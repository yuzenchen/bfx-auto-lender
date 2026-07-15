import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createAuth } from "./auth.js";
import { BitfinexClient } from "./bitfinex.js";
import { loadConfig } from "./config.js";
import { LenderBot } from "./lender.js";
import { createRoutes } from "./routes.js";

const apiKey = process.env.BFX_API_KEY;
const apiSecret = process.env.BFX_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error("缺少 BFX_API_KEY / BFX_API_SECRET，請先設定 .env（參考 .env.example）");
  process.exit(1);
}

const client = new BitfinexClient(apiKey, apiSecret);
const bot = new LenderBot(client);

const app = express();
app.use(express.json());

// 設定 TOTP_SECRET 時啟用一次性密碼驗證（雲端部署必開；本機可留空停用）
const totpSecret = process.env.TOTP_SECRET;
if (totpSecret) {
  const auth = createAuth(totpSecret);
  app.use("/api", auth.router);
  app.use("/api", auth.middleware);
  console.log("TOTP 驗證已啟用");
} else {
  console.log("TOTP 驗證未啟用（未設定 TOTP_SECRET）");
}

app.use("/api", createRoutes(client, bot));

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
  // 設定檔啟用時，開機自動啟動機器人
  if (loadConfig().enabled) bot.start();
});
