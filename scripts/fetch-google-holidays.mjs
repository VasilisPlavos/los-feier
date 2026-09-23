// Downloads Google's public holiday calendars (ICS) and stores them as compact JSON
// under data/holidays/, keeping the original ICS files in data/holidays/raw/.
// Run: node scripts/fetch-google-holidays.mjs
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "holidays");
const RAW = join(OUT, "raw");
const CANDIDATES = join(ROOT, "scripts", "google-calendar-ids.txt");
// Localized variants kept in addition to the English ones
const EXTRA_IDS = ["el.greek", "de.ch", "fr.ch", "it.ch"];

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

// Google's description first line: "Public holiday" | "Observance" | "... in Zurich, Bern, ..."
function toHoliday(ev) {
  const first = unescape(ev.DESCRIPTION ?? "").split("\n")[0];
  const m = first.match(/^(.*?)(?: in (.*))?$/);
  const holiday = {
    date: isoDate(ev.DTSTART),
    name: unescape(ev.SUMMARY ?? ""),
    type: m[1],
  };
  const days = (Date.parse(isoDate(ev.DTEND ?? ev.DTSTART)) - Date.parse(holiday.date)) / 86400000;
  if (days > 1) holiday.days = days;
  if (m[2]) holiday.regions = m[2].split(/,\s*/);
  return holiday;
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
const ids = [...new Set([...candidates, ...EXTRA_IDS])];
await mkdir(RAW, { recursive: true });

const seen = new Map(); // content hash -> id, to drop aliases of the same calendar
const index = [];
const fetched = await pool(ids, 12, async (id) => ({ id, ics: await download(id) }));

for (const { id, ics } of fetched.sort((a, b) => a.id.localeCompare(b.id))) {
  if (!ics) continue;
  const cal = parseIcs(ics);
  if (cal.events.length === 0) continue;
  const lang = id.split(".")[0];
  const hash = createHash("sha1").update(lang + JSON.stringify(cal.events)).digest("hex");
  if (seen.has(hash)) continue;
  seen.set(hash, id);

  const years = cal.events.map((e) => +e.date.slice(0, 4));
  const entry = { id, name: cal.name, lang, from: Math.min(...years), to: Math.max(...years), count: cal.events.length };
  index.push(entry);
  await writeFile(join(RAW, `${id}.ics`), ics);
  await writeFile(join(OUT, `${id}.json`), JSON.stringify({ ...entry, fetchedAt: new Date().toISOString(), events: cal.events }, null, 1));
}

await writeFile(join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(`Saved ${index.length} calendars to ${OUT}`);
