import fs from "node:fs";
import path from "node:path";

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
  return null;
}
