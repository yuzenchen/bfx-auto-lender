import { FormEvent, useState } from "react";
import { api } from "../api";

export function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(code);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-gate">
      <form className="card login-card" onSubmit={(e) => void submit(e)}>
        <h1>Bitfinex 自動放貸</h1>
        <p>請輸入 Authenticator 上的 6 位數驗證碼</p>
        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn" type="submit" disabled={busy || code.length !== 6}>
          {busy ? "驗證中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
