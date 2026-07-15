import { Status, fmtApr, fmtDaily, fmtUsd } from "../api";

export function OverviewCards({ status }: { status: Status }) {
  const m = status.market;
  const stats = [
    { label: "可用餘額", value: `$${fmtUsd(status.available)}` },
    { label: "放貸中總額", value: `$${fmtUsd(status.lentTotal)}` },
    { label: "FRR 日利率", value: fmtDaily(m.frrDaily), sub: `年化 ${fmtApr(m.frrApr)}` },
    { label: "最佳出借日利率", value: fmtDaily(m.bestAskDaily), sub: `年化 ${fmtApr(m.bestAskApr)}` },
    { label: "24h 最高日利率", value: fmtDaily(m.high24hDaily), sub: `年化 ${fmtApr(m.high24hApr)}` },
    { label: "預估日收益", value: `$${fmtUsd(status.estDailyEarning)}`, accent: true },
  ];
  return (
    <section className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-label">{s.label}</div>
          <div className={`stat-value${s.accent ? " accent" : ""}`}>{s.value}</div>
          <div className="stat-sub">{s.sub ?? ""}</div>
        </div>
      ))}
    </section>
  );
}
