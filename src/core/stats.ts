import { addDays, yearDates } from "./dates";
import type { DayResolver } from "./days";
import type { Stretch } from "./types";

/** Hard cap so a plan where every day is free can never loop forever. */
const MAX_SCAN_DAYS = 800;

export function leaveUsed(year: number, resolve: DayResolver): number {
  return yearDates(year).reduce((sum, date) => sum + resolve(date).leaveEff, 0);
}

export function findStretches(year: number, resolve: DayResolver, minLength = 3): Stretch[] {
  const end = `${year}-12-31`;
  let date = `${year}-01-01`;
  let guard = 0;

  // A run that already started last year belongs to last year: skip past it.
  if (resolve(addDays(date, -1)).free) {
    while (date <= end && resolve(date).free) date = addDays(date, 1);
  }

  const out: Stretch[] = [];
  while (date <= end) {
    if (!resolve(date).free) {
      date = addDays(date, 1);
      continue;
    }
    const start = date;
    let length = 0;
    let leave = 0;
    while (resolve(date).free && guard++ < MAX_SCAN_DAYS) {
      leave += resolve(date).leaveEff;
      length++;
      date = addDays(date, 1);
    }
    if (length >= minLength) out.push({ start, end: addDays(date, -1), length, leaveUsed: leave });
  }
  return out;
}

export function groupStretches(stretches: Stretch[]): { length: number; stretches: Stretch[] }[] {
  const groups = new Map<number, Stretch[]>();
  for (const s of stretches) groups.set(s.length, [...(groups.get(s.length) ?? []), s]);
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([length, list]) => ({ length, stretches: list }));
}
