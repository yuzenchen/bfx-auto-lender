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

export interface OfferView {
  id: number;
  amount: number;
  rate: number;
  rateDaily: number;
  rateApr: number;
  period: number;
  mtsCreated: number;
}

export interface CreditView {
  id: number;
  amount: number;
  rate: number;
  rateDaily: number;
  rateApr: number;
  period: number;
  mtsOpening: number;
}

export interface BotStatus {
  running: boolean;
  lastRunAt: number | null;
  lastRunResult: string | null;
  nextRunAt: number | null;
}

export interface Status {
  balance: number;
  available: number;
  lentTotal: number;
  estDailyEarning: number;
  market: MarketSnapshot;
  offers: OfferView[];
  credits: CreditView[];
  bot: BotStatus;
}

export interface StrategyConfig {
  enabled: boolean;
  minRateDailyPct: number;
  maxRateDailyPct: number;
  placeRatioPct: number;
  period: number;
  smallAmountThreshold: number;
  smallAmountPeriod: number;
  amountPerOrder: number;
  keepReserve: number;
  checkIntervalMinutes: number;
  restaleHours: number;
}

export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface Earnings {
  total: number;
  monthly: { month: string; total: number }[];
  recent: { id: number; mts: number; amount: number; description: string }[];
  recentTotal: number;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
  }
}

export class SetupRequiredError extends Error {
  constructor() {
    super("SETUP_REQUIRED");
  }
}

// 路徑一律用相對路徑（"api/..."），讓頁面在控制台代理路徑（/acc/0/）下也能運作
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json();
  if (res.status === 401 && data.error === "AUTH_REQUIRED") throw new AuthRequiredError();
  if (res.status === 503 && data.error === "SETUP_REQUIRED") throw new SetupRequiredError();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  login: (code: string) =>
    request<{ ok: boolean }>("api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  setup: (apiKey: string, apiSecret: string) =>
    request<{ ok: boolean }>("api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, apiSecret }),
    }),
  getStatus: () => request<Status>("api/status"),
  getConfig: () => request<StrategyConfig>("api/config"),
  saveConfig: (config: StrategyConfig) =>
    request<StrategyConfig>("api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),
  startBot: () => request<BotStatus>("api/bot/start", { method: "POST" }),
  stopBot: () => request<BotStatus>("api/bot/stop", { method: "POST" }),
  cancelOffer: (id: number) => request<{ ok: boolean }>(`api/offers/cancel/${id}`, { method: "POST" }),
  getEarnings: () => request<Earnings>("api/earnings"),
  getLogs: () => request<LogEntry[]>("api/logs"),
};

export const fmtUsd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtApr = (n: number) => `${n.toFixed(2)}%`;
export const fmtDaily = (n: number) => `${n.toFixed(4)}%`;
/** 日利率 % + 年化 %，例：0.0300%（年化 10.95%） */
export const fmtRate = (daily: number, apr: number) => `${fmtDaily(daily)}（年化 ${fmtApr(apr)}）`;
export const fmtTime = (mts: number) => new Date(mts).toLocaleString("zh-TW", { hour12: false });
export const dailyPctToApr = (dailyPct: number) => dailyPct * 365;
