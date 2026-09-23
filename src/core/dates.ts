// All dates are "YYYY-MM-DD" strings. Arithmetic uses UTC so the user's
// timezone and daylight-saving changes can never shift a date.
const DAY_MS = 86_400_000;

export function isoFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseIso(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function toUtcMs(iso: string): number {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtcMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(iso: string): number {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

export function monthDates(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => isoFromParts(year, month, i + 1));
}

export function yearDates(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => monthDates(year, i + 1)).flat();
}

/** Inclusive list of dates from start to end. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Today's date in the user's local timezone. */
export function todayIso(now: Date = new Date()): string {
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
