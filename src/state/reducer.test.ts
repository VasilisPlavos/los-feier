import { describe, expect, test } from "vitest";
import { reducer } from "./reducer";
import { createDefaultState } from "./defaults";

describe("reducer", () => {
  test("toggleLeave cycles and removes the key at 0", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({ "2026-04-07": 1 });
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({ "2026-04-07": 0.5 });
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({});
  });

  test("toggleLeave on a half-free day uses half leave", () => {
    const s = reducer(createDefaultState(), { type: "toggleLeave", date: "2026-09-14", room: 0.5 });
    expect(s.leave).toEqual({ "2026-09-14": 0.5 });
  });

  test("toggleLeave on a free day clears redundant leave", () => {
    const start = { ...createDefaultState(), leave: { "2026-04-06": 1 as const } };
    expect(reducer(start, { type: "toggleLeave", date: "2026-04-06", room: 0 }).leave).toEqual({});
  });

  test("cycleWeekly 0 → 0.5 → 1 → 0", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(0.5);
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(1);
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(0);
  });

  test("setHolidayRule for all years and removal", () => {
    let s = reducer(createDefaultState(), { type: "setHolidayRule", name: "K", scope: "all", rule: { enabled: true, fraction: 0.5 } });
    expect(s.holidayRules).toEqual({ K: { enabled: true, fraction: 0.5 } });
    s = reducer(s, { type: "setHolidayRule", name: "K", scope: "all", rule: null });
    expect(s.holidayRules).toEqual({});
  });

  test("setHolidayRule for one year removes empty years", () => {
    let s = reducer(createDefaultState(), { type: "setHolidayRule", name: "X", scope: 2026, rule: { enabled: false } });
    expect(s.yearOverrides).toEqual({ "2026": { X: { enabled: false } } });
    s = reducer(s, { type: "setHolidayRule", name: "X", scope: 2026, rule: {} });
    expect(s.yearOverrides).toEqual({});
  });

  test("custom holidays add / update / remove", () => {
    const holiday = { id: "a", name: "Company day", fraction: 1 as const, rule: { type: "yearly" as const, month: 6, day: 15 } };
    let s = reducer(createDefaultState(), { type: "addCustomHoliday", holiday });
    s = reducer(s, { type: "updateCustomHoliday", id: "a", changes: { fraction: 0.5 } });
    expect(s.customHolidays).toEqual([{ ...holiday, fraction: 0.5 }]);
    s = reducer(s, { type: "removeCustomHoliday", id: "a" });
    expect(s.customHolidays).toEqual([]);
  });

  test("calendar, regions, observances, language, theme", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "setCalendar", id: "de.ch" });
    s = reducer(s, { type: "setRegions", regions: ["Zurich", "Bern"] });
    s = reducer(s, { type: "setIncludeObservances", value: true });
    s = reducer(s, { type: "setLanguage", language: "el" });
    s = reducer(s, { type: "setTheme", theme: "dark" });
    expect(s.calendar).toEqual({ id: "de.ch", regions: ["Bern", "Zurich"], includeObservances: true });
    expect(s.language).toBe("el");
    expect(s.theme).toBe("dark");
  });

  test("replaceState and reset", () => {
    const other = { ...createDefaultState(), theme: "light" as const };
    expect(reducer(createDefaultState(), { type: "replaceState", state: other })).toBe(other);
    expect(reducer(other, { type: "reset" })).toEqual(createDefaultState());
  });

  test("never mutates the previous state", () => {
    const before = createDefaultState();
    const snapshot = JSON.stringify(before);
    reducer(before, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    reducer(before, { type: "cycleWeekly", weekday: 0 });
    reducer(before, { type: "setHolidayRule", name: "X", scope: 2026, rule: { enabled: false } });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
