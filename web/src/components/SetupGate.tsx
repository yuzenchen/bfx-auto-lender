import { FormEvent, useState } from "react";
import { api } from "../api";

export function SetupGate({ onSuccess }: { onSuccess: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setup(apiKey, apiSecret);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-gate">
      <form className="card login-card setup-card" onSubmit={(e) => void submit(e)}>
        <h1>初始化設定</h1>
        <p>
          請輸入你的 Bitfinex API Key 與 Secret。
          <br />
          建議金鑰只開啟「Margin Funding」讀寫與錢包/帳戶歷史唯讀權限，
          <br />
          不要開啟提款與交易權限。
        </p>
        <label className="field">
          <span>API Key</span>
          <input
            autoFocus
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value.trim())}
          />
        </label>
        <label className="field">
          <span>API Secret</span>
          <input
            type="password"
            autoComplete="off"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value.trim())}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn" type="submit" disabled={busy || !apiKey || !apiSecret}>
          {busy ? "驗證金鑰中…" : "儲存並啟用"}
        </button>
      </form>
    </div>
  );
}
