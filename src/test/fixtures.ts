import { createDefaultProfile } from "../core/profiles";
import { createDefaultState } from "../state/defaults";
import type { AppState, CalendarFile, GoogleHoliday, YearProfile } from "../core/types";

export function makeCalendar(id: string, name: string, events: GoogleHoliday[], from = 2025, to = 2027): CalendarFile {
  return { id, name, lang: id.split(".")[0], from, to, count: events.length, fetchedAt: "2026-09-23T00:00:00.000Z", events };
}

/** A tiny Swiss-like calendar. 2026: Apr 3 = Friday, Apr 6 = Monday, Sep 12–13 = weekend, Sep 14 = Monday, Dec 25 = Friday. */
export const zurichFixture: CalendarFile = makeCalendar("en.ch", "Holidays in Switzerland", [
  { date: "2025-12-25", name: "Christmas Day", type: "public" },
  { date: "2025-12-26", name: "St. Stephen's Day", type: "public" },
  { date: "2026-01-01", name: "New Year's Day", type: "public" },
  { date: "2026-03-19", name: "Saint Joseph's Day", type: "public", regions: ["Lucerne"] },
  { date: "2026-04-03", name: "Good Friday", type: "public", regions: ["Zurich", "Bern"] },
  { date: "2026-04-06", name: "Easter Monday", type: "public", regions: ["Zurich", "Bern"] },
  { date: "2026-09-12", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-09-13", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-09-14", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-12-25", name: "Christmas Day", type: "public" },
  { date: "2026-12-26", name: "St. Stephen's Day", type: "public" },
  { date: "2027-01-01", name: "New Year's Day", type: "public" },
]);

/** A profile with calendar en.ch / Zurich, plus any overrides. */
export function makeProfile(overrides: Partial<YearProfile> = {}): YearProfile {
  return { ...createDefaultProfile(), calendars: [{ id: "en.ch", regions: ["Zurich"] }], ...overrides };
}

type StateOverrides = Partial<YearProfile> & Partial<Pick<AppState, "language" | "theme" | "leave" | "profiles">>;

/**
 * Default state with one profile at 2020 — it covers every year — built from `makeProfile` and the
 * profile fields in `overrides`. Pass `profiles` to replace the profiles entirely.
 */
export function makeState(overrides: StateOverrides = {}): AppState {
  const { language, theme, leave, profiles, ...profile } = overrides;
  const base = createDefaultState();
  return {
    ...base,
    language: language ?? base.language,
    theme: theme ?? base.theme,
    leave: leave ?? base.leave,
    profiles: profiles ?? { "2020": makeProfile(profile) },
  };
}

/** A tiny religious calendar without regions that overlaps the Swiss one by name and date. */
export const christianFixture: CalendarFile = makeCalendar("en.christian", "Christian Holidays", [
  { date: "2026-04-03", name: "Good Friday", type: "observance" },
  { date: "2026-12-24", name: "Christmas Eve", type: "observance", tentative: true },
  { date: "2026-12-25", name: "Christmas Day", type: "observance" },
]);
