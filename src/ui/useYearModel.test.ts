import { renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useYearModel } from "./useYearModel";
import { makeState, zurichFixture } from "../test/fixtures";

test("useYearModel combines holidays, leave total and stretches", () => {
  const state = makeState({ leave: { "2026-04-07": 1 } });
  const { result } = renderHook(() => useYearModel(state, [zurichFixture], 2026));
  expect(result.current.leaveTotal).toBe(1);
  expect(result.current.stretches.map((s) => s.start)).toEqual(["2026-04-03", "2026-12-25"]);
  expect(result.current.holidays.some((h) => h.name === "Good Friday")).toBe(true);
  expect(result.current.resolve("2026-04-07").leave).toBe(1);
});
