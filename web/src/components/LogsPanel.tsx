import { LogEntry } from "../api";

// 含執行日期（MM/DD）＋時間
const fmtLogTime = (mts: number) =>
  new Date(mts).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function LogsPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <section>
      <div className="section-head">
        <h2>動作日誌</h2>
      </div>
      {logs.length === 0 ? (
        <div className="logs">
          <span className="log-time">尚無日誌</span>
        </div>
      ) : (
        <div className="logs">
          {logs.map((l, i) => (
            <div className={`log-line log-${l.level}`} key={`${l.time}-${i}`}>
              <span className="log-time">{fmtLogTime(l.time)}</span>
              <span className="log-text">{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
