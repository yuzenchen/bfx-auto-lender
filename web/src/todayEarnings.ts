export interface DayEarning {
  /** 該日入帳總額 */
  amount: number;
  /** 該日任一筆入帳時間（用來顯示日期） */
  mts: number;
  /** 是否為今天（瀏覽器本地時間） */
  isToday: boolean;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * 依本地日期加總收益：今天有入帳就回傳今天；否則回傳最近一個有入帳的過去日期；完全沒有資料回傳 null。
 */
export function todayEarnings(
  recent: { mts: number; amount: number }[],
  now: number = Date.now(),
): DayEarning | null {
  const todayKey = dayKey(new Date(now));
  const byDay = new Map<string, { amount: number; mts: number }>();
  for (const e of recent) {
    const key = dayKey(new Date(e.mts));
    const cur = byDay.get(key);
    if (cur) cur.amount += e.amount;
    else byDay.set(key, { amount: e.amount, mts: e.mts });
  }
  const today = byDay.get(todayKey);
  if (today) return { amount: today.amount, mts: today.mts, isToday: true };

  let best: { amount: number; mts: number } | null = null;
  for (const day of byDay.values()) {
    if (day.mts > now) continue;
    if (!best || day.mts > best.mts) best = day;
  }
  return best ? { amount: best.amount, mts: best.mts, isToday: false } : null;
}
