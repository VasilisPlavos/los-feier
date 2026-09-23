import { addDays, isValidIsoDate, isoFromParts, yearOf } from "./dates";
import type { CalendarFile, Fraction, HolidayRule, HolidayType, ResolvedHoliday, YearProfile } from "./types";

interface Effective {
  enabled: boolean;
  fraction: Fraction;
}

interface Occurrence {
  date: string;
  name: string;
  type: HolidayType;
  tentative: boolean;
  calendarIds: string[];
}

/** Google marks regional holidays with a suffix, per calendar language. */
const REGIONAL_SUFFIX = / \((regional holiday|regionaler Feiertag|jour férié local|festività regionale)\)$/;

/** The holiday's name without Google's regional marker, so the same holiday from another calendar merges with it. */
export function holidayName(raw: string): string {
  return raw.replace(REGIONAL_SUFFIX, "");
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
 * All holidays visible in `year` (enabled and disabled) for the calendars of `profile`: each
 * calendar filtered by its own regions, the same name on the same date merged into one entry,
 * then the observance default and the profile's rules (by name) applied. Calendars of the
 * profile that are missing from `calendars` (not loaded, failed) are skipped.
 */
export function resolveYearHolidays(profile: YearProfile, calendars: CalendarFile[], year: number): ResolvedHoliday[] {
  const ruleFor = (name: string) => (Object.hasOwn(profile.holidayRules, name) ? profile.holidayRules[name] : undefined);
  const merged = new Map<string, Occurrence>();

  for (const selected of profile.calendars) {
    const calendar = calendars.find((c) => c.id === selected.id);
    if (!calendar) continue;
    for (const event of calendar.events) {
      if (!isVisible(event.regions, selected.regions)) continue;
      const tentative = event.tentative === true;
      const name = holidayName(event.name);
      for (let i = 0; i < (event.days ?? 1); i++) {
        const date = addDays(event.date, i);
        if (yearOf(date) !== year) continue;
        const key = `${date}|${name}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { date, name, type: event.type, tentative, calendarIds: [calendar.id] });
          continue;
        }
        if (event.type === "public") existing.type = "public";
        existing.tentative = existing.tentative && tentative;
        if (!existing.calendarIds.includes(calendar.id)) existing.calendarIds.push(calendar.id);
      }
    }
  }

  const out: ResolvedHoliday[] = [];
  for (const o of merged.values()) {
    const rule = ruleFor(o.name);
    out.push({
      date: o.date,
      name: o.name,
      source: "google",
      type: o.type,
      tentative: o.tentative,
      ...applyRules({ enabled: o.type === "public" || profile.includeObservances, fraction: 1 }, rule),
      calendarIds: o.calendarIds,
      hasRule: rule !== undefined,
    });
  }

  for (const custom of profile.customHolidays) {
    const date = custom.rule.type === "once" ? custom.rule.date : isoFromParts(year, custom.rule.month, custom.rule.day);
    if (!isValidIsoDate(date) || yearOf(date) !== year) continue;
    const rule = ruleFor(custom.name);
    out.push({
      date,
      name: custom.name,
      source: "custom",
      type: "custom",
      tentative: false,
      // A custom holiday's fraction is edited on the holiday itself; rules only switch it on/off.
      ...applyRules({ enabled: true, fraction: custom.fraction }, rule && { enabled: rule.enabled }),
      calendarIds: [],
      customId: custom.id,
      hasRule: rule !== undefined,
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
