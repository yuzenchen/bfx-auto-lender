import { Router } from "express";
import { BitfinexClient, dailyToApr, getFundingTicker } from "./bitfinex.js";
import { loadConfig, saveConfig, validateConfig, StrategyConfig } from "./config.js";
import { CURRENCY, LenderBot, SYMBOL, computeAvailable, marketSnapshot } from "./lender.js";

export function createRoutes(client: BitfinexClient, bot: LenderBot): Router {
  const router = Router();

  router.get("/status", async (_req, res) => {
    try {
      const [wallets, offers, credits, ticker] = await Promise.all([
        client.getWallets(),
        client.getActiveOffers(SYMBOL),
        client.getAllLent(SYMBOL),
        getFundingTicker(SYMBOL),
      ]);
      const wallet = wallets.find((w) => w.type === "funding" && w.currency === CURRENCY);
      const available = computeAvailable(wallets, offers, credits);
      const lentTotal = credits.reduce((sum, c) => sum + Math.abs(c.amount), 0);
      // 預估日收益 = Σ(放貸金額 × 日利率)
      const estDailyEarning = credits.reduce((sum, c) => sum + Math.abs(c.amount) * c.rate, 0);
      res.json({
        balance: wallet?.balance ?? 0,
        available,
        lentTotal,
        estDailyEarning,
        market: marketSnapshot(ticker),
        offers: offers.map((o) => ({ ...o, rateDaily: o.rate * 100, rateApr: dailyToApr(o.rate) })),
        credits: credits.map((c) => ({ ...c, rateDaily: c.rate * 100, rateApr: dailyToApr(c.rate) })),
        bot: bot.getStatus(),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/config", (_req, res) => {
    res.json(loadConfig());
  });

  router.put("/config", (req, res) => {
    const input = req.body as Partial<StrategyConfig>;
    const merged = { ...loadConfig(), ...input };
    // 驗證合併後的完整設定，跨欄位規則（如範圍上下限）才能正確檢查
    const error = validateConfig(merged);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    saveConfig(merged);
    res.json(merged);
  });

  router.post("/bot/start", (_req, res) => {
    bot.start();
    res.json(bot.getStatus());
  });

  router.post("/bot/stop", (_req, res) => {
    bot.stop();
    res.json(bot.getStatus());
  });

  router.post("/offers/cancel/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "無效的掛單 ID" });
      return;
    }
    try {
      await client.cancelOffer(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/earnings", async (_req, res) => {
    try {
      const start = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const entries = await client.getFundingEarnings(CURRENCY, start);
      const total = entries.reduce((sum, e) => sum + e.amount, 0);

      // 近 12 個月逐月彙總（含沒有收益的月份，補 0）
      const byMonth = new Map<string, number>();
      for (const e of entries) {
        const d = new Date(e.mts);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) ?? 0) + e.amount);
      }
      const monthly: { month: string; total: number }[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthly.push({ month: key, total: byMonth.get(key) ?? 0 });
      }

      // 近 30 天明細（由新到舊）
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = entries.filter((e) => e.mts >= cutoff);
      const recentTotal = recent.reduce((sum, e) => sum + e.amount, 0);

      res.json({ total, monthly, recent, recentTotal });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/logs", (_req, res) => {
    res.json(bot.getLogs());
  });

  return router;
}
