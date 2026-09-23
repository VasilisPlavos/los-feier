// Downloads Google's public holiday calendars (ICS) and stores them as compact JSON
// under data/holidays/, keeping the original ICS files in data/holidays/raw/.
// Run: npm run holidays:update  (or: node scripts/fetch-google-holidays.mjs)
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "holidays");
const RAW = join(OUT, "raw");
const CANDIDATES = join(ROOT, "scripts", "google-calendar-ids.txt");

// Localized calendars and the English calendar they mirror. Google translates the
// description ("Public holiday in Zurich" -> "Gesetzlicher Feiertag in Zürich"), so
// type and regions are copied from the English twin to keep them canonical.
const LOCALIZED = {
  "el.greek": "en.greek",
  "de.ch": "en.ch",
  "fr.ch": "en.ch",
  "it.ch": "en.ch",
};

const icsUrl = (id) =>
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(id + "#holiday@group.v.calendar.google.com")}/public/basic.ics`;

const unescape = (s) => s.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
const isoDate = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/); // unfold continuation lines
  const name = lines.find((l) => l.startsWith("X-WR-CALNAME:"))?.slice(13) ?? "";
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") ev = {};
    else if (line === "END:VEVENT") {
      events.push(toHoliday(ev));
      ev = null;
    } else if (ev) {
      const i = line.indexOf(":");
      ev[line.slice(0, i).split(";")[0]] = line.slice(i + 1);
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { name: unescape(name), events };
}

// English description first line: "Public holiday" | "Observance" | "<type> in Zurich, Bern, ..."
// Anything else (missing, "Date is tentative and may change.") is treated as an observance.
function toHoliday(ev) {
  const first = unescape(ev.DESCRIPTION ?? "").split("\n")[0];
  const m = first.match(/^(Public holiday|Observance)(?: in (.*))?$/);
  const holiday = {
    date: isoDate(ev.DTSTART),
    name: unescape(ev.SUMMARY ?? ""),
    type: m?.[1] === "Public holiday" ? "public" : "observance",
  };
  const days = (Date.parse(isoDate(ev.DTEND ?? ev.DTSTART)) - Date.parse(holiday.date)) / 86400000;
  if (days > 1) holiday.days = days;
  if (m?.[2]) holiday.regions = m[2].split(/,\s*/);
  if (/tentative/i.test(first)) holiday.tentative = true;
  return holiday;
}

// Pairs each localized event with the English event on the same date. When a date has
// several English events, the one whose region list has the same number of commas as the
// translated description wins (translation keeps the list length). Type, regions and the
// tentative flag are then copied from the English twin.
function normalizeLocalized(localized, english) {
  const byDate = new Map();
  for (const e of english.events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  return localized.events.map((e) => {
    const pool = byDate.get(e.date) ?? [];
    const commas = (c) => Math.max(0, (c.regions?.length ?? 0) - 1);
    const matches = pool.filter((c) => commas(c) === e.commas);
    const twin = matches[0] ?? pool[0];
    if (!twin) throw new Error(`No English twin for ${e.date} ${e.name}`);
    const kinds = new Set(matches.map((c) => c.type + (c.regions ?? []).join()));
    if (kinds.size > 1) console.warn(`Ambiguous English twin for ${e.date} ${e.name}`);
    pool.splice(pool.indexOf(twin), 1);
    const out = { date: e.date, name: e.name, type: twin.type };
    if (e.days) out.days = e.days;
    if (twin.regions) out.regions = twin.regions;
    if (twin.tentative) out.tentative = true;
    return out;
  });
}

// Like parseIcs, but also records how many commas each translated description's first line has.
function parseLocalized(text) {
  const cal = parseIcs(text);
  const blocks = text.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT").slice(1);
  const commas = new Map();
  for (const block of blocks) {
    const get = (key) => block.match(new RegExp(`^${key}[^:\\r\\n]*:(.*?)\\r?$`, "m"))?.[1] ?? "";
    const first = unescape(get("DESCRIPTION")).split("\n")[0];
    commas.set(isoDate(get("DTSTART")) + "|" + unescape(get("SUMMARY")), (first.match(/,/g) ?? []).length);
  }
  for (const e of cal.events) e.commas = commas.get(e.date + "|" + e.name) ?? 0;
  return cal;
}

async function download(id) {
  const res = await fetch(icsUrl(id));
  if (!res.ok) return null;
  const text = await res.text();
  return text.includes("BEGIN:VCALENDAR") ? text : null;
}

async function pool(items, size, fn) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const candidates = (await readFile(CANDIDATES, "utf8")).split(/\s+/).filter(Boolean);
const ids = [...new Set([...candidates, ...Object.keys(LOCALIZED), ...Object.values(LOCALIZED)])];
await mkdir(RAW, { recursive: true });

const fetched = (await pool(ids, 12, async (id) => ({ id, ics: await download(id) })))
  .filter((f) => f.ics)
  .sort((a, b) => a.id.localeCompare(b.id));

const parsed = new Map();
for (const { id, ics } of fetched) {
  parsed.set(id, LOCALIZED[id] ? parseLocalized(ics) : parseIcs(ics));
}
for (const [id, english] of Object.entries(LOCALIZED)) {
  const cal = parsed.get(id);
  if (cal && parsed.has(english)) cal.events = normalizeLocalized(cal, parsed.get(english));
}

const seen = new Set(); // content hash, to drop aliases of the same calendar
const index = [];
for (const { id, ics } of fetched) {
  const cal = parsed.get(id);
  if (cal.events.length === 0) continue;
  const lang = id.split(".")[0];
  const hash = createHash("sha1").update(lang + JSON.stringify(cal.events)).digest("hex");
  if (seen.has(hash)) continue;
  seen.add(hash);

  const years = cal.events.map((e) => +e.date.slice(0, 4));
  const entry = { id, name: cal.name, lang, from: Math.min(...years), to: Math.max(...years), count: cal.events.length };
  index.push(entry);
  await writeFile(join(RAW, `${id}.ics`), ics);
  await writeFile(join(OUT, `${id}.json`), JSON.stringify({ ...entry, fetchedAt: new Date().toISOString(), events: cal.events }, null, 1));
}

await writeFile(join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(`Saved ${index.length} calendars to ${OUT}`);
