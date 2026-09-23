import { describe, expect, test } from "vitest";
import { findStretches, groupStretches, leaveUsed } from "./stats";
import { createDayResolver } from "./days";
import { makeState, zurichFixture } from "../test/fixtures";

const summary = (s: { start: string; end: string; length: number; leaveUsed: number }[]) =>
  s.map((x) => `${x.start}..${x.end} ${x.length}d ${x.leaveUsed}l`);

describe("findStretches", () => {
  test("default Zurich fixture 2026: Easter and Christmas", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(summary(findStretches(2026, resolve))).toEqual([
      "2026-04-03..2026-04-06 4d 0l",
      "2026-12-25..2026-12-27 3d 0l",
    ]);
  });

  test("leave extends a stretch across the new year; listed in the start year only", () => {
    const leave = { "2026-12-28": 1, "2026-12-29": 1, "2026-12-30": 1, "2026-12-31": 1 } as const;
    const resolve = createDayResolver(makeState({ leave }), zurichFixture);
    expect(summary(findStretches(2026, resolve)).at(-1)).toBe("2026-12-25..2027-01-03 10d 4l");
    expect(summary(findStretches(2027, resolve))).toEqual([]);
  });

  test("half holiday + half leave joins the weekend (Knabenschiessen)", () => {
    const rules = { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 as const } };
    const without = createDayResolver(makeState({ holidayRules: rules }), zurichFixture);
    expect(findStretches(2026, without).map((s) => s.start)).not.toContain("2026-09-12");
    const withLeave = createDayResolver(makeState({ holidayRules: rules, leave: { "2026-09-14": 0.5 } }), zurichFixture);
    expect(summary(findStretches(2026, withLeave))).toContain("2026-09-12..2026-09-14 3d 0.5l");
  });

  test("half leave alone does not join days", () => {
    const resolve = createDayResolver(makeState({ leave: { "2026-04-07": 0.5 } }), zurichFixture);
    expect(summary(findStretches(2026, resolve))[0]).toBe("2026-04-03..2026-04-06 4d 0l");
  });

  test("REVIEW FOCUS: every day off terminates and returns no in-year stretch", () => {
    const resolve = createDayResolver(makeState({ weeklyPlan: [1, 1, 1, 1, 1, 1, 1] }), zurichFixture);
    expect(findStretches(2026, resolve)).toEqual([]);
    expect(leaveUsed(2026, resolve)).toBe(0);
  });

  test("minLength parameter", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(findStretches(2026, resolve, 5)).toEqual([]);
  });
});

describe("leaveUsed", () => {
  test("counts effective leave of the year only", () => {
    const leave = { "2026-04-07": 1, "2026-04-08": 0.5, "2026-04-06": 1, "2025-12-30": 1 } as const;
    const resolve = createDayResolver(makeState({ leave }), zurichFixture);
    expect(leaveUsed(2026, resolve)).toBe(1.5); // Apr 6 is a holiday → redundant, not counted
  });
});

describe("groupStretches", () => {
  test("groups by length, longest first, keeps date order inside a group", () => {
    const s = (start: string, length: number) => ({ start, end: start, length, leaveUsed: 0 });
    expect(groupStretches([s("2026-01-01", 3), s("2026-04-03", 4), s("2026-12-25", 3)])).toEqual([
      { length: 4, stretches: [s("2026-04-03", 4)] },
      { length: 3, stretches: [s("2026-01-01", 3), s("2026-12-25", 3)] },
    ]);
  });
});
