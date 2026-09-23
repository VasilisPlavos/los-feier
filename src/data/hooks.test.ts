import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { clearCalendarCache } from "./calendars";
import { useCalendars } from "./hooks";
import { christianFixture, zurichFixture } from "../test/fixtures";

const FILES: Record<string, unknown> = { "en.ch": zurichFixture, "en.christian": christianFixture };

function stubFetch(failing: string[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    const id = url.split("/").pop()!.replace(".json", "");
    if (failing.includes(id) || !FILES[id]) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => FILES[id] };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearCalendarCache();
});

describe("useCalendars", () => {
  test("no ids: nothing to load", () => {
    stubFetch();
    const { result } = renderHook(() => useCalendars([]));
    expect(result.current).toMatchObject({ calendars: [], failed: [], loading: false });
  });

  test("loads every id once, sorted by id", async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useCalendars(["en.christian", "en.ch", "en.ch"]));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendars.map((c) => c.id)).toEqual(["en.ch", "en.christian"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a failed calendar is reported, the others still load, retry refetches it", async () => {
    const fetchMock = stubFetch(["en.christian"]);
    const { result } = renderHook(() => useCalendars(["en.ch", "en.christian"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.calendars.map((c) => c.id)).toEqual(["en.ch"]);
    expect(result.current.failed).toEqual(["en.christian"]);
    act(() => result.current.retry());
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("en.christian.json"))).toHaveLength(2),
    );
  });

  test("keeps already loaded calendars while a new id loads", async () => {
    stubFetch();
    const { result, rerender } = renderHook(({ ids }) => useCalendars(ids), { initialProps: { ids: ["en.ch"] } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ ids: ["en.ch", "en.christian"] });
    expect(result.current.loading).toBe(true);
    expect(result.current.calendars.map((c) => c.id)).toEqual(["en.ch"]);
    await waitFor(() => expect(result.current.calendars.map((c) => c.id)).toEqual(["en.ch", "en.christian"]));
  });
});
