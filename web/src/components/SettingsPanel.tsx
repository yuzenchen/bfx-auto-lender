import { useEffect, useRef, useState } from "react";
import { MarketSnapshot, StrategyConfig, dailyPctToApr, fmtApr, fmtDaily } from "../api";

export function SettingsPanel({
  config,
  market,
  onSave,
}: {
  config: StrategyConfig;
  market: MarketSnapshot | null;
  onSave: (next: StrategyConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setDraft(config), [config]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const set = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(draft);
      setMessage("已儲存");
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setMessage(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const inRange =
    market !== null &&
    market.high24hDaily >= draft.minRateDailyPct &&
    market.high24hDaily <= draft.maxRateDailyPct;
  const placeRate = market
    ? Math.max((market.high24hDaily * draft.placeRatioPct) / 100, draft.minRateDailyPct)
    : 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>策略設定</h2>
        <label className="form-checkbox" title="總開關：勾選後機器人運作時才會實際掛單；未勾選時只輪詢不動作">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          啟用自動出借
        </label>
      </div>

      <div className="form">
        <div className="form-grid">
          <label className="field">
            <span title="24h 最高日利率低於此值時不掛單；同時是掛單利率的最低地板">日利率下限（%）</span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={draft.minRateDailyPct}
              onChange={(e) => set("minRateDailyPct", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="24h 最高日利率超過此值時觀望不掛單，防止利率異常飆高時出借">日利率上限（%）</span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={draft.maxRateDailyPct}
              onChange={(e) => set("maxRateDailyPct", Number(e.target.value))}
            />
          </label>
        </div>

        <label className="field">
          <span title="掛單利率 = 24h 最高日利率 × 此比例。越低成交越快、但利率越低（建議 90–100）">掛單利率比例（% of 24h 最高）</span>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={draft.placeRatioPct}
            onChange={(e) => set("placeRatioPct", Number(e.target.value))}
          />
        </label>

        <div className="form-hint">
          換算年化{" "}
          <span className="range">
            {fmtApr(dailyPctToApr(draft.minRateDailyPct))} – {fmtApr(dailyPctToApr(draft.maxRateDailyPct))}
          </span>
          {market && (
            <>
              <br />
              24h 最高 {fmtDaily(market.high24hDaily)}（年化 {fmtApr(market.high24hApr)}）
              {inRange ? (
                <span className="ok"> ✓ 在範圍內，將以 {fmtDaily(placeRate)} 掛單</span>
              ) : (
                <span className="no"> ✗ 不在範圍內，不掛單</span>
              )}
            </>
          )}
        </div>

        <div className="form-grid">
          <label className="field">
            <span title="成交後資金被鎖定的天數。短天期較靈活，長天期可鎖住當前利率">出借天數（2–120）</span>
            <input
              type="number"
              min="2"
              max="120"
              value={draft.period}
              onChange={(e) => set("period", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="把資金拆成多筆掛出的單筆上限，0 = 全部一筆掛出（拆分可分散到期時間）">單筆掛單金額（USD）</span>
            <input
              type="number"
              min="0"
              value={draft.amountPerOrder}
              onChange={(e) => set("amountPerOrder", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="掛單金額低於此值時改用小額規則：以市場最佳利率＋小額天數快速成交，避免零碎資金閒置">小額門檻（USD，0 = 停用）</span>
            <input
              type="number"
              min="0"
              value={draft.smallAmountThreshold}
              onChange={(e) => set("smallAmountThreshold", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="小額掛單使用的出借天數，建議設短（2–3 天）讓零碎資金保持靈活">小額出借天數（2–120）</span>
            <input
              type="number"
              min="2"
              max="120"
              value={draft.smallAmountPeriod}
              onChange={(e) => set("smallAmountPeriod", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="永遠不出借的金額，保留在可用餘額（例如預備提領用）">保留金額（USD）</span>
            <input
              type="number"
              min="0"
              value={draft.keepReserve}
              onChange={(e) => set("keepReserve", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="機器人每隔幾分鐘檢查市場並執行一輪掛單邏輯">檢查週期（分鐘）</span>
            <input
              type="number"
              min="1"
              value={draft.checkIntervalMinutes}
              onChange={(e) => set("checkIntervalMinutes", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span title="掛單超過此時數未成交、且利率已高於目前目標時，自動取消並於下輪重掛">重掛判定（小時）</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="168"
              value={draft.restaleHours}
              onChange={(e) => set("restaleHours", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? "儲存中…" : "儲存設定"}
          </button>
          {message && <span className="form-message">{message}</span>}
        </div>
      </div>
    </section>
  );
}
