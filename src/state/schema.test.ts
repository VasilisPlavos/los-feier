import { describe, expect, test } from "vitest";
import { parseAppState, parseStateText } from "./schema";
import { createDefaultState } from "./defaults";

const valid = () => ({
  ...createDefaultState(),
  calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
  holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
  yearOverrides: { "2026": { "St. Stephen's Day": { enabled: false } } },
  customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
  leave: { "2026-04-07": 1, "2026-09-14": 0.5 },
});

describe("parseAppState", () => {
  test("accepts a full valid state", () => {
    const result = parseAppState(valid());
    expect(result).toEqual({ ok: true, state: valid() });
  });

  test("accepts the default state", () => {
    expect(parseAppState(createDefaultState()).ok).toBe(true);
  });

  test.each([
    ["impossible leave date", { ...valid(), leave: { "2026-02-30": 1 } }],
    ["leave fraction 0.3", { ...valid(), leave: { "2026-04-07": 0.3 } }],
    ["weekly plan of 6 days", { ...valid(), weeklyPlan: [0, 0, 0, 0, 0, 1] }],
    ["weekly value 2", { ...valid(), weeklyPlan: [0, 0, 0, 0, 0, 1, 2] }],
    ["bad year key", { ...valid(), yearOverrides: { "26": {} } }],
    ["bad calendar id", { ...valid(), calendar: { id: "../../x", regions: [], includeObservances: false } }],
    ["custom once with bad date", { ...valid(), customHolidays: [{ id: "b", name: "X", fraction: 1, rule: { type: "once", date: "2026-13-01" } }] }],
    ["unknown theme", { ...valid(), theme: "neon" }],
    ["not an object", 42],
  ])("REVIEW FOCUS: rejects %s", (_label, input) => {
    expect(parseAppState(input)).toEqual({ ok: false, error: "invalidShape" });
  });

  test("REVIEW FOCUS: rejects a newer version with a specific error", () => {
    expect(parseAppState({ ...valid(), version: 2 })).toEqual({ ok: false, error: "unsupportedVersion" });
  });
});

describe("parseStateText", () => {
  test("REVIEW FOCUS: invalid JSON", () => {
    expect(parseStateText("{not json")).toEqual({ ok: false, error: "invalidJson" });
  });
  test("valid JSON text", () => {
    expect(parseStateText(JSON.stringify(valid())).ok).toBe(true);
  });
});
