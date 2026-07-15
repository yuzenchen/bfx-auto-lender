import { Earnings, fmtTime, fmtUsd } from "../api";

export function RecentEarningsPanel({ earnings }: { earnings: Earnings }) {
  return (
    <section>
      <div className="section-head">
        <h2>近 30 天收益</h2>
        <span className="earnings-total">${fmtUsd(earnings.recentTotal)}</span>
      </div>
      {earnings.recent.length === 0 ? (
        <p className="empty">尚無收益紀錄</p>
      ) : (
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th className="num">金額 (USD)</th>
                <th className="desc">說明</th>
              </tr>
            </thead>
            <tbody>
              {earnings.recent.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{fmtTime(e.mts)}</td>
                  <td className="num">{fmtUsd(e.amount)}</td>
                  <td className="dim desc">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
