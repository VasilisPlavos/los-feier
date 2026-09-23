import { describe, expect, test } from "vitest";
import { reducer } from "./reducer";
import { createDefaultState } from "./defaults";
import { createDefaultProfile } from "../core/profiles";
import { makeProfile, makeState } from "../test/fixtures";

// makeState() has a single profile at 2020 (en.ch / Zurich) that covers every year.

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

  test("cycleWeekly 0 → 0.5 → 1 → 0 in the profile of the year", () => {
    let s = makeState({ profiles: { "2026": makeProfile() } });
    for (const expected of [0.5, 1, 0]) {
      s = reducer(s, { type: "cycleWeekly", year: 2026, weekday: 4 });
      expect(s.profiles["2026"].weeklyPlan[4]).toBe(expected);
    }
  });

  test("an edit in an unconfigured year copies the covering profile to that year", () => {
    const s = reducer(makeState(), { type: "cycleWeekly", year: 2027, weekday: 4 });
    expect(Object.keys(s.profiles).sort()).toEqual(["2020", "2027"]);
    expect(s.profiles["2020"].weeklyPlan[4]).toBe(0);
    expect(s.profiles["2027"].weeklyPlan[4]).toBe(0.5);
    expect(s.profiles["2027"].calendars).toEqual([{ id: "en.ch", regions: ["Zurich"] }]);
  });

  test("setHolidayRule sets a rule and an empty rule removes it", () => {
    let s = reducer(makeState(), { type: "setHolidayRule", year: 2020, name: "K", rule: { enabled: true, fraction: 0.5 } });
    expect(s.profiles["2020"].holidayRules).toEqual({ K: { enabled: true, fraction: 0.5 } });
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: {} });
    expect(s.profiles["2020"].holidayRules).toEqual({});
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: { enabled: false } });
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: null });
    expect(s.profiles["2020"].holidayRules).toEqual({});
  });

  test("custom holidays add / update / remove", () => {
    const holiday = { id: "a", name: "Company day", fraction: 1 as const, rule: { type: "yearly" as const, month: 6, day: 15 } };
    let s = reducer(makeState(), { type: "addCustomHoliday", year: 2020, holiday });
    s = reducer(s, { type: "updateCustomHoliday", year: 2020, id: "a", changes: { fraction: 0.5 } });
    expect(s.profiles["2020"].customHolidays).toEqual([{ ...holiday, fraction: 0.5 }]);
    s = reducer(s, { type: "removeCustomHoliday", year: 2020, id: "a" });
    expect(s.profiles["2020"].customHolidays).toEqual([]);
  });

  test("setCalendars drops duplicate ids, sorts and dedupes regions, stores observances", () => {
    const s = reducer(createDefaultState(), {
      type: "setCalendars",
      year: 2026,
      includeObservances: true,
      calendars: [
        { id: "en.ch", regions: ["Zurich", "Bern", "Zurich"] },
        { id: "en.christian", regions: [] },
        { id: "en.ch", regions: [] },
      ],
    });
    expect(Object.keys(s.profiles)).toEqual(["2026"]);
    expect(s.profiles["2026"].calendars).toEqual([
      { id: "en.ch", regions: ["Bern", "Zurich"] },
      { id: "en.christian", regions: [] },
    ]);
    expect(s.profiles["2026"].includeObservances).toBe(true);
  });

  test("setCalendars with no calendars still creates the profile (first run closed empty)", () => {
    const s = reducer(createDefaultState(), { type: "setCalendars", year: 2026, calendars: [], includeObservances: false });
    expect(s.profiles).toEqual({ "2026": createDefaultProfile() });
  });

  test("removeProfile removes a configured year when another one exists", () => {
    const s = makeState({ profiles: { "2020": makeProfile(), "2027": makeProfile({ calendars: [] }) } });
    expect(Object.keys(reducer(s, { type: "removeProfile", year: 2027 }).profiles)).toEqual(["2020"]);
  });

  test("REVIEW FOCUS: removeProfile keeps the only profile and ignores unconfigured years", () => {
    const s = makeState();
    expect(reducer(s, { type: "removeProfile", year: 2020 })).toBe(s);
    const two = makeState({ profiles: { "2020": makeProfile(), "2027": makeProfile() } });
    expect(reducer(two, { type: "removeProfile", year: 2025 })).toBe(two);
  });

  test("language and theme", () => {
    let s = reducer(createDefaultState(), { type: "setLanguage", language: "el" });
    s = reducer(s, { type: "setTheme", theme: "dark" });
    expect(s.language).toBe("el");
    expect(s.theme).toBe("dark");
  });

  test("replaceState and reset", () => {
    const other = { ...createDefaultState(), theme: "light" as const };
    expect(reducer(createDefaultState(), { type: "replaceState", state: other })).toBe(other);
    expect(reducer(other, { type: "reset" })).toEqual(createDefaultState());
  });

  test("never mutates the previous state", () => {
    const before = makeState();
    const snapshot = JSON.stringify(before);
    reducer(before, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    reducer(before, { type: "cycleWeekly", year: 2020, weekday: 0 });
    reducer(before, { type: "cycleWeekly", year: 2027, weekday: 0 });
    reducer(before, { type: "setHolidayRule", year: 2020, name: "X", rule: { enabled: false } });
    reducer(before, { type: "setCalendars", year: 2020, calendars: [], includeObservances: true });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
