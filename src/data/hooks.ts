import { useEffect, useMemo, useState } from "react";
import type { CalendarFile, CalendarIndexEntry } from "../core/types";
import { loadCalendar, loadIndex } from "./calendars";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export function useCalendarIndex(): { status: LoadStatus; index: CalendarIndexEntry[] | null; retry(): void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ status: LoadStatus; index: CalendarIndexEntry[] | null }>({ status: "loading", index: null });
  useEffect(() => {
    let cancelled = false;
    setResult({ status: "loading", index: null });
    loadIndex().then(
      (index) => !cancelled && setResult({ status: "ready", index }),
      () => !cancelled && setResult({ status: "error", index: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

export function useCalendar(id: string | null): { status: LoadStatus; calendar: CalendarFile | null; retry(): void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ status: LoadStatus; calendar: CalendarFile | null }>({ status: "idle", calendar: null });
  useEffect(() => {
    if (!id) {
      setResult({ status: "idle", calendar: null });
      return;
    }
    let cancelled = false;
    setResult({ status: "loading", calendar: null });
    loadCalendar(id).then(
      (calendar) => !cancelled && setResult({ status: "ready", calendar }),
      () => !cancelled && setResult({ status: "error", calendar: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

interface CalendarsResult {
  key: string; // the id set these results belong to
  loaded: Record<string, CalendarFile>;
  failed: string[];
}

/** Loads several calendars (each file once, via the shared cache) and reports the ones that failed. */
export function useCalendars(ids: readonly string[]): {
  calendars: CalendarFile[];
  failed: string[];
  loading: boolean;
  retry(): void;
} {
  const key = [...new Set(ids)].sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CalendarsResult>({ key: "", loaded: {}, failed: [] });

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    let cancelled = false;
    void Promise.allSettled(wanted.map((id) => loadCalendar(id))).then((settled) => {
      if (cancelled) return;
      const loaded: Record<string, CalendarFile> = {};
      const failed: string[] = [];
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") loaded[wanted[i]] = s.value;
        else failed.push(wanted[i]);
      });
      setResult({ key, loaded, failed });
    });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const loading = result.key !== key;
  // While a new id set loads, keep showing the files we already have that are still wanted.
  const calendars = useMemo(
    () => (key ? key.split(",") : []).flatMap((id) => (result.loaded[id] ? [result.loaded[id]] : [])),
    [key, result],
  );
  return { calendars, failed: loading ? [] : result.failed, loading, retry: () => setAttempt((n) => n + 1) };
}
