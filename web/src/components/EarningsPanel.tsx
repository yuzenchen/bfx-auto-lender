import { useState } from "react";
import { Earnings, fmtUsd } from "../api";

export function EarningsPanel({ earnings }: { earnings: Earnings }) {
  const [showTable, setShowTable] = useState(false);

  const months = earnings.monthly;
  const max = Math.max(...months.map((m) => m.total), 0.01);
  const label = (month: string) => month.slice(2).replace("-", "/");

  return (
    <section>
      <div className="section-head">
        <h2>近一年報酬</h2>
        <span className="earnings-total">${fmtUsd(earnings.total)}</span>
        <span className="spacer" />
        <button className="btn btn-ghost neutral" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "看圖表" : "看表格"}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th className="num">報酬 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {/* 表格由新到舊排序；圖表維持時間序 */}
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td className="muted">{m.month}</td>
                  <td className="num">{fmtUsd(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="chart">
            {months.map((m) => (
              <div className="chart-col" key={m.month}>
                <div
                  className="chart-bar"
                  style={{ height: `${Math.round((m.total / max) * 100)}%` }}
                  title={`${label(m.month)}：$${fmtUsd(m.total)}`}
                >
                  {m.total === max && max > 0.01 && (
                    <div className="chart-bar-label">${fmtUsd(m.total)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="chart-baseline" />
          <div className="chart-months">
            {months.map((m) => (
              <div key={m.month}>{label(m.month)}</div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
