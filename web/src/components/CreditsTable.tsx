import { CreditView, fmtApr, fmtDaily, fmtRate, fmtTime, fmtUsd } from "../api";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 到期日在此天數內的放貸單顯示提醒 */
const EXPIRY_SOON_DAYS = 3;

export function CreditsTable({ credits }: { credits: CreditView[] }) {
  const totalLent = credits.reduce((sum, c) => sum + Math.abs(c.amount), 0);
  const dailyEarning = credits.reduce((sum, c) => sum + Math.abs(c.amount) * c.rate, 0);
  const avgDaily =
    totalLent > 0 ? credits.reduce((sum, c) => sum + Math.abs(c.amount) * c.rateDaily, 0) / totalLent : 0;

  const now = Date.now();
  const expiryOf = (c: CreditView) => c.mtsOpening + c.period * DAY_MS;
  const daysLeft = (c: CreditView) => (expiryOf(c) - now) / DAY_MS;
  const expiringSoon = credits.filter((c) => daysLeft(c) <= EXPIRY_SOON_DAYS);
  const expiringTotal = expiringSoon.reduce((sum, c) => sum + Math.abs(c.amount), 0);

  return (
    <section>
      <div className="section-head">
        <h2>放貸中</h2>
        <span className="tag tag-neutral">{credits.length}</span>
        {credits.length > 0 && (
          <>
            <span className="summary">
              總額 <strong>${fmtUsd(totalLent)}</strong>
            </span>
            <span className="summary">
              加權平均日利率 <strong>{fmtDaily(avgDaily)}</strong>（年化 {fmtApr(avgDaily * 365)}）
            </span>
            <span className="summary">
              預估日收益 <span className="accent">${fmtUsd(dailyEarning)}</span>
            </span>
          </>
        )}
        {expiringSoon.length > 0 && (
          <span className="summary warn">
            ⚠ {expiringSoon.length} 筆將於 {EXPIRY_SOON_DAYS} 天內到期（${fmtUsd(expiringTotal)}）
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>金額 (USD)</th>
              <th>利率</th>
              <th className="num">預估日收益</th>
              <th className="num">天數</th>
              <th className="num">起始時間</th>
              <th className="num">到期時間</th>
            </tr>
          </thead>
          <tbody>
            {credits.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  目前沒有放貸中的資金
                </td>
              </tr>
            ) : (
              credits.map((c) => {
                const left = daysLeft(c);
                const soon = left <= EXPIRY_SOON_DAYS;
                return (
                  <tr key={c.id} className={soon ? "row-expiring" : undefined}>
                    <td>{fmtUsd(Math.abs(c.amount))}</td>
                    <td>{fmtRate(c.rateDaily, c.rateApr)}</td>
                    <td className="num accent">${fmtUsd(Math.abs(c.amount) * c.rate)}</td>
                    <td className="num">{c.period}</td>
                    <td className="num muted">{fmtTime(c.mtsOpening)}</td>
                    <td className="num muted">
                      {fmtTime(expiryOf(c))}
                      {soon && <span className="tag tag-warn">剩 {Math.max(0, Math.ceil(left))} 天</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
