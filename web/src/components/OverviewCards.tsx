import { Earnings, Status, fmtApr, fmtDaily, fmtUsd } from "../api";
import { todayEarnings } from "../todayEarnings";

const fmtMd = (mts: number) => {
  const d = new Date(mts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

export function OverviewCards({ status, earnings }: { status: Status; earnings: Earnings | null }) {
  const m = status.market;
  const credits = status.credits;
  const lentSum = credits.reduce((s, c) => s + Math.abs(c.amount), 0);
  const weighted = lentSum > 0 ? credits.reduce((s, c) => s + Math.abs(c.amount) * c.rateApr, 0) / lentSum : 0;
  const offeredSum = status.offers.reduce((s, o) => s + Math.abs(o.amount), 0);

  const day = earnings ? todayEarnings(earnings.recent) : null;
  const todayValue = day ? `$${fmtUsd(day.amount)}` : "—";
  const todaySub = day ? (day.isToday ? `${fmtMd(day.mts)} 入帳` : `今日尚未入帳 · 顯示 ${fmtMd(day.mts)}`) : "";

  // 本月／上月以瀏覽器本地時間的年月比對 earnings.monthly
  const now = new Date();
  const ym = (y: number, mIdx: number) => {
    const d = new Date(y, mIdx, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthTotal = (key: string) => earnings?.monthly.find((e) => e.month === key)?.total ?? 0;
  const monthValue = earnings ? `$${fmtUsd(monthTotal(ym(now.getFullYear(), now.getMonth())))}` : "—";
  const monthSub = earnings ? `上月 $${fmtUsd(monthTotal(ym(now.getFullYear(), now.getMonth() - 1)))}` : "";

  const stats = [
    {
      label: "放貸總額",
      value: `$${fmtUsd(status.lentTotal)}`,
      sub: credits.length > 0 ? `${credits.length} 筆 · 加權年化 ${fmtApr(weighted)}` : "0 筆",
      hero: true,
    },
    { label: "可用餘額", value: `$${fmtUsd(status.available)}`, sub: `掛單中 $${fmtUsd(offeredSum)}` },
    { label: "24h 最高日利率", value: fmtDaily(m.high24hDaily), sub: `年化 ${fmtApr(m.high24hApr)}` },
    { label: "本日收益", value: todayValue, sub: todaySub, accent: true },
    { label: "本月收益", value: monthValue, sub: monthSub, accent: true },
  ];
  return (
    <section className="stats stats-5">
      {stats.map((s) => (
        <div className={`stat${s.hero ? " stat-hero" : ""}`} key={s.label}>
          <div className="stat-label">{s.label}</div>
          <div className={`stat-value${s.accent ? " accent" : ""}`}>{s.value}</div>
          <div className="stat-sub">{s.sub ?? ""}</div>
        </div>
      ))}
    </section>
  );
}
