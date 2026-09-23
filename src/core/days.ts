import { weekday, yearOf } from "./dates";
import { holidayFractions, resolveYearHolidays } from "./holidays";
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

/** Returns a function that computes DayInfo for any date, caching holidays per year. */
export function createDayResolver(state: AppState, calendar: CalendarFile | null): DayResolver {
  const holidaysByYear = new Map<number, ReturnType<typeof holidayFractions>>();
  const days = new Map<string, DayInfo>();
  return (date) => {
    const cached = days.get(date);
    if (cached) return cached;
    const year = yearOf(date);
    let fractions = holidaysByYear.get(year);
    if (!fractions) {
      fractions = holidayFractions(resolveYearHolidays(state, calendar, year));
      holidaysByYear.set(year, fractions);
    }
    const info = computeDay(date, fractions.get(date), state.weeklyPlan, state.leave);
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
