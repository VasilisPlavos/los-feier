import { expect, test } from "vitest";
import enCh from "../../data/holidays/en.ch.json";
import { createDayResolver } from "./days";
import { findStretches } from "./stats";
import type { CalendarFile } from "./types";
import { makeState } from "../test/fixtures";

test("real data: Zurich 2026 breaks with a Mon–Fri plan and no leave", () => {
  const resolve = createDayResolver(makeState(), [enCh as unknown as CalendarFile]);
  expect(findStretches(2026, resolve).map((s) => `${s.start}..${s.end} ${s.length}`)).toEqual([
    "2026-04-03..2026-04-06 4",
    "2026-05-01..2026-05-03 3",
    "2026-05-23..2026-05-25 3",
    "2026-12-25..2026-12-27 3",
  ]);
});
