import type { CalendarFile, CalendarIndexEntry } from "../core/types";

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const defaultFetch: FetchLike = (url) => fetch(url);
const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/holidays/${file}`;

export function isCalendarId(id: string): boolean {
  return /^[a-z]{2}\.[a-z_]+$/.test(id);
}

async function getJson(url: string, fetchFn: FetchLike): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

export async function loadIndex(fetchFn: FetchLike = defaultFetch): Promise<CalendarIndexEntry[]> {
  return (await getJson(dataUrl("index.json"), fetchFn)) as CalendarIndexEntry[];
}

const calendarCache = new Map<string, Promise<CalendarFile>>();

export function loadCalendar(id: string, fetchFn: FetchLike = defaultFetch): Promise<CalendarFile> {
  if (!isCalendarId(id)) return Promise.reject(new Error(`Invalid calendar id: ${id}`));
  const cached = calendarCache.get(id);
  if (cached) return cached;
  const promise = getJson(dataUrl(`${id}.json`), fetchFn).then((json) => json as CalendarFile);
  calendarCache.set(id, promise);
  promise.catch(() => calendarCache.delete(id)); // allow retry after a failure
  return promise;
}

export function clearCalendarCache(): void {
  calendarCache.clear();
}

export function calendarRegions(calendar: CalendarFile): string[] {
  const regions = new Set<string>();
  for (const e of calendar.events) for (const r of e.regions ?? []) regions.add(r);
  return [...regions].sort((a, b) => a.localeCompare(b));
}

export function hasDataForYear(calendar: CalendarFile, year: number): boolean {
  return year >= calendar.from && year <= calendar.to;
}

export interface YearBounds {
  min: number;
  max: number;
}

/** First to last year that any calendar has data for; null when there are no calendars. */
export function yearBounds(index: CalendarIndexEntry[]): YearBounds | null {
  if (index.length === 0) return null;
  return { min: Math.min(...index.map((c) => c.from)), max: Math.max(...index.map((c) => c.to)) };
}

export function clampYear(year: number, bounds: YearBounds | null): number {
  return bounds ? Math.min(Math.max(year, bounds.min), bounds.max) : year;
}

/** Google's older ids for some countries (ISO region → id suffix). */
const REGION_ALIASES: Record<string, string> = {
  at: "austrian", au: "australian", br: "brazilian", ca: "canadian", cn: "china", de: "german",
  dk: "danish", es: "spain", fi: "finnish", fr: "french", gb: "uk", gr: "greek", hk: "hong_kong",
  id: "indonesian", ie: "irish", il: "jewish", in: "indian", it: "italian", jp: "japanese",
  kr: "south_korea", mx: "mexican", my: "malaysia", nl: "dutch", no: "norwegian", nz: "new_zealand",
  ph: "philippines", pl: "polish", pt: "portuguese", ru: "russian", se: "swedish", sg: "singapore",
  tw: "taiwan", us: "usa", vn: "vietnamese", za: "sa",
};

/** Region to assume when the browser language has none (e.g. "el" → Greece). */
const LANGUAGE_DEFAULT_REGION: Record<string, string> = { el: "gr" };

/**
 * ISO regions with no real calendar despite a literal id match: "sa" is Saudi Arabia in
 * BCP 47, but Google's "en.sa" calendar is "Holidays in South Africa" (reached instead via
 * the za→sa alias above). There is no Saudi calendar, so this region must never resolve.
 */
const NO_CALENDAR_REGIONS = new Set(["sa"]);

export function suggestCalendarId(languages: readonly string[], index: CalendarIndexEntry[]): string | null {
  const ids = new Set(index.map((c) => c.id));
  for (const tag of languages) {
    const [lang, maybeRegion] = tag.toLowerCase().split("-");
    const region = maybeRegion ?? LANGUAGE_DEFAULT_REGION[lang];
    if (!region || NO_CALENDAR_REGIONS.has(region)) continue;
    const alias = REGION_ALIASES[region] ?? region;
    const candidates = [`${lang}.${alias}`, `${lang}.${region}`, `en.${alias}`, `en.${region}`];
    const found = candidates.find((id) => ids.has(id));
    if (found) return found;
  }
  return null;
}

/** Lower case without accents, so "ελλαδα" finds "Ελλάδα" and "zurich" finds "Zürich". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** True when `text` contains `query`, ignoring case and accents; a blank query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const q = foldText(query.trim());
  return q === "" || foldText(text).includes(q);
}
