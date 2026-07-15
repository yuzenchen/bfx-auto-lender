import { BotStatus, fmtTime } from "../api";

export function BotControl({ bot }: { bot: BotStatus }) {
  return (
    <section className="bot-bar">
      <i className="ph ph-robot" aria-hidden="true" />
      <span>
        上次執行 <strong>{bot.lastRunAt ? fmtTime(bot.lastRunAt) : "—"}</strong>
      </span>
      <span className="grow">結果：{bot.lastRunResult ?? "—"}</span>
      {bot.running && bot.nextRunAt && (
        <span>
          下次執行 <strong>{fmtTime(bot.nextRunAt)}</strong>
        </span>
      )}
    </section>
  );
}
