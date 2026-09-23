import { monthDates, weekday } from "../core/dates";
import type { DayResolver } from "../core/days";
import { useI18n } from "../i18n/I18nProvider";
import { DayCell } from "./DayCell";

interface Props {
  year: number;
  month: number;
  resolve: DayResolver;
  today: string;
  stretchDays: ReadonlySet<string>;
  highlightDays: ReadonlySet<string>;
  onToggle(date: string, room: number): void;
}

export function MonthCard({ year, month, resolve, today, stretchDays, highlightDays, onToggle }: Props) {
  const { monthName, weekdayShort } = useI18n();
  const dates = monthDates(year, month);
  const blanks = weekday(dates[0]);
  return (
    <section className="month" data-month={month} aria-labelledby={`month-${month}`}>
      <h3 id={`month-${month}`}>{monthName(month)}</h3>
      <div className="days">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={`w${i}`} className="weekday-label" aria-hidden="true">
            {weekdayShort(i)}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} className="day-blank" />
        ))}
        {dates.map((date) => (
          <DayCell
            key={date}
            info={resolve(date)}
            isToday={date === today}
            inStretch={stretchDays.has(date)}
            highlighted={highlightDays.has(date)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}
