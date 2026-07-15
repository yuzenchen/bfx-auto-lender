import { useCallback, useEffect, useState } from "react";
import { AuthRequiredError, Earnings, LogEntry, Status, StrategyConfig, api } from "./api";
import { LoginGate } from "./components/LoginGate";
import { OverviewCards } from "./components/OverviewCards";
import { BotControl } from "./components/BotControl";
import { SettingsPanel } from "./components/SettingsPanel";
import { OffersTable } from "./components/OffersTable";
import { CreditsTable } from "./components/CreditsTable";
import { EarningsPanel } from "./components/EarningsPanel";
import { RecentEarningsPanel } from "./components/RecentEarningsPanel";
import { LogsPanel } from "./components/LogsPanel";

const POLL_MS = 15_000;

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.getStatus(), api.getLogs()]);
      setStatus(s);
      setLogs(l);
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

  const loadAll = useCallback(() => {
    void refresh();
    void api.getConfig().then(setConfig).catch(() => {});
    void api.getEarnings().then(setEarnings).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    loadAll();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [loadAll, refresh]);

  const handleSaveConfig = async (next: StrategyConfig) => {
    const saved = await api.saveConfig(next);
    setConfig(saved);
  };

  const handleToggleBot = async () => {
    if (!status) return;
    if (status.bot.running) await api.stopBot();
    else await api.startBot();
    await refresh();
  };

  const handleCancelOffer = async (id: number) => {
    await api.cancelOffer(id);
    await refresh();
  };

  const running = status?.bot.running ?? false;

  if (needAuth) return <LoginGate onSuccess={loadAll} />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>Bitfinex 自動放貸</h1>
          <span className="tag">USD</span>
        </div>
        {status && (
          <div className="header-status">
            <span className="status-text">
              <span className={`dot ${running ? "dot-on" : "dot-off"}`} />
              {running ? "自動出借運作中" : "自動出借已停止"}
            </span>
            <button
              className={`btn btn-toggle ${running ? "btn-danger" : ""}`}
              onClick={() => void handleToggleBot()}
            >
              {running ? "停止" : "啟動"}
            </button>
          </div>
        )}
      </header>

      {error && <div className="error-banner">連線錯誤：{error}</div>}

      {status && <OverviewCards status={status} />}
      {status && <BotControl bot={status.bot} />}

      <div className="grid-2">
        {config && <SettingsPanel config={config} market={status?.market ?? null} onSave={handleSaveConfig} />}
        <div className="col">
          {status && <OffersTable offers={status.offers} onCancel={handleCancelOffer} />}
          <LogsPanel logs={logs} />
        </div>
      </div>

      {status && <CreditsTable credits={status.credits} />}
      {earnings && <EarningsPanel earnings={earnings} />}
      {earnings && <RecentEarningsPanel earnings={earnings} />}
    </div>
  );
}
