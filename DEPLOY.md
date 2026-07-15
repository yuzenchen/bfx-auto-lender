# 部署到 Oracle Cloud Always Free

目標：在 Oracle 永久免費 VM 上 24h 跑自動放貸，HTTPS + TOTP 一次性密碼保護。

## 1. 建立 Oracle Cloud 帳號與 VM

1. 到 <https://www.oracle.com/cloud/free/> 註冊（需信用卡驗證身分，不會扣款；home region 建議選 Japan East (Tokyo) 或 South Korea，離台灣近）
2. Console → Compute → Instances → **Create Instance**：
   - Image：**Ubuntu 24.04**
   - Shape：**VM.Standard.A1.Flex**（Ampere ARM，Always Free 額度：最多 4 OCPU / 24GB，本服務 1 OCPU / 6GB 綽綽有餘）
   - 上傳你的 SSH 公鑰（沒有的話 `ssh-keygen -t ed25519` 產生）
3. 記下 VM 的 **Public IP**
4. 開防火牆（兩層都要開）：
   - **VCN Security List**：Networking → VCN → Security List → Add Ingress Rules，開放 TCP **80、443**（Source 0.0.0.0/0）
   - VM 內部：`sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT`（Oracle 的 Ubuntu 映像預設 iptables 擋外部連線）
     持久化：`sudo apt install iptables-persistent -y && sudo netfilter-persistent save`

## 2. 安裝 Docker

SSH 進 VM（`ssh ubuntu@<PUBLIC_IP>`）：

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # 重新登入生效
```

## 3. 上傳專案

本機執行（PowerShell，排除不需要的目錄）：

```powershell
scp -r server web package.json package-lock.json tsconfig.json Dockerfile .dockerignore docker-compose.cloud.yml Caddyfile ubuntu@<PUBLIC_IP>:~/bfx-lender/
```

（或推到私有 Git repo 再在 VM 上 clone）

## 4. 設定 DNS

到 `yuzen.tw` 的 DNS 管理後台，新增一筆 A 記錄指向 VM：

| 類型 | 主機名稱 | 值 |
|---|---|---|
| A | `bfx`（或你喜歡的子域名） | `<VM 的 Public IP>` |

生效後 `bfx.yuzen.tw` 就會解析到你的 VM（可用 `nslookup bfx.yuzen.tw` 確認）。
Caddy 啟動時會自動用這個域名申請 Let's Encrypt 憑證，**申請前 DNS 必須已生效**，否則憑證會失敗（失敗會自動重試，生效後就會成功）。

## 5. 設定 .env

先在**本機**產生 TOTP secret：

```sh
npm run totp:setup
```

把印出的 Secret 加入手機的 Google Authenticator / Microsoft Authenticator（手動輸入金鑰），然後在 VM 上建立 `~/bfx-lender/.env`：

```ini
BFX_API_KEY=你的_API_KEY
BFX_API_SECRET=你的_API_SECRET
TOTP_SECRET=剛剛產生的SECRET
DOMAIN=bfx.yuzen.tw
```

（沒有域名時的備案：`DOMAIN=<PUBLIC_IP>.sslip.io`，sslip.io 會把 `140.83.1.2.sslip.io` 自動解析到該 IP。）

## 6. 啟動

```sh
cd ~/bfx-lender
docker compose -f docker-compose.cloud.yml up -d --build
```

開瀏覽器進 `https://bfx.yuzen.tw` → 輸入 Authenticator 的 6 碼 → 登入後 30 天內免重驗。

## 7. 收尾（重要）

1. **Bitfinex API Key 綁定 IP**：到 Bitfinex API Key 設定，把「允許從任何 IP 位址訪問」關掉，填入 VM 的 Public IP——金鑰就算外洩，別人也用不了
2. 確認機器人設定（策略設定 → 啟用 → 啟動），本機的容器記得停掉避免兩邊同時掛單：`docker compose down`
3. 之後更新程式：重新 scp 覆蓋後 `docker compose -f docker-compose.cloud.yml up -d --build`

## 費用

VM.Standard.A1.Flex 在 Always Free 額度內**永久 $0**。唯一注意：Oracle 對閒置 VM 有回收政策（免費帳號 CPU 長期 <10% 可能被停機），本服務負載極低，建議升級成 **Pay As You Go** 帳號（仍在免費額度內就不收費）以免被回收。
