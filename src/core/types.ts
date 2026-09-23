/** A holiday or leave amount: half day or full day. */
export type Fraction = 0.5 | 1;

/** Weekly plan value for one weekday: 0 = working day, 0.5 = half day off, 1 = day off. */
export type WeeklyValue = 0 | 0.5 | 1;

/** Monday … Sunday. */
export type WeeklyPlan = [WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue];

/** A user adjustment of a holiday, stored by holiday name. Missing fields = keep default. */
export interface HolidayRule {
  enabled?: boolean;
  fraction?: Fraction;
}

export type CustomRule =
  | { type: "yearly"; month: number; day: number } // every year on month/day (1-based)
  | { type: "once"; date: string }; // exactly one date

export interface CustomHoliday {
  id: string;
  name: string;
  fraction: Fraction;
  rule: CustomRule;
}

export type Theme = "system" | "light" | "dark";

/** Everything the user chose. Saved as one JSON object. */
export interface AppState {
  version: 1;
  language: string | null; // null = follow the system language
  calendar: {
    id: string | null; // e.g. "en.ch"; null = not chosen yet
    regions: string[]; // e.g. ["Zurich"]; [] = national holidays only
    includeObservances: boolean;
  };
  holidayRules: Record<string, HolidayRule>; // holiday name -> rule, all years
  yearOverrides: Record<string, Record<string, HolidayRule>>; // "2026" -> holiday name -> rule
  customHolidays: CustomHoliday[];
  weeklyPlan: WeeklyPlan;
  leave: Record<string, Fraction>; // "YYYY-MM-DD" -> leave taken
  theme: Theme;
}

export type HolidayType = "public" | "observance";

/** One event of a Google calendar file (data/holidays/<id>.json). */
export interface GoogleHoliday {
  date: string;
  name: string;
  type: HolidayType;
  regions?: string[];
  days?: number;
  tentative?: true;
}

export interface CalendarIndexEntry {
  id: string;
  name: string;
  lang: string;
  from: number;
  to: number;
  count: number;
}

export interface CalendarFile extends CalendarIndexEntry {
  fetchedAt: string;
  events: GoogleHoliday[];
}

/** A holiday as it applies to one date in one year, after filters and user rules. */
export interface ResolvedHoliday {
  date: string;
  name: string;
  source: "google" | "custom";
  type: HolidayType | "custom";
  tentative: boolean;
  enabled: boolean;
  fraction: Fraction;
  customId?: string;
  hasRule: boolean; // a holidayRules entry exists for this name
  hasYearOverride: boolean; // a yearOverrides entry exists for this name in this year
}

/** Everything the UI and the statistics need to know about one date. */
export interface DayInfo {
  date: string;
  weekday: number; // 0 = Monday … 6 = Sunday
  holiday: number; // 0 | 0.5 | 1 — largest fraction of the enabled holidays on this date
  holidayNames: string[]; // names of the enabled holidays on this date
  weekly: WeeklyValue;
  base: number; // min(1, holiday + weekly)
  room: number; // 1 - base: how much leave can still be useful on this day
  leave: number; // stored leave (0 if none)
  leaveEff: number; // min(leave, room): leave that actually counts
  free: boolean; // base + leaveEff >= 1
  redundant: boolean; // leave > leaveEff: some stored leave is not needed
}

/** A run of consecutive free days (length >= 3). */
export interface Stretch {
  start: string;
  end: string;
  length: number;
  leaveUsed: number; // sum of leaveEff inside the run
}
