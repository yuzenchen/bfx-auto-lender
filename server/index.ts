import "dotenv/config";
import express, { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { createAuth } from "./auth.js";
import { BitfinexClient } from "./bitfinex.js";
import { loadConfig } from "./config.js";
import { LenderBot } from "./lender.js";
import { createRoutes } from "./routes.js";

// API Key 來源優先序：環境變數 > data/credentials.json（網頁初始化流程寫入）
// 兩者皆無 → 進入「設定模式」，等待使用者透過 /api/setup 輸入
const CRED_PATH =
  process.env.CREDENTIALS_PATH ??
  path.resolve(path.dirname(process.env.CONFIG_PATH ?? path.resolve("data", "config.json")), "credentials.json");

interface Credentials {
  apiKey: string;
  apiSecret: string;
}

function loadStoredCredentials(): Credentials | null {
  if (process.env.BFX_API_KEY && process.env.BFX_API_SECRET) {
    return { apiKey: process.env.BFX_API_KEY, apiSecret: process.env.BFX_API_SECRET };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CRED_PATH, "utf-8")) as Credentials;
    if (parsed.apiKey && parsed.apiSecret) return parsed;
  } catch {
    // 檔案不存在或格式錯誤 → 視為未設定
  }
  return null;
}

const app = express();
app.use(express.json());

let client: BitfinexClient | null = null;
let apiRouter: Router | null = null;

function activate(creds: Credentials) {
  client = new BitfinexClient(creds.apiKey, creds.apiSecret);
  const bot = new LenderBot(client);
  // 填入下方預先註冊的轉發器；不能在此 app.use()，否則會排在靜態檔 catch-all 之後永遠比對不到
  apiRouter = createRoutes(client, bot);
  if (loadConfig().enabled) bot.start();
}

// TOTP 驗證；帶有效內部 token 的請求（控制台聚合/代理）可略過
const totpSecret = process.env.TOTP_SECRET;
const internalToken = process.env.INTERNAL_TOKEN;
if (totpSecret) {
  const auth = createAuth(totpSecret);
  app.use("/api", auth.router);
  app.use("/api", (req, res, next) => {
    if (internalToken && req.headers["x-internal-token"] === internalToken) {
      next();
      return;
    }
    auth.middleware(req, res, next);
  });
  console.log("TOTP 驗證已啟用");
} else {
  console.log("TOTP 驗證未啟用（未設定 TOTP_SECRET）");
}

// ---- 初始化流程（設定模式時使用） ----

app.get("/api/setup", (_req, res) => {
  res.json({ needsSetup: client === null });
});

app.post("/api/setup", async (req, res) => {
  if (client) {
    res.status(400).json({ error: "API Key 已設定，如需更換請聯繫管理員" });
    return;
  }
  const body = req.body as { apiKey?: unknown; apiSecret?: unknown };
  const apiKey = String(body?.apiKey ?? "").trim();
  const apiSecret = String(body?.apiSecret ?? "").trim();
  if (!apiKey || !apiSecret) {
    res.status(400).json({ error: "請填寫 API Key 與 API Secret" });
    return;
  }
  // 先實際呼叫 Bitfinex 驗證金鑰有效，通過才儲存
  try {
    await new BitfinexClient(apiKey, apiSecret).getWallets();
  } catch (err) {
    res.status(400).json({ error: `金鑰驗證失敗：${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  fs.mkdirSync(path.dirname(CRED_PATH), { recursive: true });
  fs.writeFileSync(CRED_PATH, JSON.stringify({ apiKey, apiSecret }, null, 2));
  activate({ apiKey, apiSecret });
  res.json({ ok: true });
});

// 主要 API 路由的動態轉發器：開機即註冊（保住路由順序），啟用後才有內容
app.use("/api", (req, res, next) => {
  if (apiRouter) apiRouter(req, res, next);
  else res.status(503).json({ error: "SETUP_REQUIRED" });
});

const stored = loadStoredCredentials();
if (stored) {
  activate(stored);
} else {
  console.log("尚未設定 Bitfinex API Key，進入設定模式（登入網頁後輸入）");
}

// 靜態伺服前端 build 結果（dev 模式用 Vite dev server + proxy，不走這裡）
const webDist = path.resolve(import.meta.dirname, "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`bfx-auto-lender 已啟動：http://${host}:${port}`);
});
