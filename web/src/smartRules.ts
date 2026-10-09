import { SmartRule } from "./api";

/** 驗證智能規則（與後端 server/config.ts 的 validateSmartRules 邏輯一致）：
 *  欄位合法、天數 2–120、區間不重疊。回傳 null 表示通過 */
export function validateSmartRules(rules: SmartRule[], enabled: boolean): string | null {
  if (enabled && rules.length === 0) return "已啟用智能規則，但尚未新增任何規則";
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const n = i + 1;
    if (typeof r.minRatePct !== "number" || Number.isNaN(r.minRatePct))
      return `規則 ${n}：利率下限必須填數字`;
    if (r.minRatePct < 0 || r.minRatePct > 7)
      return `規則 ${n}：利率下限必須在 0–7% 之間（Bitfinex 日利率上限 7%）`;
    if (r.maxRatePct !== null) {
      if (typeof r.maxRatePct !== "number" || Number.isNaN(r.maxRatePct))
        return `規則 ${n}：利率上限必須填數字，或留空代表「以上」`;
      if (r.maxRatePct > 7) return `規則 ${n}：利率上限必須 ≤ 7%（Bitfinex 日利率上限 7%）`;
      if (r.maxRatePct <= r.minRatePct) return `規則 ${n}：利率上限必須大於下限`;
    }
    if (typeof r.period !== "number" || !Number.isInteger(r.period))
      return `規則 ${n}：掛單天數必須是整數`;
    if (r.period < 2 || r.period > 120)
      return `規則 ${n}：掛單天數 ${r.period} 天不符合邏輯，Bitfinex 最低出借天數為 2 天、最高 120 天`;
  }
  const sorted = rules.map((r, i) => ({ ...r, n: i + 1 })).sort((a, b) => a.minRatePct - b.minRatePct);
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur.maxRatePct === null)
      return `規則 ${cur.n} 未設上限（代表「以上」），不可再有下限更高的規則 ${next.n}：區間重疊`;
    if (next.minRatePct < cur.maxRatePct)
      return `規則 ${cur.n} 與規則 ${next.n} 的利率區間重疊，請調整範圍`;
  }
  return null;
}

/** 找出掛單利率（%）命中的規則；下限含、上限不含 */
export function matchSmartRule(rules: SmartRule[], ratePct: number): SmartRule | null {
  return rules.find((r) => ratePct >= r.minRatePct && (r.maxRatePct === null || ratePct < r.maxRatePct)) ?? null;
}
