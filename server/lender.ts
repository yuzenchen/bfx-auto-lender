import {
  BitfinexClient,
  FundingCredit,
  FundingOffer,
  FundingTicker,
  Wallet,
  dailyToApr,
  getFundingTicker,
} from "./bitfinex.js";
import { StrategyConfig, loadConfig, matchSmartRule } from "./config.js";

const SYMBOL = "fUSD";
const CURRENCY = "USD";
const MIN_OFFER_AMOUNT = 150;
const MAX_OFFERS_PER_CYCLE = 10;

export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface BotStatus {
  running: boolean;
  lastRunAt: number | null;
  lastRunResult: string | null;
  nextRunAt: number | null;
}

export interface MarketSnapshot {
  frrDaily: number; // 日利率 %
  frrApr: number;
  bestAskDaily: number;
  bestAskApr: number;
  bestBidDaily: number;
  bestBidApr: number;
  lastDaily: number;
  lastApr: number;
  high24hDaily: number;
  high24hApr: number;
}

export class LenderBot {
  private timer: NodeJS.Timeout | null = null;
  private logs: LogEntry[] = [];
  private status: BotStatus = { running: false, lastRunAt: null, lastRunResult: null, nextRunAt: null };
  private cycleInFlight = false;

  constructor(private client: BitfinexClient) {}

  // ---- 對外狀態 ----

