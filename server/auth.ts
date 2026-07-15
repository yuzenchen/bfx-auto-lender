import crypto from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { verifyTotp } from "./totp.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 登入後 30 天免重驗
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export function createAuth(totpSecret: string) {
  // session 簽章金鑰由 TOTP secret 衍生，重啟後既有 session 仍有效
  const signKey = crypto.createHash("sha256").update(`session:${totpSecret}`).digest();

  const sign = (exp: number) => {
    const sig = crypto.createHmac("sha256", signKey).update(String(exp)).digest("base64url");
    return `${exp}.${sig}`;
  };

  const isValidToken = (token: string | undefined): boolean => {
    if (!token) return false;
    const [expStr, sig] = token.split(".");
    if (!expStr || !sig) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const expect = crypto.createHmac("sha256", signKey).update(expStr).digest("base64url");
    return sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  };

  const getSessionCookie = (req: Request): string | undefined => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "session") return rest.join("=");
    }
    return undefined;
  };

  // 登入失敗次數限制（防暴力猜 6 碼）
  let failures: number[] = [];

  const router = Router();
  router.post("/auth/login", (req, res) => {
    const now = Date.now();
    failures = failures.filter((t) => now - t < FAILURE_WINDOW_MS);
    if (failures.length >= MAX_FAILURES) {
      res.status(429).json({ error: "嘗試次數過多，請 15 分鐘後再試" });
      return;
    }
    const code = String((req.body as { code?: unknown })?.code ?? "");
    if (!verifyTotp(totpSecret, code)) {
      failures.push(now);
      res.status(401).json({ error: "驗證碼錯誤" });
      return;
    }
    const exp = now + SESSION_TTL_MS;
    const secure = req.headers["x-forwarded-proto"] === "https" || req.secure ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `session=${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`,
    );
    res.json({ ok: true });
  });

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/auth/login") {
      next();
      return;
    }
    if (isValidToken(getSessionCookie(req))) {
      next();
      return;
    }
    res.status(401).json({ error: "AUTH_REQUIRED" });
  };

  return { router, middleware };
}
