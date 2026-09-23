import type { YearBounds } from "../data/calendars";
import { useI18n } from "../i18n/I18nProvider";

/** The year in the header; opens a list from the first to the last year any calendar has data for. */
export function YearPicker({ year, bounds, onChange }: { year: number; bounds: YearBounds | null; onChange(year: number): void }) {
  const { t } = useI18n();
  const years = bounds ? Array.from({ length: bounds.max - bounds.min + 1 }, (_, i) => bounds.min + i) : [year];
  return (
    <select className="year-picker" aria-label={t("header.year")} value={year} onChange={(e) => onChange(Number(e.target.value))}>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
