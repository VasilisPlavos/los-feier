import type { YearProfile } from "./types";

/** Configured year ("2026") -> the profile that applies from that year until the next configured one. */
export type Profiles = Record<string, YearProfile>;

export function createDefaultProfile(): YearProfile {
  return { calendars: [], includeObservances: false, holidayRules: {}, customHolidays: [], weeklyPlan: [0, 0, 0, 0, 0, 1, 1] };
}

/** The configured year whose profile applies to `year`: the latest one ≤ year, else the earliest one. */
export function profileYearFor(profiles: Profiles, year: number): number | null {
  const years = Object.keys(profiles).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return null;
  let found = years[0];
  for (const y of years) if (y <= year) found = y;
  return found;
}

export function profileFor(profiles: Profiles, year: number): YearProfile {
  const key = profileYearFor(profiles, year);
  return key === null ? createDefaultProfile() : profiles[String(key)];
}

/** Applies `fn` to the profile of `year`, first copying the covering profile when `year` has none of its own. */
export function editProfile(profiles: Profiles, year: number, fn: (profile: YearProfile) => YearProfile): Profiles {
  const key = String(year);
  const current = Object.hasOwn(profiles, key) ? profiles[key] : structuredClone(profileFor(profiles, year));
  return { ...profiles, [key]: fn(current) };
}

/** Every calendar id used by the profiles that cover `years`. */
export function calendarIdsFor(profiles: Profiles, years: number[]): string[] {
  const ids = new Set(years.flatMap((y) => profileFor(profiles, y).calendars.map((c) => c.id)));
  return [...ids].sort();
}
