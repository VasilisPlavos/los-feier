import { describe, expect, test } from "vitest";
import {
  addDays, datesBetween, daysInMonth, isValidIsoDate, isoFromParts, monthDates,
  parseIso, todayIso, weekday, yearDates, yearOf,
} from "./dates";

describe("dates", () => {
  test("isoFromParts pads month and day", () => {
    expect(isoFromParts(2026, 4, 7)).toBe("2026-04-07");
  });

  test("parseIso splits into numbers", () => {
    expect(parseIso("2026-12-31")).toEqual({ year: 2026, month: 12, day: 31 });
  });

  test("isValidIsoDate accepts real dates only", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-4-7")).toBe(false);
    expect(isValidIsoDate("../../x")).toBe(false);
  });

  test("daysInMonth handles leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  test("addDays crosses month and year boundaries and DST dates", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // EU DST switch weekend
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  test("weekday: 0 = Monday … 6 = Sunday", () => {
    expect(weekday("2026-04-06")).toBe(0); // Monday
    expect(weekday("2026-04-03")).toBe(4); // Friday
    expect(weekday("2026-04-05")).toBe(6); // Sunday
  });

  test("monthDates / yearDates / datesBetween", () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
    expect(monthDates(2026, 2)[0]).toBe("2026-02-01");
    expect(yearDates(2026)).toHaveLength(365);
    expect(yearDates(2028)).toHaveLength(366);
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesBetween("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });

  test("yearOf", () => {
    expect(yearOf("2031-05-01")).toBe(2031);
  });

  test("todayIso uses the local calendar date", () => {
    const localLateEvening = new Date(2026, 3, 7, 23, 30); // 7 April, 23:30 local time
    expect(todayIso(localLateEvening)).toBe("2026-04-07");
  });
});
