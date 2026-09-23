import type { AppState } from "../core/types";

export function createDefaultState(): AppState {
  return {
    version: 1,
    language: null,
    calendar: { id: null, regions: [], includeObservances: false },
    holidayRules: {},
    yearOverrides: {},
    customHolidays: [],
    weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    leave: {},
    theme: "system",
  };
}
