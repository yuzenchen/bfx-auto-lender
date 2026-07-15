import { generateSecret, totpCode } from "./totp.js";

// 產生 TOTP secret：npm run totp:setup
const secret = generateSecret();
const issuer = "bfx-auto-lender";

console.log("=== TOTP 設定 ===");
console.log();
console.log(`Secret（填入 .env 的 TOTP_SECRET）：`);
console.log(`  ${secret}`);
console.log();
console.log("在 Google Authenticator / Microsoft Authenticator 選「手動輸入」，");
console.log(`帳號名稱隨意（如 ${issuer}），金鑰貼上上面的 Secret（時間基準、6 碼）。`);
console.log();
console.log(`或用支援 otpauth 連結的 App 匯入：`);
console.log(`  otpauth://totp/${issuer}?secret=${secret}&issuer=${issuer}`);
console.log();
console.log(`目前這一刻的驗證碼應為：${totpCode(secret)}（新增後可對照確認）`);
