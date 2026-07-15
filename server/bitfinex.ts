import crypto from "node:crypto";

const API_URL = "https://api.bitfinex.com";
const PUB_URL = "https://api-pub.bitfinex.com";

// ---- 解析後的資料型別 ----

export interface Wallet {
  type: string;
  currency: string;
  balance: number;
  availableBalance: number | null;
}

export interface FundingOffer {
  id: number;
  symbol: string;
  mtsCreated: number;
  mtsUpdated: number;
  amount: number;
  amountOrig: number;
  status: string;
  rate: number; // 日利率
  period: number;
}

export interface FundingCredit {
  id: number;
  symbol: string;
  mtsCreate: number;
  amount: number;
  status: string;
  rate: number; // 日利率
  period: number;
  mtsOpening: number;
}

export interface FundingTicker {
  frr: number; // 日利率
  bid: number;
  bidPeriod: number;
  ask: number;
  askPeriod: number;
  last: number;
  high24h: number; // 24h 最高日利率
  low24h: number;
}

export interface LedgerEntry {
  id: number;
  currency: string;
  mts: number;
  amount: number;
  balance: number;
  description: string;
}

// nonce 必須嚴格遞增
let lastNonce = 0;
function nextNonce(): string {
  let n = Date.now() * 1000;
  if (n <= lastNonce) n = lastNonce + 1;
  lastNonce = n;
  return n.toString();
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${PUB_URL}/${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Bitfinex public ${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

export async function getFundingTicker(symbol: string): Promise<FundingTicker> {
  // [FRR, BID, BID_PERIOD, BID_SIZE, ASK, ASK_PERIOD, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST, VOLUME, HIGH, LOW, ...]
  const t = await publicGet<number[]>(`v2/ticker/${symbol}`);
  return {
    frr: t[0],
    bid: t[1],
    bidPeriod: t[2],
    ask: t[4],
    askPeriod: t[5],
    last: t[9],
    high24h: t[11],
    low24h: t[12],
  };
}

export interface FundingBookLevel {
  rate: number;
  period: number;
  count: number;
  amount: number; // >0 為出借掛單(ask)，<0 為借入需求(bid)
}

export async function getFundingBook(symbol: string): Promise<FundingBookLevel[]> {
  const rows = await publicGet<number[][]>(`v2/book/${symbol}/P0?len=25`);
  return rows.map((r) => ({ rate: r[0], period: r[1], count: r[2], amount: r[3] }));
}

// [ID, SYMBOL, SIDE, MTS_CREATE, MTS_UPDATE, AMOUNT, FLAGS, STATUS, _, _, _, RATE, PERIOD, MTS_OPENING, ...]
// credits 與 loans 回傳格式相同（credits 尾端多 POSITION_PAIR，未使用）
function parseCreditRows(rows: unknown[][]): FundingCredit[] {
  return rows.map((r) => ({
    id: r[0] as number,
    symbol: r[1] as string,
    mtsCreate: r[3] as number,
    amount: r[5] as number,
    status: r[7] as string,
    rate: r[11] as number,
    period: r[12] as number,
    mtsOpening: r[13] as number,
  }));
}

export class BitfinexClient {
  // 私有請求必須序列化：nonce 若因平行請求亂序抵達會被拒絕（10114 nonce: small）
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private apiKey: string,
    private apiSecret: string,
  ) {}

  private signedPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const next = this.queue.then(() => this.signedPostNow<T>(path, body));
    // 失敗也不中斷後續排隊的請求
    this.queue = next.catch(() => {});
    return next;
  }

  private async signedPostNow<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const nonce = nextNonce();
    const raw = JSON.stringify(body);
    const payload = `/api/${path}${nonce}${raw}`;
    const signature = crypto.createHmac("sha384", this.apiSecret).update(payload).digest("hex");
    const res = await fetch(`${API_URL}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bfx-nonce": nonce,
        "bfx-apikey": this.apiKey,
        "bfx-signature": signature,
      },
      body: raw,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bitfinex ${path} failed: ${res.status} ${text}`);
    return JSON.parse(text) as T;
  }

  async getWallets(): Promise<Wallet[]> {
    // [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...]
    const rows = await this.signedPost<unknown[][]>("v2/auth/r/wallets");
    return rows.map((r) => ({
      type: r[0] as string,
      currency: r[1] as string,
      balance: r[2] as number,
      availableBalance: (r[4] ?? null) as number | null,
    }));
  }

  async getActiveOffers(symbol: string): Promise<FundingOffer[]> {
    // [ID, SYMBOL, MTS_CREATED, MTS_UPDATED, AMOUNT, AMOUNT_ORIG, TYPE, _, _, FLAGS, STATUS, _, _, _, RATE, PERIOD, ...]
    const rows = await this.signedPost<unknown[][]>(`v2/auth/r/funding/offers/${symbol}`);
    return rows.map((r) => ({
      id: r[0] as number,
      symbol: r[1] as string,
      mtsCreated: r[2] as number,
      mtsUpdated: r[3] as number,
      amount: r[4] as number,
      amountOrig: r[5] as number,
      status: r[10] as string,
      rate: r[14] as number,
      period: r[15] as number,
    }));
  }

  async getCredits(symbol: string): Promise<FundingCredit[]> {
    // 被保證金倉位使用中的出借資金
    const rows = await this.signedPost<unknown[][]>(`v2/auth/r/funding/credits/${symbol}`);
    return parseCreditRows(rows);
  }

  async getLoans(symbol: string): Promise<FundingCredit[]> {
    // 已出借生息、但尚未被分配到倉位的資金（欄位格式與 credits 相同）
    const rows = await this.signedPost<unknown[][]>(`v2/auth/r/funding/loans/${symbol}`);
    return parseCreditRows(rows);
  }

  /** credits + loans 合併 = Bitfinex 網頁上顯示的「出借中」全部 */
  async getAllLent(symbol: string): Promise<FundingCredit[]> {
    const [credits, loans] = [await this.getCredits(symbol), await this.getLoans(symbol)];
    return [...credits, ...loans].sort((a, b) => a.mtsOpening - b.mtsOpening);
  }

  async submitOffer(opts: { symbol: string; amount: number; rate: number; period: number }): Promise<void> {
    // 金額無條件捨去到 6 位小數：四捨五入可能微幅超過實際餘額而被拒（not enough balance）
    const amount = Math.floor(opts.amount * 1e6) / 1e6;
    await this.signedPost("v2/auth/w/funding/offer/submit", {
      type: "LIMIT",
      symbol: opts.symbol,
      amount: amount.toFixed(6),
      rate: opts.rate.toFixed(8),
      period: opts.period,
      flags: 0,
    });
  }

  async cancelOffer(id: number): Promise<void> {
    await this.signedPost("v2/auth/w/funding/offer/cancel", { id });
  }

  async getFundingEarnings(currency: string, startMts: number): Promise<LedgerEntry[]> {
    // category 28 = Margin Funding Payment
    const rows = await this.signedPost<unknown[][]>(`v2/auth/r/ledgers/${currency}/hist`, {
      category: 28,
      start: startMts,
      limit: 2500,
    });
    return rows.map((r) => ({
      id: r[0] as number,
      currency: r[1] as string,
      mts: r[3] as number,
      amount: r[5] as number,
      balance: r[6] as number,
      description: (r[8] ?? "") as string,
    }));
  }
}

// 利率換算：API 為日利率，UI 用年化 %
export const dailyToApr = (daily: number) => daily * 365 * 100;
export const aprToDaily = (apr: number) => apr / 100 / 365;
