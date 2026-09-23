import { describe, expect, test } from "vitest";
import { computeDay, createDayResolver, nextLeaveValue } from "./days";
import type { WeeklyPlan } from "./types";
import { makeState, zurichFixture } from "../test/fixtures";

const MON_FRI: WeeklyPlan = [0, 0, 0, 0, 0, 1, 1];

describe("computeDay", () => {
  test("plain working day", () => {
    expect(computeDay("2026-04-07", undefined, MON_FRI, {})).toEqual({
      date: "2026-04-07", weekday: 1, holiday: 0, holidayNames: [], weekly: 0,
      base: 0, room: 1, leave: 0, leaveEff: 0, free: false, redundant: false,
    });
  });

  test("weekend is free", () => {
    const day = computeDay("2026-04-04", undefined, MON_FRI, {});
    expect(day).toMatchObject({ weekly: 1, base: 1, room: 0, free: true });
  });

  test("half holiday + half leave = free day", () => {
    const day = computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, { "2026-09-14": 0.5 });
    expect(day).toMatchObject({ holiday: 0.5, base: 0.5, room: 0.5, leaveEff: 0.5, free: true, redundant: false });
  });

  test("half holiday alone is not free", () => {
    expect(computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, {}).free).toBe(false);
  });

  test("half holiday + half weekly off = free without leave", () => {
    const plan: WeeklyPlan = [0, 0, 0, 0, 0.5, 1, 1];
    const day = computeDay("2026-04-03", { fraction: 0.5, names: ["X"] }, plan, {});
    expect(day).toMatchObject({ base: 1, room: 0, free: true });
  });

  test("full leave on a half holiday counts only half and is redundant", () => {
    const day = computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, { "2026-09-14": 1 });
    expect(day).toMatchObject({ leave: 1, leaveEff: 0.5, free: true, redundant: true });
  });

  test("leave on a full holiday counts nothing and is redundant", () => {
    const day = computeDay("2026-04-06", { fraction: 1, names: ["Easter Monday"] }, MON_FRI, { "2026-04-06": 1 });
    expect(day).toMatchObject({ leaveEff: 0, redundant: true, free: true });
  });
});

describe("nextLeaveValue", () => {
  test("room 1 cycles 0 → 1 → 0.5 → 0", () => {
    expect(nextLeaveValue(1, 0)).toBe(1);
    expect(nextLeaveValue(1, 1)).toBe(0.5);
    expect(nextLeaveValue(1, 0.5)).toBe(0);
  });
  test("room 0.5 cycles 0 → 0.5 → 0", () => {
    expect(nextLeaveValue(0.5, 0)).toBe(0.5);
    expect(nextLeaveValue(0.5, 0.5)).toBe(0);
    expect(nextLeaveValue(0.5, 1)).toBe(0);
  });
  test("room 0 always clears", () => {
    expect(nextLeaveValue(0, 0)).toBe(0);
    expect(nextLeaveValue(0, 1)).toBe(0);
  });
});

describe("createDayResolver", () => {
  test("resolves dates of any year using the user's rules", () => {
    const state = makeState({
      holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
      leave: { "2026-09-14": 0.5 },
    });
    const resolve = createDayResolver(state, zurichFixture);
    expect(resolve("2026-09-14")).toMatchObject({ holiday: 0.5, holidayNames: ["Knabenschiessen (Zurich)"], free: true });
    expect(resolve("2026-04-03")).toMatchObject({ holiday: 1, free: true });
    expect(resolve("2027-01-01")).toMatchObject({ holiday: 1, free: true });
    expect(resolve("2026-04-07").free).toBe(false);
  });

  test("returns the same object for repeated calls (cached)", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(resolve("2026-04-07")).toBe(resolve("2026-04-07"));
  });
});
