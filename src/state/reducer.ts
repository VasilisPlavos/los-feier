import { nextLeaveValue } from "../core/days";
import type { AppState, CustomHoliday, HolidayRule, Theme, WeeklyPlan, WeeklyValue } from "../core/types";
import { createDefaultState } from "./defaults";

export type Action =
  | { type: "toggleLeave"; date: string; room: number }
  | { type: "cycleWeekly"; weekday: number }
  | { type: "setHolidayRule"; name: string; scope: "all" | number; rule: HolidayRule | null }
  | { type: "addCustomHoliday"; holiday: CustomHoliday }
  | { type: "updateCustomHoliday"; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
  | { type: "removeCustomHoliday"; id: string }
  | { type: "setCalendar"; id: string }
  | { type: "setRegions"; regions: string[] }
  | { type: "setIncludeObservances"; value: boolean }
  | { type: "setLanguage"; language: string | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "replaceState"; state: AppState }
  | { type: "reset" };

const NEXT_WEEKLY: Record<WeeklyValue, WeeklyValue> = { 0: 0.5, 0.5: 1, 1: 0 };

function isEmptyRule(rule: HolidayRule | null): boolean {
  return !rule || (rule.enabled === undefined && rule.fraction === undefined);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "toggleLeave": {
      const next = nextLeaveValue(action.room, state.leave[action.date] ?? 0);
      const leave = { ...state.leave };
      if (next === 0) delete leave[action.date];
      else leave[action.date] = next;
      return { ...state, leave };
    }
    case "cycleWeekly": {
      const weeklyPlan = [...state.weeklyPlan] as WeeklyPlan;
      weeklyPlan[action.weekday] = NEXT_WEEKLY[weeklyPlan[action.weekday]];
      return { ...state, weeklyPlan };
    }
    case "setHolidayRule": {
      const remove = isEmptyRule(action.rule);
      if (action.scope === "all") {
        const holidayRules = { ...state.holidayRules };
        if (remove) delete holidayRules[action.name];
        else holidayRules[action.name] = action.rule!;
        return { ...state, holidayRules };
      }
      const key = String(action.scope);
      const yearRules = { ...(state.yearOverrides[key] ?? {}) };
      if (remove) delete yearRules[action.name];
      else yearRules[action.name] = action.rule!;
      const yearOverrides = { ...state.yearOverrides };
      if (Object.keys(yearRules).length > 0) yearOverrides[key] = yearRules;
      else delete yearOverrides[key];
      return { ...state, yearOverrides };
    }
    case "addCustomHoliday":
      return { ...state, customHolidays: [...state.customHolidays, action.holiday] };
    case "updateCustomHoliday":
      return {
        ...state,
        customHolidays: state.customHolidays.map((c) => (c.id === action.id ? { ...c, ...action.changes } : c)),
      };
    case "removeCustomHoliday":
      return { ...state, customHolidays: state.customHolidays.filter((c) => c.id !== action.id) };
    case "setCalendar":
      return { ...state, calendar: { ...state.calendar, id: action.id } };
    case "setRegions":
      return { ...state, calendar: { ...state.calendar, regions: [...action.regions].sort() } };
    case "setIncludeObservances":
      return { ...state, calendar: { ...state.calendar, includeObservances: action.value } };
    case "setLanguage":
      return { ...state, language: action.language };
    case "setTheme":
      return { ...state, theme: action.theme };
    case "replaceState":
      return action.state;
    case "reset":
      return createDefaultState();
  }
}
