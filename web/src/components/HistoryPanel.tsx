import { useState } from "react";
import { History, HistoryEntry, fmtRate, fmtTime, fmtUsd } from "../api";

type Tab = "lent" | "returned";

export function HistoryPanel({ history }: { history: History }) {
  const [tab, setTab] = useState<Tab>("lent");
  const entries = tab === "lent" ? history.lent : history.returned;

  return (
    <section>
      <div className="section-head">
        <h2>出借／歸還紀錄</h2>
        <span className="tag tag-neutral">近 30 天</span>
        <span className="spacer" />
        <div className="tab-group">
          <button className={`btn btn-ghost neutral${tab === "lent" ? " tab-active" : ""}`} onClick={() => setTab("lent")}>
            成功出借（{history.lent.length}）
          </button>
          <button
            className={`btn btn-ghost neutral${tab === "returned" ? " tab-active" : ""}`}
            onClick={() => setTab("returned")}
          >
            歸還（{history.returned.length}）
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>金額 (USD)</th>
              <th>利率</th>
              <th className="num">天數</th>
              {tab === "returned" && <th className="num">起始時間</th>}
              <th className="num">{tab === "lent" ? "成交時間" : "歸還時間"}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={tab === "returned" ? 5 : 4} className="empty">
                  近 30 天沒有{tab === "lent" ? "出借成交" : "歸還"}紀錄
                </td>
              </tr>
            ) : (
              entries.map((e: HistoryEntry) => (
                <tr key={`${tab}-${e.id}`}>
                  <td>{fmtUsd(e.amount)}</td>
                  <td>{fmtRate(e.rateDaily, e.rateApr)}</td>
                  <td className="num">{e.period}</td>
                  {tab === "returned" && (
                    <td className="num muted">{e.mtsOpening ? fmtTime(e.mtsOpening) : "—"}</td>
                  )}
                  <td className="num muted">{fmtTime(e.mts)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