  getStatus(): BotStatus {
    return { ...this.status };
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  private log(level: LogEntry["level"], message: string) {
    this.logs.push({ time: Date.now(), level, message });
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
    console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
  }

  // ---- 啟停 ----

  start() {
    if (this.status.running) return;
    this.status.running = true;
    this.log("info", "自動出借已啟動");
    this.scheduleNext(0);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status.running = false;
    this.status.nextRunAt = null;
    this.log("info", "自動出借已停止");
  }

  private scheduleNext(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.status.nextRunAt = Date.now() + delayMs;
    this.timer = setTimeout(() => void this.runCycleSafe(), delayMs);
  }

  private async runCycleSafe() {
    if (this.cycleInFlight) return;
    this.cycleInFlight = true;
    const config = loadConfig();
    try {
      const result = await this.runCycle(config);
      this.status.lastRunResult = result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status.lastRunResult = `錯誤: ${msg}`;
      this.log("error", `本輪執行失敗: ${msg}`);
    } finally {
      this.status.lastRunAt = Date.now();
      this.cycleInFlight = false;
      if (this.status.running) this.scheduleNext(config.checkIntervalMinutes * 60_000);
    }
  }

  // ---- 核心策略 ----

  private async runCycle(config: StrategyConfig): Promise<string> {
    if (!config.enabled) {
      return "設定中 enabled=false，本輪略過";
    }

    const [wallets, offers, credits, ticker] = await Promise.all([
      this.client.getWallets(),
      this.client.getActiveOffers(SYMBOL),
      this.client.getAllLent(SYMBOL),
      getFundingTicker(SYMBOL),
    ]);

    const available = computeAvailable(wallets, offers, credits);
    // 以 24h 最高日利率作為出借判斷依據
    const high24hDaily = ticker.high24h;
    const minDaily = config.minRateDailyPct / 100;
    const maxDaily = config.maxRateDailyPct / 100;
    // 掛單利率 = 24h 最高 × 比例（預設 95%，提高成交率），但不低於範圍下限
    const placeDaily = Math.max(high24hDaily * (config.placeRatioPct / 100), minDaily);

    // 1. 處理過時掛單：掛太久沒成交且利率高於目前目標掛單利率 → 取消重掛
    let cancelled = 0;
    for (const offer of offers) {
      const ageHours = (Date.now() - offer.mtsCreated) / 3_600_000;
      if (ageHours >= config.restaleHours && offer.rate > placeDaily * 1.001) {
        await this.client.cancelOffer(offer.id);
        cancelled++;
        this.log(
          "info",
          `取消過時掛單 #${offer.id}（${offer.amount.toFixed(2)} USD @ 年化 ${dailyToApr(offer.rate).toFixed(2)}%，已掛 ${ageHours.toFixed(1)} 小時）`,
        );
      }
    }
    // 取消後資金回到可用餘額，下一輪再重掛（避免餘額狀態不同步）
    if (cancelled > 0) {
      this.scheduleNext(15_000);
      return `已取消 ${cancelled} 筆過時掛單，15 秒後重新評估`;
    }

    // 2. 24h 最高日利率不在設定範圍內 → 不掛單
    if (high24hDaily < minDaily || high24hDaily > maxDaily) {
      return `24h 最高日利率 ${(high24hDaily * 100).toFixed(4)}% 不在範圍 ${config.minRateDailyPct}%–${config.maxRateDailyPct}% 內，本輪不掛單`;
    }

    // 3. 計算可掛金額
    let lendable = available - config.keepReserve;
    if (lendable < MIN_OFFER_AMOUNT) {
      return `可用資金 ${lendable.toFixed(2)} USD 不足最低掛單額 ${MIN_OFFER_AMOUNT}，本輪不動作`;
    }

    // 智能規則：依 24h 最高日利率落點決定出借天數；未命中任何區間則用預設天數
    const smartRule =
      config.smartRulesEnabled && config.smartRules.length > 0
        ? matchSmartRule(config.smartRules, high24hDaily * 100)
        : null;
    if (smartRule) {
      this.log(
        "info",
        `智能規則命中：24h 最高 ${(high24hDaily * 100).toFixed(4)}% 落在 ${smartRule.minRatePct}%–${smartRule.maxRatePct ?? "∞"}%，出借天數改用 ${smartRule.period} 天`,
      );
    }

    // 4. 掛單（依 amountPerOrder 分筆）
    const perOrder = config.amountPerOrder > 0 ? config.amountPerOrder : lendable;
    let placed = 0;
    while (lendable >= MIN_OFFER_AMOUNT && placed < MAX_OFFERS_PER_CYCLE) {
      let amount = Math.min(perOrder, lendable);
      // 剩下的尾數不足最低額時併入本筆
      if (lendable - amount < MIN_OFFER_AMOUNT) amount = lendable;
      // 小額掛單改用專屬天數與最佳出借利率，求快速成交（例：低於 500 USD 借 3 天）
      const isSmall = config.smallAmountThreshold > 0 && amount < config.smallAmountThreshold;
      const period = isSmall ? config.smallAmountPeriod : (smartRule?.period ?? config.period);
      // 小額單不設底，一律跟市場最佳出借利率
      const rate = isSmall ? ticker.ask : placeDaily;
      await this.client.submitOffer({ symbol: SYMBOL, amount, rate, period });
      placed++;
      lendable -= amount;
      this.log(
        "info",
        `掛出借單 ${amount.toFixed(2)} USD @ 年化 ${dailyToApr(rate).toFixed(2)}%，${period} 天${isSmall ? "（小額）" : smartRule ? "（智能規則）" : ""}`,
      );
    }

    return `已掛 ${placed} 筆出借單 @ 年化 ${dailyToApr(placeDaily).toFixed(2)}%`;
  }
}

// ---- 純函式，routes 也會用到 ----

export function computeAvailable(wallets: Wallet[], offers: FundingOffer[], credits: FundingCredit[]): number {
  const wallet = wallets.find((w) => w.type === "funding" && w.currency === CURRENCY);
  if (!wallet) return 0;
  if (wallet.availableBalance !== null) return wallet.availableBalance;
  // 沒有 availableBalance 時自行推算：總餘額 - 掛單中 - 放貸中
  const inOffers = offers.reduce((sum, o) => sum + Math.abs(o.amount), 0);
  const inCredits = credits.reduce((sum, c) => sum + Math.abs(c.amount), 0);
  return wallet.balance - inOffers - inCredits;
}

export function marketSnapshot(ticker: FundingTicker): MarketSnapshot {
  return {
    frrDaily: ticker.frr * 100,
    frrApr: dailyToApr(ticker.frr),
    bestAskDaily: ticker.ask * 100,
    bestAskApr: dailyToApr(ticker.ask),
    bestBidDaily: ticker.bid * 100,
    bestBidApr: dailyToApr(ticker.bid),
    lastDaily: ticker.last * 100,
    lastApr: dailyToApr(ticker.last),
    high24hDaily: ticker.high24h * 100,
    high24hApr: dailyToApr(ticker.high24h),
  };
}

export { SYMBOL, CURRENCY };
