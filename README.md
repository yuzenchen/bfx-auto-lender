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

## 策略邏輯

每個檢查週期（預設 5 分鐘）：

1. 讀取 funding wallet 可用 USD
2. 取 24h 最高日利率作為出借判斷依據
3. 24h 最高日利率落在設定範圍 [下限, 上限] 內 → 以 24h 最高利率掛單，等利率波動到高點成交；不在範圍內 → 不掛單，等下一輪
4. 掛單超過設定時間未成交且利率已高於目前 24h 最高 → 取消，下一輪重掛
5. 金額可依「單筆掛單金額」拆分多筆；可設定保留金額不出借

注意：Bitfinex 出借單最低 150 USD；範圍以「日利率 %」輸入，介面同步顯示換算年化（×365）。
