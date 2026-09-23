import { afterEach, describe, expect, test, vi } from "vitest";
import {
  calendarRegions, clearCalendarCache, hasDataForYear, isCalendarId, loadCalendar, loadIndex, matchesQuery, suggestCalendarId,
  type FetchLike,
} from "./calendars";
import { zurichFixture } from "../test/fixtures";
import realIndex from "../../data/holidays/index.json";
import type { CalendarIndexEntry } from "../core/types";

const entry = (id: string): CalendarIndexEntry => ({ id, name: id, lang: id.split(".")[0], from: 2021, to: 2031, count: 1 });
const INDEX = ["de.ch", "el.greek", "en.ch", "en.greek", "en.usa", "en.gb"].map(entry);

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => clearCalendarCache());

describe("suggestCalendarId", () => {
  test.each([
    [["el-GR"], "el.greek"],
    [["el"], "el.greek"],
    [["de-CH", "de"], "de.ch"],
    [["fr-CH"], "en.ch"],
    [["en-US"], "en.usa"],
    [["en-GB"], "en.gb"],
    [["xx"], null],
    [[], null],
  ])("%j → %s", (langs, expected) => {
    expect(suggestCalendarId(langs, INDEX)).toBe(expected);
  });
});

describe("suggestCalendarId against the real data (F2)", () => {
  const REAL_INDEX = realIndex as CalendarIndexEntry[];

  test.each([
    [["el-GR"], "el.greek"],
    [["de-CH"], "de.ch"],
    [["en-US"], "en.usa"],
    [["en-GB"], "en.uk"], // Google id is not ISO; gb→uk alias
    [["en-ZA"], "en.sa"], // "Holidays in South Africa"; za→sa alias
    [["ar-SA"], null], // Saudi Arabia: no calendar exists; must not fall through to en.sa (South Africa)
    [["en-SA"], null],
  ])("%j → %s", (langs, expected) => {
    expect(suggestCalendarId(langs, REAL_INDEX)).toBe(expected);
  });

  test("fr-FR resolves to a French calendar, if one exists in the index", () => {
    const found = suggestCalendarId(["fr-FR"], REAL_INDEX);
    expect(found).not.toBeNull();
    const entry = REAL_INDEX.find((c) => c.id === found);
    expect(entry?.name).toMatch(/france/i);
  });
});

describe("loaders", () => {
  test("loadIndex fetches index.json", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okJson(INDEX));
    expect(await loadIndex(fetchFn)).toEqual(INDEX);
    expect(fetchFn.mock.calls[0][0]).toMatch(/data\/holidays\/index\.json$/);
  });

  test("loadCalendar caches successful loads", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okJson(zurichFixture));
    await loadCalendar("en.ch", fetchFn);
    await loadCalendar("en.ch", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toMatch(/data\/holidays\/en\.ch\.json$/);
  });

  test("failed loads are retried on the next call", async () => {
    const fetchFn = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(okJson(zurichFixture));
    await expect(loadCalendar("en.ch", fetchFn)).rejects.toThrow("500");
    await expect(loadCalendar("en.ch", fetchFn)).resolves.toMatchObject({ id: "en.ch" });
  });

  test("REVIEW FOCUS: invalid ids are rejected without fetching", async () => {
    const fetchFn = vi.fn<FetchLike>();
    await expect(loadCalendar("../../secret", fetchFn)).rejects.toThrow("Invalid calendar id");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(isCalendarId("en.new_zealand")).toBe(true);
    expect(isCalendarId("EN.CH")).toBe(false);
  });
});

describe("calendar helpers", () => {
  test("calendarRegions is unique and sorted", () => {
    expect(calendarRegions(zurichFixture)).toEqual(["Bern", "Lucerne", "Zurich"]);
  });
  test("hasDataForYear uses from/to", () => {
    expect(hasDataForYear(zurichFixture, 2026)).toBe(true);
    expect(hasDataForYear(zurichFixture, 2019)).toBe(false);
  });
});

describe("matchesQuery", () => {
  test.each([
    ["Διακοπές στην Ελλάδα", "ελλαδα", true],
    ["Διακοπές στην Ελλάδα", "ΕΛΛΆΔΑ", true],
    ["Holidays in Switzerland", "switz", true],
    ["Zürich", "zurich", true],
    ["Holidays in Switzerland", "greece", false],
    ["anything", "   ", true],
  ])("%s ~ %s → %s", (text, query, expected) => {
    expect(matchesQuery(text, query)).toBe(expected);
  });
});
