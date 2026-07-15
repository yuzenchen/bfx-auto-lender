import { OfferView, fmtRate, fmtTime, fmtUsd } from "../api";

export function OffersTable({ offers, onCancel }: { offers: OfferView[]; onCancel: (id: number) => void }) {
  return (
    <section>
      <div className="section-head">
        <h2>掛單中</h2>
        <span className="tag tag-neutral">{offers.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>金額 (USD)</th>
              <th>利率</th>
              <th className="num">天數</th>
              <th className="num">掛單時間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  目前沒有掛單
                </td>
              </tr>
            ) : (
              offers.map((o) => (
                <tr key={o.id}>
                  <td>{fmtUsd(Math.abs(o.amount))}</td>
                  <td>{fmtRate(o.rateDaily, o.rateApr)}</td>
                  <td className="num">{o.period}</td>
                  <td className="num muted">{fmtTime(o.mtsCreated)}</td>
                  <td className="num">
                    <button className="btn-ghost btn" onClick={() => onCancel(o.id)}>
                      取消
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
