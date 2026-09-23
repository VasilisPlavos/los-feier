import { weekday, yearOf } from "./dates";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { profileFor } from "./profiles";
import type { AppState, CalendarFile, DayInfo, Fraction, WeeklyPlan } from "./types";

export function computeDay(
  date: string,
  holiday: { fraction: number; names: string[] } | undefined,
  weeklyPlan: WeeklyPlan,
  leave: Record<string, Fraction>,
): DayInfo {
  const wd = weekday(date);
  const holidayFraction = holiday?.fraction ?? 0;
  const weekly = weeklyPlan[wd];
  const base = Math.min(1, holidayFraction + weekly);
  const room = 1 - base;
  const stored = leave[date] ?? 0;
  const leaveEff = Math.min(stored, room);
  return {
    date,
    weekday: wd,
    holiday: holidayFraction,
    holidayNames: holiday?.names ?? [],
    weekly,
    base,
    room,
    leave: stored,
    leaveEff,
    free: base + leaveEff >= 1,
    redundant: stored > leaveEff,
  };
}

export type DayResolver = (date: string) => DayInfo;

/** Returns a function that computes DayInfo for any date, using the profile of that date's year. */
export function createDayResolver(state: Pick<AppState, "profiles" | "leave">, calendars: CalendarFile[]): DayResolver {
  const years = new Map<number, { fractions: ReturnType<typeof holidayFractions>; weeklyPlan: WeeklyPlan }>();
  const days = new Map<string, DayInfo>();
  return (date) => {
    const cached = days.get(date);
    if (cached) return cached;
    const year = yearOf(date);
    let entry = years.get(year);
    if (!entry) {
      const profile = profileFor(state.profiles, year);
      entry = { fractions: holidayFractions(resolveYearHolidays(profile, calendars, year)), weeklyPlan: profile.weeklyPlan };
      years.set(year, entry);
    }
    const info = computeDay(date, entry.fractions.get(date), entry.weeklyPlan, state.leave);
    days.set(date, info);
    return info;
  };
}

/** What a click on a day does to its stored leave (see the table in the plan). */
export function nextLeaveValue(room: number, current: number): 0 | 0.5 | 1 {
  if (room <= 0) return 0;
  if (room === 0.5) return current === 0 ? 0.5 : 0;
  if (current === 0) return 1;
  if (current === 1) return 0.5;
  return 0;
}
