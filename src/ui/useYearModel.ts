import { useMemo } from "react";
import { createDayResolver } from "../core/days";
import { resolveYearHolidays } from "../core/holidays";
import { profileFor } from "../core/profiles";
import { findStretches, leaveUsed } from "../core/stats";
import type { AppState, CalendarFile } from "../core/types";

export function useYearModel(state: AppState, calendars: CalendarFile[], year: number) {
  return useMemo(() => {
    const resolve = createDayResolver(state, calendars);
    return {
      resolve,
      holidays: resolveYearHolidays(profileFor(state.profiles, year), calendars, year),
      leaveTotal: leaveUsed(year, resolve),
      stretches: findStretches(year, resolve),
    };
  }, [state, calendars, year]);
}
