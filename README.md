# Bitfinex 自動放貸（USD）

自動出借 Bitfinex funding wallet 的閒置 USD：定時檢查可用資金，依市場利率自動掛出借單，並提供網頁儀表板監控與調整策略。

## 快速開始（Docker）

1. 複製 `.env.example` 為 `.env`，填入 Bitfinex API Key/Secret
   （建議 API Key 只開 **Margin Funding** read/write 權限，不要開提幣與交易）
2. 啟動：

   ```sh
   docker compose up -d --build
   ```

3. 開啟 <http://localhost:3000>，在「策略設定」勾選啟用並按「啟動」

策略設定會存在 `./data/config.json`（volume 掛載，重啟不會丟失）。

## 本機開發

```sh
npm install
npm --prefix web install

# 終端機 1：後端（http://127.0.0.1:3000）
npm run dev

# 終端機 2：前端 dev server（http://127.0.0.1:5173，/api 代理到後端）
npm --prefix web run dev
```

## 多帳戶模式（控制台）

一個帳戶一個容器，加上一個控制台聚合所有帳戶：總覽（餘額/放貸中/日收益/狀態）、
每帳戶啟停、點帳戶名稱可進入該帳戶完整儀表板（透過控制台反向代理，帳戶容器不對外開 port）。

```sh
# 1. 每個帳戶一個資料夾放 .env（BFX_API_KEY/SECRET）
mkdir -p accounts/main && cp .env.example accounts/main/.env  # 編輯填入金鑰

# 2. 帳戶清單
cp accounts.example.json accounts.json

# 3. 啟動（新增帳戶：複製 docker-compose.multi.yml 的 acc-main 區塊 + accounts.json 加一行）
docker compose -f docker-compose.multi.yml up -d --build
```

控制台：<http://localhost:3100>；各帳戶另有獨立 port（main=3001、之後依序 3002…）可直連該帳戶儀表板。
TOTP：控制台設在根目錄 `.env`；帳戶容器要開放外部連線（如給商戶）前，**必須**在該帳戶的
`accounts/<名稱>/.env` 設定自己的 `TOTP_SECRET`，並建議以 Caddy HTTPS 反向代理（每帳戶一個子網域）對外。

## 策略邏輯

各設定欄位的完整說明與建議值見 [docs/策略設定說明.md](docs/策略設定說明.md)。

每個檢查週期（預設 5 分鐘）：

1. 讀取 funding wallet 可用 USD
2. 取 24h 最高日利率作為出借判斷依據
3. 24h 最高日利率落在設定範圍 [下限, 上限] 內 → 以 24h 最高利率掛單，等利率波動到高點成交；不在範圍內 → 不掛單，等下一輪
4. 掛單超過設定時間未成交且利率已高於目前 24h 最高 → 取消，下一輪重掛
5. 金額可依「單筆掛單金額」拆分多筆；可設定保留金額不出借

注意：Bitfinex 出借單最低 150 USD；範圍以「日利率 %」輸入，介面同步顯示換算年化（×365）。
