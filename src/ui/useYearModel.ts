import { useMemo } from "react";
import { createDayResolver } from "../core/days";
import { resolveYearHolidays } from "../core/holidays";
import { findStretches, leaveUsed } from "../core/stats";
import type { AppState, CalendarFile } from "../core/types";

export function useYearModel(state: AppState, calendar: CalendarFile | null, year: number) {
  return useMemo(() => {
    const resolve = createDayResolver(state, calendar);
    return {
      resolve,
      holidays: resolveYearHolidays(state, calendar, year),
      leaveTotal: leaveUsed(year, resolve),
      stretches: findStretches(year, resolve),
    };
  }, [state, calendar, year]);
}
