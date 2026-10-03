import { useState } from "react";
import { History, HistoryEntry, fmtRate, fmtTime, fmtUsd } from "../api";

type Tab = "lent" | "returned";

/** 展開後預設顯示的筆數，其餘需按「顯示全部」 */
const PREVIEW_ROWS = 10;

export function HistoryPanel({ history }: { history: History }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("lent");
  const [showAll, setShowAll] = useState(false);

  const entries = tab === "lent" ? history.lent : history.returned;
  const visible = showAll ? entries : entries.slice(0, PREVIEW_ROWS);
  const hidden = entries.length - visible.length;

  const switchTab = (next: Tab) => {
    setTab(next);
    setShowAll(false);
  };

  return (
    <section>
      <div className="section-head">
        <button className="collapse-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={`collapse-caret${open ? " open" : ""}`}>▸</span>
          <h2>出借／歸還紀錄</h2>
        </button>
        <span className="tag tag-neutral">近 30 天</span>
        {!open && (
          <span className="summary">
            出借 <strong>{history.lent.length}</strong> 筆・歸還 <strong>{history.returned.length}</strong> 筆
          </span>
        )}
        {open && (
          <>
            <span className="spacer" />
            <div className="tab-group">
              <button
                className={`btn btn-ghost neutral${tab === "lent" ? " tab-active" : ""}`}
                onClick={() => switchTab("lent")}
              >
                成功出借（{history.lent.length}）
              </button>
              <button
                className={`btn btn-ghost neutral${tab === "returned" ? " tab-active" : ""}`}
                onClick={() => switchTab("returned")}
              >
                歸還（{history.returned.length}）
              </button>
            </div>
          </>
        )}
      </div>

      {open && (
        <>
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
                  visible.map((e: HistoryEntry) => (
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
          {(hidden > 0 || showAll) && entries.length > PREVIEW_ROWS && (
            <div className="show-more">
              <button className="btn btn-ghost neutral" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "收合" : `顯示全部（還有 ${hidden} 筆）`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
