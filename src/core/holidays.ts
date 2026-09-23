import { addDays, isValidIsoDate, isoFromParts, yearOf } from "./dates";
import type { AppState, CalendarFile, Fraction, HolidayRule, ResolvedHoliday } from "./types";

interface Effective {
  enabled: boolean;
  fraction: Fraction;
}

function isVisible(regions: string[] | undefined, selected: string[]): boolean {
  return !regions || regions.some((r) => selected.includes(r));
}

/** Applies rules in order; every field that is set overrides the previous value. */
function applyRules(defaults: Effective, ...rules: (HolidayRule | undefined)[]): Effective {
  let result = { ...defaults };
  for (const rule of rules) {
    if (!rule) continue;
    result = { enabled: rule.enabled ?? result.enabled, fraction: rule.fraction ?? result.fraction };
  }
  return result;
}

/**
 * All holidays visible in `year` (enabled and disabled), after the region filter,
 * the observance default, the user's rules for all years and the overrides for this year.
 */
export function resolveYearHolidays(state: AppState, calendar: CalendarFile | null, year: number): ResolvedHoliday[] {
  const out: ResolvedHoliday[] = [];
  const yearRules = state.yearOverrides[String(year)] ?? {};

  for (const event of calendar?.events ?? []) {
    if (!isVisible(event.regions, state.calendar.regions)) continue;
    const globalRule = state.holidayRules[event.name];
    const yearRule = yearRules[event.name];
    const effective = applyRules(
      { enabled: event.type === "public" || state.calendar.includeObservances, fraction: 1 },
      globalRule,
      yearRule,
    );
    for (let i = 0; i < (event.days ?? 1); i++) {
      const date = addDays(event.date, i);
      if (yearOf(date) !== year) continue;
      out.push({
        date,
        name: event.name,
        source: "google",
        type: event.type,
        tentative: event.tentative === true,
        ...effective,
        hasRule: globalRule !== undefined,
        hasYearOverride: yearRule !== undefined,
      });
    }
  }

  for (const custom of state.customHolidays) {
    const date = custom.rule.type === "once" ? custom.rule.date : isoFromParts(year, custom.rule.month, custom.rule.day);
    if (!isValidIsoDate(date) || yearOf(date) !== year) continue;
    const yearRule = yearRules[custom.name];
    out.push({
      date,
      name: custom.name,
      source: "custom",
      type: "custom",
      tentative: false,
      ...applyRules({ enabled: true, fraction: custom.fraction }, yearRule),
      customId: custom.id,
      hasRule: false,
      hasYearOverride: yearRule !== undefined,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Per date: the largest fraction among enabled holidays and their names. */
export function holidayFractions(holidays: ResolvedHoliday[]): Map<string, { fraction: number; names: string[] }> {
  const map = new Map<string, { fraction: number; names: string[] }>();
  for (const h of holidays) {
    if (!h.enabled) continue;
    const entry = map.get(h.date) ?? { fraction: 0, names: [] };
    entry.fraction = Math.max(entry.fraction, h.fraction);
    entry.names.push(h.name);
    map.set(h.date, entry);
  }
  return map;
}
