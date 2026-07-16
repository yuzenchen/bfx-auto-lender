import { useCallback, useEffect, useState } from "react";
import { AuthRequiredError, fmtTime, fmtUsd } from "../api";
import { LoginGate } from "../components/LoginGate";
import { AccountRow, consoleApi } from "./api";

const POLL_MS = 15_000;

export default function ConsoleApp() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccounts(await consoleApi.getAccounts());
      setError(null);
      setNeedAuth(false);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        setNeedAuth(true);
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleRename = async () => {
    if (!editing) return;
    try {
      await consoleApi.renameAccount(editing.index, editing.value.trim());
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggle = async (row: AccountRow) => {
    if (!row.status) return;
    setBusyIndex(row.index);
    try {
      await consoleApi.botAction(row.index, row.status.bot.running ? "stop" : "start");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyIndex(null);
    }
  };

  if (needAuth) return <LoginGate onSuccess={() => void refresh()} />;

  const okAccounts = (accounts ?? []).filter((a) => a.ok && a.status);
  const totals = {
    available: okAccounts.reduce((s, a) => s + a.status!.available, 0),
    lent: okAccounts.reduce((s, a) => s + a.status!.lentTotal, 0),
    daily: okAccounts.reduce((s, a) => s + a.status!.estDailyEarning, 0),
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>放貸控制台</h1>
          <span className="tag">{accounts?.length ?? 0} 帳戶</span>
        </div>
      </header>

      {error && <div className="error-banner">錯誤：{error}</div>}

      <section className="stats stats-3">
        <div className="stat">
          <div className="stat-label">總可用餘額</div>
          <div className="stat-value">${fmtUsd(totals.available)}</div>
          <div className="stat-sub"></div>
        </div>
        <div className="stat">
          <div className="stat-label">總放貸中</div>
          <div className="stat-value">${fmtUsd(totals.lent)}</div>
          <div className="stat-sub"></div>
        </div>
        <div className="stat">
          <div className="stat-label">總預估日收益</div>
          <div className="stat-value accent">${fmtUsd(totals.daily)}</div>
          <div className="stat-sub"></div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>帳戶</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>帳戶</th>
                <th>狀態</th>
                <th className="num">可用餘額</th>
                <th className="num">放貸中</th>
                <th className="num">預估日收益</th>
                <th>上次執行</th>
                <th>結果</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts === null ? (
                <tr>
                  <td colSpan={8} className="empty">
                    載入中…
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    尚未設定帳戶（編輯 accounts.json）
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.index}>
                    <td>
                      {editing?.index === a.index ? (
                        <span className="name-edit">
                          <input
                            autoFocus
                            maxLength={30}
                            value={editing.value}
                            onChange={(e) => setEditing({ index: a.index, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename();
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                          <button className="btn btn-ghost neutral" onClick={() => void handleRename()}>
                            儲存
                          </button>
                          <button className="btn btn-ghost neutral" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="name-edit">
                          <a href={`acc/${a.index}/`} target="_blank" rel="noreferrer">
                            {a.name}
                          </a>
                          <button
                            className="btn btn-ghost neutral"
                            title="編輯名稱"
                            onClick={() => setEditing({ index: a.index, value: a.name })}
                          >
                            ✎
                          </button>
                        </span>
                      )}
                    </td>
                    {a.ok && a.status ? (
                      <>
                        <td>
                          <span className="status-text">
                            <span className={`dot ${a.status.bot.running ? "dot-on" : "dot-off"}`} />
                            {a.status.bot.running ? "運作中" : "已停止"}
                          </span>
                        </td>
                        <td className="num">${fmtUsd(a.status.available)}</td>
                        <td className="num">${fmtUsd(a.status.lentTotal)}</td>
                        <td className="num accent">${fmtUsd(a.status.estDailyEarning)}</td>
                        <td className="muted">
                          {a.status.bot.lastRunAt ? fmtTime(a.status.bot.lastRunAt) : "—"}
                        </td>
                        <td className="dim">{a.status.bot.lastRunResult ?? "—"}</td>
                        <td className="num">
                          <button
                            className={`btn btn-toggle ${a.status.bot.running ? "btn-danger" : ""}`}
                            disabled={busyIndex === a.index}
                            onClick={() => void handleToggle(a)}
                          >
                            {a.status.bot.running ? "停止" : "啟動"}
                          </button>
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="dim">
                        {a.error === "SETUP_REQUIRED"
                          ? "尚未設定 API Key（等待商戶完成初始化）"
                          : `連線失敗：${a.error}`}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
