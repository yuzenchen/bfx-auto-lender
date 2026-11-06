import { useEffect, useRef, useState } from "react";
import { MarketSnapshot, SmartRule, StrategyConfig, dailyPctToApr, fmtApr, fmtDaily } from "../api";
import { matchSmartRule, validateSmartRules } from "../smartRules";

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
  const storageKey = `strategyOpen:${location.pathname}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // 無法存取 localStorage 時僅保留本次狀態
    }
  };

  useEffect(() => setDraft(config), [config]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const set = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setRule = (i: number, patch: Partial<SmartRule>) =>
    setDraft((d) => ({
      ...d,
      smartRules: d.smartRules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));

  const addRule = () => {
    setDraft((d) => {
      // 預設接在最後一條規則的上限之後，方便連續輸入階梯區間
      const last = d.smartRules[d.smartRules.length - 1];
      const min = last?.maxRatePct ?? 0;
      return { ...d, smartRules: [...d.smartRules, { minRatePct: min, maxRatePct: null, period: d.period }] };
    });
  };

  const removeRule = (i: number) =>
    setDraft((d) => ({ ...d, smartRules: d.smartRules.filter((_, idx) => idx !== i) }));

  const toggleSmartRules = () => {
    if (!draft.smartRulesEnabled) {
      // 啟用前先檢查規則是否符合邏輯，不通過則顯示原因且不啟用
      const err = validateSmartRules(draft.smartRules, true);
      if (err) {
        setMessage(`無法啟用智能規則：${err}`);
        return;
      }
    }
    setMessage(null);
    set("smartRulesEnabled", !draft.smartRulesEnabled);
  };

  const save = async () => {
    // 儲存前驗證智能規則，不合邏輯直接擋下並說明
    const ruleErr = validateSmartRules(draft.smartRules, draft.smartRulesEnabled);
    if (ruleErr) {
      setMessage(`儲存失敗：${ruleErr}`);
      return;
    }
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
  const floorApplied =
    market !== null &&
    placeRate === draft.minRateDailyPct &&
    (market.high24hDaily * draft.placeRatioPct) / 100 < draft.minRateDailyPct;
  const hitRule = draft.smartRulesEnabled && market !== null ? matchSmartRule(draft.smartRules, placeRate) : null;

  const saveButton = (
    <button className="btn" onClick={() => void save()} disabled={saving}>
      {saving ? "儲存中…" : "儲存設定"}
    </button>
  );

  // 收合時的摘要依「已儲存」設定顯示，而非未儲存的草稿
  const chips: { text: string; on?: boolean }[] = [
    { text: config.enabled ? "自動出借 開" : "自動出借 關", on: config.enabled },
    { text: `範圍 ${config.minRateDailyPct}–${config.maxRateDailyPct}%` },
    { text: `比例 ${config.placeRatioPct}%` },
    { text: `${config.period} 天` },
  ];
  if (config.smallAmountThreshold > 0) {
    chips.push({ text: `小額 <${config.smallAmountThreshold} → ${config.smallAmountPeriod} 天` });
  }
  chips.push(
    config.smartRulesEnabled
      ? { text: `智能規則 ${config.smartRules.length} 條`, on: true }
      : { text: "智能規則 關" },
  );

  return (
    <section className="card strategy">
      <button className="strategy-head" aria-expanded={open} onClick={toggleOpen}>
        <span className={`collapse-caret${open ? " open" : ""}`}>▸</span>
        <h2>策略設定</h2>
        <span className="strategy-chips">
          {chips.map((c) => (
            <span className={`chip${c.on ? " chip-on" : ""}`} key={c.text}>
              {c.text}
            </span>
          ))}
        </span>
        <span className="spacer" />
        <span className="strategy-toggle-text">{open ? "收合" : "展開"}</span>
      </button>

      <div className="strategy-body" hidden={!open}>
      <div className="split-b">
      <div className="pane">
        <div className="form-checkbox-row">
          <label className="form-checkbox">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            啟用自動出借
          </label>
          <span
            className="tip tip-icon"
            tabIndex={0}
            data-tip="總開關：勾選後機器人運作時才會實際掛單；未勾選時只輪詢不動作"
          >
            ⓘ
          </span>
        </div>

        <div className="group-title">利率</div>
        <div className="form-grid-3">
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="24h 最高日利率低於此值時不掛單；同時是掛單利率的最低地板">日利率下限（%）</span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={draft.minRateDailyPct}
              onChange={(e) => set("minRateDailyPct", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="24h 最高日利率超過此值時觀望不掛單，防止利率異常飆高時出借">日利率上限（%）</span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={draft.maxRateDailyPct}
              onChange={(e) => set("maxRateDailyPct", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="掛單利率 = 24h 最高日利率 × 此比例。越低成交越快、但利率越低（建議 90–100）">掛單利率比例（% of 24h 最高）</span>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={draft.placeRatioPct}
              onChange={(e) => set("placeRatioPct", Number(e.target.value))}
            />
          </label>
        </div>

        <div className="form-hint only-narrow">
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
                <span className="no"> ✗ 不在範圍內，一般單不掛（小額單照常以市價掛出）</span>
              )}
            </>
          )}
        </div>

        <div className="group-title">掛單與資金</div>
        <div className="form-grid-4">
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="成交後資金被鎖定的天數。短天期較靈活，長天期可鎖住當前利率">出借天數（2–120）</span>
            <input
              type="number"
              min="2"
              max="120"
              value={draft.period}
              onChange={(e) => set("period", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="把資金拆成多筆掛出的單筆上限，0 = 全部一筆掛出（拆分可分散到期時間）">單筆掛單金額（USD）</span>
            <input
              type="number"
              min="0"
              value={draft.amountPerOrder}
              onChange={(e) => set("amountPerOrder", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="永遠不出借的金額，保留在可用餘額（例如預備提領用）">保留金額（USD）</span>
            <input
              type="number"
              min="0"
              value={draft.keepReserve}
              onChange={(e) => set("keepReserve", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="機器人每隔幾分鐘檢查市場並執行一輪掛單邏輯">檢查週期（分鐘）</span>
            <input
              type="number"
              min="1"
              value={draft.checkIntervalMinutes}
              onChange={(e) => set("checkIntervalMinutes", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="掛單金額低於此值時改用小額規則：以市場最佳利率＋小額天數快速成交，且不受日利率範圍限制，避免零碎資金閒置；掛出 2 小時未成交會自動依市價重掛">小額門檻（USD，0 = 停用）</span>
            <input
              type="number"
              min="0"
              value={draft.smallAmountThreshold}
              onChange={(e) => set("smallAmountThreshold", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="小額掛單使用的出借天數，建議設短（2–3 天）讓零碎資金保持靈活">小額出借天數（2–120）</span>
            <input
              type="number"
              min="2"
              max="120"
              value={draft.smallAmountPeriod}
              onChange={(e) => set("smallAmountPeriod", Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="tip" tabIndex={0} data-tip="掛單超過此時數未成交、且利率已高於目前目標時，自動取消並於下輪重掛。小額單固定 2 小時：未成交且市場最佳利率已低於掛單利率時，以當下最佳利率重掛">重掛判定（小時）</span>
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

        <div className="group-title group-title-row">
          <span className="tip" tabIndex={0} data-tip="依掛單利率（24h 最高 × 掛單利率比例，不低於下限）落在哪個區間，改用該區間的出借天數掛單；未命中任何區間時用預設出借天數。小額單不受影響，維持小額天數">
            智能規則
          </span>
          <button
            className={`btn btn-toggle${draft.smartRulesEnabled ? "" : " btn-ghost neutral"}`}
            onClick={toggleSmartRules}
          >
            {draft.smartRulesEnabled ? "已啟用" : "未啟用"}
          </button>
        </div>
        <div className="smart-rules">

          {draft.smartRules.length > 0 && (
            <div className="smart-rule-list">
              <div className="smart-rule-row smart-rule-header">
                <span>利率下限（%）</span>
                <span>利率上限（%）</span>
                <span>掛單天數</span>
                <span />
              </div>
              {draft.smartRules.map((r, i) => {
                const hit =
                  draft.smartRulesEnabled &&
                  market !== null &&
                  matchSmartRule(draft.smartRules, placeRate) === r;
                return (
                  <div className={`smart-rule-row${hit ? " smart-rule-hit" : ""}`} key={i}>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={r.minRatePct}
                      onChange={(e) => setRule(i, { minRatePct: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="以上"
                      value={r.maxRatePct ?? ""}
                      onChange={(e) =>
                        setRule(i, { maxRatePct: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    />
                    <input
                      type="number"
                      min="2"
                      max="120"
                      value={r.period}
                      onChange={(e) => setRule(i, { period: Number(e.target.value) })}
                    />
                    <button className="btn-ghost" onClick={() => removeRule(i)} title="刪除規則">
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="smart-rules-actions">
            <button className="btn btn-ghost neutral" onClick={addRule}>
              ＋ 新增規則
            </button>
            {draft.smartRules.length === 0 && (
              <span className="form-hint">例：0.029–0.03 掛 30 天、0.03–0.04 掛 60 天、0.04 以上掛 120 天</span>
            )}
          </div>
        </div>

        <div className="form-actions only-narrow">
          {saveButton}
          {message && <span className="form-message">{message}</span>}
        </div>
      </div>

      <aside className="preview-panel only-wide">
        <div className="group-title preview-title">
          本輪試算 <span className="preview-title-sub">· 依目前輸入</span>
        </div>
        {market ? (
          <>
            <div className="preview-step">1 · 範圍判斷</div>
            <div className="preview-row">
              <span className="k">24h 最高</span>
              <span className="v">
                {fmtDaily(market.high24hDaily)}（年化 {fmtApr(market.high24hApr)}）
              </span>
            </div>
            <div className="preview-row">
              <span className="k">
                範圍 {draft.minRateDailyPct}–{draft.maxRateDailyPct}%
              </span>
              <span className={`v ${inRange ? "ok" : "no"}`}>{inRange ? "✓ 在範圍內" : "✗ 不在範圍內"}</span>
            </div>

            <div className="preview-step">2 · 一般單</div>
            {inRange ? (
              <>
                <div className="preview-row">
                  <span className="k">掛單利率</span>
                  <span className="v">
                    {fmtDaily(placeRate)}（年化 {fmtApr(dailyPctToApr(placeRate))}）{floorApplied && " · 下限地板"}
                  </span>
                </div>
                <div className="preview-row">
                  <span className="k">出借天數</span>
                  {draft.smartRulesEnabled ? (
                    hitRule ? (
                      <span className="v ok">
                        智能規則{" "}
                        {hitRule.maxRatePct === null
                          ? `${hitRule.minRatePct}% 以上`
                          : `${hitRule.minRatePct}–${hitRule.maxRatePct}%`}{" "}
                        → {hitRule.period} 天
                      </span>
                    ) : (
                      <span className="v">未命中規則 → {draft.period} 天</span>
                    )
                  ) : (
                    <span className="v">{draft.period} 天</span>
                  )}
                </div>
              </>
            ) : (
              <div className="preview-row">
                <span className="k">一般單</span>
                <span className="v no">本輪不掛</span>
              </div>
            )}

            {draft.smallAmountThreshold > 0 && (
              <>
                <div className="preview-step">3 · 小額單（&lt;{draft.smallAmountThreshold} USD）</div>
                <div className="preview-row">
                  <span className="k">市價</span>
                  <span className="v">
                    {fmtDaily(market.bestAskDaily)} · {draft.smallAmountPeriod} 天
                  </span>
                </div>
                <div className="preview-note">不受範圍限制</div>
              </>
            )}
          </>
        ) : (
          <div className="preview-note">等待市場資料…</div>
        )}
        <div className="preview-divider" />
        {saveButton}
        {message && <span className="form-message">{message}</span>}
        <div className="preview-note">
          換算年化範圍 {fmtApr(dailyPctToApr(draft.minRateDailyPct))} – {fmtApr(dailyPctToApr(draft.maxRateDailyPct))}
        </div>
      </aside>
      </div>
      </div>
    </section>
  );
}
