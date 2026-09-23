# Holidays App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, open-source web app (a modern clone of the defunct argies.gr) where a user sees a whole year as a 3×4 grid of months, picks their country/region holidays, adjusts them, defines a weekly working plan, clicks days to take leave (full or half), and instantly sees how many leave days they used and which 3-, 4-, … day breaks result.

**Architecture:** Vite + React + TypeScript single-page app, deployed to GitHub Pages under `/holidays/`. Holiday data are pre-downloaded Google Calendar holiday calendars stored as JSON in `data/holidays/` and copied into `public/` at build time — no API keys, no backend. All calculations live in a pure `src/core/` module (no React, no DOM) with exhaustive unit tests; the whole user state is one JSON object (`AppState`) auto-saved to `localStorage` and exportable/importable as a file.

**Tech Stack:** Node ≥ 20, npm, Vite, React 19, TypeScript, zod (import validation), Vitest + jsdom + Testing Library (unit/component tests), Playwright (mobile e2e), GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-23-holidays-design.md` (written in Greek — the plan below restates every requirement you need in English, so you can work from the plan alone; consult the spec when in doubt).

---

## Read this first (context for someone new to the project)

- **Repository root:** `C:\Users\vplav\Gits\vasilisplavos\holidays` (Windows machine; use a bash shell — Git Bash — for the commands below; paths use forward slashes). Branch `main`. Future remote: `github.com/vasilisplavos/holidays` (do **not** push; the owner does that).
- **Already present (do not rewrite):**
  - `scripts/fetch-google-holidays.mjs` — downloads Google's public holiday calendars, writes `data/holidays/raw/<id>.ics` (untouched originals), `data/holidays/<id>.json` (compact) and `data/holidays/index.json`.
  - `scripts/google-calendar-ids.txt` — candidate calendar ids.
  - `data/holidays/` — 225 calendars, years 2021–2031. Only the `*.json` files at the top level of `data/holidays/` are used by the app; `data/holidays/raw/` must never be shipped in the build.
  - `docs/superpowers/specs/…` — the spec. `.gitignore`, `.gitattributes` (`*.ics -text -diff` keeps raw files byte-for-byte).
- **Holiday data format** (every `data/holidays/<id>.json`):

  ```jsonc
  {
    "id": "en.ch", "name": "Holidays in Switzerland", "lang": "en",
    "from": 2021, "to": 2031, "count": 325, "fetchedAt": "2026-09-23T…Z",
    "events": [
      { "date": "2026-04-03", "name": "Good Friday (regional holiday)", "type": "public", "regions": ["Zurich", "Bern", "…"] },
      { "date": "2026-08-01", "name": "Swiss National Day", "type": "public" },               // no regions = national
      { "date": "2026-09-14", "name": "Knabenschiessen (Zurich)", "type": "observance", "regions": ["Zurich"] }
    ]
  }
  ```
  `type` is always `"public"` or `"observance"`. `regions` names are always English (also in localized calendars like `de.ch`, `el.greek`). Optional fields: `days` (> 1 for multi-day events; currently none exist but handle it) and `tentative: true`. `index.json` is an array of `{ id, name, lang, from, to, count }`. Event `name`s are in the calendar's language (`el.greek` → Greek names, `de.ch` → German).
- **Domain vocabulary:**
  - *Holiday* (αργία): a day off from the calendar or added by the user. Can be full (`1`) or half (`0.5`).
  - *Weekly plan* (εβδομαδιαίο πλάνο): for each weekday Mon…Sun, `0` = working day, `0.5` = half day off, `1` = day off. Default Mon–Fri working, Sat–Sun off.
  - *Leave* (άδεια): days the user takes off by clicking on the calendar. Full (`1`) or half (`0.5`).
  - *Free day*: a day where holiday + weekly-off + leave ≥ 1 (so ½ holiday + ½ leave = free).
  - *Break / stretch* (3-ήμερο, 4-ήμερο…): a maximal run of consecutive free days of length ≥ 3.
- **Where the user's choices live:** one `AppState` JSON object (Task 2 defines it) saved in `localStorage` under the key `holidays.state`.

## Global Constraints

- Node ≥ 20; package manager npm; commit `package-lock.json`.
- No API keys, tokens or secrets anywhere in the repository (it is public).
- Vite `base` is `"/holidays/"`; fetch data with `` `${import.meta.env.BASE_URL}data/holidays/<file>` ``.
- Dates are strings `"YYYY-MM-DD"` everywhere. Weekday/next-day arithmetic uses UTC (`Date.UTC`, `getUTCDay`) so the user's timezone never shifts a date. Only "today" uses local time.
- `src/core/**` must not import React, touch `window`/`document`/`localStorage`, or fetch.
- Every user-visible string goes through i18n (`t("key")`) with both `en` and `el` translations. Exceptions: language native names ("English", "Ελληνικά"), holiday names (shown exactly as in the calendar data), numbers/dates formatted with `Intl`.
- UI languages: English and Greek; default = system language (`navigator.languages`), fallback English; adding a language = adding one JSON file and one entry in a list.
- The 12 months are **always** a grid of **3 columns × 4 rows**, each month a fixed width; on narrow screens the grid keeps 3 columns and the user scrolls horizontally.
- `localStorage` keys: state `holidays.state`, corrupted-state backup `holidays.state.backup`.
- `data/holidays/raw/` must not end up in `dist/`.
- `package.json` must contain the script `"holidays:update": "node scripts/fetch-google-holidays.mjs"`, and the README must explain it.
- Commit after every task with a Conventional Commit message (`feat: …`, `test: …`, `chore: …`, `docs: …`).

## Spec deviations (intentional, small)

- Build script is `tsc --noEmit -p tsconfig.json && vite build` (single tsconfig) instead of `tsc -b`.
- `test:run` script added (non-watch Vitest) for CI.
- The displayed year is kept in the URL hash (`…/holidays/#2026`) so e2e tests and links can open a specific year.
- Desktop two-column layout starts at 1180px width (so the 3-column grid fits next to the sidebar); below that the mobile layout is used.
- Data files are copied to `public/data/holidays/` by `scripts/copy-holiday-data.mjs` (runs automatically before `dev` and `build`).

## Review Focus

Inputs the spec implies but the feature tests don't naturally hit — each has a dedicated test in the owning task:

1. **Weekly plan with every day off** (`[1,1,1,1,1,1,1]`) → stretch detection must terminate (no infinite loop) and the UI must not freeze. Test: Task 5.
2. **`localStorage` unavailable or throwing** (Safari private mode, quota exceeded, blocked cookies) → the app must still work in memory and show "cannot save" instead of crashing. Tests: Task 6 (storage), Task 15 (banner).
3. **Importing a foreign/invalid JSON** (not JSON, newer `version`, impossible date like `2026-02-30`, wrong weekly-plan length, fraction `0.3`, calendar id `../../x`) → rejected with a clear message, current data untouched, no fetch of arbitrary paths. Tests: Task 6, Task 8, Task 14.
4. **Viewing a year outside the calendar's data range** (e.g. 2019 or 2035) → banner "no holiday data for {year}", custom holidays still shown, leave/stretches still computed. Tests: Task 3, Task 15.
5. **User in a timezone west of UTC** (e.g. America/Los_Angeles) → every date must sit under the correct weekday column and clicking a date must store exactly that date. Test: Task 16 (Playwright `timezoneId`).

---

## File Structure

```
holidays/
├─ data/holidays/                    (exists) index.json, <id>.json, raw/*.ics
├─ scripts/
│  ├─ fetch-google-holidays.mjs      (exists)
│  ├─ google-calendar-ids.txt        (exists)
│  └─ copy-holiday-data.mjs          copies data/holidays/*.json → public/data/holidays/
├─ public/data/holidays/             generated, git-ignored
├─ index.html
├─ package.json, tsconfig.json, vite.config.ts, playwright.config.ts
├─ src/
│  ├─ main.tsx                       React entry
│  ├─ App.tsx                        providers + Layout
│  ├─ styles.css                     all styles (tokens, light/dark, grid, panels, mobile)
│  ├─ core/                          pure logic
│  │  ├─ types.ts                    all shared types
│  │  ├─ dates.ts                    YYYY-MM-DD helpers
│  │  ├─ holidays.ts                 which holidays apply in a year
│  │  ├─ days.ts                     per-day computation + leave click cycle
│  │  └─ stats.ts                    leave total + stretches
│  ├─ state/
│  │  ├─ defaults.ts                 createDefaultState()
│  │  ├─ schema.ts                   zod schema, parseAppState(), parseStateText()
│  │  ├─ storage.ts                  localStorage load/save with backup
│  │  ├─ exportImport.ts             exportStateJson(), downloadText()
│  │  ├─ reducer.ts                  Action union + reducer
│  │  └─ StoreProvider.tsx           React context, auto-save
│  ├─ data/
│  │  ├─ calendars.ts                loadIndex, loadCalendar, suggestCalendarId, calendarRegions, hasDataForYear
│  │  └─ hooks.ts                    useCalendarIndex, useCalendar
│  ├─ i18n/
│  │  ├─ en.json, el.json            messages (flat keys)
│  │  ├─ index.ts                    detectLang, translate, LANGUAGE_NAMES
│  │  └─ I18nProvider.tsx            context with t() and Intl formatters
│  ├─ ui/
│  │  ├─ useYearModel.ts             memoized core computations for one year
│  │  ├─ DayCell.tsx, MonthCard.tsx, YearGrid.tsx
│  │  ├─ WeeklyPlanPanel.tsx, SummaryPanel.tsx
│  │  ├─ HolidayListPanel.tsx, CustomHolidayForm.tsx
│  │  ├─ SettingsDialog.tsx
│  │  └─ Layout.tsx                  header, banners, sidebar/tabs, wiring
│  └─ test/
│     ├─ setup.ts                    jest-dom + cleanup
│     ├─ fixtures.ts                 small calendar fixture
│     └─ render.tsx                  renderWithI18n helper
├─ tests/e2e/app.spec.ts             Playwright (mobile)
├─ .github/workflows/deploy.yml
├─ README.md, LICENSE
```

Unit tests sit next to the code as `*.test.ts(x)`.

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/test/setup.ts`, `src/App.test.tsx`, `scripts/copy-holiday-data.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: working `npm run dev|build|test:run`; `src/test/setup.ts` loaded by every test; `public/data/holidays/*.json` generated before dev/build.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "holidays",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Plan your leave around public holidays and see every long weekend at a glance.",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": {
    "predev": "node scripts/copy-holiday-data.mjs",
    "dev": "vite",
    "prebuild": "node scripts/copy-holiday-data.mjs",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "holidays:update": "node scripts/fetch-google-holidays.mjs"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom zod
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom @playwright/test
```

Expected: `package.json` gains `dependencies`/`devDependencies`, `package-lock.json` is created. If `typescript` (v7+) rejects `tsconfig.json` in Step 4 with an unknown-option error, run `npm install -D typescript@5` and continue.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages path: https://vasilisplavos.github.io/holidays/
export default defineConfig({
  base: "/holidays/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 5: Create `scripts/copy-holiday-data.mjs`**

```js
// Copies the compact holiday JSON files (not raw/*.ics) into public/ so Vite serves
// them in dev and copies them into dist/ on build. Runs automatically via predev/prebuild.
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "holidays");
const DEST = join(ROOT, "public", "data", "holidays");

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });
const files = (await readdir(SRC)).filter((f) => f.endsWith(".json"));
for (const file of files) await cp(join(SRC, file), join(DEST, file));
console.log(`Copied ${files.length} holiday files to public/data/holidays`);
```

- [ ] **Step 6: Append to `.gitignore`**

Add this line at the end of the existing `.gitignore`:

```
public/data/
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Plan your leave around public holidays and see every long weekend at a glance." />
    <title>Holidays</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create placeholder `src/styles.css`, `src/App.tsx`, `src/main.tsx`**

`src/styles.css` (replaced completely in Task 11):

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

`src/App.tsx` (replaced in Task 15):

```tsx
export default function App() {
  return <h1>Holidays</h1>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 10: Write the smoke test `src/App.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";

test("renders the app title", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Holidays" })).toBeInTheDocument();
});
```

- [ ] **Step 11: Run tests and build**

Run: `npx vitest run`
Expected: 1 test passed.

Run: `npm run build`
Expected: "Copied 225 holiday files to public/data/holidays", then Vite build succeeds.

Run: `ls dist/data/holidays | wc -l && test ! -e dist/data/holidays/raw && echo "no raw in dist"`
Expected: `226` (225 calendars + index.json) and `no raw in dist`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript app with Vitest"
```

---

### Task 2: Core types and date helpers

**Files:**
- Create: `src/core/types.ts`, `src/core/dates.ts`
- Test: `src/core/dates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - Types: `Fraction`, `WeeklyValue`, `WeeklyPlan`, `HolidayRule`, `CustomRule`, `CustomHoliday`, `Theme`, `AppState`, `HolidayType`, `GoogleHoliday`, `CalendarFile`, `CalendarIndexEntry`, `ResolvedHoliday`, `DayInfo`, `Stretch`.
  - `isoFromParts(year, month, day): string`, `parseIso(iso): { year; month; day }`, `isValidIsoDate(value: string): boolean`, `daysInMonth(year, month): number`, `addDays(iso, n): string`, `weekday(iso): number` (0 = Monday … 6 = Sunday), `monthDates(year, month): string[]`, `yearDates(year): string[]`, `datesBetween(start, end): string[]` (inclusive), `yearOf(iso): number`, `todayIso(now?: Date): string`.

- [ ] **Step 1: Create `src/core/types.ts`**

```ts
/** A holiday or leave amount: half day or full day. */
export type Fraction = 0.5 | 1;

/** Weekly plan value for one weekday: 0 = working day, 0.5 = half day off, 1 = day off. */
export type WeeklyValue = 0 | 0.5 | 1;

/** Monday … Sunday. */
export type WeeklyPlan = [WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue];

/** A user adjustment of a holiday, stored by holiday name. Missing fields = keep default. */
export interface HolidayRule {
  enabled?: boolean;
  fraction?: Fraction;
}

export type CustomRule =
  | { type: "yearly"; month: number; day: number } // every year on month/day (1-based)
  | { type: "once"; date: string }; // exactly one date

export interface CustomHoliday {
  id: string;
  name: string;
  fraction: Fraction;
  rule: CustomRule;
}

export type Theme = "system" | "light" | "dark";

/** Everything the user chose. Saved as one JSON object. */
export interface AppState {
  version: 1;
  language: string | null; // null = follow the system language
  calendar: {
    id: string | null; // e.g. "en.ch"; null = not chosen yet
    regions: string[]; // e.g. ["Zurich"]; [] = national holidays only
    includeObservances: boolean;
  };
  holidayRules: Record<string, HolidayRule>; // holiday name -> rule, all years
  yearOverrides: Record<string, Record<string, HolidayRule>>; // "2026" -> holiday name -> rule
  customHolidays: CustomHoliday[];
  weeklyPlan: WeeklyPlan;
  leave: Record<string, Fraction>; // "YYYY-MM-DD" -> leave taken
  theme: Theme;
}

export type HolidayType = "public" | "observance";

/** One event of a Google calendar file (data/holidays/<id>.json). */
export interface GoogleHoliday {
  date: string;
  name: string;
  type: HolidayType;
  regions?: string[];
  days?: number;
  tentative?: true;
}

export interface CalendarIndexEntry {
  id: string;
  name: string;
  lang: string;
  from: number;
  to: number;
  count: number;
}

export interface CalendarFile extends CalendarIndexEntry {
  fetchedAt: string;
  events: GoogleHoliday[];
}

/** A holiday as it applies to one date in one year, after filters and user rules. */
export interface ResolvedHoliday {
  date: string;
  name: string;
  source: "google" | "custom";
  type: HolidayType | "custom";
  tentative: boolean;
  enabled: boolean;
  fraction: Fraction;
  customId?: string;
  hasRule: boolean; // a holidayRules entry exists for this name
  hasYearOverride: boolean; // a yearOverrides entry exists for this name in this year
}

/** Everything the UI and the statistics need to know about one date. */
export interface DayInfo {
  date: string;
  weekday: number; // 0 = Monday … 6 = Sunday
  holiday: number; // 0 | 0.5 | 1 — largest fraction of the enabled holidays on this date
  holidayNames: string[]; // names of the enabled holidays on this date
  weekly: WeeklyValue;
  base: number; // min(1, holiday + weekly)
  room: number; // 1 - base: how much leave can still be useful on this day
  leave: number; // stored leave (0 if none)
  leaveEff: number; // min(leave, room): leave that actually counts
  free: boolean; // base + leaveEff >= 1
  redundant: boolean; // leave > leaveEff: some stored leave is not needed
}

/** A run of consecutive free days (length >= 3). */
export interface Stretch {
  start: string;
  end: string;
  length: number;
  leaveUsed: number; // sum of leaveEff inside the run
}
```

- [ ] **Step 2: Write the failing tests `src/core/dates.test.ts`**

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/core/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 4: Implement `src/core/dates.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/dates.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core
git commit -m "feat(core): add shared types and UTC-safe date helpers"
```

---

### Task 3: Resolve the holidays of a year

**Files:**
- Create: `src/core/holidays.ts`, `src/test/fixtures.ts`
- Test: `src/core/holidays.test.ts`

**Interfaces:**
- Consumes: types and `addDays`, `isValidIsoDate`, `isoFromParts`, `yearOf` from Task 2.
- Produces:
  - `resolveYearHolidays(state: AppState, calendar: CalendarFile | null, year: number): ResolvedHoliday[]` — every **visible** holiday of the year (enabled and disabled), sorted by date then name.
  - `holidayFractions(holidays: ResolvedHoliday[]): Map<string, { fraction: number; names: string[] }>` — per date, the largest fraction among **enabled** holidays and their names.
  - Test fixtures `makeState(overrides?)` and `zurichFixture` in `src/test/fixtures.ts` (used by later tests).

**Rules (from the spec):**
1. A calendar event is *visible* if it has no `regions` (national) or its `regions` contain at least one of `state.calendar.regions`. Invisible events are ignored completely.
2. Default: `enabled = type === "public" || state.calendar.includeObservances`, `fraction = 1`.
3. Then apply `state.holidayRules[name]`, then `state.yearOverrides[String(year)][name]` — each field that is set overrides the previous value (per field, not the whole object).
4. Events with `days > 1` expand to consecutive dates; only dates inside `year` are returned.
5. Custom holidays: `yearly` → date `year-month-day` (skip if the date doesn't exist, e.g. 29 Feb in non-leap years); `once` → only in its own year. Default `enabled = true`, `fraction = custom.fraction`; `yearOverrides[year][name]` applies to them too.

- [ ] **Step 1: Create the fixtures `src/test/fixtures.ts`**

```ts
import { createDefaultState } from "../state/defaults";
import type { AppState, CalendarFile, GoogleHoliday } from "../core/types";

