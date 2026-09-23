import { useEffect, useState } from "react";
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
