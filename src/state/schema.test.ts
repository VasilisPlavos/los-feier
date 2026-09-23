import { describe, expect, test } from "vitest";
import { parseAppState, parseStateText } from "./schema";
import { createDefaultState } from "./defaults";

const profile = () => ({
  calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }],
  includeObservances: false,
  holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
  customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
  weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
});

const valid = () => ({
  ...createDefaultState(),
  leave: { "2026-04-07": 1, "2026-09-14": 0.5 },
  profiles: { "2026": profile(), "2028": { ...profile(), calendars: [] } },
});

const withProfile = (changes: object) => ({ ...valid(), profiles: { "2026": { ...profile(), ...changes } } });

const v1State = {
  version: 1,
  language: null,
  calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
  holidayRules: {},
  yearOverrides: {},
  customHolidays: [],
  weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
  leave: {},
  theme: "system",
};

describe("parseAppState", () => {
  test("accepts a full valid state", () => {
    expect(parseAppState(valid())).toEqual({ ok: true, state: valid() });
  });

  test("accepts the default state (first run)", () => {
    expect(parseAppState(createDefaultState()).ok).toBe(true);
  });

  test.each([
    ["impossible leave date", { ...valid(), leave: { "2026-02-30": 1 } }],
    ["leave fraction 0.3", { ...valid(), leave: { "2026-04-07": 0.3 } }],
    ["weekly plan of 6 days", withProfile({ weeklyPlan: [0, 0, 0, 0, 0, 1] })],
    ["weekly value 2", withProfile({ weeklyPlan: [0, 0, 0, 0, 0, 1, 2] })],
    ["bad profile year key", { ...valid(), profiles: { "26": profile() } }],
    ["bad calendar id", withProfile({ calendars: [{ id: "../../x", regions: [] }] })],
    ["calendar without regions", withProfile({ calendars: [{ id: "en.ch" }] })],
    ["custom once with bad date", withProfile({ customHolidays: [{ id: "b", name: "X", fraction: 1, rule: { type: "once", date: "2026-13-01" } }] })],
    ["unknown theme", { ...valid(), theme: "neon" }],
    ["a version 1 state", v1State],
    ["not an object", 42],
  ])("REVIEW FOCUS: rejects %s", (_label, input) => {
    expect(parseAppState(input)).toEqual({ ok: false, error: "invalidShape" });
  });

  test("REVIEW FOCUS: rejects a newer version with a specific error", () => {
    expect(parseAppState({ ...valid(), version: 3 })).toEqual({ ok: false, error: "unsupportedVersion" });
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
