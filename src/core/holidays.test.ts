import { describe, expect, test } from "vitest";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { christianFixture, makeCalendar, makeProfile, zurichFixture } from "../test/fixtures";

const names = (list: { name: string }[]) => list.map((h) => h.name);
const both = [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }];

describe("resolveYearHolidays", () => {
  test("without regions only national holidays are visible", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: [] }] });
    expect(names(resolveYearHolidays(profile, [zurichFixture], 2026))).toEqual([
      "New Year's Day", "Christmas Day", "St. Stephen's Day",
    ]);
  });

  test("region filter shows national + matching regional holidays", () => {
    const list = resolveYearHolidays(makeProfile(), [zurichFixture], 2026);
    expect(names(list)).toContain("Good Friday");
    expect(names(list)).not.toContain("Saint Joseph's Day"); // Lucerne only
  });

  test("observances are visible but disabled by default", () => {
    const list = resolveYearHolidays(makeProfile(), [zurichFixture], 2026);
    const knaben = list.filter((h) => h.name === "Knabenschiessen (Zurich)");
    expect(knaben).toHaveLength(3);
    expect(knaben.every((h) => !h.enabled && h.type === "observance")).toBe(true);
    expect(list.find((h) => h.name === "Good Friday")).toMatchObject({
      enabled: true, fraction: 1, source: "google", hasRule: false, calendarIds: ["en.ch"],
    });
  });

  test("includeObservances enables observances", () => {
    const list = resolveYearHolidays(makeProfile({ includeObservances: true }), [zurichFixture], 2026);
    expect(list.filter((h) => h.name.startsWith("Knaben")).every((h) => h.enabled)).toBe(true);
  });

  test("holidayRules apply by name to every date with that name", () => {
    const profile = makeProfile({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } } });
    const knaben = resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.name.startsWith("Knaben"));
    expect(knaben.map((h) => [h.date, h.enabled, h.fraction, h.hasRule])).toEqual([
      ["2026-09-12", true, 0.5, true],
      ["2026-09-13", true, 0.5, true],
      ["2026-09-14", true, 0.5, true],
    ]);
  });

  test("every selected calendar contributes, each filtered by its own regions", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: [] }, { id: "en.christian", regions: [] }] });
    const list = resolveYearHolidays(profile, [zurichFixture, christianFixture], 2026);
    expect(names(list)).toContain("Christmas Eve");
    // Good Friday is regional in en.ch (no region chosen) but national in en.christian:
    expect(list.filter((h) => h.name === "Good Friday")).toEqual([
      expect.objectContaining({ type: "observance", enabled: false, calendarIds: ["en.christian"] }),
    ]);
  });

  test("REVIEW FOCUS: the same name on the same date is one entry; public wins; both calendar ids", () => {
    const list = resolveYearHolidays(makeProfile({ calendars: both }), [zurichFixture, christianFixture], 2026);
    expect(list.filter((h) => h.name === "Good Friday")).toEqual([
      expect.objectContaining({ date: "2026-04-03", type: "public", enabled: true, calendarIds: ["en.ch", "en.christian"] }),
    ]);
    expect(list.filter((h) => h.name === "Christmas Day")).toHaveLength(1);
  });

  test("REVIEW FOCUS: a rule by name covers the merged holiday of both calendars", () => {
    const profile = makeProfile({ calendars: both, holidayRules: { "Christmas Day": { enabled: false } } });
    const xmas = resolveYearHolidays(profile, [zurichFixture, christianFixture], 2026).filter((h) => h.name === "Christmas Day");
    expect(xmas).toEqual([expect.objectContaining({ enabled: false, hasRule: true })]);
  });

  test("REVIEW: Google's regional-holiday suffix does not stop the merge (real calendar names)", () => {
    const ch = makeCalendar("en.ch", "CH", [
      { date: "2026-04-03", name: "Good Friday (regional holiday)", type: "public", regions: ["Zurich"] },
    ]);
    const de = makeCalendar("de.ch", "DE", [
      { date: "2026-04-06", name: "Ostermontag (regionaler Feiertag)", type: "public", regions: ["Zurich"] },
    ]);
    const profile = makeProfile({
      calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "de.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }],
      holidayRules: { "Good Friday": { fraction: 0.5 } },
    });
    const list = resolveYearHolidays(profile, [ch, de, christianFixture], 2026);
    expect(list.filter((h) => h.date === "2026-04-03")).toEqual([
      expect.objectContaining({ name: "Good Friday", type: "public", fraction: 0.5, hasRule: true, calendarIds: ["en.ch", "en.christian"] }),
    ]);
    expect(names(list)).toContain("Ostermontag");
  });

  test("tentative only when every source is tentative", () => {
    const a = makeCalendar("en.aa", "A", [{ date: "2026-05-01", name: "Feast", type: "public", tentative: true }]);
    const b = makeCalendar("en.bb", "B", [{ date: "2026-05-01", name: "Feast", type: "public" }]);
    const calendars = [{ id: "en.aa", regions: [] }, { id: "en.bb", regions: [] }];
    expect(resolveYearHolidays(makeProfile({ calendars }), [a, b], 2026)[0].tentative).toBe(false);
    expect(resolveYearHolidays(makeProfile({ calendars }), [a], 2026)[0].tentative).toBe(true);
  });

  test("selected calendars that are not loaded are skipped", () => {
    const list = resolveYearHolidays(makeProfile({ calendars: both }), [zurichFixture], 2026);
    expect(names(list)).not.toContain("Christmas Eve");
    expect(names(list)).toContain("Good Friday");
  });

  test("custom holidays: yearly, once and 29 February", () => {
    const profile = makeProfile({
      customHolidays: [
        { id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } },
        { id: "b", name: "Office closed", fraction: 0.5, rule: { type: "once", date: "2026-12-24" } },
        { id: "c", name: "Leap party", fraction: 1, rule: { type: "yearly", month: 2, day: 29 } },
      ],
    });
    const y2026 = resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.source === "custom");
    expect(y2026.map((h) => [h.date, h.name, h.fraction, h.enabled, h.customId, h.calendarIds])).toEqual([
      ["2026-06-15", "Company day", 1, true, "a", []],
      ["2026-12-24", "Office closed", 0.5, true, "b", []],
    ]);
    const y2027 = resolveYearHolidays(profile, [zurichFixture], 2027).filter((h) => h.source === "custom");
    expect(names(y2027)).toEqual(["Company day"]);
    const y2028 = resolveYearHolidays(profile, [zurichFixture], 2028).filter((h) => h.source === "custom");
    expect(names(y2028)).toEqual(["Leap party", "Company day"]);
  });

  test("a rule's `enabled` applies to custom holidays, their fraction stays their own", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
      holidayRules: { "Company day": { enabled: false, fraction: 0.5 } },
    });
    const [company] = resolveYearHolidays(profile, [], 2026);
    expect(company).toMatchObject({ enabled: false, fraction: 1, hasRule: true });
  });

  test("multi-day events expand and are clipped to the year", () => {
    const cal = makeCalendar("en.xx", "X", [{ date: "2026-12-31", name: "Long feast", type: "public", days: 3 }]);
    const profile = makeProfile({ calendars: [{ id: "en.xx", regions: [] }] });
    expect(resolveYearHolidays(profile, [cal], 2026).map((h) => h.date)).toEqual(["2026-12-31"]);
    expect(resolveYearHolidays(profile, [cal], 2027).map((h) => h.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });

  test("a year outside the calendar data returns only custom holidays", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(names(resolveYearHolidays(profile, [zurichFixture], 2019))).toEqual(["Company day"]);
    expect(resolveYearHolidays(profile, [], 2026)).toHaveLength(1);
  });
});

describe("prototype-safe name lookups (F6)", () => {
  test("a custom holiday named like an Object.prototype member has no rule", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "x", name: "constructor", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.source === "custom")).toEqual([
      expect.objectContaining({ name: "constructor", enabled: true, hasRule: false }),
    ]);
  });
});

describe("holidayFractions", () => {
  test("uses the largest enabled fraction per date and ignores disabled holidays", () => {
    const base = { source: "google" as const, tentative: false, hasRule: false, calendarIds: [] };
    const map = holidayFractions([
      { ...base, date: "2026-01-01", name: "A", type: "public", enabled: true, fraction: 0.5 },
      { ...base, date: "2026-01-01", name: "B", type: "public", enabled: true, fraction: 1 },
      { ...base, date: "2026-01-02", name: "C", type: "observance", enabled: false, fraction: 1 },
    ]);
    expect(map.get("2026-01-01")).toEqual({ fraction: 1, names: ["A", "B"] });
    expect(map.has("2026-01-02")).toBe(false);
  });
});
