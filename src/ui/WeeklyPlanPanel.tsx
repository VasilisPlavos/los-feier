import type { WeeklyPlan, WeeklyValue } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

const ICON: Record<WeeklyValue, string> = { 0: "💼", 0.5: "½", 1: "🌴" };

export function WeeklyPlanPanel({ plan, onCycle }: { plan: WeeklyPlan; onCycle(weekday: number): void }) {
  const { t, weekdayShort } = useI18n();
  const label = (v: WeeklyValue) => (v === 0 ? t("weekly.work") : v === 0.5 ? t("weekly.half") : t("weekly.off"));
  return (
    <section className="panel" aria-labelledby="weekly-title" aria-describedby="weekly-hint">
      <h2 id="weekly-title">{t("weekly.title")}</h2>
      <p id="weekly-hint" className="panel-hint">{t("weekly.hint")}</p>
      <div className="weekly">
        {plan.map((value, i) => (
          <button
            key={i}
            type="button"
            className="weekly-day"
            data-value={value}
            aria-label={`${weekdayShort(i)}: ${label(value)}`}
            title={label(value)}
            onClick={() => onCycle(i)}
          >
            <span aria-hidden="true">{weekdayShort(i)}</span>
            <span aria-hidden="true">{ICON[value]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
