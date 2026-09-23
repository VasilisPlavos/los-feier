import { nextLeaveValue } from "../core/days";
import { editProfile } from "../core/profiles";
import type {
  AppState, CustomHoliday, HolidayRule, SelectedCalendar, Theme, WeeklyPlan, WeeklyValue, YearProfile,
} from "../core/types";
import { createDefaultState } from "./defaults";

export type Action =
  | { type: "toggleLeave"; date: string; room: number }
  | { type: "setCalendars"; year: number; calendars: SelectedCalendar[]; includeObservances: boolean }
  | { type: "setHolidayRule"; year: number; name: string; rule: HolidayRule | null }
  | { type: "addCustomHoliday"; year: number; holiday: CustomHoliday }
  | { type: "updateCustomHoliday"; year: number; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
  | { type: "removeCustomHoliday"; year: number; id: string }
  | { type: "cycleWeekly"; year: number; weekday: number }
  | { type: "removeProfile"; year: number }
  | { type: "setLanguage"; language: string | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "replaceState"; state: AppState }
  | { type: "reset" };

const NEXT_WEEKLY: Record<WeeklyValue, WeeklyValue> = { 0: 0.5, 0.5: 1, 1: 0 };

function isEmptyRule(rule: HolidayRule | null): boolean {
  return !rule || (rule.enabled === undefined && rule.fraction === undefined);
}

/** First occurrence of each id wins; regions sorted and unique. */
function normalizeCalendars(calendars: SelectedCalendar[]): SelectedCalendar[] {
  const seen = new Set<string>();
  const out: SelectedCalendar[] = [];
  for (const c of calendars) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, regions: [...new Set(c.regions)].sort() });
  }
  return out;
}

/** Edits the profile of `year`, copying the covering profile first when `year` has none of its own. */
function withProfile(state: AppState, year: number, fn: (profile: YearProfile) => YearProfile): AppState {
  return { ...state, profiles: editProfile(state.profiles, year, fn) };
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
    case "setCalendars":
      return withProfile(state, action.year, (p) => ({
        ...p,
        calendars: normalizeCalendars(action.calendars),
        includeObservances: action.includeObservances,
      }));
    case "setHolidayRule":
      return withProfile(state, action.year, (p) => {
        const holidayRules = { ...p.holidayRules };
        if (isEmptyRule(action.rule)) delete holidayRules[action.name];
        else holidayRules[action.name] = action.rule!;
        return { ...p, holidayRules };
      });
    case "addCustomHoliday":
      return withProfile(state, action.year, (p) => ({ ...p, customHolidays: [...p.customHolidays, action.holiday] }));
    case "updateCustomHoliday":
      return withProfile(state, action.year, (p) => ({
        ...p,
        customHolidays: p.customHolidays.map((c) => (c.id === action.id ? { ...c, ...action.changes } : c)),
      }));
    case "removeCustomHoliday":
      return withProfile(state, action.year, (p) => ({
        ...p,
        customHolidays: p.customHolidays.filter((c) => c.id !== action.id),
      }));
    case "cycleWeekly":
      return withProfile(state, action.year, (p) => {
        const weeklyPlan = [...p.weeklyPlan] as WeeklyPlan;
        weeklyPlan[action.weekday] = NEXT_WEEKLY[weeklyPlan[action.weekday]];
        return { ...p, weeklyPlan };
      });
    case "removeProfile": {
      const key = String(action.year);
      if (!Object.hasOwn(state.profiles, key) || Object.keys(state.profiles).length <= 1) return state;
      const profiles = { ...state.profiles };
      delete profiles[key];
      return { ...state, profiles };
    }
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
