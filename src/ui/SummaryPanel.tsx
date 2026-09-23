import { groupStretches } from "../core/stats";
import type { Stretch } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

interface Props {
  leaveTotal: number;
  stretches: Stretch[];
  selected: Stretch | null;
  onSelect(stretch: Stretch | null): void;
}

export function SummaryPanel({ leaveTotal, stretches, selected, onSelect }: Props) {
  const { t, formatNumber, formatRange } = useI18n();
  const groups = groupStretches(stretches);
  return (
    <section className="panel" aria-labelledby="summary-title">
      <h2 id="summary-title">{t("summary.leaveDays", { n: formatNumber(leaveTotal) })}</h2>
      {groups.length === 0 && <p className="muted">{t("summary.noStretches")}</p>}
      {groups.map((group) => (
        <div key={group.length}>
          <h3>{t("summary.stretchGroup", { n: String(group.length) })}</h3>
          <ul>
            {group.stretches.map((s) => {
              const isSelected = selected?.start === s.start;
              return (
                <li key={s.start}>
                  <button
                    type="button"
                    className="stretch"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : s)}
                  >
                    {t("summary.stretchItem", {
                      range: formatRange(s.start, s.end),
                      days: String(s.length),
                      leave: formatNumber(s.leaveUsed),
                    })}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