export function makeCalendar(id: string, name: string, events: GoogleHoliday[], from = 2025, to = 2027): CalendarFile {
  return { id, name, lang: id.split(".")[0], from, to, count: events.length, fetchedAt: "2026-09-23T00:00:00.000Z", events };
}

/** A tiny Swiss-like calendar. 2026: Apr 3 = Friday, Apr 6 = Monday, Sep 12–13 = weekend, Sep 14 = Monday, Dec 25 = Friday. */
export const zurichFixture: CalendarFile = makeCalendar("en.ch", "Holidays in Switzerland", [
  { date: "2025-12-25", name: "Christmas Day", type: "public" },
  { date: "2025-12-26", name: "St. Stephen's Day", type: "public" },
  { date: "2026-01-01", name: "New Year's Day", type: "public" },
  { date: "2026-03-19", name: "Saint Joseph's Day", type: "public", regions: ["Lucerne"] },
  { date: "2026-04-03", name: "Good Friday", type: "public", regions: ["Zurich", "Bern"] },
  { date: "2026-04-06", name: "Easter Monday", type: "public", regions: ["Zurich", "Bern"] },
  { date: "2026-09-12", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-09-13", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-09-14", name: "Knabenschiessen (Zurich)", type: "observance", regions: ["Zurich"] },
  { date: "2026-12-25", name: "Christmas Day", type: "public" },
  { date: "2026-12-26", name: "St. Stephen's Day", type: "public" },
  { date: "2027-01-01", name: "New Year's Day", type: "public" },
]);

/** Default state with calendar en.ch / Zurich, plus any overrides. */
export function makeState(overrides: Partial<AppState> = {}): AppState {
  const base = createDefaultState();
  return {
    ...base,
    calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
    ...overrides,
  };
}
```

Note: `createDefaultState` is created in Task 6. To keep this task self-contained, create `src/state/defaults.ts` now with exactly this content (Task 6 reuses it unchanged):

```ts
import type { AppState } from "../core/types";

export function createDefaultState(): AppState {
  return {
    version: 1,
    language: null,
    calendar: { id: null, regions: [], includeObservances: false },
    holidayRules: {},
    yearOverrides: {},
    customHolidays: [],
    weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    leave: {},
    theme: "system",
  };
}
```

- [ ] **Step 2: Write the failing tests `src/core/holidays.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { makeCalendar, makeState, zurichFixture } from "../test/fixtures";

const names = (list: { name: string }[]) => list.map((h) => h.name);

