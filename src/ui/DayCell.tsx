import type { DayInfo } from "../core/types";
import { useI18n, type I18n } from "../i18n/I18nProvider";

interface Props {
  info: DayInfo;
  isToday: boolean;
  inStretch: boolean;
  highlighted: boolean;
  onToggle(date: string, room: number): void;
}

function describe(info: DayInfo, isToday: boolean, t: I18n["t"]): string[] {
  const parts: string[] = [];
  if (info.holidayNames.length > 0) {
    parts.push(`${info.holiday === 1 ? t("day.holiday") : t("day.halfHoliday")}: ${info.holidayNames.join(", ")}`);
  }
  if (info.weekly === 1) parts.push(t("day.off"));
  else if (info.weekly === 0.5) parts.push(t("day.halfOff"));
  if (info.leaveEff === 1) parts.push(t("day.leave"));
  else if (info.leaveEff === 0.5) parts.push(t("day.halfLeave"));
  if (info.redundant) parts.push(t("day.redundant"));
  if (isToday) parts.push(t("day.today"));
  return parts;
}

export function DayCell({ info, isToday, inStretch, highlighted, onToggle }: Props) {
  const { t, formatDate } = useI18n();
  const locked = info.room === 0 && !info.redundant;
  const parts = describe(info, isToday, t);
  const title = [locked ? t("day.alreadyFree") : null, ...info.holidayNames].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className="day"
      data-date={info.date}
      data-weekday={info.weekday}
      data-holiday={info.holiday > 0 ? info.holiday : undefined}
      data-weekly={info.weekly > 0 ? info.weekly : undefined}
      data-leave={info.leave > 0 ? info.leave : undefined}
      data-redundant={info.redundant || undefined}
      data-today={isToday || undefined}
      data-stretch={inStretch || undefined}
      data-highlight={highlighted || undefined}
      aria-label={[formatDate(info.date), ...parts].join(", ")}
      aria-disabled={locked || undefined}
      title={title || undefined}
      onClick={() => {
        if (!locked) onToggle(info.date, info.room);
      }}
    >
      {Number(info.date.slice(8))}
    </button>
  );
}
