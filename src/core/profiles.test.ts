import { describe, expect, test } from "vitest";
import { calendarIdsFor, createDefaultProfile, editProfile, profileFor, profileYearFor } from "./profiles";
import type { YearProfile } from "./types";

const p = (id: string): YearProfile => ({ ...createDefaultProfile(), calendars: [{ id, regions: [] }] });
const profiles = { "2026": p("en.ch"), "2028": p("en.german") };
const disableX = (profile: YearProfile): YearProfile => ({
  ...profile,
  holidayRules: { ...profile.holidayRules, X: { enabled: false } },
});

describe("profileYearFor", () => {
  test.each([
    [2020, 2026],
    [2026, 2026],
    [2027, 2026],
    [2028, 2028],
    [2040, 2028],
  ])("year %i uses the profile of %i", (year, expected) => {
    expect(profileYearFor(profiles, year)).toBe(expected);
  });

  test("no profiles → null", () => {
    expect(profileYearFor({}, 2026)).toBeNull();
  });
});

describe("profileFor", () => {
  test("returns the covering profile itself", () => {
    expect(profileFor(profiles, 2027)).toBe(profiles["2026"]);
  });

  test("no profiles → the default profile", () => {
    expect(profileFor({}, 2026)).toEqual({
      calendars: [],
      includeObservances: false,
      holidayRules: {},
      customHolidays: [],
      weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    });
  });
});

describe("editProfile", () => {
  test("editing an unconfigured year copies the covering profile first", () => {
    const next = editProfile(profiles, 2027, disableX);
    expect(Object.keys(next).sort()).toEqual(["2026", "2027", "2028"]);
    expect(next["2027"]).toEqual({ ...profiles["2026"], holidayRules: { X: { enabled: false } } });
    expect(next["2026"]).toBe(profiles["2026"]);
    expect(next["2028"]).toBe(profiles["2028"]);
  });

  test("the copy shares no objects with the original", () => {
    const next = editProfile(profiles, 2027, (profile) => profile);
    expect(next["2027"]).toEqual(profiles["2026"]);
    expect(next["2027"]).not.toBe(profiles["2026"]);
    expect(next["2027"].calendars).not.toBe(profiles["2026"].calendars);
    expect(next["2027"].calendars[0]).not.toBe(profiles["2026"].calendars[0]);
  });

  test("editing before the first profile creates a new first profile", () => {
    const next = editProfile(profiles, 2024, disableX);
    expect(profileYearFor(next, 2020)).toBe(2024);
    expect(profileYearFor(next, 2025)).toBe(2024);
    expect(profileYearFor(next, 2026)).toBe(2026);
  });

  test("editing a configured year changes only that year and never the input", () => {
    const next = editProfile(profiles, 2026, disableX);
    expect(next["2026"].holidayRules).toEqual({ X: { enabled: false } });
    expect(next["2028"]).toBe(profiles["2028"]);
    expect(profiles["2026"].holidayRules).toEqual({});
  });

  test("editing with no profiles starts from the default profile", () => {
    expect(editProfile({}, 2026, disableX)).toEqual({
      "2026": { ...createDefaultProfile(), holidayRules: { X: { enabled: false } } },
    });
  });
});

describe("calendarIdsFor", () => {
  test("unique, sorted ids of the profiles covering the given years", () => {
    const two = { ...profiles, "2028": { ...p("en.german"), calendars: [{ id: "en.german", regions: [] }, { id: "en.ch", regions: [] }] } };
    expect(calendarIdsFor(two, [2027, 2028, 2029])).toEqual(["en.ch", "en.german"]);
    expect(calendarIdsFor({}, [2026])).toEqual([]);
  });
});
