import { describe, expect, test } from "vitest";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { makeCalendar, makeState, zurichFixture } from "../test/fixtures";

const names = (list: { name: string }[]) => list.map((h) => h.name);

describe("resolveYearHolidays", () => {
  test("without regions only national holidays are visible", () => {
    const state = makeState({ calendar: { id: "en.ch", regions: [], includeObservances: false } });
    expect(names(resolveYearHolidays(state, zurichFixture, 2026))).toEqual([
      "New Year's Day", "Christmas Day", "St. Stephen's Day",
    ]);
  });

  test("region filter shows national + matching regional holidays", () => {
    const list = resolveYearHolidays(makeState(), zurichFixture, 2026);
    expect(names(list)).toContain("Good Friday");
    expect(names(list)).not.toContain("Saint Joseph's Day"); // Lucerne only
  });

  test("observances are visible but disabled by default", () => {
    const list = resolveYearHolidays(makeState(), zurichFixture, 2026);
    const knaben = list.filter((h) => h.name === "Knabenschiessen (Zurich)");
    expect(knaben).toHaveLength(3);
    expect(knaben.every((h) => !h.enabled && h.type === "observance")).toBe(true);
    const goodFriday = list.find((h) => h.name === "Good Friday")!;
    expect(goodFriday).toMatchObject({ enabled: true, fraction: 1, source: "google", hasRule: false });
  });

  test("includeObservances enables observances", () => {
    const state = makeState({ calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: true } });
    const list = resolveYearHolidays(state, zurichFixture, 2026);
    expect(list.filter((h) => h.name.startsWith("Knaben")).every((h) => h.enabled)).toBe(true);
  });

  test("holidayRules apply by name to every date with that name", () => {
    const state = makeState({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } } });
    const knaben = resolveYearHolidays(state, zurichFixture, 2026).filter((h) => h.name.startsWith("Knaben"));
    expect(knaben.map((h) => [h.date, h.enabled, h.fraction, h.hasRule])).toEqual([
      ["2026-09-12", true, 0.5, true],
      ["2026-09-13", true, 0.5, true],
      ["2026-09-14", true, 0.5, true],
    ]);
  });

  test("yearOverrides beat holidayRules field by field, only in their year", () => {
    const state = makeState({
      holidayRules: { "St. Stephen's Day": { enabled: false, fraction: 0.5 } },
      yearOverrides: { "2026": { "St. Stephen's Day": { enabled: true } } },
    });
    const in2026 = resolveYearHolidays(state, zurichFixture, 2026).find((h) => h.name === "St. Stephen's Day")!;
    expect(in2026).toMatchObject({ enabled: true, fraction: 0.5, hasRule: true, hasYearOverride: true });
    const in2025 = resolveYearHolidays(state, zurichFixture, 2025).find((h) => h.name === "St. Stephen's Day")!;
    expect(in2025).toMatchObject({ enabled: false, fraction: 0.5, hasYearOverride: false });
  });

  test("custom holidays: yearly, once, 29 February and year overrides", () => {
    const state = makeState({
      customHolidays: [
        { id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } },
        { id: "b", name: "Office closed", fraction: 0.5, rule: { type: "once", date: "2026-12-24" } },
        { id: "c", name: "Leap party", fraction: 1, rule: { type: "yearly", month: 2, day: 29 } },
      ],
      yearOverrides: { "2027": { "Company day": { enabled: false } } },
    });
    const y2026 = resolveYearHolidays(state, zurichFixture, 2026).filter((h) => h.source === "custom");
    expect(y2026.map((h) => [h.date, h.name, h.fraction, h.enabled, h.customId])).toEqual([
      ["2026-06-15", "Company day", 1, true, "a"],
      ["2026-12-24", "Office closed", 0.5, true, "b"],
    ]);
    const y2027 = resolveYearHolidays(state, zurichFixture, 2027).filter((h) => h.source === "custom");
    expect(y2027.map((h) => [h.name, h.enabled])).toEqual([["Company day", false]]);
    const y2028 = resolveYearHolidays(state, zurichFixture, 2028).filter((h) => h.source === "custom");
    expect(names(y2028)).toEqual(["Leap party", "Company day"]);
  });

  test("multi-day events expand and are clipped to the year", () => {
    const cal = makeCalendar("en.xx", "X", [{ date: "2026-12-31", name: "Long feast", type: "public", days: 3 }]);
    const state = makeState({ calendar: { id: "en.xx", regions: [], includeObservances: false } });
    expect(resolveYearHolidays(state, cal, 2026).map((h) => h.date)).toEqual(["2026-12-31"]);
    expect(resolveYearHolidays(state, cal, 2027).map((h) => h.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });

  test("a year outside the calendar data returns only custom holidays", () => {
    const state = makeState({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(names(resolveYearHolidays(state, zurichFixture, 2019))).toEqual(["Company day"]);
    expect(resolveYearHolidays(state, null, 2026)).toHaveLength(1);
  });
});

describe("holidayFractions", () => {
  test("uses the largest enabled fraction per date and ignores disabled holidays", () => {
    const map = holidayFractions([
      { date: "2026-01-01", name: "A", source: "google", type: "public", tentative: false, enabled: true, fraction: 0.5, hasRule: false, hasYearOverride: false },
      { date: "2026-01-01", name: "B", source: "google", type: "public", tentative: false, enabled: true, fraction: 1, hasRule: false, hasYearOverride: false },
      { date: "2026-01-02", name: "C", source: "google", type: "observance", tentative: false, enabled: false, fraction: 1, hasRule: false, hasYearOverride: false },
    ]);
    expect(map.get("2026-01-01")).toEqual({ fraction: 1, names: ["A", "B"] });
    expect(map.has("2026-01-02")).toBe(false);
  });
});
