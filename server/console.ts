import "dotenv/config";
import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { createAuth } from "./auth.js";

// 多帳戶控制台：聚合各帳戶實例的狀態、代理啟停與完整儀表板
// 帳戶清單 accounts.json：[{ "name": "主帳戶", "url": "http://acc-main:3000" }]

interface Account {
  name: string;
  url: string;
}

const accountsPath = process.env.ACCOUNTS_PATH ?? path.resolve("accounts.json");

function loadAccounts(): Account[] {
  // 去除 BOM（Windows 編輯器常見），避免 JSON.parse 失敗
  const raw = fs.readFileSync(accountsPath, "utf-8").replace(/^﻿/, "");
  const list = JSON.parse(raw) as Account[];
  if (!Array.isArray(list)) throw new Error("accounts.json 必須是陣列");
  return list.map((a) => ({ name: String(a.name), url: String(a.url).replace(/\/+$/, "") }));
}

try {
  loadAccounts();
} catch (err) {
  console.error(`無法讀取帳戶清單 ${accountsPath}：${err instanceof Error ? err.message : err}`);
  console.error("請參考 accounts.example.json 建立");
  process.exit(1);
}

// 對帳戶容器的內部呼叫帶上信任 token，讓有啟用 TOTP 的帳戶（商戶號）也能被控制台存取
const internalToken = process.env.INTERNAL_TOKEN;
const internalHeaders: Record<string, string> = internalToken ? { "x-internal-token": internalToken } : {};

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: { ...internalHeaders, ...init?.headers }, signal: ctrl.signal });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const app = express();
app.use(express.json());

// TOTP 驗證（雲端必開）；/acc 代理也在保護範圍內
const totpSecret = process.env.TOTP_SECRET;
if (totpSecret) {
  const auth = createAuth(totpSecret);
  app.use("/api", auth.router);
  app.use("/api", auth.middleware);
  app.use("/acc", auth.middleware);
  console.log("TOTP 驗證已啟用");
} else {
  console.log("TOTP 驗證未啟用（未設定 TOTP_SECRET）");
}

app.get("/api/accounts", async (_req, res) => {
  const accounts = loadAccounts();
  const results = await Promise.all(
    accounts.map(async (a, index) => {
      try {
        const status = await fetchJson(`${a.url}/api/status`);
        return { index, name: a.name, ok: true, status };
      } catch (err) {
        return { index, name: a.name, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  res.json(results);
});

app.put("/api/accounts/:idx/name", (req, res) => {
  const idx = Number(req.params.idx);
  const name = String((req.body as { name?: unknown })?.name ?? "").trim();
  if (!name || name.length > 30) {
    res.status(400).json({ error: "名稱必須為 1–30 字" });
    return;
  }
  const accounts = loadAccounts();
  if (!accounts[idx]) {
    res.status(404).json({ error: "找不到帳戶" });
    return;
  }
  accounts[idx].name = name;
  fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2) + "\n");
  res.json({ ok: true, name });
});

app.post("/api/accounts/:idx/bot/:action", async (req, res) => {
  const { idx, action } = req.params;
  if (action !== "start" && action !== "stop") {
    res.status(400).json({ error: "無效的動作" });
    return;
  }
  const account = loadAccounts()[Number(idx)];
  if (!account) {
    res.status(404).json({ error: "找不到帳戶" });
    return;
  }
  try {
    res.json(await fetchJson(`${account.url}/api/bot/${action}`, { method: "POST" }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- 帳戶完整儀表板反向代理：/acc/0/... → 帳戶容器 ----

// 無尾斜線 → 補上（僅精確匹配 /acc/N，避免與下方代理路由互搶造成重導向迴圈）
app.get(/^\/acc\/(\d+)$/, (req, res) => res.redirect(`/acc/${req.params[0]}/`));

app.all(/^\/acc\/(\d+)\/.*$/, async (req: Request, res: Response) => {
  const idx = req.params[0];
  const account = loadAccounts()[Number(idx)];
  if (!account) {
    res.status(404).json({ error: "找不到帳戶" });
    return;
  }
  const prefix = `/acc/${idx}/`;
  const subPath = req.originalUrl.slice(prefix.length);
  try {
    const init: RequestInit = { method: req.method, headers: { ...internalHeaders } };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.headers = { ...internalHeaders, "Content-Type": "application/json" };
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(`${account.url}/${subPath}`, init);
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- 控制台前端 ----

const webDist = path.resolve(import.meta.dirname, "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "console.html")));
}

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`放貸控制台已啟動：http://${host}:${port}（帳戶清單：${accountsPath}）`);
});
