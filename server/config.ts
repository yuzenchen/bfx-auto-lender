import fs from "node:fs";
import path from "node:path";

export interface SmartRule {
  /** 區間下限：掛單利率（%，= 24h 最高 × 掛單利率比例，含下限地板），含 */
  minRatePct: number;
  /** 區間上限：掛單利率（%），不含；null = 無上限（以上） */
  maxRatePct: number | null;
  /** 命中此區間時的出借天數 2–120 */
  period: number;
}

export interface StrategyConfig {
  /** 自動出借總開關 */
  enabled: boolean;
  /** 日利率範圍下限（%）：24h 最高日利率落在 [min, max] 內才掛單 */
  minRateDailyPct: number;
  /** 日利率範圍上限（%） */
  maxRateDailyPct: number;
  /** 掛單利率 = 24h 最高日利率 × 此比例（%），提高成交率 */
  placeRatioPct: number;
  /** 出借天數 2–120 */
  period: number;
  /** 小額門檻（USD）：掛單金額低於此值時改用 smallAmountPeriod；0 = 停用 */
  smallAmountThreshold: number;
  /** 小額掛單的出借天數 2–120 */
  smallAmountPeriod: number;
  /** 單筆掛單金額上限（0 = 全部一筆掛出） */
  amountPerOrder: number;
  /** 保留不出借的金額 */
  keepReserve: number;
  /** 檢查週期（分鐘） */
  checkIntervalMinutes: number;
  /** 掛單超過此小時數未成交且利率偏離市場時取消重掛 */
  restaleHours: number;
  /** 智能規則開關：依掛單利率（24h 最高 × 掛單利率比例）落點套用對應出借天數 */
  smartRulesEnabled: boolean;
  /** 智能規則列表（區間不可重疊） */
  smartRules: SmartRule[];
}

export const DEFAULT_CONFIG: StrategyConfig = {
  enabled: false,
  minRateDailyPct: 0.02,
  maxRateDailyPct: 0.5,
  placeRatioPct: 95,
  period: 2,
  smallAmountThreshold: 0,
  smallAmountPeriod: 2,
  amountPerOrder: 0,
  keepReserve: 0,
  checkIntervalMinutes: 5,
  restaleHours: 1,
  smartRulesEnabled: false,
  smartRules: [],
};

const CONFIG_PATH = process.env.CONFIG_PATH ?? path.resolve("data", "config.json");

export function loadConfig(): StrategyConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // 只取已知欄位，捨棄舊版設定檔殘留的欄位
    const config = { ...DEFAULT_CONFIG };
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof StrategyConfig)[]) {
      if (parsed[key] !== undefined) (config as Record<string, unknown>)[key] = parsed[key];
    }
    return config;
  } catch {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: StrategyConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function validateConfig(input: Partial<StrategyConfig>): string | null {
  if (input.minRateDailyPct !== undefined && (input.minRateDailyPct < 0 || input.minRateDailyPct > 7))
    return "minRateDailyPct 必須在 0–7 之間（Bitfinex 日利率上限 7%）";
  if (input.maxRateDailyPct !== undefined && (input.maxRateDailyPct < 0 || input.maxRateDailyPct > 7))
    return "maxRateDailyPct 必須在 0–7 之間（Bitfinex 日利率上限 7%）";
  if (input.placeRatioPct !== undefined && (input.placeRatioPct < 1 || input.placeRatioPct > 100))
    return "placeRatioPct 必須在 1–100 之間";
  if (input.period !== undefined && (input.period < 2 || input.period > 120))
    return "period 必須在 2–120 天之間";
  if (input.smallAmountThreshold !== undefined && input.smallAmountThreshold < 0)
    return "smallAmountThreshold 不可為負";
  if (input.smallAmountPeriod !== undefined && (input.smallAmountPeriod < 2 || input.smallAmountPeriod > 120))
    return "smallAmountPeriod 必須在 2–120 天之間";
  if (input.amountPerOrder !== undefined && input.amountPerOrder !== 0 && input.amountPerOrder < 150)
    return "amountPerOrder 必須為 0（不限制）或 ≥ 150";
  if (input.keepReserve !== undefined && input.keepReserve < 0) return "keepReserve 不可為負";
  if (input.checkIntervalMinutes !== undefined && (input.checkIntervalMinutes < 1 || input.checkIntervalMinutes > 1440))
    return "checkIntervalMinutes 必須在 1–1440 之間";
  if (input.restaleHours !== undefined && (input.restaleHours < 0.5 || input.restaleHours > 168))
    return "restaleHours 必須在 0.5–168 小時之間";
  if (
    input.minRateDailyPct !== undefined &&
    input.maxRateDailyPct !== undefined &&
    input.maxRateDailyPct < input.minRateDailyPct
  )
    return "日利率範圍上限必須 ≥ 下限";
  if (input.smartRules !== undefined || input.smartRulesEnabled) {
    const err = validateSmartRules(input.smartRules ?? [], input.smartRulesEnabled === true);
    if (err) return err;
  }
  return null;
}

/** 驗證智能規則：欄位合法、天數 2–120、區間不重疊。回傳 null 表示通過 */
export function validateSmartRules(rules: SmartRule[], enabled: boolean): string | null {
  if (!Array.isArray(rules)) return "智能規則格式錯誤：必須是規則列表";
  if (enabled && rules.length === 0) return "已啟用智能規則，但尚未新增任何規則";
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const n = i + 1;
    if (typeof r?.minRatePct !== "number" || Number.isNaN(r.minRatePct))
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
  // 區間重疊檢查：依下限排序後逐對比較（上一條的上限可等於下一條的下限，即相接不算重疊）
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

/** 找出掛單利率（%）命中的規則；下限含、上限不含（無上限 = 以上皆命中） */
export function matchSmartRule(rules: SmartRule[], ratePct: number): SmartRule | null {
  return rules.find((r) => ratePct >= r.minRatePct && (r.maxRatePct === null || ratePct < r.maxRatePct)) ?? null;
}