describe("resolveYearHolidays", () => {
  test("without regions only national holidays are visible", () => {
    const state = makeState({ calendar: { id: "en.ch", regions: [], includeObservances: false } });
    expect(names(resolveYearHolidays(state, zurichFixture, 2026))).toEqual([
      "New Year's Day", "Christmas Day", "St. Stephen's Day",
    ]);
  });

  test("region filter shows national + matching regional holidays", () => {
    const list = resolveYearHolidays(makeState(), zurichFixture, 2026);
    expect(names(list)).toContain("Good Friday");
    expect(names(list)).not.toContain("Saint Joseph's Day"); // Lucerne only
  });

  test("observances are visible but disabled by default", () => {
    const list = resolveYearHolidays(makeState(), zurichFixture, 2026);
    const knaben = list.filter((h) => h.name === "Knabenschiessen (Zurich)");
    expect(knaben).toHaveLength(3);
    expect(knaben.every((h) => !h.enabled && h.type === "observance")).toBe(true);
    const goodFriday = list.find((h) => h.name === "Good Friday")!;
    expect(goodFriday).toMatchObject({ enabled: true, fraction: 1, source: "google", hasRule: false });
  });

  test("includeObservances enables observances", () => {
    const state = makeState({ calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: true } });
    const list = resolveYearHolidays(state, zurichFixture, 2026);
    expect(list.filter((h) => h.name.startsWith("Knaben")).every((h) => h.enabled)).toBe(true);
  });

  test("holidayRules apply by name to every date with that name", () => {
    const state = makeState({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } } });
    const knaben = resolveYearHolidays(state, zurichFixture, 2026).filter((h) => h.name.startsWith("Knaben"));
    expect(knaben.map((h) => [h.date, h.enabled, h.fraction, h.hasRule])).toEqual([
      ["2026-09-12", true, 0.5, true],
      ["2026-09-13", true, 0.5, true],
      ["2026-09-14", true, 0.5, true],
    ]);
  });

  test("yearOverrides beat holidayRules field by field, only in their year", () => {
    const state = makeState({
      holidayRules: { "St. Stephen's Day": { enabled: false, fraction: 0.5 } },
      yearOverrides: { "2026": { "St. Stephen's Day": { enabled: true } } },
    });
    const in2026 = resolveYearHolidays(state, zurichFixture, 2026).find((h) => h.name === "St. Stephen's Day")!;
    expect(in2026).toMatchObject({ enabled: true, fraction: 0.5, hasRule: true, hasYearOverride: true });
    const in2025 = resolveYearHolidays(state, zurichFixture, 2025).find((h) => h.name === "St. Stephen's Day")!;
    expect(in2025).toMatchObject({ enabled: false, fraction: 0.5, hasYearOverride: false });
  });

  test("custom holidays: yearly, once, 29 February and year overrides", () => {
    const state = makeState({
      customHolidays: [
        { id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } },
        { id: "b", name: "Office closed", fraction: 0.5, rule: { type: "once", date: "2026-12-24" } },
        { id: "c", name: "Leap party", fraction: 1, rule: { type: "yearly", month: 2, day: 29 } },
      ],
      yearOverrides: { "2027": { "Company day": { enabled: false } } },
    });
    const y2026 = resolveYearHolidays(state, zurichFixture, 2026).filter((h) => h.source === "custom");
    expect(y2026.map((h) => [h.date, h.name, h.fraction, h.enabled, h.customId])).toEqual([
      ["2026-06-15", "Company day", 1, true, "a"],
      ["2026-12-24", "Office closed", 0.5, true, "b"],
    ]);
    const y2027 = resolveYearHolidays(state, zurichFixture, 2027).filter((h) => h.source === "custom");
    expect(y2027.map((h) => [h.name, h.enabled])).toEqual([["Company day", false]]);
    const y2028 = resolveYearHolidays(state, zurichFixture, 2028).filter((h) => h.source === "custom");
    expect(names(y2028)).toEqual(["Leap party", "Company day"]);
  });

  test("multi-day events expand and are clipped to the year", () => {
    const cal = makeCalendar("en.xx", "X", [{ date: "2026-12-31", name: "Long feast", type: "public", days: 3 }]);
    const state = makeState({ calendar: { id: "en.xx", regions: [], includeObservances: false } });
    expect(resolveYearHolidays(state, cal, 2026).map((h) => h.date)).toEqual(["2026-12-31"]);
    expect(resolveYearHolidays(state, cal, 2027).map((h) => h.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });

  test("a year outside the calendar data returns only custom holidays", () => {
    const state = makeState({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(names(resolveYearHolidays(state, zurichFixture, 2019))).toEqual(["Company day"]);
    expect(resolveYearHolidays(state, null, 2026)).toHaveLength(1);
  });
});

describe("holidayFractions", () => {
  test("uses the largest enabled fraction per date and ignores disabled holidays", () => {
    const map = holidayFractions([
      { date: "2026-01-01", name: "A", source: "google", type: "public", tentative: false, enabled: true, fraction: 0.5, hasRule: false, hasYearOverride: false },
      { date: "2026-01-01", name: "B", source: "google", type: "public", tentative: false, enabled: true, fraction: 1, hasRule: false, hasYearOverride: false },
      { date: "2026-01-02", name: "C", source: "google", type: "observance", tentative: false, enabled: false, fraction: 1, hasRule: false, hasYearOverride: false },
    ]);
    expect(map.get("2026-01-01")).toEqual({ fraction: 1, names: ["A", "B"] });
    expect(map.has("2026-01-02")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/core/holidays.test.ts`
Expected: FAIL — cannot resolve `./holidays`.

- [ ] **Step 4: Implement `src/core/holidays.ts`**

```ts
import { addDays, isValidIsoDate, isoFromParts, yearOf } from "./dates";
import type { AppState, CalendarFile, Fraction, HolidayRule, ResolvedHoliday } from "./types";

interface Effective {
  enabled: boolean;
  fraction: Fraction;
}

function isVisible(regions: string[] | undefined, selected: string[]): boolean {
  return !regions || regions.some((r) => selected.includes(r));
}

/** Applies rules in order; every field that is set overrides the previous value. */
function applyRules(defaults: Effective, ...rules: (HolidayRule | undefined)[]): Effective {
  let result = { ...defaults };
  for (const rule of rules) {
    if (!rule) continue;
    result = { enabled: rule.enabled ?? result.enabled, fraction: rule.fraction ?? result.fraction };
  }
  return result;
}

/**
 * All holidays visible in `year` (enabled and disabled), after the region filter,
 * the observance default, the user's rules for all years and the overrides for this year.
 */
export function resolveYearHolidays(state: AppState, calendar: CalendarFile | null, year: number): ResolvedHoliday[] {
  const out: ResolvedHoliday[] = [];
  const yearRules = state.yearOverrides[String(year)] ?? {};

  for (const event of calendar?.events ?? []) {
    if (!isVisible(event.regions, state.calendar.regions)) continue;
    const globalRule = state.holidayRules[event.name];
    const yearRule = yearRules[event.name];
    const effective = applyRules(
      { enabled: event.type === "public" || state.calendar.includeObservances, fraction: 1 },
      globalRule,
      yearRule,
    );
    for (let i = 0; i < (event.days ?? 1); i++) {
      const date = addDays(event.date, i);
      if (yearOf(date) !== year) continue;
      out.push({
        date,
        name: event.name,
        source: "google",
        type: event.type,
        tentative: event.tentative === true,
        ...effective,
        hasRule: globalRule !== undefined,
        hasYearOverride: yearRule !== undefined,
      });
    }
  }

  for (const custom of state.customHolidays) {
    const date = custom.rule.type === "once" ? custom.rule.date : isoFromParts(year, custom.rule.month, custom.rule.day);
    if (!isValidIsoDate(date) || yearOf(date) !== year) continue;
    const yearRule = yearRules[custom.name];
    out.push({
      date,
      name: custom.name,
      source: "custom",
      type: "custom",
      tentative: false,
      ...applyRules({ enabled: true, fraction: custom.fraction }, yearRule),
      customId: custom.id,
      hasRule: false,
      hasYearOverride: yearRule !== undefined,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Per date: the largest fraction among enabled holidays and their names. */
export function holidayFractions(holidays: ResolvedHoliday[]): Map<string, { fraction: number; names: string[] }> {
  const map = new Map<string, { fraction: number; names: string[] }>();
  for (const h of holidays) {
    if (!h.enabled) continue;
    const entry = map.get(h.date) ?? { fraction: 0, names: [] };
    entry.fraction = Math.max(entry.fraction, h.fraction);
    entry.names.push(h.name);
    map.set(h.date, entry);
  }
  return map;
}
```

Note on the sort in the `2028` custom test: both custom holidays are in 2028 (`2028-02-29` "Leap party", `2028-06-15` "Company day"), so date order gives `["Leap party", "Company day"]`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/core/holidays.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/holidays.ts src/core/holidays.test.ts src/test/fixtures.ts src/state/defaults.ts
git commit -m "feat(core): resolve visible and enabled holidays per year"
```

---

### Task 4: Per-day computation and the leave click cycle

**Files:**
- Create: `src/core/days.ts`
- Test: `src/core/days.test.ts`

**Interfaces:**
- Consumes: `resolveYearHolidays`, `holidayFractions` (Task 3); `weekday`, `yearOf` (Task 2).
- Produces:
  - `computeDay(date, holiday: { fraction: number; names: string[] } | undefined, weeklyPlan: WeeklyPlan, leave: Record<string, Fraction>): DayInfo`
  - `type DayResolver = (date: string) => DayInfo`
  - `createDayResolver(state: AppState, calendar: CalendarFile | null): DayResolver` — works for any date of any year (caches per year and per date).
  - `nextLeaveValue(room: number, current: number): 0 | 0.5 | 1`

**Rules (spec §6.2–6.3):**

```
holiday   = largest enabled holiday fraction on the date (0 if none)
weekly    = weeklyPlan[weekday]
base      = min(1, holiday + weekly)
room      = 1 - base
leaveEff  = min(storedLeave, room)
free      = base + leaveEff >= 1
redundant = storedLeave > leaveEff
```

Click cycle on a date:

| room | current stored leave → next |
|---|---|
| 0 | anything → 0 (clicking deletes leave that is not needed; with no leave nothing changes) |
| 0.5 | 0 → 0.5; 0.5 or 1 → 0 |
| 1 | 0 → 1 → 0.5 → 0 |

- [ ] **Step 1: Write the failing tests `src/core/days.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { computeDay, createDayResolver, nextLeaveValue } from "./days";
import type { WeeklyPlan } from "./types";
import { makeState, zurichFixture } from "../test/fixtures";

const MON_FRI: WeeklyPlan = [0, 0, 0, 0, 0, 1, 1];

describe("computeDay", () => {
  test("plain working day", () => {
    expect(computeDay("2026-04-07", undefined, MON_FRI, {})).toEqual({
      date: "2026-04-07", weekday: 1, holiday: 0, holidayNames: [], weekly: 0,
      base: 0, room: 1, leave: 0, leaveEff: 0, free: false, redundant: false,
    });
  });

  test("weekend is free", () => {
    const day = computeDay("2026-04-04", undefined, MON_FRI, {});
    expect(day).toMatchObject({ weekly: 1, base: 1, room: 0, free: true });
  });

  test("half holiday + half leave = free day", () => {
    const day = computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, { "2026-09-14": 0.5 });
    expect(day).toMatchObject({ holiday: 0.5, base: 0.5, room: 0.5, leaveEff: 0.5, free: true, redundant: false });
  });

  test("half holiday alone is not free", () => {
    expect(computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, {}).free).toBe(false);
  });

  test("half holiday + half weekly off = free without leave", () => {
    const plan: WeeklyPlan = [0, 0, 0, 0, 0.5, 1, 1];
    const day = computeDay("2026-04-03", { fraction: 0.5, names: ["X"] }, plan, {});
    expect(day).toMatchObject({ base: 1, room: 0, free: true });
  });

  test("full leave on a half holiday counts only half and is redundant", () => {
    const day = computeDay("2026-09-14", { fraction: 0.5, names: ["K"] }, MON_FRI, { "2026-09-14": 1 });
    expect(day).toMatchObject({ leave: 1, leaveEff: 0.5, free: true, redundant: true });
  });

  test("leave on a full holiday counts nothing and is redundant", () => {
    const day = computeDay("2026-04-06", { fraction: 1, names: ["Easter Monday"] }, MON_FRI, { "2026-04-06": 1 });
    expect(day).toMatchObject({ leaveEff: 0, redundant: true, free: true });
  });
});

describe("nextLeaveValue", () => {
  test("room 1 cycles 0 → 1 → 0.5 → 0", () => {
    expect(nextLeaveValue(1, 0)).toBe(1);
    expect(nextLeaveValue(1, 1)).toBe(0.5);
    expect(nextLeaveValue(1, 0.5)).toBe(0);
  });
  test("room 0.5 cycles 0 → 0.5 → 0", () => {
    expect(nextLeaveValue(0.5, 0)).toBe(0.5);
    expect(nextLeaveValue(0.5, 0.5)).toBe(0);
    expect(nextLeaveValue(0.5, 1)).toBe(0);
  });
  test("room 0 always clears", () => {
    expect(nextLeaveValue(0, 0)).toBe(0);
    expect(nextLeaveValue(0, 1)).toBe(0);
  });
});

describe("createDayResolver", () => {
  test("resolves dates of any year using the user's rules", () => {
    const state = makeState({
      holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
      leave: { "2026-09-14": 0.5 },
    });
    const resolve = createDayResolver(state, zurichFixture);
    expect(resolve("2026-09-14")).toMatchObject({ holiday: 0.5, holidayNames: ["Knabenschiessen (Zurich)"], free: true });
    expect(resolve("2026-04-03")).toMatchObject({ holiday: 1, free: true });
    expect(resolve("2027-01-01")).toMatchObject({ holiday: 1, free: true });
    expect(resolve("2026-04-07").free).toBe(false);
  });

  test("returns the same object for repeated calls (cached)", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(resolve("2026-04-07")).toBe(resolve("2026-04-07"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/days.test.ts`
Expected: FAIL — cannot resolve `./days`.

- [ ] **Step 3: Implement `src/core/days.ts`**

```ts
import { weekday, yearOf } from "./dates";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import type { AppState, CalendarFile, DayInfo, Fraction, WeeklyPlan } from "./types";

export function computeDay(
  date: string,
  holiday: { fraction: number; names: string[] } | undefined,
  weeklyPlan: WeeklyPlan,
  leave: Record<string, Fraction>,
): DayInfo {
  const wd = weekday(date);
  const holidayFraction = holiday?.fraction ?? 0;
  const weekly = weeklyPlan[wd];
  const base = Math.min(1, holidayFraction + weekly);
  const room = 1 - base;
  const stored = leave[date] ?? 0;
  const leaveEff = Math.min(stored, room);
  return {
    date,
    weekday: wd,
    holiday: holidayFraction,
    holidayNames: holiday?.names ?? [],
    weekly,
    base,
    room,
    leave: stored,
    leaveEff,
    free: base + leaveEff >= 1,
    redundant: stored > leaveEff,
  };
}

export type DayResolver = (date: string) => DayInfo;

/** Returns a function that computes DayInfo for any date, caching holidays per year. */
export function createDayResolver(state: AppState, calendar: CalendarFile | null): DayResolver {
  const holidaysByYear = new Map<number, ReturnType<typeof holidayFractions>>();
  const days = new Map<string, DayInfo>();
  return (date) => {
    const cached = days.get(date);
    if (cached) return cached;
    const year = yearOf(date);
    let fractions = holidaysByYear.get(year);
    if (!fractions) {
      fractions = holidayFractions(resolveYearHolidays(state, calendar, year));
      holidaysByYear.set(year, fractions);
    }
    const info = computeDay(date, fractions.get(date), state.weeklyPlan, state.leave);
    days.set(date, info);
    return info;
  };
}

/** What a click on a day does to its stored leave (see the table in the plan). */
export function nextLeaveValue(room: number, current: number): 0 | 0.5 | 1 {
  if (room <= 0) return 0;
  if (room === 0.5) return current === 0 ? 0.5 : 0;
  if (current === 0) return 1;
  if (current === 1) return 0.5;
  return 0;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/core/days.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/days.ts src/core/days.test.ts
git commit -m "feat(core): compute free days with half-day arithmetic and leave cycle"
```

---

### Task 5: Leave total and stretches (3-day, 4-day … breaks)

**Files:**
- Create: `src/core/stats.ts`
- Test: `src/core/stats.test.ts`, `src/core/stats.real-data.test.ts`

**Interfaces:**
- Consumes: `DayResolver`, `createDayResolver` (Task 4); `addDays`, `yearDates` (Task 2).
- Produces:
  - `leaveUsed(year: number, resolve: DayResolver): number` — Σ `leaveEff` over the days of `year`.
  - `findStretches(year: number, resolve: DayResolver, minLength?: number /* default 3 */): Stretch[]` — sorted by start date.
  - `groupStretches(stretches: Stretch[]): { length: number; stretches: Stretch[] }[]` — grouped by length, longest first.

**Rules (spec §6.4):** a stretch is a maximal run of consecutive `free` days with length ≥ 3. Runs may cross year boundaries: a run is listed in the year of its **first** day and its full length counts (e.g. 25 Dec 2026 → 3 Jan 2027 is a 10-day break listed in 2026, not in 2027). `leaveUsed` of a stretch includes days in the next year. Scanning must stop even if every day is free.

- [ ] **Step 1: Write the failing tests `src/core/stats.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { findStretches, groupStretches, leaveUsed } from "./stats";
import { createDayResolver } from "./days";
import { makeState, zurichFixture } from "../test/fixtures";

const summary = (s: { start: string; end: string; length: number; leaveUsed: number }[]) =>
  s.map((x) => `${x.start}..${x.end} ${x.length}d ${x.leaveUsed}l`);

describe("findStretches", () => {
  test("default Zurich fixture 2026: Easter and Christmas", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(summary(findStretches(2026, resolve))).toEqual([
      "2026-04-03..2026-04-06 4d 0l",
      "2026-12-25..2026-12-27 3d 0l",
    ]);
  });

  test("leave extends a stretch across the new year; listed in the start year only", () => {
    const leave = { "2026-12-28": 1, "2026-12-29": 1, "2026-12-30": 1, "2026-12-31": 1 } as const;
    const resolve = createDayResolver(makeState({ leave }), zurichFixture);
    expect(summary(findStretches(2026, resolve)).at(-1)).toBe("2026-12-25..2027-01-03 10d 4l");
    expect(summary(findStretches(2027, resolve))).toEqual([]);
  });

  test("half holiday + half leave joins the weekend (Knabenschiessen)", () => {
    const rules = { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 as const } };
    const without = createDayResolver(makeState({ holidayRules: rules }), zurichFixture);
    expect(findStretches(2026, without).map((s) => s.start)).not.toContain("2026-09-12");
    const withLeave = createDayResolver(makeState({ holidayRules: rules, leave: { "2026-09-14": 0.5 } }), zurichFixture);
    expect(summary(findStretches(2026, withLeave))).toContain("2026-09-12..2026-09-14 3d 0.5l");
  });

  test("half leave alone does not join days", () => {
    const resolve = createDayResolver(makeState({ leave: { "2026-04-07": 0.5 } }), zurichFixture);
    expect(summary(findStretches(2026, resolve))[0]).toBe("2026-04-03..2026-04-06 4d 0l");
  });

  test("REVIEW FOCUS: every day off terminates and returns no in-year stretch", () => {
    const resolve = createDayResolver(makeState({ weeklyPlan: [1, 1, 1, 1, 1, 1, 1] }), zurichFixture);
    expect(findStretches(2026, resolve)).toEqual([]);
    expect(leaveUsed(2026, resolve)).toBe(0);
  });

  test("minLength parameter", () => {
    const resolve = createDayResolver(makeState(), zurichFixture);
    expect(findStretches(2026, resolve, 5)).toEqual([]);
  });
});

describe("leaveUsed", () => {
  test("counts effective leave of the year only", () => {
    const leave = { "2026-04-07": 1, "2026-04-08": 0.5, "2026-04-06": 1, "2025-12-30": 1 } as const;
    const resolve = createDayResolver(makeState({ leave }), zurichFixture);
    expect(leaveUsed(2026, resolve)).toBe(1.5); // Apr 6 is a holiday → redundant, not counted
  });
});

describe("groupStretches", () => {
  test("groups by length, longest first, keeps date order inside a group", () => {
    const s = (start: string, length: number) => ({ start, end: start, length, leaveUsed: 0 });
    expect(groupStretches([s("2026-01-01", 3), s("2026-04-03", 4), s("2026-12-25", 3)])).toEqual([
      { length: 4, stretches: [s("2026-04-03", 4)] },
      { length: 3, stretches: [s("2026-01-01", 3), s("2026-12-25", 3)] },
    ]);
  });
});
```

- [ ] **Step 2: Write the real-data test `src/core/stats.real-data.test.ts`**

This checks the logic against the real downloaded Google data (Zurich 2026, Mon–Fri plan, no leave). The expected values were computed from `data/holidays/en.ch.json`.

```ts
import { expect, test } from "vitest";
import enCh from "../../data/holidays/en.ch.json";
import { createDayResolver } from "./days";
import { findStretches } from "./stats";
import type { CalendarFile } from "./types";
import { makeState } from "../test/fixtures";

test("real data: Zurich 2026 breaks with a Mon–Fri plan and no leave", () => {
  const resolve = createDayResolver(makeState(), enCh as unknown as CalendarFile);
  expect(findStretches(2026, resolve).map((s) => `${s.start}..${s.end} ${s.length}`)).toEqual([
    "2026-04-03..2026-04-06 4",
    "2026-05-01..2026-05-03 3",
    "2026-05-23..2026-05-25 3",
    "2026-12-25..2026-12-27 3",
  ]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/core/stats`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 4: Implement `src/core/stats.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/core`
Expected: PASS (all core tests, including the real-data test).

- [ ] **Step 6: Commit**

```bash
git add src/core/stats.ts src/core/stats.test.ts src/core/stats.real-data.test.ts
git commit -m "feat(core): compute leave total and multi-day breaks across years"
```

---

### Task 6: State schema, persistence and import/export

**Files:**
- Modify: `src/state/defaults.ts` (already created in Task 3 — keep as is)
- Create: `src/state/schema.ts`, `src/state/storage.ts`, `src/state/exportImport.ts`
- Test: `src/state/schema.test.ts`, `src/state/storage.test.ts`

**Interfaces:**
- Consumes: `AppState` (Task 2), `isValidIsoDate` (Task 2), `createDefaultState` (Task 3).
- Produces:
  - `type ParseError = "invalidJson" | "unsupportedVersion" | "invalidShape"`
  - `parseAppState(input: unknown): { ok: true; state: AppState } | { ok: false; error: ParseError }`
  - `parseStateText(text: string)` → same result type (handles `JSON.parse` errors).
  - `STORAGE_KEY = "holidays.state"`, `BACKUP_KEY = "holidays.state.backup"`
  - `getStorage(): Storage | null` — `null` when `localStorage` is unusable.
  - `loadState(storage: Storage | null): { state: AppState; recoveredBackup: string | null }`
  - `saveState(storage: Storage | null, state: AppState): boolean`
  - `exportStateJson(state: AppState): string`, `downloadText(filename: string, text: string): void`

- [ ] **Step 1: Write the failing tests `src/state/schema.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { parseAppState, parseStateText } from "./schema";
import { createDefaultState } from "./defaults";

const valid = () => ({
  ...createDefaultState(),
  calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
  holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
  yearOverrides: { "2026": { "St. Stephen's Day": { enabled: false } } },
  customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
  leave: { "2026-04-07": 1, "2026-09-14": 0.5 },
});

describe("parseAppState", () => {
  test("accepts a full valid state", () => {
    const result = parseAppState(valid());
    expect(result).toEqual({ ok: true, state: valid() });
  });

  test("accepts the default state", () => {
    expect(parseAppState(createDefaultState()).ok).toBe(true);
  });

  test.each([
    ["impossible leave date", { ...valid(), leave: { "2026-02-30": 1 } }],
    ["leave fraction 0.3", { ...valid(), leave: { "2026-04-07": 0.3 } }],
    ["weekly plan of 6 days", { ...valid(), weeklyPlan: [0, 0, 0, 0, 0, 1] }],
    ["weekly value 2", { ...valid(), weeklyPlan: [0, 0, 0, 0, 0, 1, 2] }],
    ["bad year key", { ...valid(), yearOverrides: { "26": {} } }],
    ["bad calendar id", { ...valid(), calendar: { id: "../../x", regions: [], includeObservances: false } }],
    ["custom once with bad date", { ...valid(), customHolidays: [{ id: "b", name: "X", fraction: 1, rule: { type: "once", date: "2026-13-01" } }] }],
    ["unknown theme", { ...valid(), theme: "neon" }],
    ["not an object", 42],
  ])("REVIEW FOCUS: rejects %s", (_label, input) => {
    expect(parseAppState(input)).toEqual({ ok: false, error: "invalidShape" });
  });

  test("REVIEW FOCUS: rejects a newer version with a specific error", () => {
    expect(parseAppState({ ...valid(), version: 2 })).toEqual({ ok: false, error: "unsupportedVersion" });
  });
});

describe("parseStateText", () => {
  test("REVIEW FOCUS: invalid JSON", () => {
    expect(parseStateText("{not json")).toEqual({ ok: false, error: "invalidJson" });
  });
  test("valid JSON text", () => {
    expect(parseStateText(JSON.stringify(valid())).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing tests `src/state/storage.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { BACKUP_KEY, STORAGE_KEY, loadState, saveState } from "./storage";
import { createDefaultState } from "./defaults";
import { exportStateJson } from "./exportImport";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

function throwingStorage(): Storage {
  const s = memoryStorage();
  s.setItem = () => { throw new DOMException("QuotaExceededError"); };
  s.getItem = () => { throw new DOMException("SecurityError"); };
  return s;
}

describe("storage", () => {
  test("round-trips the state", () => {
    const storage = memoryStorage();
    const state = { ...createDefaultState(), leave: { "2026-04-07": 1 as const } };
    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage)).toEqual({ state, recoveredBackup: null });
  });

  test("empty storage gives the default state", () => {
    expect(loadState(memoryStorage())).toEqual({ state: createDefaultState(), recoveredBackup: null });
  });

  test("corrupted data is backed up and the default state is used", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    const result = loadState(storage);
    expect(result.state).toEqual(createDefaultState());
    expect(result.recoveredBackup).toBe("{broken");
    expect(storage.getItem(BACKUP_KEY)).toBe("{broken");
  });

  test("REVIEW FOCUS: no storage at all", () => {
    expect(loadState(null).state).toEqual(createDefaultState());
    expect(saveState(null, createDefaultState())).toBe(false);
  });

  test("REVIEW FOCUS: throwing storage never throws out of load/save", () => {
    const storage = throwingStorage();
    expect(loadState(storage).state).toEqual(createDefaultState());
    expect(saveState(storage, createDefaultState())).toBe(false);
  });

  test("export is pretty JSON of the state", () => {
    const state = createDefaultState();
    expect(JSON.parse(exportStateJson(state))).toEqual(state);
    expect(exportStateJson(state)).toContain("\n  ");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/state`
Expected: FAIL — cannot resolve `./schema`, `./storage`, `./exportImport`.

- [ ] **Step 4: Implement `src/state/schema.ts`**

```ts
import { z } from "zod";
import { isValidIsoDate } from "../core/dates";
import type { AppState } from "../core/types";

const fraction = z.union([z.literal(0.5), z.literal(1)]);
const weeklyValue = z.union([z.literal(0), z.literal(0.5), z.literal(1)]);
const isoDate = z.string().refine(isValidIsoDate, "Invalid date");
const rule = z.object({ enabled: z.boolean().optional(), fraction: fraction.optional() });

const customHoliday = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fraction,
  rule: z.discriminatedUnion("type", [
    z.object({ type: z.literal("yearly"), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
    z.object({ type: z.literal("once"), date: isoDate }),
  ]),
});

export const appStateSchema = z.object({
  version: z.literal(1),
  language: z.string().nullable(),
  calendar: z.object({
    // Calendar ids look like "en.ch" or "en.new_zealand"; anything else could be a path trick.
    id: z.string().regex(/^[a-z]{2}\.[a-z_]+$/).nullable(),
    regions: z.array(z.string()),
    includeObservances: z.boolean(),
  }),
  holidayRules: z.record(z.string(), rule),
  yearOverrides: z.record(z.string().regex(/^\d{4}$/), z.record(z.string(), rule)),
  customHolidays: z.array(customHoliday),
  weeklyPlan: z.tuple([weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue]),
  leave: z
    .record(z.string(), fraction)
    .refine((leave) => Object.keys(leave).every(isValidIsoDate), "Invalid leave date"),
  theme: z.enum(["system", "light", "dark"]),
});

export type ParseError = "invalidJson" | "unsupportedVersion" | "invalidShape";
export type ParseResult = { ok: true; state: AppState } | { ok: false; error: ParseError };

export function parseAppState(input: unknown): ParseResult {
  if (typeof input === "object" && input !== null && typeof (input as { version?: unknown }).version === "number") {
    if ((input as { version: number }).version > 1) return { ok: false, error: "unsupportedVersion" };
  }
  const result = appStateSchema.safeParse(input);
  return result.success ? { ok: true, state: result.data as AppState } : { ok: false, error: "invalidShape" };
}

export function parseStateText(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalidJson" };
  }
  return parseAppState(json);
}
```

- [ ] **Step 5: Implement `src/state/storage.ts`**

```ts
import type { AppState } from "../core/types";
import { createDefaultState } from "./defaults";
import { parseStateText } from "./schema";

export const STORAGE_KEY = "holidays.state";
export const BACKUP_KEY = "holidays.state.backup";

/** localStorage if it can actually be written, otherwise null (private mode, blocked, …). */
export function getStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = "__holidays_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function loadState(storage: Storage | null): { state: AppState; recoveredBackup: string | null } {
  const fresh = { state: createDefaultState(), recoveredBackup: null };
  if (!storage) return fresh;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return fresh;
  }
  if (raw === null) return fresh;
  const parsed = parseStateText(raw);
  if (parsed.ok) return { state: parsed.state, recoveredBackup: null };
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Keeping the backup is best effort; the user can still download it from the banner.
  }
  return { state: createDefaultState(), recoveredBackup: raw };
}

export function saveState(storage: Storage | null, state: AppState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Implement `src/state/exportImport.ts`**

```ts
import type { AppState } from "../core/types";

export function exportStateJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Lets the browser download `text` as a file. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/state`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/state
git commit -m "feat(state): validate, persist and export the app state"
```

---

### Task 7: State reducer (all user actions)

**Files:**
- Create: `src/state/reducer.ts`
- Test: `src/state/reducer.test.ts`

**Interfaces:**
- Consumes: `AppState`, `CustomHoliday`, `HolidayRule`, `Theme`, `WeeklyPlan` (Task 2); `nextLeaveValue` (Task 4); `createDefaultState` (Task 3).
- Produces:

```ts
export type Action =
  | { type: "toggleLeave"; date: string; room: number }
  | { type: "cycleWeekly"; weekday: number }
  | { type: "setHolidayRule"; name: string; scope: "all" | number; rule: HolidayRule | null }
  | { type: "addCustomHoliday"; holiday: CustomHoliday }
  | { type: "updateCustomHoliday"; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
  | { type: "removeCustomHoliday"; id: string }
  | { type: "setCalendar"; id: string }
  | { type: "setRegions"; regions: string[] }
  | { type: "setIncludeObservances"; value: boolean }
  | { type: "setLanguage"; language: string | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "replaceState"; state: AppState }
  | { type: "reset" };
export function reducer(state: AppState, action: Action): AppState;
```

Semantics: `toggleLeave` uses `nextLeaveValue(room, current)`; value 0 deletes the date key. `cycleWeekly` cycles 0 → 0.5 → 1 → 0. `setHolidayRule` with `rule: null` or an empty rule (`{}`) removes the entry; with `scope: <year>` it edits `yearOverrides[String(year)]` and removes the year key when empty. `setRegions` stores a sorted copy. The reducer never mutates its input.

- [ ] **Step 1: Write the failing tests `src/state/reducer.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import { reducer } from "./reducer";
import { createDefaultState } from "./defaults";

describe("reducer", () => {
  test("toggleLeave cycles and removes the key at 0", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({ "2026-04-07": 1 });
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({ "2026-04-07": 0.5 });
    s = reducer(s, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    expect(s.leave).toEqual({});
  });

  test("toggleLeave on a half-free day uses half leave", () => {
    const s = reducer(createDefaultState(), { type: "toggleLeave", date: "2026-09-14", room: 0.5 });
    expect(s.leave).toEqual({ "2026-09-14": 0.5 });
  });

  test("toggleLeave on a free day clears redundant leave", () => {
    const start = { ...createDefaultState(), leave: { "2026-04-06": 1 as const } };
    expect(reducer(start, { type: "toggleLeave", date: "2026-04-06", room: 0 }).leave).toEqual({});
  });

  test("cycleWeekly 0 → 0.5 → 1 → 0", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(0.5);
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(1);
    s = reducer(s, { type: "cycleWeekly", weekday: 4 });
    expect(s.weeklyPlan[4]).toBe(0);
  });

  test("setHolidayRule for all years and removal", () => {
    let s = reducer(createDefaultState(), { type: "setHolidayRule", name: "K", scope: "all", rule: { enabled: true, fraction: 0.5 } });
    expect(s.holidayRules).toEqual({ K: { enabled: true, fraction: 0.5 } });
    s = reducer(s, { type: "setHolidayRule", name: "K", scope: "all", rule: null });
    expect(s.holidayRules).toEqual({});
  });

  test("setHolidayRule for one year removes empty years", () => {
    let s = reducer(createDefaultState(), { type: "setHolidayRule", name: "X", scope: 2026, rule: { enabled: false } });
    expect(s.yearOverrides).toEqual({ "2026": { X: { enabled: false } } });
    s = reducer(s, { type: "setHolidayRule", name: "X", scope: 2026, rule: {} });
    expect(s.yearOverrides).toEqual({});
  });

  test("custom holidays add / update / remove", () => {
    const holiday = { id: "a", name: "Company day", fraction: 1 as const, rule: { type: "yearly" as const, month: 6, day: 15 } };
    let s = reducer(createDefaultState(), { type: "addCustomHoliday", holiday });
    s = reducer(s, { type: "updateCustomHoliday", id: "a", changes: { fraction: 0.5 } });
    expect(s.customHolidays).toEqual([{ ...holiday, fraction: 0.5 }]);
    s = reducer(s, { type: "removeCustomHoliday", id: "a" });
    expect(s.customHolidays).toEqual([]);
  });

  test("calendar, regions, observances, language, theme", () => {
    let s = createDefaultState();
    s = reducer(s, { type: "setCalendar", id: "de.ch" });
    s = reducer(s, { type: "setRegions", regions: ["Zurich", "Bern"] });
    s = reducer(s, { type: "setIncludeObservances", value: true });
    s = reducer(s, { type: "setLanguage", language: "el" });
    s = reducer(s, { type: "setTheme", theme: "dark" });
    expect(s.calendar).toEqual({ id: "de.ch", regions: ["Bern", "Zurich"], includeObservances: true });
    expect(s.language).toBe("el");
    expect(s.theme).toBe("dark");
  });

  test("replaceState and reset", () => {
    const other = { ...createDefaultState(), theme: "light" as const };
    expect(reducer(createDefaultState(), { type: "replaceState", state: other })).toBe(other);
    expect(reducer(other, { type: "reset" })).toEqual(createDefaultState());
  });

  test("never mutates the previous state", () => {
    const before = createDefaultState();
    const snapshot = JSON.stringify(before);
    reducer(before, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    reducer(before, { type: "cycleWeekly", weekday: 0 });
    reducer(before, { type: "setHolidayRule", name: "X", scope: 2026, rule: { enabled: false } });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/state/reducer.test.ts`
Expected: FAIL — cannot resolve `./reducer`.

- [ ] **Step 3: Implement `src/state/reducer.ts`**

```ts
import { nextLeaveValue } from "../core/days";
import type { AppState, CustomHoliday, HolidayRule, Theme, WeeklyPlan, WeeklyValue } from "../core/types";
import { createDefaultState } from "./defaults";

export type Action =
  | { type: "toggleLeave"; date: string; room: number }
  | { type: "cycleWeekly"; weekday: number }
  | { type: "setHolidayRule"; name: string; scope: "all" | number; rule: HolidayRule | null }
  | { type: "addCustomHoliday"; holiday: CustomHoliday }
  | { type: "updateCustomHoliday"; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
  | { type: "removeCustomHoliday"; id: string }
  | { type: "setCalendar"; id: string }
  | { type: "setRegions"; regions: string[] }
  | { type: "setIncludeObservances"; value: boolean }
  | { type: "setLanguage"; language: string | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "replaceState"; state: AppState }
  | { type: "reset" };

const NEXT_WEEKLY: Record<WeeklyValue, WeeklyValue> = { 0: 0.5, 0.5: 1, 1: 0 };

function isEmptyRule(rule: HolidayRule | null): boolean {
  return !rule || (rule.enabled === undefined && rule.fraction === undefined);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "toggleLeave": {
      const next = nextLeaveValue(action.room, state.leave[action.date] ?? 0);
      const leave = { ...state.leave };
      if (next === 0) delete leave[action.date];
      else leave[action.date] = next;
      return { ...state, leave };
    }
    case "cycleWeekly": {
      const weeklyPlan = [...state.weeklyPlan] as WeeklyPlan;
      weeklyPlan[action.weekday] = NEXT_WEEKLY[weeklyPlan[action.weekday]];
      return { ...state, weeklyPlan };
    }
    case "setHolidayRule": {
      const remove = isEmptyRule(action.rule);
      if (action.scope === "all") {
        const holidayRules = { ...state.holidayRules };
        if (remove) delete holidayRules[action.name];
        else holidayRules[action.name] = action.rule!;
        return { ...state, holidayRules };
      }
      const key = String(action.scope);
      const yearRules = { ...(state.yearOverrides[key] ?? {}) };
      if (remove) delete yearRules[action.name];
      else yearRules[action.name] = action.rule!;
      const yearOverrides = { ...state.yearOverrides };
      if (Object.keys(yearRules).length > 0) yearOverrides[key] = yearRules;
      else delete yearOverrides[key];
      return { ...state, yearOverrides };
    }
    case "addCustomHoliday":
      return { ...state, customHolidays: [...state.customHolidays, action.holiday] };
    case "updateCustomHoliday":
      return {
        ...state,
        customHolidays: state.customHolidays.map((c) => (c.id === action.id ? { ...c, ...action.changes } : c)),
      };
    case "removeCustomHoliday":
      return { ...state, customHolidays: state.customHolidays.filter((c) => c.id !== action.id) };
    case "setCalendar":
      return { ...state, calendar: { ...state.calendar, id: action.id } };
    case "setRegions":
      return { ...state, calendar: { ...state.calendar, regions: [...action.regions].sort() } };
    case "setIncludeObservances":
      return { ...state, calendar: { ...state.calendar, includeObservances: action.value } };
    case "setLanguage":
      return { ...state, language: action.language };
    case "setTheme":
      return { ...state, theme: action.theme };
    case "replaceState":
      return action.state;
    case "reset":
      return createDefaultState();
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/reducer.ts src/state/reducer.test.ts
git commit -m "feat(state): add reducer for every user action"
```

---

### Task 8: Loading calendars and suggesting one

**Files:**
- Create: `src/data/calendars.ts`, `src/data/hooks.ts`
- Test: `src/data/calendars.test.ts`

**Interfaces:**
- Consumes: `CalendarFile`, `CalendarIndexEntry` (Task 2).
- Produces:
  - `type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `isCalendarId(id: string): boolean`
  - `loadIndex(fetchFn?: FetchLike): Promise<CalendarIndexEntry[]>`
  - `loadCalendar(id: string, fetchFn?: FetchLike): Promise<CalendarFile>` — cached per id; failed loads are not cached; invalid ids reject **without** fetching.
  - `clearCalendarCache(): void` (tests)
  - `calendarRegions(calendar: CalendarFile): string[]` — unique, sorted.
  - `hasDataForYear(calendar: CalendarFile, year: number): boolean`
  - `suggestCalendarId(languages: readonly string[], index: CalendarIndexEntry[]): string | null`
  - Hooks: `type LoadStatus = "idle" | "loading" | "ready" | "error"`; `useCalendarIndex(): { status; index: CalendarIndexEntry[] | null; retry(): void }`; `useCalendar(id: string | null): { status; calendar: CalendarFile | null; retry(): void }`.

**Suggestion algorithm:** for each browser language tag in order (e.g. `"de-CH"`, `"el"`), lowercase and split into `lang` and `region` (a missing region is looked up in `LANGUAGE_DEFAULT_REGION`, e.g. `el → gr`). Candidate ids in order: `${lang}.${alias}`, `${lang}.${region}`, `en.${alias}`, `en.${region}`, where `alias = REGION_ALIASES[region] ?? region` (Google's older ids like `greek`, `usa`). Return the first candidate present in the index; `null` if none.

- [ ] **Step 1: Write the failing tests `src/data/calendars.test.ts`**

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  calendarRegions, clearCalendarCache, hasDataForYear, isCalendarId, loadCalendar, loadIndex, suggestCalendarId,
  type FetchLike,
} from "./calendars";
import { zurichFixture } from "../test/fixtures";
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data`
Expected: FAIL — cannot resolve `./calendars`.

- [ ] **Step 3: Implement `src/data/calendars.ts`**

```ts
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

/** Google's older ids for some countries (ISO region → id suffix). */
const REGION_ALIASES: Record<string, string> = {
  at: "austrian", au: "australian", br: "brazilian", ca: "canadian", cn: "china", de: "german",
  dk: "danish", es: "spain", fi: "finnish", fr: "french", gr: "greek", hk: "hong_kong",
  id: "indonesian", ie: "irish", il: "jewish", in: "indian", it: "italian", jp: "japanese",
  kr: "south_korea", mx: "mexican", my: "malaysia", nl: "dutch", no: "norwegian", nz: "new_zealand",
  ph: "philippines", pl: "polish", pt: "portuguese", ru: "russian", se: "swedish", sg: "singapore",
  tw: "taiwan", us: "usa", vn: "vietnamese",
};

/** Region to assume when the browser language has none (e.g. "el" → Greece). */
const LANGUAGE_DEFAULT_REGION: Record<string, string> = { el: "gr" };

export function suggestCalendarId(languages: readonly string[], index: CalendarIndexEntry[]): string | null {
  const ids = new Set(index.map((c) => c.id));
  for (const tag of languages) {
    const [lang, maybeRegion] = tag.toLowerCase().split("-");
    const region = maybeRegion ?? LANGUAGE_DEFAULT_REGION[lang];
    if (!region) continue;
    const alias = REGION_ALIASES[region] ?? region;
    const candidates = [`${lang}.${alias}`, `${lang}.${region}`, `en.${alias}`, `en.${region}`];
    const found = candidates.find((id) => ids.has(id));
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Implement `src/data/hooks.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/data`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data
git commit -m "feat(data): load holiday calendars and suggest one from the browser language"
```

---

### Task 9: Internationalisation (English + Greek)

**Files:**
- Create: `src/i18n/en.json`, `src/i18n/el.json`, `src/i18n/index.ts`, `src/i18n/I18nProvider.tsx`, `src/test/render.tsx`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type Lang = "en" | "el"` (derived from `MESSAGES`), `type MessageKey` (keys of `en.json`), `SUPPORTED_LANGS: Lang[]`, `LANGUAGE_NAMES: Record<Lang, string>`, `isLang(v: string): v is Lang`.
  - `detectLang(preference: string | null, navigatorLanguages: readonly string[]): Lang`
  - `translate(lang: Lang, key: MessageKey, vars?: Record<string, string>): string` — `{name}` placeholders.
  - `interface I18n { lang; t(key, vars?); formatNumber(n); monthName(month1to12); weekdayShort(0..6 Mon..Sun); formatDate(iso, style?: "long" | "short"); formatRange(startIso, endIso) }`
  - `createI18n(lang): I18n`, `<I18nProvider lang>`, `useI18n(): I18n`.
  - Test helper `renderWithI18n(ui, lang = "en")`.

**How to add a language later:** add `src/i18n/<code>.json` with the same keys, import it in `index.ts` and add it to `MESSAGES` and `LANGUAGE_NAMES`. The test "every language has every key" will catch missing keys.

- [ ] **Step 1: Create `src/i18n/en.json`**

```json
{
  "app.title": "Holidays",
  "header.prevYear": "Previous year",
  "header.nextYear": "Next year",
  "header.settings": "Settings",
  "header.noCalendar": "Choose a holiday calendar",
  "weekly.title": "Weekly plan",
  "weekly.work": "Working day",
  "weekly.half": "Half day off",
  "weekly.off": "Day off",
  "summary.leaveDays": "Leave days: {n}",
  "summary.stretchGroup": "{n}-day breaks",
  "summary.stretchItem": "{range} · {days} days · {leave} leave",
  "summary.noStretches": "No breaks of 3 or more days yet.",
  "summary.compact": "Leave {n} · {breaks} breaks",
  "holidays.title": "Holidays {year}",
  "holidays.scope": "Changes apply to",
  "holidays.scopeAll": "All years",
  "holidays.scopeYear": "Only {year}",
  "holidays.enabled": "Counts as holiday",
  "holidays.makeHalf": "make it a half day",
  "holidays.makeFull": "make it a full day",
  "holidays.thisYearBadge": "only {year}",
  "holidays.resetYear": "Undo the change for {year}",
  "holidays.observance": "observance",
  "holidays.tentative": "date may change",
  "holidays.customAllYearsHint": "Delete it with × or switch to “Only {year}”",
  "holidays.add": "+ My holiday",
  "holidays.delete": "Delete",
  "holidays.empty": "No holidays for this year.",
  "custom.name": "Name",
  "custom.date": "Date",
  "custom.yearly": "Every year",
  "custom.half": "Half day",
  "custom.save": "Add",
  "custom.cancel": "Cancel",
  "settings.title": "Settings",
  "settings.calendar": "Holiday calendar",
  "settings.search": "Search countries…",
  "settings.regions": "Regions",
  "settings.regionsHint": "Nothing selected = national holidays only.",
  "settings.observances": "Treat observances as holidays",
  "settings.language": "Language",
  "settings.system": "System",
  "settings.theme": "Theme",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.data": "Your data",
  "settings.export": "Export JSON",
  "settings.import": "Import JSON",
  "settings.reset": "Reset everything",
  "settings.close": "Close",
  "confirm.changeCalendar": "Your holiday adjustments are saved by holiday name and may not match the new calendar. Continue?",
  "confirm.import": "Replace all your data with the imported file?",
  "confirm.reset": "Delete all your data and start over?",
  "errors.calendarLoad": "The holiday calendar could not be loaded.",
  "errors.retry": "Retry",
  "errors.noData": "There is no holiday data for {year}. Only your own holidays are shown.",
  "errors.recovered": "Your saved data could not be read, so the app started fresh.",
  "errors.downloadBackup": "Download the old data",
  "errors.saveFailed": "This browser does not allow saving. Your changes will be lost when you close the page.",
  "errors.import.invalidJson": "The file is not valid JSON.",
  "errors.import.unsupportedVersion": "The file was made by a newer version of the app.",
  "errors.import.invalidShape": "The file is not a valid Holidays backup.",
  "day.holiday": "holiday",
  "day.halfHoliday": "half-day holiday",
  "day.off": "day off",
  "day.halfOff": "half day off",
  "day.leave": "leave",
  "day.halfLeave": "half-day leave",
  "day.today": "today",
  "day.alreadyFree": "Already a day off",
  "day.redundant": "leave not needed",
  "tabs.plan": "Plan",
  "tabs.breaks": "Breaks",
  "tabs.holidays": "Holidays",
  "firstRun.using": "Using “{name}”.",
  "firstRun.change": "Change",
  "common.dismiss": "Dismiss"
}
```

- [ ] **Step 2: Create `src/i18n/el.json`**

```json
{
  "app.title": "Αργίες",
  "header.prevYear": "Προηγούμενο έτος",
  "header.nextYear": "Επόμενο έτος",
  "header.settings": "Ρυθμίσεις",
  "header.noCalendar": "Επιλέξτε ημερολόγιο αργιών",
  "weekly.title": "Εβδομαδιαίο πλάνο",
  "weekly.work": "Εργάσιμη",
  "weekly.half": "Μισή μέρα ρεπό",
  "weekly.off": "Ρεπό",
  "summary.leaveDays": "Ημέρες άδειας: {n}",
  "summary.stretchGroup": "{n}-ήμερα",
  "summary.stretchItem": "{range} · {days} ημέρες · {leave} άδεια",
  "summary.noStretches": "Δεν υπάρχουν ακόμα διαστήματα 3 ή περισσότερων ημερών.",
  "summary.compact": "Άδεια {n} · {breaks} διαστήματα",
  "holidays.title": "Αργίες {year}",
  "holidays.scope": "Οι αλλαγές ισχύουν για",
  "holidays.scopeAll": "Όλα τα έτη",
  "holidays.scopeYear": "Μόνο το {year}",
  "holidays.enabled": "Μετράει ως αργία",
  "holidays.makeHalf": "κάν' τη μισή μέρα",
  "holidays.makeFull": "κάν' τη ολόκληρη μέρα",
  "holidays.thisYearBadge": "μόνο {year}",
  "holidays.resetYear": "Αναίρεση της αλλαγής για το {year}",
  "holidays.observance": "εορτή",
  "holidays.tentative": "η ημερομηνία μπορεί να αλλάξει",
  "holidays.customAllYearsHint": "Διαγράψτε τη με × ή επιλέξτε «Μόνο το {year}»",
  "holidays.add": "+ Δική μου αργία",
  "holidays.delete": "Διαγραφή",
  "holidays.empty": "Δεν υπάρχουν αργίες για αυτό το έτος.",
  "custom.name": "Όνομα",
  "custom.date": "Ημερομηνία",
  "custom.yearly": "Κάθε χρόνο",
  "custom.half": "Μισή μέρα",
  "custom.save": "Προσθήκη",
  "custom.cancel": "Ακύρωση",
  "settings.title": "Ρυθμίσεις",
  "settings.calendar": "Ημερολόγιο αργιών",
  "settings.search": "Αναζήτηση χώρας…",
  "settings.regions": "Περιοχές",
  "settings.regionsHint": "Χωρίς επιλογή = μόνο οι εθνικές αργίες.",
  "settings.observances": "Οι εορτές να μετράνε ως αργίες",
  "settings.language": "Γλώσσα",
  "settings.system": "Συστήματος",
  "settings.theme": "Θέμα",
  "settings.themeLight": "Φωτεινό",
  "settings.themeDark": "Σκοτεινό",
  "settings.data": "Τα δεδομένα σας",
  "settings.export": "Εξαγωγή JSON",
  "settings.import": "Εισαγωγή JSON",
  "settings.reset": "Επαναφορά όλων",
  "settings.close": "Κλείσιμο",
  "confirm.changeCalendar": "Οι ρυθμίσεις των αργιών σας αποθηκεύονται με βάση το όνομα της αργίας και ίσως δεν ταιριάζουν στο νέο ημερολόγιο. Συνέχεια;",
  "confirm.import": "Να αντικατασταθούν όλα τα δεδομένα σας με το αρχείο;",
  "confirm.reset": "Να διαγραφούν όλα τα δεδομένα σας;",
  "errors.calendarLoad": "Δεν ήταν δυνατή η φόρτωση του ημερολογίου αργιών.",
  "errors.retry": "Ξαναδοκίμασε",
  "errors.noData": "Δεν υπάρχουν δεδομένα αργιών για το {year}. Εμφανίζονται μόνο οι δικές σας αργίες.",
  "errors.recovered": "Τα αποθηκευμένα δεδομένα σας δεν διαβάζονταν, οπότε η εφαρμογή ξεκίνησε από την αρχή.",
  "errors.downloadBackup": "Λήψη των παλιών δεδομένων",
  "errors.saveFailed": "Αυτός ο browser δεν επιτρέπει αποθήκευση. Οι αλλαγές θα χαθούν όταν κλείσετε τη σελίδα.",
  "errors.import.invalidJson": "Το αρχείο δεν είναι έγκυρο JSON.",
  "errors.import.unsupportedVersion": "Το αρχείο δημιουργήθηκε από νεότερη έκδοση της εφαρμογής.",
  "errors.import.invalidShape": "Το αρχείο δεν είναι έγκυρο αντίγραφο της εφαρμογής.",
  "day.holiday": "αργία",
  "day.halfHoliday": "μισή αργία",
  "day.off": "ρεπό",
  "day.halfOff": "μισό ρεπό",
  "day.leave": "άδεια",
  "day.halfLeave": "μισή μέρα άδεια",
  "day.today": "σήμερα",
  "day.alreadyFree": "Είναι ήδη ελεύθερη μέρα",
  "day.redundant": "η άδεια δεν χρειάζεται",
  "tabs.plan": "Πλάνο",
  "tabs.breaks": "Διαστήματα",
  "tabs.holidays": "Αργίες",
  "firstRun.using": "Χρησιμοποιείται το «{name}».",
  "firstRun.change": "Αλλαγή",
  "common.dismiss": "Κλείσιμο"
}
```

- [ ] **Step 3: Write the failing tests `src/i18n/i18n.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import en from "./en.json";
import el from "./el.json";
import { createI18n } from "./I18nProvider";
import { detectLang, translate } from "./index";

describe("i18n", () => {
  test("every language has exactly the English keys", () => {
    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());
  });

  test("detectLang: explicit preference, then browser languages, then English", () => {
    expect(detectLang("el", ["en-US"])).toBe("el");
    expect(detectLang(null, ["el-GR", "en"])).toBe("el");
    expect(detectLang(null, ["de-CH", "en-GB"])).toBe("en");
    expect(detectLang(null, ["fr-FR"])).toBe("en");
    expect(detectLang("xx", [])).toBe("en");
  });

  test("translate interpolates and keeps unknown placeholders", () => {
    expect(translate("en", "summary.leaveDays", { n: "3" })).toBe("Leave days: 3");
    expect(translate("el", "summary.leaveDays", { n: "3" })).toBe("Ημέρες άδειας: 3");
    expect(translate("en", "summary.leaveDays")).toBe("Leave days: {n}");
  });

  test("formatters", () => {
    const enI18n = createI18n("en");
    const elI18n = createI18n("el");
    expect(enI18n.weekdayShort(0)).toBe("Mon");
    expect(enI18n.monthName(4)).toBe("April");
    expect(elI18n.formatNumber(12.5)).toBe("12,5");
    expect(enI18n.formatDate("2026-04-07")).toBe("Tuesday, April 7, 2026");
    expect(enI18n.formatRange("2026-04-03", "2026-04-06")).toMatch(/Apr 3.+6/);
    expect(enI18n.formatRange("2026-04-03", "2026-04-03")).toBe("Apr 3");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/i18n`
Expected: FAIL — cannot resolve `./I18nProvider` / `./index`.

- [ ] **Step 5: Implement `src/i18n/index.ts`**

```ts
import en from "./en.json";
import el from "./el.json";

export const MESSAGES = { en, el } as const;
export type Lang = keyof typeof MESSAGES;
export type MessageKey = keyof typeof en;
export const SUPPORTED_LANGS = Object.keys(MESSAGES) as Lang[];

/** Shown in the language picker in their own language. */
export const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", el: "Ελληνικά" };

export function isLang(value: string): value is Lang {
  return (SUPPORTED_LANGS as string[]).includes(value);
}

export function detectLang(preference: string | null, navigatorLanguages: readonly string[]): Lang {
  const candidates = preference ? [preference, ...navigatorLanguages] : navigatorLanguages;
  for (const tag of candidates) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

export function translate(lang: Lang, key: MessageKey, vars: Record<string, string> = {}): string {
  const table = MESSAGES[lang] as Record<string, string>;
  const template = table[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
```

- [ ] **Step 6: Implement `src/i18n/I18nProvider.tsx`**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translate, type Lang, type MessageKey } from "./index";

export interface I18n {
  lang: Lang;
  t(key: MessageKey, vars?: Record<string, string>): string;
  formatNumber(n: number): string;
  monthName(month: number): string; // 1–12
  weekdayShort(index: number): string; // 0 = Monday
  formatDate(iso: string, style?: "long" | "short"): string;
  formatRange(startIso: string, endIso: string): string;
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function createI18n(lang: Lang): I18n {
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat(lang, { month: "long", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const short = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return {
    lang,
    t: (key, vars) => translate(lang, key, vars),
    formatNumber: (n) => number.format(n),
    monthName: (m) => month.format(utc(`2024-${String(m).padStart(2, "0")}-01`)),
    weekdayShort: (i) => weekday.format(utc(`2024-01-0${i + 1}`)), // 2024-01-01 was a Monday
    formatDate: (iso, style = "long") => (style === "long" ? long : short).format(utc(iso)),
    formatRange: (a, b) => (a === b ? short.format(utc(a)) : short.formatRange(utc(a), utc(b))),
  };
}

const I18nContext = createContext<I18n>(createI18n("en"));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => createI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
```

- [ ] **Step 7: Create the test helper `src/test/render.tsx`**

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../i18n/I18nProvider";
import type { Lang } from "../i18n";

export function renderWithI18n(ui: ReactElement, lang: Lang = "en") {
  return render(<I18nProvider lang={lang}>{ui}</I18nProvider>);
}
```

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run src/i18n`
Expected: PASS. If the `formatDate` expectation differs only by a narrow no-break space or comma placement due to the ICU version, adjust that one expected string to what Node prints — do not change the implementation.

- [ ] **Step 9: Commit**

```bash
git add src/i18n src/test/render.tsx
git commit -m "feat(i18n): add English and Greek translations with Intl formatters"
```

---

### Task 10: Store provider and year model hook

**Files:**
- Create: `src/state/StoreProvider.tsx`, `src/ui/useYearModel.ts`
- Test: `src/state/StoreProvider.test.tsx`, `src/ui/useYearModel.test.ts`

**Interfaces:**
- Consumes: `reducer`, `Action` (Task 7); `getStorage`, `loadState`, `saveState` (Task 6); `createDayResolver`, `DayResolver` (Task 4); `resolveYearHolidays` (Task 3); `leaveUsed`, `findStretches` (Task 5).
- Produces:
  - `<StoreProvider storage?: Storage | null>` — `storage` undefined = use `getStorage()`; `null` = no persistence.
  - `useStore(): { state: AppState; dispatch: Dispatch<Action>; recoveredBackup: string | null; dismissRecovered(): void; saveFailed: boolean }`
  - `useYearModel(state, calendar, year): { resolve: DayResolver; holidays: ResolvedHoliday[]; leaveTotal: number; stretches: Stretch[] }` (memoized on its three inputs).

- [ ] **Step 1: Write the failing tests `src/state/StoreProvider.test.tsx`**

```tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StoreProvider, useStore } from "./StoreProvider";
import { STORAGE_KEY } from "./storage";

function Probe() {
  const { state, dispatch, saveFailed, recoveredBackup } = useStore();
  return (
    <div>
      <span data-testid="leave">{JSON.stringify(state.leave)}</span>
      <span data-testid="saveFailed">{String(saveFailed)}</span>
      <span data-testid="recovered">{String(recoveredBackup)}</span>
      <button onClick={() => dispatch({ type: "toggleLeave", date: "2026-04-07", room: 1 })}>toggle</button>
    </div>
  );
}

describe("StoreProvider", () => {
  test("auto-saves every change to localStorage", () => {
    render(<StoreProvider><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).leave).toEqual({ "2026-04-07": 1 });
    expect(screen.getByTestId("saveFailed")).toHaveTextContent("false");
  });

  test("loads the saved state on start", () => {
    render(<StoreProvider><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    render(<StoreProvider><Probe /></StoreProvider>);
    expect(screen.getAllByTestId("leave")[1]).toHaveTextContent('{"2026-04-07":1}');
  });

  test("reports a corrupted saved state", () => {
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<StoreProvider><Probe /></StoreProvider>);
    expect(screen.getByTestId("recovered")).toHaveTextContent("{broken");
  });

  test("REVIEW FOCUS: works without storage and reports saveFailed", () => {
    render(<StoreProvider storage={null}><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("leave")).toHaveTextContent('{"2026-04-07":1}');
    expect(screen.getByTestId("saveFailed")).toHaveTextContent("true");
  });
});
```

- [ ] **Step 2: Write the failing test `src/ui/useYearModel.test.ts`**

```ts
import { renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useYearModel } from "./useYearModel";
import { makeState, zurichFixture } from "../test/fixtures";

test("useYearModel combines holidays, leave total and stretches", () => {
  const state = makeState({ leave: { "2026-04-07": 1 } });
  const { result } = renderHook(() => useYearModel(state, zurichFixture, 2026));
  expect(result.current.leaveTotal).toBe(1);
  expect(result.current.stretches.map((s) => s.start)).toEqual(["2026-04-03", "2026-12-25"]);
  expect(result.current.holidays.some((h) => h.name === "Good Friday")).toBe(true);
  expect(result.current.resolve("2026-04-07").leave).toBe(1);
});
```

Note: with leave on 7 April the Easter stretch becomes 3 Apr – 7 Apr (5 days), still starting on `2026-04-03`.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/state/StoreProvider.test.tsx src/ui/useYearModel.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `src/state/StoreProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useReducer, useState, type Dispatch, type ReactNode } from "react";
import type { AppState } from "../core/types";
import { reducer, type Action } from "./reducer";
import { getStorage, loadState, saveState } from "./storage";

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  recoveredBackup: string | null;
  dismissRecovered(): void;
  saveFailed: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, storage }: { children: ReactNode; storage?: Storage | null }) {
  const [store] = useState(() => (storage === undefined ? getStorage() : storage));
  const [initial] = useState(() => loadState(store));
  const [state, dispatch] = useReducer(reducer, initial.state);
  const [recoveredBackup, setRecoveredBackup] = useState(initial.recoveredBackup);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setSaveFailed(!saveState(store, state));
  }, [store, state]);

  return (
    <StoreContext.Provider
      value={{ state, dispatch, recoveredBackup, dismissRecovered: () => setRecoveredBackup(null), saveFailed }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}
```

- [ ] **Step 5: Implement `src/ui/useYearModel.ts`**

```ts
import { useMemo } from "react";
import { createDayResolver } from "../core/days";
import { resolveYearHolidays } from "../core/holidays";
import { findStretches, leaveUsed } from "../core/stats";
import type { AppState, CalendarFile } from "../core/types";

export function useYearModel(state: AppState, calendar: CalendarFile | null, year: number) {
  return useMemo(() => {
    const resolve = createDayResolver(state, calendar);
    return {
      resolve,
      holidays: resolveYearHolidays(state, calendar, year),
      leaveTotal: leaveUsed(year, resolve),
      stretches: findStretches(year, resolve),
    };
  }, [state, calendar, year]);
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/state src/ui`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/StoreProvider.tsx src/state/StoreProvider.test.tsx src/ui/useYearModel.ts src/ui/useYearModel.test.ts
git commit -m "feat(state): add auto-saving store provider and year model hook"
```

---

### Task 11: Year grid (3×4 months, clickable days) and styles

**Files:**
- Create: `src/ui/DayCell.tsx`, `src/ui/MonthCard.tsx`, `src/ui/YearGrid.tsx`
- Replace: `src/styles.css`
- Test: `src/ui/YearGrid.test.tsx`

**Interfaces:**
- Consumes: `DayResolver` (Task 4), `DayInfo` (Task 2), `addDays`, `monthDates`, `weekday` (Task 2), `useI18n` (Task 9).
- Produces:
  - `<YearGrid year resolve today stretchDays highlightDays onToggle />` with props `{ year: number; resolve: DayResolver; today: string; stretchDays: ReadonlySet<string>; highlightDays: ReadonlySet<string>; onToggle(date: string, room: number): void }`.
  - DOM contract (used by Layout and e2e tests): scroller `data-testid="grid-scroller"`, grid `data-testid="year-grid"`, each month `data-month="1..12"`, each day `<button class="day" data-date data-weekday data-leave? data-holiday? data-weekly? data-redundant? data-today? data-stretch? data-highlight?>`.

**Behaviour:**
- Month cards appear in calendar order in a CSS grid of 3 columns (Jan Feb Mar / Apr May Jun / …).
- Clicking a day calls `onToggle(date, info.room)` unless the day has `room === 0` and no redundant leave (then nothing happens; the `title` says "Already a day off").
- Arrow keys move the focus ±1 day / ±7 days between day buttons (also across months); Space/Enter activate the focused button (native button behaviour).
- When `year` is the current year, the scroller scrolls so the current month is visible (guard: `scrollIntoView` may not exist in tests).

- [ ] **Step 1: Write the failing tests `src/ui/YearGrid.test.tsx`**

```tsx
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { YearGrid } from "./YearGrid";
import { createDayResolver } from "../core/days";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";

function setup(stateOverrides = {}, onToggle = vi.fn()) {
  const resolve = createDayResolver(makeState(stateOverrides), zurichFixture);
  renderWithI18n(
    <YearGrid year={2026} resolve={resolve} today="2026-04-07" stretchDays={new Set(["2026-04-03"])}
      highlightDays={new Set()} onToggle={onToggle} />,
  );
  return { onToggle };
}

const day = (date: string) => document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

describe("YearGrid", () => {
  test("renders 12 months in calendar order with the right number of days", () => {
    setup();
    const months = screen.getByTestId("year-grid").querySelectorAll("[data-month]");
    expect([...months].map((m) => m.getAttribute("data-month"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(within(months[1] as HTMLElement).getAllByRole("button")).toHaveLength(28);
    expect(screen.getByRole("heading", { name: "April" })).toBeInTheDocument();
  });

  test("first of the month is placed under its weekday (1 April 2026 = Wednesday)", () => {
    setup();
    const april = document.querySelector('[data-month="4"] .days')!;
    const blanks = april.querySelectorAll(".day-blank");
    expect(blanks).toHaveLength(2);
    expect(day("2026-04-01").dataset.weekday).toBe("2");
  });

  test("marks holidays, weekends, leave, today and stretches", () => {
    setup({ leave: { "2026-04-08": 0.5, "2026-04-06": 1 } });
    expect(day("2026-04-03").dataset.holiday).toBe("1");
    expect(day("2026-04-04").dataset.weekly).toBe("1");
    expect(day("2026-04-08").dataset.leave).toBe("0.5");
    expect(day("2026-04-06").dataset.redundant).toBe("true");
    expect(day("2026-04-07").dataset.today).toBe("true");
    expect(day("2026-04-03").dataset.stretch).toBe("true");
    expect(day("2026-04-03")).toHaveAccessibleName(/Friday, April 3, 2026.*holiday: Good Friday/);
  });

  test("clicking a working day toggles leave with its room", async () => {
    const { onToggle } = setup();
    await userEvent.click(day("2026-04-07"));
    expect(onToggle).toHaveBeenCalledWith("2026-04-07", 1);
  });

  test("clicking an already free day does nothing, but clears redundant leave", async () => {
    const { onToggle } = setup({ leave: { "2026-04-06": 1 } });
    await userEvent.click(day("2026-04-04"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(day("2026-04-04").title).toMatch(/Already a day off/);
    await userEvent.click(day("2026-04-06"));
    expect(onToggle).toHaveBeenCalledWith("2026-04-06", 0);
  });

  test("arrow keys move focus by day and week, across months", () => {
    setup();
    day("2026-04-30").focus();
    fireEvent.keyDown(day("2026-04-30"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(day("2026-05-01"));
    fireEvent.keyDown(day("2026-05-01"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(day("2026-04-24"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/YearGrid.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/DayCell.tsx`**

```tsx
import type { DayInfo } from "../core/types";
import { useI18n, type I18n } from "../i18n/I18nProvider";

interface Props {
  info: DayInfo;
  isToday: boolean;
  inStretch: boolean;
  highlighted: boolean;
  onToggle(date: string, room: number): void;
}

function describe(info: DayInfo, isToday: boolean, t: I18n["t"]): string[] {
  const parts: string[] = [];
  if (info.holidayNames.length > 0) {
    parts.push(`${info.holiday === 1 ? t("day.holiday") : t("day.halfHoliday")}: ${info.holidayNames.join(", ")}`);
  }
  if (info.weekly === 1) parts.push(t("day.off"));
  else if (info.weekly === 0.5) parts.push(t("day.halfOff"));
  if (info.leaveEff === 1) parts.push(t("day.leave"));
  else if (info.leaveEff === 0.5) parts.push(t("day.halfLeave"));
  if (info.redundant) parts.push(t("day.redundant"));
  if (isToday) parts.push(t("day.today"));
  return parts;
}

export function DayCell({ info, isToday, inStretch, highlighted, onToggle }: Props) {
  const { t, formatDate } = useI18n();
  const locked = info.room === 0 && !info.redundant;
  const parts = describe(info, isToday, t);
  const title = [locked ? t("day.alreadyFree") : null, ...info.holidayNames].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      className="day"
      data-date={info.date}
      data-weekday={info.weekday}
      data-holiday={info.holiday > 0 ? info.holiday : undefined}
      data-weekly={info.weekly > 0 ? info.weekly : undefined}
      data-leave={info.leave > 0 ? info.leave : undefined}
      data-redundant={info.redundant || undefined}
      data-today={isToday || undefined}
      data-stretch={inStretch || undefined}
      data-highlight={highlighted || undefined}
      aria-label={[formatDate(info.date), ...parts].join(", ")}
      aria-disabled={locked || undefined}
      title={title || undefined}
      onClick={() => {
        if (!locked) onToggle(info.date, info.room);
      }}
    >
      {Number(info.date.slice(8))}
    </button>
  );
}
```

- [ ] **Step 4: Implement `src/ui/MonthCard.tsx`**

```tsx
import { monthDates, weekday } from "../core/dates";
import type { DayResolver } from "../core/days";
import { useI18n } from "../i18n/I18nProvider";
import { DayCell } from "./DayCell";

interface Props {
  year: number;
  month: number;
  resolve: DayResolver;
  today: string;
  stretchDays: ReadonlySet<string>;
  highlightDays: ReadonlySet<string>;
  onToggle(date: string, room: number): void;
}

export function MonthCard({ year, month, resolve, today, stretchDays, highlightDays, onToggle }: Props) {
  const { monthName, weekdayShort } = useI18n();
  const dates = monthDates(year, month);
  const blanks = weekday(dates[0]);
  return (
    <section className="month" data-month={month} aria-labelledby={`month-${month}`}>
      <h3 id={`month-${month}`}>{monthName(month)}</h3>
      <div className="days">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={`w${i}`} className="weekday-label" aria-hidden="true">
            {weekdayShort(i)}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} className="day-blank" />
        ))}
        {dates.map((date) => (
          <DayCell
            key={date}
            info={resolve(date)}
            isToday={date === today}
            inStretch={stretchDays.has(date)}
            highlighted={highlightDays.has(date)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implement `src/ui/YearGrid.tsx`**

```tsx
import { useEffect, useRef, type KeyboardEvent } from "react";
import { addDays } from "../core/dates";
import type { DayResolver } from "../core/days";
import { MonthCard } from "./MonthCard";

interface Props {
  year: number;
  resolve: DayResolver;
  today: string;
  stretchDays: ReadonlySet<string>;
  highlightDays: ReadonlySet<string>;
  onToggle(date: string, room: number): void;
}

const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function YearGrid({ year, resolve, today, stretchDays, highlightDays, onToggle }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Number(today.slice(0, 4)) !== year) return;
    const current = scroller.current?.querySelector<HTMLElement>(`[data-month="${Number(today.slice(5, 7))}"]`);
    if (current && typeof current.scrollIntoView === "function") {
      current.scrollIntoView({ block: "nearest", inline: "start" });
    }
  }, [year, today]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = MOVES[e.key];
    const date = (e.target as HTMLElement).dataset.date;
    if (!delta || !date) return;
    const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-date="${addDays(date, delta)}"]`);
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  return (
    <div className="grid-scroller" data-testid="grid-scroller" ref={scroller} onKeyDown={onKeyDown}>
      <div className="year-grid" data-testid="year-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <MonthCard
            key={i + 1}
            year={year}
            month={i + 1}
            resolve={resolve}
            today={today}
            stretchDays={stretchDays}
            highlightDays={highlightDays}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Replace `src/styles.css`**

```css
/* ---------- Design tokens ---------- */
:root {
  --bg: #f6f6f3;
  --surface: #ffffff;
  --text: #1d1d1f;
  --muted: #6b6b70;
  --border: #e3e3df;
  --accent: #2f6fed;
  --weekend: #fff1b8;
  --holiday: #d93025;
  --leave: #2e9e4f;
  --leave-text: #ffffff;
  --stretch: #2f6fed;
  --danger-bg: #fdecea;
  --info-bg: #e8f0fe;
  --radius: 12px;
  --cell: 32px;
  --month-width: 260px;
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #121214; --surface: #1c1c1f; --text: #f2f2f3; --muted: #a0a0a8; --border: #2e2e33;
    --weekend: #3a3420; --holiday: #ff6b5e; --leave: #2f9d52; --danger-bg: #3b1f1d; --info-bg: #1d2a44;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #121214; --surface: #1c1c1f; --text: #f2f2f3; --muted: #a0a0a8; --border: #2e2e33;
  --weekend: #3a3420; --holiday: #ff6b5e; --leave: #2f9d52; --danger-bg: #3b1f1d; --info-bg: #1d2a44;
  color-scheme: dark;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
button, input, select { font: inherit; color: inherit; }
.muted { color: var(--muted); }

/* ---------- App layout (desktop ≥ 1180px) ---------- */
.app {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  grid-template-areas: "header header" "side main";
  min-height: 100vh;
}
.header {
  grid-area: header; position: sticky; top: 0; z-index: 3;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
  padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border);
}
.header h1 { font-size: 18px; margin: 0 8px 0 0; }
.year-nav { display: flex; align-items: center; gap: 4px; }
.year-nav strong { min-width: 3.5em; text-align: center; font-size: 18px; }
.icon-button { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
.header .spacer { flex: 1; }
.calendar-button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 4px; }
.summary-bar { display: none; }
.sidebar { grid-area: side; padding: 16px; display: flex; flex-direction: column; gap: 16px; border-right: 1px solid var(--border); }
.main { grid-area: main; padding: 16px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.tabbar { display: none; }

/* ---------- Banners ---------- */
.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--info-bg); }
.banner[data-kind="error"] { background: var(--danger-bg); }
.banner button { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 4px 10px; cursor: pointer; }

/* ---------- Year grid: always 3 columns x 4 rows ---------- */
.grid-scroller { overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
.year-grid { display: grid; grid-template-columns: repeat(3, var(--month-width)); gap: 16px; width: max-content; }
.month { scroll-snap-align: start; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; }
.month h3 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; text-align: center; }
.days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.weekday-label { font-size: 11px; color: var(--muted); text-align: center; padding-bottom: 2px; }
.day {
  position: relative; height: var(--cell); border: none; border-radius: 8px;
  background: transparent; font-size: 13px; cursor: pointer; font-variant-numeric: tabular-nums;
}
.day:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.day[aria-disabled="true"] { cursor: default; }
.day[data-weekly="1"] { background: var(--weekend); }
.day[data-weekly="0.5"] { background: linear-gradient(135deg, var(--weekend) 50%, transparent 50%); }
.day[data-holiday="1"] { box-shadow: inset 0 0 0 2px var(--holiday); color: var(--holiday); font-weight: 600; }
.day[data-holiday="0.5"] { outline: 2px dashed var(--holiday); outline-offset: -2px; color: var(--holiday); font-weight: 600; }
.day[data-leave="1"] { background: var(--leave); color: var(--leave-text); }
.day[data-leave="0.5"] { background: linear-gradient(to top, var(--leave) 50%, transparent 50%); }
.day[data-redundant="true"] { background: transparent; box-shadow: inset 0 0 0 2px var(--leave); color: var(--text); }
.day[data-redundant="true"]::after { content: "!"; position: absolute; top: 0; right: 3px; font-size: 10px; color: var(--leave); }
.day[data-today="true"] { outline: 2px solid var(--accent); outline-offset: 1px; }
.day[data-stretch="true"]::before {
  content: ""; position: absolute; left: -1px; right: -1px; bottom: 2px; height: 2px;
  background: var(--stretch); opacity: 0.35;
}
.day[data-highlight="true"]::before { opacity: 1; height: 3px; }
.day:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ---------- Panels ---------- */
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.panel h2 { font-size: 15px; margin: 0; }
.panel h3 { font-size: 13px; margin: 8px 0 4px; color: var(--muted); }
.panel ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.weekly { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.weekly-day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; font-size: 12px; }
.weekly-day[data-value="1"] { background: var(--weekend); }
.weekly-day[data-value="0.5"] { background: linear-gradient(135deg, var(--weekend) 50%, var(--surface) 50%); }
.stretch { width: 100%; text-align: left; border: 1px solid transparent; background: none; border-radius: 8px; padding: 4px 6px; cursor: pointer; }
.stretch[aria-pressed="true"] { border-color: var(--stretch); background: var(--info-bg); }
.holiday { display: grid; grid-template-columns: auto 4.5em 1fr auto auto auto; align-items: center; gap: 6px; font-size: 13px; }
.holiday[data-enabled="false"] { color: var(--muted); }
.holiday small { color: var(--muted); }
.fraction, .badge, .holiday button { border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 2px 6px; cursor: pointer; font-size: 12px; }
.custom-form { display: grid; gap: 6px; }

/* ---------- Settings dialog ---------- */
.dialog-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.4); display: grid; place-items: center; z-index: 10; padding: 16px; }
.dialog { background: var(--surface); border-radius: var(--radius); padding: 16px; width: min(560px, 100%); max-height: 90vh; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.dialog fieldset { border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; gap: 6px; }
.dialog select[size] { width: 100%; }
.regions { display: flex; flex-wrap: wrap; gap: 4px 12px; max-height: 160px; overflow: auto; }
.error-text { color: var(--holiday); }

/* ---------- Mobile / narrow (< 1180px) ---------- */
@media (max-width: 1179px) {
  :root { --month-width: 240px; }
  .app { grid-template-columns: minmax(0, 1fr); grid-template-areas: "header" "main" "side"; padding-bottom: 72px; }
  .summary-bar { display: block; flex-basis: 100%; font-size: 13px; color: var(--muted); }
  .sidebar { border-right: none; padding-top: 0; }
  .panel-slot { display: none; }
  .panel-slot[data-active="true"] { display: block; }
  .tabbar {
    display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 3;
    background: var(--surface); border-top: 1px solid var(--border);
  }
  .tabbar button { flex: 1; padding: 14px 4px; border: none; background: none; cursor: pointer; }
  .tabbar button[aria-selected="true"] { color: var(--accent); font-weight: 600; }
}
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/ui/YearGrid.test.tsx`
Expected: PASS. (jsdom ignores the CSS; layout is verified by Playwright in Task 16.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/DayCell.tsx src/ui/MonthCard.tsx src/ui/YearGrid.tsx src/ui/YearGrid.test.tsx src/styles.css
git commit -m "feat(ui): add 3x4 year grid with clickable, accessible days"
```

---

### Task 12: Weekly plan panel and summary panel

**Files:**
- Create: `src/ui/WeeklyPlanPanel.tsx`, `src/ui/SummaryPanel.tsx`
- Test: `src/ui/panels.test.tsx`

**Interfaces:**
- Consumes: `WeeklyPlan`, `Stretch` (Task 2), `groupStretches` (Task 5), `useI18n` (Task 9).
- Produces:
  - `<WeeklyPlanPanel plan onCycle />` — `{ plan: WeeklyPlan; onCycle(weekday: number): void }`
  - `<SummaryPanel leaveTotal stretches selected onSelect />` — `{ leaveTotal: number; stretches: Stretch[]; selected: Stretch | null; onSelect(s: Stretch | null): void }`. Clicking the selected stretch again deselects it.

- [ ] **Step 1: Write the failing tests `src/ui/panels.test.tsx`**

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { SummaryPanel } from "./SummaryPanel";
import { renderWithI18n } from "../test/render";
import type { Stretch } from "../core/types";

describe("WeeklyPlanPanel", () => {
  test("shows 7 days with their state and cycles on click", async () => {
    const onCycle = vi.fn();
    renderWithI18n(<WeeklyPlanPanel plan={[0, 0, 0, 0, 0.5, 1, 1]} onCycle={onCycle} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    expect(buttons[0]).toHaveAccessibleName("Mon: Working day");
    expect(buttons[4]).toHaveAccessibleName("Fri: Half day off");
    expect(buttons[6]).toHaveAccessibleName("Sun: Day off");
    await userEvent.click(buttons[4]);
    expect(onCycle).toHaveBeenCalledWith(4);
  });

  test("Greek labels", () => {
    renderWithI18n(<WeeklyPlanPanel plan={[0, 0, 0, 0, 0, 1, 1]} onCycle={() => {}} />, "el");
    expect(screen.getByRole("heading", { name: "Εβδομαδιαίο πλάνο" })).toBeInTheDocument();
  });
});

describe("SummaryPanel", () => {
  const easter: Stretch = { start: "2026-04-03", end: "2026-04-06", length: 4, leaveUsed: 0 };
  const xmas: Stretch = { start: "2026-12-25", end: "2026-12-27", length: 3, leaveUsed: 0.5 };

  test("shows the leave total and stretches grouped by length", () => {
    renderWithI18n(<SummaryPanel leaveTotal={2.5} stretches={[easter, xmas]} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Leave days: 2.5" })).toBeInTheDocument();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["4-day breaks", "3-day breaks"]);
    expect(screen.getByRole("button", { name: /4 days · 0 leave/ })).toBeInTheDocument();
  });

  test("selecting and deselecting a stretch", async () => {
    const onSelect = vi.fn();
    const { rerender } = renderWithI18n(<SummaryPanel leaveTotal={0} stretches={[easter]} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /4 days/ }));
    expect(onSelect).toHaveBeenLastCalledWith(easter);
    rerender(<SummaryPanel leaveTotal={0} stretches={[easter]} selected={easter} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /4 days/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /4 days/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test("empty state", () => {
    renderWithI18n(<SummaryPanel leaveTotal={0} stretches={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("No breaks of 3 or more days yet.")).toBeInTheDocument();
  });
});
```

Note: `rerender` from Testing Library re-renders without the I18nProvider wrapper; that is fine because `useI18n()` falls back to the default English context.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/panels.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/WeeklyPlanPanel.tsx`**

```tsx
import type { WeeklyPlan, WeeklyValue } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

const ICON: Record<WeeklyValue, string> = { 0: "💼", 0.5: "½", 1: "🌴" };

export function WeeklyPlanPanel({ plan, onCycle }: { plan: WeeklyPlan; onCycle(weekday: number): void }) {
  const { t, weekdayShort } = useI18n();
  const label = (v: WeeklyValue) => (v === 0 ? t("weekly.work") : v === 0.5 ? t("weekly.half") : t("weekly.off"));
  return (
    <section className="panel" aria-labelledby="weekly-title">
      <h2 id="weekly-title">{t("weekly.title")}</h2>
      <div className="weekly">
        {plan.map((value, i) => (
          <button
            key={i}
            type="button"
            className="weekly-day"
            data-value={value}
            aria-label={`${weekdayShort(i)}: ${label(value)}`}
            title={label(value)}
            onClick={() => onCycle(i)}
          >
            <span aria-hidden="true">{weekdayShort(i)}</span>
            <span aria-hidden="true">{ICON[value]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement `src/ui/SummaryPanel.tsx`**

```tsx
import { groupStretches } from "../core/stats";
import type { Stretch } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

interface Props {
  leaveTotal: number;
  stretches: Stretch[];
  selected: Stretch | null;
  onSelect(stretch: Stretch | null): void;
}

export function SummaryPanel({ leaveTotal, stretches, selected, onSelect }: Props) {
  const { t, formatNumber, formatRange } = useI18n();
  const groups = groupStretches(stretches);
  return (
    <section className="panel" aria-labelledby="summary-title">
      <h2 id="summary-title">{t("summary.leaveDays", { n: formatNumber(leaveTotal) })}</h2>
      {groups.length === 0 && <p className="muted">{t("summary.noStretches")}</p>}
      {groups.map((group) => (
        <div key={group.length}>
          <h3>{t("summary.stretchGroup", { n: String(group.length) })}</h3>
          <ul>
            {group.stretches.map((s) => {
              const isSelected = selected?.start === s.start;
              return (
                <li key={s.start}>
                  <button
                    type="button"
                    className="stretch"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : s)}
                  >
                    {t("summary.stretchItem", {
                      range: formatRange(s.start, s.end),
                      days: String(s.length),
                      leave: formatNumber(s.leaveUsed),
                    })}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/ui/panels.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/WeeklyPlanPanel.tsx src/ui/SummaryPanel.tsx src/ui/panels.test.tsx
git commit -m "feat(ui): add weekly plan and summary panels"
```

---

### Task 13: Holiday list panel and custom holidays

**Files:**
- Create: `src/ui/HolidayListPanel.tsx`, `src/ui/CustomHolidayForm.tsx`
- Test: `src/ui/HolidayListPanel.test.tsx`

**Interfaces:**
- Consumes: `Action` (Task 7), `AppState`, `CustomHoliday`, `HolidayRule`, `ResolvedHoliday` (Task 2), `isValidIsoDate`, `parseIso` (Task 2), `useI18n` (Task 9).
- Produces:
  - `<HolidayListPanel year holidays state dispatch />` — `{ year: number; holidays: ResolvedHoliday[]; state: AppState; dispatch: Dispatch<Action> }`
  - `<CustomHolidayForm year onSave onCancel />` — `{ year: number; onSave(h: CustomHoliday): void; onCancel(): void }`

**Behaviour:**
- A scope selector at the top: "All years" (default) or "Only {year}". Edits go to `holidayRules` or `yearOverrides[year]` accordingly.
- Each row shows a checkbox (enabled), the date, the name (+ "observance" / "date may change" hints), a `1`/`½` button, a "only {year} ↺" badge when a year override exists (clicking it removes the override), and × for custom holidays.
- Editing merges into the existing rule of the chosen scope (e.g. toggling ½ keeps an existing `enabled: true`).
- Custom holidays with scope "All years": `½` edits the custom holiday itself (`updateCustomHoliday`); the checkbox is disabled (hint: delete with × or switch scope).
- "+ My holiday" opens the form: name, date (defaults to 1 Jan of the shown year), "Every year" (checked), "Half day". Saving with an empty name or invalid date does nothing.

- [ ] **Step 1: Write the failing tests `src/ui/HolidayListPanel.test.tsx`**

```tsx
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HolidayListPanel } from "./HolidayListPanel";
import { resolveYearHolidays } from "../core/holidays";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { AppState } from "../core/types";

function setup(state: AppState = makeState()) {
  const dispatch = vi.fn();
  renderWithI18n(
    <HolidayListPanel year={2026} holidays={resolveYearHolidays(state, zurichFixture, 2026)} state={state} dispatch={dispatch} />,
  );
  return dispatch;
}

const row = (name: string, index = 0) => screen.getAllByText(name)[index].closest("li")!;

describe("HolidayListPanel", () => {
  test("lists visible holidays including observances", () => {
    setup();
    expect(screen.getByText("Good Friday")).toBeInTheDocument();
    expect(screen.getAllByText("Knabenschiessen (Zurich)")).toHaveLength(3);
    expect(screen.queryByText("Saint Joseph's Day")).not.toBeInTheDocument();
    expect(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox")).not.toBeChecked();
  });

  test("enabling an observance for all years", async () => {
    const dispatch = setup();
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "Knabenschiessen (Zurich)", scope: "all", rule: { enabled: true } });
  });

  test("making a holiday half keeps the existing rule fields", async () => {
    const dispatch = setup(makeState({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true } } }));
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", name: "Knabenschiessen (Zurich)", scope: "all", rule: { enabled: true, fraction: 0.5 },
    });
  });

  test("scope 'Only 2026' writes a year override, badge undoes it", async () => {
    const state = makeState({ yearOverrides: { "2026": { "St. Stephen's Day": { enabled: false } } } });
    const dispatch = setup(state);
    await userEvent.selectOptions(screen.getByRole("combobox"), "year");
    await userEvent.click(within(row("Good Friday")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "Good Friday", scope: 2026, rule: { enabled: false } });
    await userEvent.click(within(row("St. Stephen's Day")).getByRole("button", { name: /only 2026/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "St. Stephen's Day", scope: 2026, rule: null });
  });

  test("custom holiday: ½ edits it, checkbox disabled for all years, × deletes", async () => {
    const state = makeState({
      customHolidays: [{ id: "c1", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    const dispatch = setup(state);
    const r = row("Company day");
    expect(within(r).getByRole("checkbox")).toBeDisabled();
    await userEvent.click(within(r).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "updateCustomHoliday", id: "c1", changes: { fraction: 0.5 } });
    await userEvent.click(within(r).getByRole("button", { name: /Delete/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "removeCustomHoliday", id: "c1" });
  });

  test("adding a custom holiday", async () => {
    const dispatch = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ My holiday" }));
    await userEvent.type(screen.getByLabelText("Name"), "Company day");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-15" } });
    await userEvent.click(screen.getByLabelText("Half day"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "addCustomHoliday",
      holiday: expect.objectContaining({ name: "Company day", fraction: 0.5, rule: { type: "yearly", month: 6, day: 15 } }),
    });
  });

  test("adding with an empty name does nothing", async () => {
    const dispatch = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ My holiday" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/HolidayListPanel.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/CustomHolidayForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { isValidIsoDate, parseIso } from "../core/dates";
import type { CustomHoliday } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

interface Props {
  year: number;
  onSave(holiday: CustomHoliday): void;
  onCancel(): void;
}

export function CustomHolidayForm({ year, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [date, setDate] = useState(`${year}-01-01`);
  const [yearly, setYearly] = useState(true);
  const [half, setHalf] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isValidIsoDate(date)) return;
    const { month, day } = parseIso(date);
    onSave({
      id: newId(),
      name: name.trim(),
      fraction: half ? 0.5 : 1,
      rule: yearly ? { type: "yearly", month, day } : { type: "once", date },
    });
  };

  return (
    <form className="custom-form" onSubmit={submit}>
      <label>
        {t("custom.name")}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {t("custom.date")}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} /> {t("custom.yearly")}
      </label>
      <label>
        <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} /> {t("custom.half")}
      </label>
      <div>
        <button type="submit">{t("custom.save")}</button> <button type="button" onClick={onCancel}>{t("custom.cancel")}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Implement `src/ui/HolidayListPanel.tsx`**

```tsx
import { useState, type Dispatch } from "react";
import type { AppState, HolidayRule, ResolvedHoliday } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";
import type { Action } from "../state/reducer";
import { CustomHolidayForm } from "./CustomHolidayForm";

interface Props {
  year: number;
  holidays: ResolvedHoliday[];
  state: AppState;
  dispatch: Dispatch<Action>;
}

export function HolidayListPanel({ year, holidays, state, dispatch }: Props) {
  const { t, formatDate } = useI18n();
  const [scope, setScope] = useState<"all" | "year">("all");
  const [adding, setAdding] = useState(false);
  const yearLabel = String(year);

  const currentRule = (name: string): HolidayRule =>
    scope === "all" ? (state.holidayRules[name] ?? {}) : (state.yearOverrides[yearLabel]?.[name] ?? {});

  const update = (h: ResolvedHoliday, change: HolidayRule) => {
    if (h.source === "custom" && scope === "all") {
      if (change.fraction !== undefined && h.customId) {
        dispatch({ type: "updateCustomHoliday", id: h.customId, changes: { fraction: change.fraction } });
      }
      return;
    }
    dispatch({
      type: "setHolidayRule",
      name: h.name,
      scope: scope === "all" ? "all" : year,
      rule: { ...currentRule(h.name), ...change },
    });
  };

  return (
    <section className="panel" aria-labelledby="holidays-title">
      <h2 id="holidays-title">{t("holidays.title", { year: yearLabel })}</h2>
      <label>
        {t("holidays.scope")}{" "}
        <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "year")}>
          <option value="all">{t("holidays.scopeAll")}</option>
          <option value="year">{t("holidays.scopeYear", { year: yearLabel })}</option>
        </select>
      </label>
      {holidays.length === 0 && <p className="muted">{t("holidays.empty")}</p>}
      <ul>
        {holidays.map((h) => {
          const customLocked = h.source === "custom" && scope === "all";
          return (
            <li key={`${h.date}|${h.name}`} className="holiday" data-enabled={h.enabled}>
              <input
                type="checkbox"
                checked={h.enabled}
                disabled={customLocked}
                title={customLocked ? t("holidays.customAllYearsHint", { year: yearLabel }) : undefined}
                aria-label={`${t("holidays.enabled")}: ${h.name}`}
                onChange={(e) => update(h, { enabled: e.target.checked })}
              />
              <span>{formatDate(h.date, "short")}</span>
              <span>
                <span className="holiday-name">{h.name}</span>
                {h.type === "observance" && <small> · {t("holidays.observance")}</small>}
                {h.tentative && <small> · {t("holidays.tentative")}</small>}
              </span>
              <button
                type="button"
                className="fraction"
                aria-label={`${h.name}: ${h.fraction === 1 ? t("holidays.makeHalf") : t("holidays.makeFull")}`}
                onClick={() => update(h, { fraction: h.fraction === 1 ? 0.5 : 1 })}
              >
                {h.fraction === 1 ? "1" : "½"}
              </button>
              {h.hasYearOverride ? (
                <button
                  type="button"
                  className="badge"
                  title={t("holidays.resetYear", { year: yearLabel })}
                  onClick={() => dispatch({ type: "setHolidayRule", name: h.name, scope: year, rule: null })}
                >
                  {t("holidays.thisYearBadge", { year: yearLabel })} ↺
                </button>
              ) : (
                <span />
              )}
              {h.source === "custom" && h.customId ? (
                <button
                  type="button"
                  aria-label={`${t("holidays.delete")}: ${h.name}`}
                  onClick={() => dispatch({ type: "removeCustomHoliday", id: h.customId! })}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <CustomHolidayForm
          year={year}
          onSave={(holiday) => {
            dispatch({ type: "addCustomHoliday", holiday });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)}>
          {t("holidays.add")}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/ui/HolidayListPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/HolidayListPanel.tsx src/ui/CustomHolidayForm.tsx src/ui/HolidayListPanel.test.tsx
git commit -m "feat(ui): add holiday list with per-name and per-year adjustments"
```

---

### Task 14: Settings dialog

**Files:**
- Create: `src/ui/SettingsDialog.tsx`
- Test: `src/ui/SettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `Action` (Task 7), `AppState`, `CalendarFile`, `CalendarIndexEntry` (Task 2), `calendarRegions` (Task 8), `parseStateText` (Task 6), `exportStateJson`, `downloadText` (Task 6), `LANGUAGE_NAMES`, `SUPPORTED_LANGS`, `MessageKey` (Task 9), `todayIso` (Task 2), `useI18n`.
- Produces: `<SettingsDialog open onClose index calendar state dispatch />` with props `{ open: boolean; onClose(): void; index: CalendarIndexEntry[] | null; calendar: CalendarFile | null; state: AppState; dispatch: Dispatch<Action> }`. Renders nothing when `open` is false. Uses `role="dialog"`, `aria-modal`, closes on Escape.

**Sections:**
1. **Holiday calendar** — search input filtering by name or id, `<select size={8}>` of calendars (`name (id)`). Changing to another calendar while `holidayRules` or `yearOverrides` is non-empty asks `window.confirm(t("confirm.changeCalendar"))`.
2. **Regions** — checkboxes from `calendarRegions(calendar)` (hidden when the calendar has no regions), hint "Nothing selected = national holidays only".
3. **Treat observances as holidays** — checkbox.
4. **Language** — select: System / English / Ελληνικά.
5. **Theme** — select: System / Light / Dark.
6. **Your data** — Export (downloads `holidays-YYYY-MM-DD.json`), Import (file input `accept="application/json,.json"`; invalid → error text, valid → `confirm` → `replaceState`), Reset (`confirm` → `reset`).

- [ ] **Step 1: Write the failing tests `src/ui/SettingsDialog.test.tsx`**

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import { createDefaultState } from "../state/defaults";
import type { AppState, CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2021, to: 2031, count: 325 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 245 },
];

function setup(state: AppState = makeState()) {
  const dispatch = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(
    <SettingsDialog open onClose={onClose} index={INDEX} calendar={zurichFixture} state={state} dispatch={dispatch} />,
  );
  return { dispatch, onClose };
}

afterEach(() => vi.restoreAllMocks());

describe("SettingsDialog", () => {
  test("renders nothing when closed", () => {
    renderWithI18n(<SettingsDialog open={false} onClose={() => {}} index={INDEX} calendar={null} state={makeState()} dispatch={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("search filters calendars and choosing one dispatches setCalendar", async () => {
    const { dispatch } = setup();
    await userEvent.type(screen.getByPlaceholderText("Search countries…"), "ελλ");
    expect(screen.getAllByRole("option", { name: /\(/ })).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Holiday calendar"), "el.greek");
    expect(dispatch).toHaveBeenCalledWith({ type: "setCalendar", id: "el.greek" });
  });

  test("changing calendar with existing rules asks for confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { dispatch } = setup(makeState({ holidayRules: { X: { enabled: false } } }));
    await userEvent.selectOptions(screen.getByLabelText("Holiday calendar"), "el.greek");
    expect(confirm).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("regions and observances", async () => {
    const { dispatch } = setup();
    expect(screen.getByLabelText("Zurich")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Bern"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setRegions", regions: ["Zurich", "Bern"] });
    await userEvent.click(screen.getByLabelText("Treat observances as holidays"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setIncludeObservances", value: true });
  });

  test("language and theme", async () => {
    const { dispatch } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Language"), "el");
    expect(dispatch).toHaveBeenCalledWith({ type: "setLanguage", language: "el" });
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(dispatch).toHaveBeenCalledWith({ type: "setTheme", theme: "dark" });
  });

  test("choosing 'System' language stores null", async () => {
    const { dispatch } = setup(makeState({ language: "el" }));
    await userEvent.selectOptions(screen.getByLabelText("Language"), "");
    expect(dispatch).toHaveBeenCalledWith({ type: "setLanguage", language: null });
  });

  test("REVIEW FOCUS: importing an invalid file shows an error and changes nothing", async () => {
    const { dispatch } = setup();
    const file = new File(["{nope"], "backup.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    expect(await screen.findByText("The file is not valid JSON.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("REVIEW FOCUS: importing a newer version is refused", async () => {
    const { dispatch } = setup();
    const file = new File([JSON.stringify({ ...createDefaultState(), version: 2 })], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    expect(await screen.findByText("The file was made by a newer version of the app.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("importing a valid file asks and replaces the state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { dispatch } = setup();
    const imported = { ...createDefaultState(), theme: "dark" };
    const file = new File([JSON.stringify(imported)], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "replaceState", state: imported }));
  });

  test("reset asks first; Escape closes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { dispatch, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Reset everything" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "reset" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/SettingsDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/SettingsDialog.tsx`**

```tsx
import { useState, type Dispatch } from "react";
import { todayIso } from "../core/dates";
import type { AppState, CalendarFile, CalendarIndexEntry, Theme } from "../core/types";
import { calendarRegions } from "../data/calendars";
import { LANGUAGE_NAMES, SUPPORTED_LANGS, type MessageKey } from "../i18n";
import { useI18n } from "../i18n/I18nProvider";
import { downloadText, exportStateJson } from "../state/exportImport";
import type { Action } from "../state/reducer";
import { parseStateText } from "../state/schema";

interface Props {
  open: boolean;
  onClose(): void;
  index: CalendarIndexEntry[] | null;
  calendar: CalendarFile | null;
  state: AppState;
  dispatch: Dispatch<Action>;
}

export function SettingsDialog({ open, onClose, index, calendar, state, dispatch }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  if (!open) return null;

  const q = query.trim().toLowerCase();
  const options = (index ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q));
  const regions = calendar ? calendarRegions(calendar) : [];

  const chooseCalendar = (id: string) => {
    if (!id || id === state.calendar.id) return;
    const hasRules = Object.keys(state.holidayRules).length > 0 || Object.keys(state.yearOverrides).length > 0;
    if (hasRules && !window.confirm(t("confirm.changeCalendar"))) return;
    dispatch({ type: "setCalendar", id });
  };

  const toggleRegion = (region: string) => {
    const selected = state.calendar.regions;
    dispatch({
      type: "setRegions",
      regions: selected.includes(region) ? selected.filter((r) => r !== region) : [...selected, region],
    });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseStateText(await file.text());
    if (!result.ok) {
      setImportError(t(`errors.import.${result.error}` as MessageKey));
      return;
    }
    setImportError(null);
    if (window.confirm(t("confirm.import"))) dispatch({ type: "replaceState", state: result.state });
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <h2 id="settings-title">{t("settings.title")}</h2>

        <fieldset>
          <legend>{t("settings.calendar")}</legend>
          <input
            type="search"
            placeholder={t("settings.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            size={8}
            aria-label={t("settings.calendar")}
            value={state.calendar.id ?? ""}
            onChange={(e) => chooseCalendar(e.target.value)}
          >
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </fieldset>

        {regions.length > 0 && (
          <fieldset>
            <legend>{t("settings.regions")}</legend>
            <p className="muted">{t("settings.regionsHint")}</p>
            <div className="regions">
              {regions.map((region) => (
                <label key={region}>
                  <input
                    type="checkbox"
                    checked={state.calendar.regions.includes(region)}
                    onChange={() => toggleRegion(region)}
                  />{" "}
                  {region}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label>
          <input
            type="checkbox"
            checked={state.calendar.includeObservances}
            onChange={(e) => dispatch({ type: "setIncludeObservances", value: e.target.checked })}
          />{" "}
          {t("settings.observances")}
        </label>

        <label>
          {t("settings.language")}{" "}
          <select
            value={state.language ?? ""}
            onChange={(e) => dispatch({ type: "setLanguage", language: e.target.value || null })}
          >
            <option value="">{t("settings.system")}</option>
            {SUPPORTED_LANGS.map((lang) => (
              <option key={lang} value={lang}>
                {LANGUAGE_NAMES[lang]}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("settings.theme")}{" "}
          <select value={state.theme} onChange={(e) => dispatch({ type: "setTheme", theme: e.target.value as Theme })}>
            <option value="system">{t("settings.system")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select>
        </label>

        <fieldset>
          <legend>{t("settings.data")}</legend>
          <button type="button" onClick={() => downloadText(`holidays-${todayIso()}.json`, exportStateJson(state))}>
            {t("settings.export")}
          </button>
          <label>
            {t("settings.import")}
            <input type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
          {importError && (
            <p className="error-text" role="alert">
              {importError}
            </p>
          )}
          <button type="button" onClick={() => window.confirm(t("confirm.reset")) && dispatch({ type: "reset" })}>
            {t("settings.reset")}
          </button>
        </fieldset>

        <button type="button" onClick={onClose}>
          {t("settings.close")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui/SettingsDialog.test.tsx`
Expected: PASS. If jsdom in the installed version lacks `File.prototype.text`, add this polyfill to `src/test/setup.ts` (tests only):

```ts
if (!File.prototype.text) {
  File.prototype.text = function text(this: File) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(this);
    });
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/SettingsDialog.tsx src/ui/SettingsDialog.test.tsx src/test/setup.ts
git commit -m "feat(ui): add settings dialog with calendar, regions, language, theme and backup"
```

---

### Task 15: Layout, banners, first run and app wiring

**Files:**
- Create: `src/ui/Layout.tsx`
- Replace: `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: everything above — `useStore`, `StoreProvider` (Task 10); `useCalendarIndex`, `useCalendar` (Task 8); `suggestCalendarId`, `hasDataForYear`, `clearCalendarCache` (Task 8); `useYearModel` (Task 10); `YearGrid` (Task 11); `WeeklyPlanPanel`, `SummaryPanel` (Task 12); `HolidayListPanel` (Task 13); `SettingsDialog` (Task 14); `I18nProvider`, `useI18n`, `detectLang` (Task 9); `datesBetween`, `todayIso` (Task 2).
- Produces: `App({ storage?: Storage | null })` default export (the `storage` prop exists for tests; `main.tsx` calls `<App />`).

**Behaviour:**
- **Year:** initial year = `#YYYY` from the URL hash if present (1900–2200), otherwise the current year. ‹ / › change it and update the hash with `history.replaceState`. Changing year clears the selected stretch.
- **Header:** app title, year navigation, calendar button showing the calendar name + selected regions (or "Choose a holiday calendar"), settings button (⚙). On narrow screens a compact summary line (`data-testid="summary-bar"`) is shown: "Leave {n} · {breaks} breaks".
- **Banners (in `.main`, above the grid):**
  - storage recovered → "Your saved data could not be read…" + "Download the old data" + "Dismiss";
  - save failed → "This browser does not allow saving…";
  - calendar or index failed to load → "The holiday calendar could not be loaded." + "Retry";
  - calendar loaded but no data for the year → "There is no holiday data for {year}…";
  - first run → "Using “{name}”." + "Change" (opens settings) + "Dismiss".
- **First run:** when `state.calendar.id === null` and the index is loaded: `suggestCalendarId(navigator.languages)`; if found dispatch `setCalendar` and show the first-run banner; otherwise open the settings dialog.
- **Sidebar/panels:** three slots `data-panel="plan" | "breaks" | "holidays"` each wrapping a panel; on desktop all are visible, on mobile only `data-active="true"` (the selected tab) is shown and a fixed bottom tab bar (`role="tablist"`) switches tabs. Default tab: `breaks`.
- **Document effects:** `<html lang>` = UI language; `<html data-theme>` = `light`/`dark`, removed for `system`.

- [ ] **Step 1: Write the failing tests (replace `src/App.test.tsx`)**

```tsx
import { act, screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { clearCalendarCache } from "./data/calendars";
import { STORAGE_KEY } from "./state/storage";
import { makeState, zurichFixture } from "./test/fixtures";

const INDEX = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 0 },
];

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("index.json")) return { ok: true, status: 200, json: async () => INDEX };
    if (url.endsWith("en.ch.json")) return { ok: true, status: 200, json: async () => zurichFixture };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, "languages", { value: languages, configurable: true });
}

beforeEach(() => {
  window.location.hash = "#2026";
  setLanguages(["en-US"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCalendarCache();
});

const seed = (overrides = {}) => localStorage.setItem(STORAGE_KEY, JSON.stringify(makeState(overrides)));

describe("App", () => {
  test("first run picks a calendar from the browser language", async () => {
    stubFetch();
    setLanguages(["de-CH"]);
    render(<App />);
    expect(await screen.findByText("Using “Holidays in Switzerland”.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).calendar.id).toBe("en.ch");
  });

  test("first run without a suggestion opens the settings", async () => {
    stubFetch();
    setLanguages(["xx"]);
    render(<App />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  test("clicking a day updates the leave total and is saved", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2026-04-07"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).leave).toEqual({ "2026-04-07": 1 });
  });

  test("year navigation updates the hash", async () => {
    stubFetch();
    seed();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(window.location.hash).toBe("#2027");
  });

  test("REVIEW FOCUS: a year without data shows a banner but keeps working", async () => {
    stubFetch();
    seed();
    window.location.hash = "#2019";
    render(<App />);
    expect(await screen.findByText(/There is no holiday data for 2019/)).toBeInTheDocument();
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2019-04-09"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
  });

  test("calendar load failure shows retry", async () => {
    const fetchMock = stubFetch();
    seed({ calendar: { id: "el.greek", regions: [], includeObservances: false } });
    render(<App />);
    expect(await screen.findByText("The holiday calendar could not be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("el.greek.json"))).toHaveLength(2));
  });

  test("REVIEW FOCUS: no storage shows the cannot-save banner", async () => {
    stubFetch();
    render(<App storage={null} />);
    expect(await screen.findByText(/does not allow saving/)).toBeInTheDocument();
  });

  test("corrupted storage shows the recovery banner", async () => {
    stubFetch();
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<App />);
    expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
  });

  test("Greek UI from the saved language preference, theme on <html>", async () => {
    stubFetch();
    seed({ language: "el", theme: "dark" });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /Ημέρες άδειας/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("el");
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => document.documentElement.removeAttribute("data-theme"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `Layout` missing / placeholder App does not match.

- [ ] **Step 3: Implement `src/ui/Layout.tsx`**

```tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { datesBetween, todayIso } from "../core/dates";
import type { Stretch } from "../core/types";
import { hasDataForYear, suggestCalendarId } from "../data/calendars";
import { useCalendar, useCalendarIndex } from "../data/hooks";
import { useI18n } from "../i18n/I18nProvider";
import { downloadText } from "../state/exportImport";
import { useStore } from "../state/StoreProvider";
import { HolidayListPanel } from "./HolidayListPanel";
import { SettingsDialog } from "./SettingsDialog";
import { SummaryPanel } from "./SummaryPanel";
import { useYearModel } from "./useYearModel";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { YearGrid } from "./YearGrid";

type Tab = "plan" | "breaks" | "holidays";

function yearFromHash(hash: string): number | null {
  const year = Number(hash.replace("#", ""));
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

export function Layout() {
  const { state, dispatch, recoveredBackup, dismissRecovered, saveFailed } = useStore();
  const { t, lang, formatNumber } = useI18n();
  const [year, setYear] = useState(() => yearFromHash(window.location.hash) ?? new Date().getFullYear());
  const [tab, setTab] = useState<Tab>("breaks");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Stretch | null>(null);
  const [firstRunName, setFirstRunName] = useState<string | null>(null);

  const index = useCalendarIndex();
  const cal = useCalendar(state.calendar.id);
  const model = useYearModel(state, cal.calendar, year);
  const today = todayIso();

  useEffect(() => {
    history.replaceState(null, "", `#${year}`);
    setSelected(null);
  }, [year]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    if (state.calendar.id !== null || index.status !== "ready" || !index.index) return;
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const suggested = suggestCalendarId(languages, index.index);
    if (suggested) {
      dispatch({ type: "setCalendar", id: suggested });
      setFirstRunName(index.index.find((c) => c.id === suggested)?.name ?? suggested);
    } else {
      setSettingsOpen(true);
    }
  }, [state.calendar.id, index.status, index.index, dispatch]);

  const stretchDays = useMemo(
    () => new Set(model.stretches.flatMap((s) => datesBetween(s.start, s.end))),
    [model.stretches],
  );
  const highlightDays = useMemo(
    () => new Set(selected ? datesBetween(selected.start, selected.end) : []),
    [selected],
  );

  const calendarName = index.index?.find((c) => c.id === state.calendar.id)?.name;
  const calendarLabel = calendarName
    ? [calendarName, ...state.calendar.regions].join(" · ")
    : t("header.noCalendar");
  const loadFailed = index.status === "error" || cal.status === "error";
  const noData = cal.status === "ready" && cal.calendar !== null && !hasDataForYear(cal.calendar, year);

  const slot = (name: Tab, content: ReactNode) => (
    <div className="panel-slot" data-panel={name} data-active={tab === name}>
      {content}
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>{t("app.title")}</h1>
        <nav className="year-nav">
          <button type="button" className="icon-button" aria-label={t("header.prevYear")} onClick={() => setYear((y) => y - 1)}>
            ‹
          </button>
          <strong>{year}</strong>
          <button type="button" className="icon-button" aria-label={t("header.nextYear")} onClick={() => setYear((y) => y + 1)}>
            ›
          </button>
        </nav>
        <button type="button" className="calendar-button" onClick={() => setSettingsOpen(true)}>
          {calendarLabel}
        </button>
        <span className="spacer" />
        <button type="button" className="icon-button" aria-label={t("header.settings")} onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
        <div className="summary-bar" data-testid="summary-bar" aria-live="polite">
          {t("summary.compact", { n: formatNumber(model.leaveTotal), breaks: String(model.stretches.length) })}
        </div>
      </header>

      <main className="main">
        {recoveredBackup !== null && (
          <div className="banner" data-kind="error" role="alert">
            {t("errors.recovered")}
            <button type="button" onClick={() => downloadText("holidays-backup.json", recoveredBackup)}>
              {t("errors.downloadBackup")}
            </button>
            <button type="button" onClick={dismissRecovered}>{t("common.dismiss")}</button>
          </div>
        )}
        {saveFailed && (
          <div className="banner" data-kind="error" role="alert">{t("errors.saveFailed")}</div>
        )}
        {loadFailed && (
          <div className="banner" data-kind="error" role="alert">
            {t("errors.calendarLoad")}
            <button type="button" onClick={() => (index.status === "error" ? index.retry() : cal.retry())}>
              {t("errors.retry")}
            </button>
          </div>
        )}
        {noData && <div className="banner">{t("errors.noData", { year: String(year) })}</div>}
        {firstRunName && (
          <div className="banner">
            {t("firstRun.using", { name: firstRunName })}
            <button type="button" onClick={() => setSettingsOpen(true)}>{t("firstRun.change")}</button>
            <button type="button" onClick={() => setFirstRunName(null)}>{t("common.dismiss")}</button>
          </div>
        )}
        <YearGrid
          year={year}
          resolve={model.resolve}
          today={today}
          stretchDays={stretchDays}
          highlightDays={highlightDays}
          onToggle={(date, room) => dispatch({ type: "toggleLeave", date, room })}
        />
      </main>

      <aside className="sidebar">
        {slot("plan", <WeeklyPlanPanel plan={state.weeklyPlan} onCycle={(weekday) => dispatch({ type: "cycleWeekly", weekday })} />)}
        {slot("breaks", <SummaryPanel leaveTotal={model.leaveTotal} stretches={model.stretches} selected={selected} onSelect={setSelected} />)}
        {slot("holidays", <HolidayListPanel year={year} holidays={model.holidays} state={state} dispatch={dispatch} />)}
      </aside>

      <nav className="tabbar" role="tablist">
        {(["plan", "breaks", "holidays"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {t(`tabs.${name}`)}
          </button>
        ))}
      </nav>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        index={index.index}
        calendar={cal.calendar}
        state={state}
        dispatch={dispatch}
      />
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import type { ReactNode } from "react";
import { detectLang } from "./i18n";
import { I18nProvider } from "./i18n/I18nProvider";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { Layout } from "./ui/Layout";

function I18nRoot({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return <I18nProvider lang={detectLang(state.language, languages)}>{children}</I18nProvider>;
}

export default function App({ storage }: { storage?: Storage | null }) {
  return (
    <StoreProvider storage={storage}>
      <I18nRoot>
        <Layout />
      </I18nRoot>
    </StoreProvider>
  );
}
```

- [ ] **Step 5: Run the whole unit test suite**

Run: `npx vitest run`
Expected: PASS (all files). Then `npm run build` — expected: TypeScript passes and Vite builds.

- [ ] **Step 6: Manual check in the browser**

Run: `npm run dev` and open the printed URL + `holidays/` (e.g. `http://localhost:5173/holidays/`). Check: the first-run banner, clicking days (green / half green), the weekly plan, the ½ holiday flow for "Knabenschiessen (Zurich)" in Settings → region Zurich, switching language, dark theme, and a narrow window (< 1180px) showing 3 month columns with horizontal scrolling and the bottom tabs. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/ui/Layout.tsx
git commit -m "feat(ui): wire layout, banners, first-run suggestion and mobile tabs"
```

---

### Task 16: Mobile end-to-end tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/app.spec.ts`
- Modify: `.gitignore` (already ignores `test-results/` and `playwright-report/` — verify)

**Interfaces:**
- Consumes: the built app (`npm run build && npm run preview`), DOM contract from Task 11 and Task 15 (`grid-scroller`, `year-grid`, `data-month`, `data-date`, `data-weekday`, `data-leave`, `summary-bar`).
- Produces: `npm run test:e2e` passing locally and in CI.

- [ ] **Step 1: Install the browser**

Run: `npx playwright install chromium`
Expected: Chromium downloaded.

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:4173/holidays/", locale: "en-US" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173/holidays/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
});
```

- [ ] **Step 3: Write `tests/e2e/app.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

const seededState = {
  version: 1,
  language: null,
  calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
  holidayRules: {},
  yearOverrides: {},
  customHolidays: [],
  weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
  leave: {},
  theme: "system",
};

test.describe("with a Zurich profile", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      if (!localStorage.getItem("holidays.state")) localStorage.setItem("holidays.state", JSON.stringify(state));
    }, seededState);
  });

  test("mobile keeps 3 month columns and scrolls horizontally", async ({ page }) => {
    await page.goto("./#2026");
    const grid = page.getByTestId("year-grid");
    await expect(grid.locator("[data-month]")).toHaveCount(12);
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(3);
    const overflows = await page.getByTestId("grid-scroller").evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows).toBe(true);
  });

  test("clicking a day adds leave, updates the summary and survives a reload", async ({ page }) => {
    await page.goto("./#2026");
    const summary = page.getByTestId("summary-bar");
    await expect(summary).toContainText("Leave 0");
    const day = page.locator('[data-date="2026-04-07"]');
    await day.click();
    await expect(day).toHaveAttribute("data-leave", "1");
    await expect(summary).toContainText("Leave 1");
    await page.reload();
    await expect(page.locator('[data-date="2026-04-07"]')).toHaveAttribute("data-leave", "1");
  });

  test("bottom tabs switch panels", async ({ page }) => {
    await page.goto("./#2026");
    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page.getByRole("heading", { name: "Weekly plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Leave days/ })).toBeHidden();
  });
});

test.describe("REVIEW FOCUS: timezone west of UTC", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => localStorage.setItem("holidays.state", JSON.stringify(state)), seededState);
  });

  test("dates stay under the right weekday and clicks store the same date", async ({ page }) => {
    await page.goto("./#2026");
    const day = page.locator('[data-date="2026-04-07"]');
    await expect(day).toHaveAttribute("data-weekday", "1"); // Tuesday
    await expect(page.locator('[data-date="2026-04-06"]')).toHaveAttribute("data-holiday", "1"); // Easter Monday
    await day.click();
    const leave = await page.evaluate(() => JSON.parse(localStorage.getItem("holidays.state")!).leave);
    expect(leave).toEqual({ "2026-04-07": 1 });
  });
});

test.describe("first run in Greek", () => {
  test.use({ locale: "el-GR" });

  test("suggests the Greek calendar and shows the Greek UI", async ({ page }) => {
    await page.goto("./#2026");
    await expect(page.getByText("Χρησιμοποιείται το «Διακοπές στην Ελλάδα».")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Αργίες", level: 1 })).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the e2e tests**

Run: `npm run test:e2e`
Expected: 5 passed. If a test fails, inspect with `npx playwright show-report` and fix the app (not the assertions) unless an assertion contradicts this plan.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): cover mobile grid, leave flow, timezone and Greek first run"
```

---

### Task 17: README, license and GitHub Pages deployment

**Files:**
- Create: `README.md`, `LICENSE`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `package.json` scripts from Task 1.
- Produces: documentation and CI that tests, builds and deploys `dist/` to GitHub Pages on every push to `main`.

- [ ] **Step 1: Create `README.md`**

````markdown
# Holidays

Plan your leave around public holidays. See the whole year as 12 months (3 × 4), pick your country and region, adjust holidays, set your weekly working days, click the days you take off, and instantly see how many leave days you used and every 3-, 4-, … day break you get.

A modern, open-source successor of the old argies.gr calendar.

**Live:** https://vasilisplavos.github.io/holidays/

## Features

- Holiday calendars for ~220 countries (Google public holiday calendars), with region filters (e.g. Swiss cantons).
- Enable/disable any holiday, make it a half day, for all years or just one year; add your own holidays.
- Weekly plan with half days (e.g. Friday afternoon off, 4-day week).
- Click a day: full leave → half leave → none. Half holiday + half leave = a full free day.
- Leave counter and list of breaks, grouped by length.
- English and Greek UI (system language by default). Light/dark theme.
- Everything is stored in your browser (`localStorage`); export/import as JSON.

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173/holidays/
npm run test         # unit tests (watch mode)
npm run test:run     # unit tests once
npm run test:e2e     # Playwright mobile tests (first time: npx playwright install chromium)
npm run build        # production build into dist/
npm run preview      # serve dist/ at http://localhost:4173/holidays/
```

## Updating the holiday data

Holiday data live in `data/holidays/`:

- `raw/<id>.ics` — the original files as downloaded from Google,
- `<id>.json` — compact JSON used by the app,
- `index.json` — list of available calendars.

To refresh them (e.g. once a year, when Google publishes new years):

```bash
npm run holidays:update
```

This runs `scripts/fetch-google-holidays.mjs`, which downloads every calendar listed in `scripts/google-calendar-ids.txt` (plus the Greek/German/French/Italian variants), removes duplicates and empty calendars, and rewrites `data/holidays/`. Review the diff and commit it. No API key is needed.

## Adding a UI language

Copy `src/i18n/en.json` to `src/i18n/<code>.json`, translate the values, then register it in `src/i18n/index.ts` (`MESSAGES` and `LANGUAGE_NAMES`). The unit tests check that every language has all keys.

## Data source

Holiday data: Google Calendar public holiday calendars (`https://calendar.google.com/calendar/ical/<id>%23holiday%40group.v.calendar.google.com/public/basic.ics`). Dates may change; always double-check with official sources.

## License

MIT — see [LICENSE](LICENSE).
````

- [ ] **Step 2: Create `LICENSE`**

```
MIT License

Copyright (c) 2026 Vasileios Plavos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Create `.github/workflows/deploy.yml`**

```yaml
name: Test and deploy

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:run
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          CI: "true"
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        if: github.ref == 'refs/heads/main'
        with:
          path: dist

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Final verification**

Run: `npx vitest run && npm run build && npm run test:e2e`
Expected: all unit tests pass, build succeeds, 5 e2e tests pass.

Run: `git status --short`
Expected: only the new files of this task (no `dist/`, `public/data/`, `node_modules/`, `test-results/`).

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE .github/workflows/deploy.yml
git commit -m "docs: add README, MIT license and GitHub Pages workflow"
```

- [ ] **Step 6: Hand-off note for the owner (do not do this yourself)**

After pushing to `github.com/vasilisplavos/holidays`, the owner must enable Pages once: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site will then be at `https://vasilisplavos.github.io/holidays/`.
