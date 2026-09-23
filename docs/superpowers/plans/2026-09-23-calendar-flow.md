# Calendar Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick several holiday calendars (and several regions per calendar) in a first-run / "Change" modal, and make every holiday and weekly-plan setting apply "from the year it was set onwards" through per-year profiles (GitHub issue #2).

**Architecture:** `AppState` v2 replaces the single `calendar` + global rules + per-year overrides with `profiles: Record<"YYYY", YearProfile>`. A pure module `src/core/profiles.ts` picks the profile of a year (latest configured year ≤ Y, else the earliest) and copies a profile on the first edit of an unconfigured year. Holiday resolution merges all selected calendars of the year's profile; the day resolver uses each date's own year profile. The UI gains a `CalendarPickerDialog`, a `CalendarsPanel` in the left column, a shared `Dialog` shell, and loses the "Changes apply to" scope, the first-run banner and the calendar part of Settings.

**Tech Stack:** Vite + React 19 + TypeScript, zod 4, Vitest + jsdom + Testing Library, Playwright (mobile Chromium).

**Spec:** `docs/superpowers/specs/2026-09-23-calendar-flow-design.md` (written in Greek; this plan restates everything you need in English).

## Global Constraints

- Work on branch `feature/calendar-flow` in `C:\Users\vplav\Gits\vasilisplavos\los-feier` (Windows; use Git Bash, forward slashes). Do not push.
- `node_modules` is missing: run `npm install` once before Task 1.
- `AppState.version` is `2`. No migration from v1: a stored or imported v1 object is simply invalid (`invalidShape`); `version > 2` is `unsupportedVersion`.
- Profile keys are 4-digit year strings (`/^\d{4}$/`). Calendar ids match `/^[a-z]{2}\.[a-z_]+$/`.
- Resolution rule: year Y uses the profile of the largest configured year ≤ Y; if none, the smallest configured year; if no profiles at all, the default profile (`calendars: []`, `includeObservances: false`, `holidayRules: {}`, `customHolidays: []`, `weeklyPlan: [0,0,0,0,0,1,1]`).
- Editing a year with no profile of its own first deep-copies the covering profile to that year, silently. Other configured years are never touched.
- Leave (`state.leave`), language and theme stay global (outside profiles).
- Holiday rules are keyed by holiday name and apply to every selected calendar that has a holiday with that name. Custom holidays take `enabled` from the rules, but keep their own `fraction`.
- All user-visible text goes through i18n with keys in **both** `src/i18n/en.json` and `src/i18n/el.json` (a unit test enforces identical key sets). Greek copy is given verbatim in the tasks.
- `localStorage` access outside `src/state/storage.ts` must be wrapped in try/catch (it can throw).
- Commit after every task with a Conventional Commit message ending in:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu
  ```
- **Expected breakage between tasks:** Task 2 changes `AppState`, so `npm run build` (tsc) and the tests of modules not yet migrated (`App.test.tsx`, UI tests, core tests migrated in Task 3) fail until the task that migrates them. Each task lists the test files that must pass at its end. From Task 9 on, the whole suite and `npm run build` must be green.

## Review Focus

1. **A stale selection** (a calendar id no longer in the index, or a region no longer in the calendar file): the app shows it clearly marked and never crashes; saving the picker drops it. → tests in Task 6 (picker save) and Task 7 (panel marking).
2. **The same holiday coming from two calendars** (e.g. Good Friday in `en.ch` and `en.christian`): one list row, one rule, public wins. → Task 3.
3. **A break that spans the new year with different profiles on each side**: each date uses its own year's weekly plan and calendars. → Task 3 (`stats.test.ts`).
4. **`localStorage` blocked** while toggling the calendars panel: the toggle still works. → Task 7.
5. **First run with no suggestion, closed with Escape and nothing checked**: saves an empty profile, the modal does not reopen, the app works with weekends only. → Task 9 (`App.test.tsx`).

---

### Task 1: Year profiles in the core

**Files:**
- Modify: `src/core/types.ts` (add two interfaces; nothing removed yet)
- Create: `src/core/profiles.ts`
- Test: `src/core/profiles.test.ts`

**Interfaces:**
- Produces (types, in `src/core/types.ts`):
  ```ts
  export interface SelectedCalendar { id: string; regions: string[] }
  export interface YearProfile {
    calendars: SelectedCalendar[];
    includeObservances: boolean;
    holidayRules: Record<string, HolidayRule>;
    customHolidays: CustomHoliday[];
    weeklyPlan: WeeklyPlan;
  }
  ```
- Produces (functions, in `src/core/profiles.ts`):
  ```ts
  export type Profiles = Record<string, YearProfile>;
  export function createDefaultProfile(): YearProfile;
  export function profileYearFor(profiles: Profiles, year: number): number | null;
  export function profileFor(profiles: Profiles, year: number): YearProfile;
  export function editProfile(profiles: Profiles, year: number, fn: (profile: YearProfile) => YearProfile): Profiles;
  export function calendarIdsFor(profiles: Profiles, years: number[]): string[]; // unique, sorted
  ```

- [ ] **Step 1: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` exists.

- [ ] **Step 2: Add the types**

In `src/core/types.ts`, directly above `export type Theme = ...`, add:

```ts
/** One chosen holiday calendar and the regions chosen in it ([] = national holidays only). */
export interface SelectedCalendar {
  id: string; // e.g. "en.ch"
  regions: string[];
}

/** Everything that applies from one configured year onwards (until the next configured year). */
export interface YearProfile {
  calendars: SelectedCalendar[]; // [] = no calendar
  includeObservances: boolean;
  holidayRules: Record<string, HolidayRule>; // holiday name -> rule
  customHolidays: CustomHoliday[];
  weeklyPlan: WeeklyPlan;
}
```

- [ ] **Step 3: Write the failing test**

Create `src/core/profiles.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { calendarIdsFor, createDefaultProfile, editProfile, profileFor, profileYearFor } from "./profiles";
import type { YearProfile } from "./types";

const p = (id: string): YearProfile => ({ ...createDefaultProfile(), calendars: [{ id, regions: [] }] });
const profiles = { "2026": p("en.ch"), "2028": p("en.german") };
const disableX = (profile: YearProfile): YearProfile => ({
  ...profile,
  holidayRules: { ...profile.holidayRules, X: { enabled: false } },
});

describe("profileYearFor", () => {
  test.each([
    [2020, 2026],
    [2026, 2026],
    [2027, 2026],
    [2028, 2028],
    [2040, 2028],
  ])("year %i uses the profile of %i", (year, expected) => {
    expect(profileYearFor(profiles, year)).toBe(expected);
  });

  test("no profiles → null", () => {
    expect(profileYearFor({}, 2026)).toBeNull();
  });
});

describe("profileFor", () => {
  test("returns the covering profile itself", () => {
    expect(profileFor(profiles, 2027)).toBe(profiles["2026"]);
  });

  test("no profiles → the default profile", () => {
    expect(profileFor({}, 2026)).toEqual({
      calendars: [],
      includeObservances: false,
      holidayRules: {},
      customHolidays: [],
      weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    });
  });
});

describe("editProfile", () => {
  test("editing an unconfigured year copies the covering profile first", () => {
    const next = editProfile(profiles, 2027, disableX);
    expect(Object.keys(next).sort()).toEqual(["2026", "2027", "2028"]);
    expect(next["2027"]).toEqual({ ...profiles["2026"], holidayRules: { X: { enabled: false } } });
    expect(next["2026"]).toBe(profiles["2026"]);
    expect(next["2028"]).toBe(profiles["2028"]);
  });

  test("the copy shares no objects with the original", () => {
    const next = editProfile(profiles, 2027, (profile) => profile);
    expect(next["2027"]).toEqual(profiles["2026"]);
    expect(next["2027"]).not.toBe(profiles["2026"]);
    expect(next["2027"].calendars).not.toBe(profiles["2026"].calendars);
    expect(next["2027"].calendars[0]).not.toBe(profiles["2026"].calendars[0]);
  });

  test("editing before the first profile creates a new first profile", () => {
    const next = editProfile(profiles, 2024, disableX);
    expect(profileYearFor(next, 2020)).toBe(2024);
    expect(profileYearFor(next, 2025)).toBe(2024);
    expect(profileYearFor(next, 2026)).toBe(2026);
  });

  test("editing a configured year changes only that year and never the input", () => {
    const next = editProfile(profiles, 2026, disableX);
    expect(next["2026"].holidayRules).toEqual({ X: { enabled: false } });
    expect(next["2028"]).toBe(profiles["2028"]);
    expect(profiles["2026"].holidayRules).toEqual({});
  });

  test("editing with no profiles starts from the default profile", () => {
    expect(editProfile({}, 2026, disableX)).toEqual({
      "2026": { ...createDefaultProfile(), holidayRules: { X: { enabled: false } } },
    });
  });
});

describe("calendarIdsFor", () => {
  test("unique, sorted ids of the profiles covering the given years", () => {
    const two = { ...profiles, "2028": { ...p("en.german"), calendars: [{ id: "en.german", regions: [] }, { id: "en.ch", regions: [] }] } };
    expect(calendarIdsFor(two, [2027, 2028, 2029])).toEqual(["en.ch", "en.german"]);
    expect(calendarIdsFor({}, [2026])).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/core/profiles.test.ts`
Expected: FAIL — cannot resolve `./profiles`.

- [ ] **Step 5: Implement**

Create `src/core/profiles.ts`:

```ts
import type { YearProfile } from "./types";

/** Configured year ("2026") -> the profile that applies from that year until the next configured one. */
export type Profiles = Record<string, YearProfile>;

export function createDefaultProfile(): YearProfile {
  return { calendars: [], includeObservances: false, holidayRules: {}, customHolidays: [], weeklyPlan: [0, 0, 0, 0, 0, 1, 1] };
}

/** The configured year whose profile applies to `year`: the latest one ≤ year, else the earliest one. */
export function profileYearFor(profiles: Profiles, year: number): number | null {
  const years = Object.keys(profiles).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return null;
  let found = years[0];
  for (const y of years) if (y <= year) found = y;
  return found;
}

export function profileFor(profiles: Profiles, year: number): YearProfile {
  const key = profileYearFor(profiles, year);
  return key === null ? createDefaultProfile() : profiles[String(key)];
}

/** Applies `fn` to the profile of `year`, first copying the covering profile when `year` has none of its own. */
export function editProfile(profiles: Profiles, year: number, fn: (profile: YearProfile) => YearProfile): Profiles {
  const key = String(year);
  const current = Object.hasOwn(profiles, key) ? profiles[key] : structuredClone(profileFor(profiles, year));
  return { ...profiles, [key]: fn(current) };
}

/** Every calendar id used by the profiles that cover `years`. */
export function calendarIdsFor(profiles: Profiles, years: number[]): string[] {
  const ids = new Set(years.flatMap((y) => profileFor(profiles, y).calendars.map((c) => c.id)));
  return [...ids].sort();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/core/profiles.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/profiles.ts src/core/profiles.test.ts package-lock.json
git commit -m "feat(core): add year profiles and their resolution (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```
(`package-lock.json` only if `npm install` changed it.)

---

### Task 2: AppState v2 — defaults, schema, reducer, test fixtures

**Files:**
- Modify: `src/core/types.ts` (`AppState`)
- Modify: `src/state/defaults.ts`, `src/state/schema.ts`, `src/state/reducer.ts`
- Modify: `src/test/fixtures.ts`
- Test: `src/state/schema.test.ts` (rewrite), `src/state/reducer.test.ts` (rewrite)

**Interfaces:**
- Consumes: `YearProfile`, `SelectedCalendar` (Task 1), `editProfile`, `createDefaultProfile` (Task 1).
- Produces:
  ```ts
  interface AppState { version: 2; language: string | null; theme: Theme; leave: Record<string, Fraction>; profiles: Record<string, YearProfile> }
  type Action =
    | { type: "toggleLeave"; date: string; room: number }
    | { type: "setCalendars"; year: number; calendars: SelectedCalendar[]; includeObservances: boolean }
    | { type: "setHolidayRule"; year: number; name: string; rule: HolidayRule | null }
    | { type: "addCustomHoliday"; year: number; holiday: CustomHoliday }
    | { type: "updateCustomHoliday"; year: number; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
    | { type: "removeCustomHoliday"; year: number; id: string }
    | { type: "cycleWeekly"; year: number; weekday: number }
    | { type: "removeProfile"; year: number }
    | { type: "setLanguage"; language: string | null }
    | { type: "setTheme"; theme: Theme }
    | { type: "replaceState"; state: AppState }
    | { type: "reset" };
  ```
  Test helpers in `src/test/fixtures.ts`:
  ```ts
  export function makeProfile(overrides?: Partial<YearProfile>): YearProfile; // en.ch / ["Zurich"] + overrides
  export function makeState(overrides?: Partial<YearProfile> & Partial<Pick<AppState, "language" | "theme" | "leave" | "profiles">>): AppState;
  // one profile at "2020" (covers every year) built with makeProfile(profile fields); `profiles` replaces it entirely
  ```

- [ ] **Step 1: Change `AppState`**

In `src/core/types.ts` replace the whole `AppState` interface with:

```ts
/** Everything the user chose. Saved as one JSON object. */
export interface AppState {
  version: 2;
  language: string | null; // null = follow the system language
  theme: Theme;
  leave: Record<string, Fraction>; // "YYYY-MM-DD" -> leave taken
  profiles: Record<string, YearProfile>; // "2026" -> profile; {} = first run
}
```

- [ ] **Step 2: Update defaults and fixtures**

Replace `src/state/defaults.ts` with:

```ts
import type { AppState } from "../core/types";

export function createDefaultState(): AppState {
  return { version: 2, language: null, theme: "system", leave: {}, profiles: {} };
}
```

In `src/test/fixtures.ts`: change the imports to

```ts
import { createDefaultProfile } from "../core/profiles";
import { createDefaultState } from "../state/defaults";
import type { AppState, CalendarFile, GoogleHoliday, YearProfile } from "../core/types";
```

and replace the `makeState` function (keep `makeCalendar` and `zurichFixture` as they are) with:

```ts
/** A profile with calendar en.ch / Zurich, plus any overrides. */
export function makeProfile(overrides: Partial<YearProfile> = {}): YearProfile {
  return { ...createDefaultProfile(), calendars: [{ id: "en.ch", regions: ["Zurich"] }], ...overrides };
}

type StateOverrides = Partial<YearProfile> & Partial<Pick<AppState, "language" | "theme" | "leave" | "profiles">>;

/**
 * Default state with one profile at 2020 — it covers every year — built from `makeProfile` and the
 * profile fields in `overrides`. Pass `profiles` to replace the profiles entirely.
 */
export function makeState(overrides: StateOverrides = {}): AppState {
  const { language, theme, leave, profiles, ...profile } = overrides;
  const base = createDefaultState();
  return {
    ...base,
    language: language ?? base.language,
    theme: theme ?? base.theme,
    leave: leave ?? base.leave,
    profiles: profiles ?? { "2020": makeProfile(profile) },
  };
}
```

- [ ] **Step 3: Write the failing schema test**

Replace `src/state/schema.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { parseAppState, parseStateText } from "./schema";
import { createDefaultState } from "./defaults";

const profile = () => ({
  calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }],
  includeObservances: false,
  holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } },
  customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
  weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
});

const valid = () => ({
  ...createDefaultState(),
  leave: { "2026-04-07": 1, "2026-09-14": 0.5 },
  profiles: { "2026": profile(), "2028": { ...profile(), calendars: [] } },
});

const withProfile = (changes: object) => ({ ...valid(), profiles: { "2026": { ...profile(), ...changes } } });

const v1State = {
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

describe("parseAppState", () => {
  test("accepts a full valid state", () => {
    expect(parseAppState(valid())).toEqual({ ok: true, state: valid() });
  });

  test("accepts the default state (first run)", () => {
    expect(parseAppState(createDefaultState()).ok).toBe(true);
  });

  test.each([
    ["impossible leave date", { ...valid(), leave: { "2026-02-30": 1 } }],
    ["leave fraction 0.3", { ...valid(), leave: { "2026-04-07": 0.3 } }],
    ["weekly plan of 6 days", withProfile({ weeklyPlan: [0, 0, 0, 0, 0, 1] })],
    ["weekly value 2", withProfile({ weeklyPlan: [0, 0, 0, 0, 0, 1, 2] })],
    ["bad profile year key", { ...valid(), profiles: { "26": profile() } }],
    ["bad calendar id", withProfile({ calendars: [{ id: "../../x", regions: [] }] })],
    ["calendar without regions", withProfile({ calendars: [{ id: "en.ch" }] })],
    ["custom once with bad date", withProfile({ customHolidays: [{ id: "b", name: "X", fraction: 1, rule: { type: "once", date: "2026-13-01" } }] })],
    ["unknown theme", { ...valid(), theme: "neon" }],
    ["a version 1 state", v1State],
    ["not an object", 42],
  ])("REVIEW FOCUS: rejects %s", (_label, input) => {
    expect(parseAppState(input)).toEqual({ ok: false, error: "invalidShape" });
  });

  test("REVIEW FOCUS: rejects a newer version with a specific error", () => {
    expect(parseAppState({ ...valid(), version: 3 })).toEqual({ ok: false, error: "unsupportedVersion" });
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

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/state/schema.test.ts`
Expected: FAIL — the v1 schema rejects `version: 2` states and accepts the v1 one.

- [ ] **Step 5: Implement the schema**

In `src/state/schema.ts` replace everything from `export const appStateSchema` down to (and including) the `parseAppState` function with:

```ts
const weeklyPlan = z.tuple([weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue, weeklyValue]);

const yearProfile = z.object({
  calendars: z.array(
    z.object({
      // Calendar ids look like "en.ch" or "en.new_zealand"; anything else could be a path trick.
      id: z.string().regex(/^[a-z]{2}\.[a-z_]+$/),
      regions: z.array(z.string()),
    }),
  ),
  includeObservances: z.boolean(),
  holidayRules: z.record(z.string(), rule),
  customHolidays: z.array(customHoliday),
  weeklyPlan,
});

export const appStateSchema = z.object({
  version: z.literal(2),
  language: z.string().nullable(),
  theme: z.enum(["system", "light", "dark"]),
  leave: z
    .record(z.string(), fraction)
    .refine((leave) => Object.keys(leave).every(isValidIsoDate), "Invalid leave date"),
  profiles: z.record(z.string().regex(/^\d{4}$/), yearProfile),
});

export type ParseError = "invalidJson" | "unsupportedVersion" | "invalidShape";
export type ParseResult = { ok: true; state: AppState } | { ok: false; error: ParseError };

export function parseAppState(input: unknown): ParseResult {
  if (typeof input === "object" && input !== null && typeof (input as { version?: unknown }).version === "number") {
    if ((input as { version: number }).version > 2) return { ok: false, error: "unsupportedVersion" };
  }
  const result = appStateSchema.safeParse(input);
  return result.success ? { ok: true, state: result.data as AppState } : { ok: false, error: "invalidShape" };
}
```

Run: `npx vitest run src/state/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing reducer test**

Replace `src/state/reducer.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { reducer } from "./reducer";
import { createDefaultState } from "./defaults";
import { createDefaultProfile } from "../core/profiles";
import { makeProfile, makeState } from "../test/fixtures";

// makeState() has a single profile at 2020 (en.ch / Zurich) that covers every year.

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

  test("cycleWeekly 0 → 0.5 → 1 → 0 in the profile of the year", () => {
    let s = makeState({ profiles: { "2026": makeProfile() } });
    for (const expected of [0.5, 1, 0]) {
      s = reducer(s, { type: "cycleWeekly", year: 2026, weekday: 4 });
      expect(s.profiles["2026"].weeklyPlan[4]).toBe(expected);
    }
  });

  test("an edit in an unconfigured year copies the covering profile to that year", () => {
    const s = reducer(makeState(), { type: "cycleWeekly", year: 2027, weekday: 4 });
    expect(Object.keys(s.profiles).sort()).toEqual(["2020", "2027"]);
    expect(s.profiles["2020"].weeklyPlan[4]).toBe(0);
    expect(s.profiles["2027"].weeklyPlan[4]).toBe(0.5);
    expect(s.profiles["2027"].calendars).toEqual([{ id: "en.ch", regions: ["Zurich"] }]);
  });

  test("setHolidayRule sets a rule and an empty rule removes it", () => {
    let s = reducer(makeState(), { type: "setHolidayRule", year: 2020, name: "K", rule: { enabled: true, fraction: 0.5 } });
    expect(s.profiles["2020"].holidayRules).toEqual({ K: { enabled: true, fraction: 0.5 } });
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: {} });
    expect(s.profiles["2020"].holidayRules).toEqual({});
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: { enabled: false } });
    s = reducer(s, { type: "setHolidayRule", year: 2020, name: "K", rule: null });
    expect(s.profiles["2020"].holidayRules).toEqual({});
  });

  test("custom holidays add / update / remove", () => {
    const holiday = { id: "a", name: "Company day", fraction: 1 as const, rule: { type: "yearly" as const, month: 6, day: 15 } };
    let s = reducer(makeState(), { type: "addCustomHoliday", year: 2020, holiday });
    s = reducer(s, { type: "updateCustomHoliday", year: 2020, id: "a", changes: { fraction: 0.5 } });
    expect(s.profiles["2020"].customHolidays).toEqual([{ ...holiday, fraction: 0.5 }]);
    s = reducer(s, { type: "removeCustomHoliday", year: 2020, id: "a" });
    expect(s.profiles["2020"].customHolidays).toEqual([]);
  });

  test("setCalendars drops duplicate ids, sorts and dedupes regions, stores observances", () => {
    const s = reducer(createDefaultState(), {
      type: "setCalendars",
      year: 2026,
      includeObservances: true,
      calendars: [
        { id: "en.ch", regions: ["Zurich", "Bern", "Zurich"] },
        { id: "en.christian", regions: [] },
        { id: "en.ch", regions: [] },
      ],
    });
    expect(Object.keys(s.profiles)).toEqual(["2026"]);
    expect(s.profiles["2026"].calendars).toEqual([
      { id: "en.ch", regions: ["Bern", "Zurich"] },
      { id: "en.christian", regions: [] },
    ]);
    expect(s.profiles["2026"].includeObservances).toBe(true);
  });

  test("setCalendars with no calendars still creates the profile (first run closed empty)", () => {
    const s = reducer(createDefaultState(), { type: "setCalendars", year: 2026, calendars: [], includeObservances: false });
    expect(s.profiles).toEqual({ "2026": createDefaultProfile() });
  });

  test("removeProfile removes a configured year when another one exists", () => {
    const s = makeState({ profiles: { "2020": makeProfile(), "2027": makeProfile({ calendars: [] }) } });
    expect(Object.keys(reducer(s, { type: "removeProfile", year: 2027 }).profiles)).toEqual(["2020"]);
  });

  test("REVIEW FOCUS: removeProfile keeps the only profile and ignores unconfigured years", () => {
    const s = makeState();
    expect(reducer(s, { type: "removeProfile", year: 2020 })).toBe(s);
    const two = makeState({ profiles: { "2020": makeProfile(), "2027": makeProfile() } });
    expect(reducer(two, { type: "removeProfile", year: 2025 })).toBe(two);
  });

  test("language and theme", () => {
    let s = reducer(createDefaultState(), { type: "setLanguage", language: "el" });
    s = reducer(s, { type: "setTheme", theme: "dark" });
    expect(s.language).toBe("el");
    expect(s.theme).toBe("dark");
  });

  test("replaceState and reset", () => {
    const other = { ...createDefaultState(), theme: "light" as const };
    expect(reducer(createDefaultState(), { type: "replaceState", state: other })).toBe(other);
    expect(reducer(other, { type: "reset" })).toEqual(createDefaultState());
  });

  test("never mutates the previous state", () => {
    const before = makeState();
    const snapshot = JSON.stringify(before);
    reducer(before, { type: "toggleLeave", date: "2026-04-07", room: 1 });
    reducer(before, { type: "cycleWeekly", year: 2020, weekday: 0 });
    reducer(before, { type: "cycleWeekly", year: 2027, weekday: 0 });
    reducer(before, { type: "setHolidayRule", year: 2020, name: "X", rule: { enabled: false } });
    reducer(before, { type: "setCalendars", year: 2020, calendars: [], includeObservances: true });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/state/reducer.test.ts`
Expected: FAIL — e.g. `Cannot read properties of undefined (reading 'weeklyPlan')` / unknown action types.

- [ ] **Step 8: Implement the reducer**

Replace `src/state/reducer.ts` with:

```ts
import { nextLeaveValue } from "../core/days";
import { editProfile } from "../core/profiles";
import type {
  AppState, CustomHoliday, HolidayRule, SelectedCalendar, Theme, WeeklyPlan, WeeklyValue, YearProfile,
} from "../core/types";
import { createDefaultState } from "./defaults";

export type Action =
  | { type: "toggleLeave"; date: string; room: number }
  | { type: "setCalendars"; year: number; calendars: SelectedCalendar[]; includeObservances: boolean }
  | { type: "setHolidayRule"; year: number; name: string; rule: HolidayRule | null }
  | { type: "addCustomHoliday"; year: number; holiday: CustomHoliday }
  | { type: "updateCustomHoliday"; year: number; id: string; changes: Partial<Pick<CustomHoliday, "name" | "fraction">> }
  | { type: "removeCustomHoliday"; year: number; id: string }
  | { type: "cycleWeekly"; year: number; weekday: number }
  | { type: "removeProfile"; year: number }
  | { type: "setLanguage"; language: string | null }
  | { type: "setTheme"; theme: Theme }
  | { type: "replaceState"; state: AppState }
  | { type: "reset" };

const NEXT_WEEKLY: Record<WeeklyValue, WeeklyValue> = { 0: 0.5, 0.5: 1, 1: 0 };

function isEmptyRule(rule: HolidayRule | null): boolean {
  return !rule || (rule.enabled === undefined && rule.fraction === undefined);
}

/** First occurrence of each id wins; regions sorted and unique. */
function normalizeCalendars(calendars: SelectedCalendar[]): SelectedCalendar[] {
  const seen = new Set<string>();
  const out: SelectedCalendar[] = [];
  for (const c of calendars) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, regions: [...new Set(c.regions)].sort() });
  }
  return out;
}

/** Edits the profile of `year`, copying the covering profile first when `year` has none of its own. */
function withProfile(state: AppState, year: number, fn: (profile: YearProfile) => YearProfile): AppState {
  return { ...state, profiles: editProfile(state.profiles, year, fn) };
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
    case "setCalendars":
      return withProfile(state, action.year, (p) => ({
        ...p,
        calendars: normalizeCalendars(action.calendars),
        includeObservances: action.includeObservances,
      }));
    case "setHolidayRule":
      return withProfile(state, action.year, (p) => {
        const holidayRules = { ...p.holidayRules };
        if (isEmptyRule(action.rule)) delete holidayRules[action.name];
        else holidayRules[action.name] = action.rule!;
        return { ...p, holidayRules };
      });
    case "addCustomHoliday":
      return withProfile(state, action.year, (p) => ({ ...p, customHolidays: [...p.customHolidays, action.holiday] }));
    case "updateCustomHoliday":
      return withProfile(state, action.year, (p) => ({
        ...p,
        customHolidays: p.customHolidays.map((c) => (c.id === action.id ? { ...c, ...action.changes } : c)),
      }));
    case "removeCustomHoliday":
      return withProfile(state, action.year, (p) => ({
        ...p,
        customHolidays: p.customHolidays.filter((c) => c.id !== action.id),
      }));
    case "cycleWeekly":
      return withProfile(state, action.year, (p) => {
        const weeklyPlan = [...p.weeklyPlan] as WeeklyPlan;
        weeklyPlan[action.weekday] = NEXT_WEEKLY[weeklyPlan[action.weekday]];
        return { ...p, weeklyPlan };
      });
    case "removeProfile": {
      const key = String(action.year);
      if (!Object.hasOwn(state.profiles, key) || Object.keys(state.profiles).length <= 1) return state;
      const profiles = { ...state.profiles };
      delete profiles[key];
      return { ...state, profiles };
    }
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

- [ ] **Step 9: Run the state tests**

Run: `npx vitest run src/core/profiles.test.ts src/state`
Expected: PASS for `profiles`, `schema`, `reducer`, `storage`, `StoreProvider`. (If `storage.test.ts` or `StoreProvider.test.tsx` fail, they only need `createDefaultState()`/`makeState()` — fix any v1-shaped literal there to the v2 shape above.)

- [ ] **Step 10: Commit**

```bash
git add src/core/types.ts src/state src/test/fixtures.ts
git commit -m "feat(state): switch AppState to v2 with per-year profiles (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 3: Several calendars per year and a per-year day resolver

**Files:**
- Modify: `src/core/types.ts` (`ResolvedHoliday`)
- Modify: `src/core/holidays.ts`, `src/core/days.ts`, `src/ui/useYearModel.ts`
- Modify: `src/test/fixtures.ts` (add `christianFixture`)
- Test: `src/core/holidays.test.ts` (rewrite), `src/core/days.test.ts`, `src/core/stats.test.ts`, `src/core/stats.real-data.test.ts`, `src/ui/useYearModel.test.ts`, `src/ui/YearGrid.test.tsx`

**Interfaces:**
- Consumes: `profileFor` (Task 1), `makeProfile`, `makeState` (Task 2).
- Produces:
  ```ts
  // ResolvedHoliday: `hasYearOverride` removed; added
  calendarIds: string[]; // ids of the calendars this holiday comes from; [] for custom holidays
  export function resolveYearHolidays(profile: YearProfile, calendars: CalendarFile[], year: number): ResolvedHoliday[];
  export function createDayResolver(state: Pick<AppState, "profiles" | "leave">, calendars: CalendarFile[]): DayResolver;
  export function useYearModel(state: AppState, calendars: CalendarFile[], year: number): { resolve; holidays; leaveTotal; stretches };
  export const christianFixture: CalendarFile; // in src/test/fixtures.ts
  ```

- [ ] **Step 1: Add the second fixture calendar**

Append to `src/test/fixtures.ts`:

```ts
/** A tiny religious calendar without regions that overlaps the Swiss one by name and date. */
export const christianFixture: CalendarFile = makeCalendar("en.christian", "Christian Holidays", [
  { date: "2026-04-03", name: "Good Friday", type: "observance" },
  { date: "2026-12-24", name: "Christmas Eve", type: "observance", tentative: true },
  { date: "2026-12-25", name: "Christmas Day", type: "observance" },
]);
```

- [ ] **Step 2: Write the failing holiday tests**

Replace `src/core/holidays.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { christianFixture, makeCalendar, makeProfile, zurichFixture } from "../test/fixtures";

const names = (list: { name: string }[]) => list.map((h) => h.name);
const both = [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }];

describe("resolveYearHolidays", () => {
  test("without regions only national holidays are visible", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: [] }] });
    expect(names(resolveYearHolidays(profile, [zurichFixture], 2026))).toEqual([
      "New Year's Day", "Christmas Day", "St. Stephen's Day",
    ]);
  });

  test("region filter shows national + matching regional holidays", () => {
    const list = resolveYearHolidays(makeProfile(), [zurichFixture], 2026);
    expect(names(list)).toContain("Good Friday");
    expect(names(list)).not.toContain("Saint Joseph's Day"); // Lucerne only
  });

  test("observances are visible but disabled by default", () => {
    const list = resolveYearHolidays(makeProfile(), [zurichFixture], 2026);
    const knaben = list.filter((h) => h.name === "Knabenschiessen (Zurich)");
    expect(knaben).toHaveLength(3);
    expect(knaben.every((h) => !h.enabled && h.type === "observance")).toBe(true);
    expect(list.find((h) => h.name === "Good Friday")).toMatchObject({
      enabled: true, fraction: 1, source: "google", hasRule: false, calendarIds: ["en.ch"],
    });
  });

  test("includeObservances enables observances", () => {
    const list = resolveYearHolidays(makeProfile({ includeObservances: true }), [zurichFixture], 2026);
    expect(list.filter((h) => h.name.startsWith("Knaben")).every((h) => h.enabled)).toBe(true);
  });

  test("holidayRules apply by name to every date with that name", () => {
    const profile = makeProfile({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true, fraction: 0.5 } } });
    const knaben = resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.name.startsWith("Knaben"));
    expect(knaben.map((h) => [h.date, h.enabled, h.fraction, h.hasRule])).toEqual([
      ["2026-09-12", true, 0.5, true],
      ["2026-09-13", true, 0.5, true],
      ["2026-09-14", true, 0.5, true],
    ]);
  });

  test("every selected calendar contributes, each filtered by its own regions", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: [] }, { id: "en.christian", regions: [] }] });
    const list = resolveYearHolidays(profile, [zurichFixture, christianFixture], 2026);
    expect(names(list)).toContain("Christmas Eve");
    // Good Friday is regional in en.ch (no region chosen) but national in en.christian:
    expect(list.filter((h) => h.name === "Good Friday")).toEqual([
      expect.objectContaining({ type: "observance", enabled: false, calendarIds: ["en.christian"] }),
    ]);
  });

  test("REVIEW FOCUS: the same name on the same date is one entry; public wins; both calendar ids", () => {
    const list = resolveYearHolidays(makeProfile({ calendars: both }), [zurichFixture, christianFixture], 2026);
    expect(list.filter((h) => h.name === "Good Friday")).toEqual([
      expect.objectContaining({ date: "2026-04-03", type: "public", enabled: true, calendarIds: ["en.ch", "en.christian"] }),
    ]);
    expect(list.filter((h) => h.name === "Christmas Day")).toHaveLength(1);
  });

  test("REVIEW FOCUS: a rule by name covers the merged holiday of both calendars", () => {
    const profile = makeProfile({ calendars: both, holidayRules: { "Christmas Day": { enabled: false } } });
    const xmas = resolveYearHolidays(profile, [zurichFixture, christianFixture], 2026).filter((h) => h.name === "Christmas Day");
    expect(xmas).toEqual([expect.objectContaining({ enabled: false, hasRule: true })]);
  });

  test("tentative only when every source is tentative", () => {
    const a = makeCalendar("en.aa", "A", [{ date: "2026-05-01", name: "Feast", type: "public", tentative: true }]);
    const b = makeCalendar("en.bb", "B", [{ date: "2026-05-01", name: "Feast", type: "public" }]);
    const calendars = [{ id: "en.aa", regions: [] }, { id: "en.bb", regions: [] }];
    expect(resolveYearHolidays(makeProfile({ calendars }), [a, b], 2026)[0].tentative).toBe(false);
    expect(resolveYearHolidays(makeProfile({ calendars }), [a], 2026)[0].tentative).toBe(true);
  });

  test("selected calendars that are not loaded are skipped", () => {
    const list = resolveYearHolidays(makeProfile({ calendars: both }), [zurichFixture], 2026);
    expect(names(list)).not.toContain("Christmas Eve");
    expect(names(list)).toContain("Good Friday");
  });

  test("custom holidays: yearly, once and 29 February", () => {
    const profile = makeProfile({
      customHolidays: [
        { id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } },
        { id: "b", name: "Office closed", fraction: 0.5, rule: { type: "once", date: "2026-12-24" } },
        { id: "c", name: "Leap party", fraction: 1, rule: { type: "yearly", month: 2, day: 29 } },
      ],
    });
    const y2026 = resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.source === "custom");
    expect(y2026.map((h) => [h.date, h.name, h.fraction, h.enabled, h.customId, h.calendarIds])).toEqual([
      ["2026-06-15", "Company day", 1, true, "a", []],
      ["2026-12-24", "Office closed", 0.5, true, "b", []],
    ]);
    const y2027 = resolveYearHolidays(profile, [zurichFixture], 2027).filter((h) => h.source === "custom");
    expect(names(y2027)).toEqual(["Company day"]);
    const y2028 = resolveYearHolidays(profile, [zurichFixture], 2028).filter((h) => h.source === "custom");
    expect(names(y2028)).toEqual(["Leap party", "Company day"]);
  });

  test("a rule's `enabled` applies to custom holidays, their fraction stays their own", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
      holidayRules: { "Company day": { enabled: false, fraction: 0.5 } },
    });
    const [company] = resolveYearHolidays(profile, [], 2026);
    expect(company).toMatchObject({ enabled: false, fraction: 1, hasRule: true });
  });

  test("multi-day events expand and are clipped to the year", () => {
    const cal = makeCalendar("en.xx", "X", [{ date: "2026-12-31", name: "Long feast", type: "public", days: 3 }]);
    const profile = makeProfile({ calendars: [{ id: "en.xx", regions: [] }] });
    expect(resolveYearHolidays(profile, [cal], 2026).map((h) => h.date)).toEqual(["2026-12-31"]);
    expect(resolveYearHolidays(profile, [cal], 2027).map((h) => h.date)).toEqual(["2027-01-01", "2027-01-02"]);
  });

  test("a year outside the calendar data returns only custom holidays", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "a", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(names(resolveYearHolidays(profile, [zurichFixture], 2019))).toEqual(["Company day"]);
    expect(resolveYearHolidays(profile, [], 2026)).toHaveLength(1);
  });
});

describe("prototype-safe name lookups (F6)", () => {
  test("a custom holiday named like an Object.prototype member has no rule", () => {
    const profile = makeProfile({
      customHolidays: [{ id: "x", name: "constructor", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    expect(resolveYearHolidays(profile, [zurichFixture], 2026).filter((h) => h.source === "custom")).toEqual([
      expect.objectContaining({ name: "constructor", enabled: true, hasRule: false }),
    ]);
  });
});

describe("holidayFractions", () => {
  test("uses the largest enabled fraction per date and ignores disabled holidays", () => {
    const base = { source: "google" as const, tentative: false, hasRule: false, calendarIds: [] };
    const map = holidayFractions([
      { ...base, date: "2026-01-01", name: "A", type: "public", enabled: true, fraction: 0.5 },
      { ...base, date: "2026-01-01", name: "B", type: "public", enabled: true, fraction: 1 },
      { ...base, date: "2026-01-02", name: "C", type: "observance", enabled: false, fraction: 1 },
    ]);
    expect(map.get("2026-01-01")).toEqual({ fraction: 1, names: ["A", "B"] });
    expect(map.has("2026-01-02")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/core/holidays.test.ts`
Expected: FAIL (old signature reads `state.calendar.regions` → TypeError, no `calendarIds`).

- [ ] **Step 4: Implement the holiday resolution**

In `src/core/types.ts`, in `ResolvedHoliday`, delete the `hasYearOverride` line and add after `customId?: string;`:

```ts
  calendarIds: string[]; // calendars this holiday comes from; [] for custom holidays
```

and change the `hasRule` comment to `// a holidayRules entry exists for this name`.

Replace `src/core/holidays.ts` with:

```ts
import { addDays, isValidIsoDate, isoFromParts, yearOf } from "./dates";
import type { CalendarFile, Fraction, HolidayRule, HolidayType, ResolvedHoliday, YearProfile } from "./types";

interface Effective {
  enabled: boolean;
  fraction: Fraction;
}

interface Occurrence {
  date: string;
  name: string;
  type: HolidayType;
  tentative: boolean;
  calendarIds: string[];
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
 * All holidays visible in `year` (enabled and disabled) for the calendars of `profile`: each
 * calendar filtered by its own regions, the same name on the same date merged into one entry,
 * then the observance default and the profile's rules (by name) applied. Calendars of the
 * profile that are missing from `calendars` (not loaded, failed) are skipped.
 */
export function resolveYearHolidays(profile: YearProfile, calendars: CalendarFile[], year: number): ResolvedHoliday[] {
  const ruleFor = (name: string) => (Object.hasOwn(profile.holidayRules, name) ? profile.holidayRules[name] : undefined);
  const merged = new Map<string, Occurrence>();

  for (const selected of profile.calendars) {
    const calendar = calendars.find((c) => c.id === selected.id);
    if (!calendar) continue;
    for (const event of calendar.events) {
      if (!isVisible(event.regions, selected.regions)) continue;
      const tentative = event.tentative === true;
      for (let i = 0; i < (event.days ?? 1); i++) {
        const date = addDays(event.date, i);
        if (yearOf(date) !== year) continue;
        const key = `${date}|${event.name}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { date, name: event.name, type: event.type, tentative, calendarIds: [calendar.id] });
          continue;
        }
        if (event.type === "public") existing.type = "public";
        existing.tentative = existing.tentative && tentative;
        if (!existing.calendarIds.includes(calendar.id)) existing.calendarIds.push(calendar.id);
      }
    }
  }

  const out: ResolvedHoliday[] = [];
  for (const o of merged.values()) {
    const rule = ruleFor(o.name);
    out.push({
      date: o.date,
      name: o.name,
      source: "google",
      type: o.type,
      tentative: o.tentative,
      ...applyRules({ enabled: o.type === "public" || profile.includeObservances, fraction: 1 }, rule),
      calendarIds: o.calendarIds,
      hasRule: rule !== undefined,
    });
  }

  for (const custom of profile.customHolidays) {
    const date = custom.rule.type === "once" ? custom.rule.date : isoFromParts(year, custom.rule.month, custom.rule.day);
    if (!isValidIsoDate(date) || yearOf(date) !== year) continue;
    const rule = ruleFor(custom.name);
    out.push({
      date,
      name: custom.name,
      source: "custom",
      type: "custom",
      tentative: false,
      // A custom holiday's fraction is edited on the holiday itself; rules only switch it on/off.
      ...applyRules({ enabled: true, fraction: custom.fraction }, rule && { enabled: rule.enabled }),
      calendarIds: [],
      customId: custom.id,
      hasRule: rule !== undefined,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
```

Keep `holidayFractions` exactly as it was (append it unchanged at the end of the file).

Run: `npx vitest run src/core/holidays.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing day-resolver and stretch tests**

In `src/core/days.test.ts`:
- change the import line of fixtures to `import { makeProfile, makeState, zurichFixture } from "../test/fixtures";`
- replace both `createDayResolver(…, zurichFixture)` calls with `createDayResolver(…, [zurichFixture])`
- add inside `describe("createDayResolver", …)`:

```ts
  test("each date uses the profile of its own year (holidays and weekly plan)", () => {
    const state = makeState({
      profiles: {
        "2026": makeProfile(),
        "2027": makeProfile({ calendars: [], weeklyPlan: [0, 0, 0, 0, 1, 1, 1] }),
      },
    });
    const resolve = createDayResolver(state, [zurichFixture]);
    expect(resolve("2026-12-25")).toMatchObject({ holiday: 1, weekly: 0 }); // Friday, Christmas (2026 profile)
    expect(resolve("2027-01-01")).toMatchObject({ holiday: 0, weekly: 1 }); // Friday: no calendar, 4-day week
    expect(resolve("2026-04-03").weekly).toBe(0); // a Friday in 2026 is a working day
  });
```

In `src/core/stats.test.ts`:
- change the fixtures import to `import { makeProfile, makeState, zurichFixture } from "../test/fixtures";`
- replace every `, zurichFixture)` argument of `createDayResolver` with `, [zurichFixture])`
- add inside `describe("findStretches", …)`:

```ts
  test("REVIEW FOCUS: a break across the new year uses each year's own profile", () => {
    const leave = { "2026-12-28": 1, "2026-12-29": 1, "2026-12-30": 1, "2026-12-31": 1 } as const;
    const profiles = {
      "2026": makeProfile(),
      "2027": makeProfile({ weeklyPlan: [1, 0, 0, 0, 0, 1, 1] }), // Mondays off from 2027
    };
    const resolve = createDayResolver(makeState({ leave, profiles }), [zurichFixture]);
    expect(summary(findStretches(2026, resolve)).at(-1)).toBe("2026-12-25..2027-01-04 11d 4l");
  });
```

In `src/core/stats.real-data.test.ts` replace `createDayResolver(makeState(), enCh as unknown as CalendarFile)` with `createDayResolver(makeState(), [enCh as unknown as CalendarFile])`.

In `src/ui/YearGrid.test.tsx` replace `createDayResolver(makeState(stateOverrides), zurichFixture)` with `createDayResolver(makeState(stateOverrides), [zurichFixture])`.

In `src/ui/useYearModel.test.ts` replace `useYearModel(state, zurichFixture, 2026)` with `useYearModel(state, [zurichFixture], 2026)`.

Run: `npx vitest run src/core src/ui/YearGrid.test.tsx src/ui/useYearModel.test.ts`
Expected: FAIL in `days`, `stats`, `stats.real-data`, `YearGrid`, `useYearModel` (old resolver reads `state.weeklyPlan` / `state.calendar`).

- [ ] **Step 6: Implement the resolver and the year model**

In `src/core/days.ts` change the imports to:

```ts
import { weekday, yearOf } from "./dates";
import { holidayFractions, resolveYearHolidays } from "./holidays";
import { profileFor } from "./profiles";
import type { AppState, CalendarFile, DayInfo, Fraction, WeeklyPlan } from "./types";
```

and replace `createDayResolver` with:

```ts
/** Returns a function that computes DayInfo for any date, using the profile of that date's year. */
export function createDayResolver(state: Pick<AppState, "profiles" | "leave">, calendars: CalendarFile[]): DayResolver {
  const years = new Map<number, { fractions: ReturnType<typeof holidayFractions>; weeklyPlan: WeeklyPlan }>();
  const days = new Map<string, DayInfo>();
  return (date) => {
    const cached = days.get(date);
    if (cached) return cached;
    const year = yearOf(date);
    let entry = years.get(year);
    if (!entry) {
      const profile = profileFor(state.profiles, year);
      entry = { fractions: holidayFractions(resolveYearHolidays(profile, calendars, year)), weeklyPlan: profile.weeklyPlan };
      years.set(year, entry);
    }
    const info = computeDay(date, entry.fractions.get(date), entry.weeklyPlan, state.leave);
    days.set(date, info);
    return info;
  };
}
```

Replace `src/ui/useYearModel.ts` with:

```ts
import { useMemo } from "react";
import { createDayResolver } from "../core/days";
import { resolveYearHolidays } from "../core/holidays";
import { profileFor } from "../core/profiles";
import { findStretches, leaveUsed } from "../core/stats";
import type { AppState, CalendarFile } from "../core/types";

export function useYearModel(state: AppState, calendars: CalendarFile[], year: number) {
  return useMemo(() => {
    const resolve = createDayResolver(state, calendars);
    return {
      resolve,
      holidays: resolveYearHolidays(profileFor(state.profiles, year), calendars, year),
      leaveTotal: leaveUsed(year, resolve),
      stretches: findStretches(year, resolve),
    };
  }, [state, calendars, year]);
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/core src/state src/ui/YearGrid.test.tsx src/ui/useYearModel.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core src/ui/useYearModel.ts src/ui/useYearModel.test.ts src/ui/YearGrid.test.tsx src/test/fixtures.ts
git commit -m "feat(core): merge several calendars per year and resolve days by year profile (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 4: Accent-insensitive search and loading several calendars

**Files:**
- Modify: `src/data/calendars.ts` (add `foldText`, `matchesQuery`)
- Modify: `src/data/hooks.ts` (add `useCalendars`; leave `useCalendar` in place — Task 9 removes it)
- Test: `src/data/calendars.test.ts` (add tests), `src/data/hooks.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export function foldText(text: string): string;
  export function matchesQuery(text: string, query: string): boolean; // blank query matches everything
  export function useCalendars(ids: readonly string[]): {
    calendars: CalendarFile[]; // loaded files of `ids`, sorted by id, duplicates ignored
    failed: string[];          // ids that failed to load (empty while loading)
    loading: boolean;          // true while the current id set is loading
    retry(): void;
  };
  ```

- [ ] **Step 1: Write the failing tests**

In `src/data/calendars.test.ts` add `matchesQuery` to the import list from `./calendars` and append:

```ts
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
```

Create `src/data/hooks.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data`
Expected: FAIL — `matchesQuery` / `useCalendars` are not exported.

- [ ] **Step 3: Implement**

Append to `src/data/calendars.ts`:

```ts
/** Lower case without accents, so "ελλαδα" finds "Ελλάδα" and "zurich" finds "Zürich". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** True when `text` contains `query`, ignoring case and accents; a blank query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const q = foldText(query.trim());
  return q === "" || foldText(text).includes(q);
}
```

In `src/data/hooks.ts` change the React import to `import { useEffect, useMemo, useState } from "react";` and append:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/data`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat(data): load several calendars and search without accents (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 5: Shared dialog shell; Settings without calendar options

**Files:**
- Create: `src/ui/Dialog.tsx`
- Modify: `src/ui/SettingsDialog.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/el.json` (remove keys)
- Test: `src/ui/Dialog.test.tsx` (new), `src/ui/SettingsDialog.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function Dialog(props: { open: boolean; onClose(): void; labelledBy: string; className?: string; children: ReactNode }): JSX.Element | null;
  // focus moves in on open; Tab/Shift+Tab wrap; Escape and backdrop click call onClose and restore focus;
  // focus is also restored when `open` turns false or the dialog unmounts.
  export function SettingsDialog(props: { open: boolean; onClose(): void; state: AppState; dispatch: Dispatch<Action> }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/ui/Dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  test("renders nothing when closed", () => {
    render(<Dialog open={false} onClose={() => {}} labelledBy="t"><h2 id="t">Title</h2></Dialog>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("labelled by its heading; backdrop click closes, clicks inside do not", () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} labelledBy="t" className="picker"><h2 id="t">Title</h2><button>Inside</button></Dialog>);
    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog).toHaveClass("dialog", "picker");
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape calls the latest onClose", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open onClose={first} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    rerender(<Dialog open onClose={second} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  test("closing by the parent restores focus to the opener", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Dialog open onClose={() => {}} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    expect(document.activeElement).toHaveTextContent("x");
    rerender(<Dialog open={false} onClose={() => {}} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
```

In `src/ui/SettingsDialog.test.tsx`:
- remove the `INDEX` constant and the `zurichFixture`, `CalendarIndexEntry` imports; keep `makeState`.
- change every render to `<SettingsDialog open onClose={onClose} state={state} dispatch={dispatch} />` (in `setup`), `<SettingsDialog open={false} onClose={() => {}} state={makeState()} dispatch={() => {}} />` (closed test) and `<SettingsDialog open onClose={onClose} state={makeState()} dispatch={() => {}} />` (focus test).
- delete these tests: "search filters calendars and choosing one dispatches setCalendar", "changing calendar with existing rules asks for confirmation", "regions and observances", "F3: stale regions from a previous calendar stay visible until unchecked".
- in "REVIEW FOCUS: importing a newer version is refused" change `version: 2` to `version: 3`.
- add:

```tsx
  test("has no calendar options any more", () => {
    setup();
    expect(screen.queryByText("Holiday calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("Regions")).not.toBeInTheDocument();
    expect(screen.queryByText("Treat observances as holidays")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/Dialog.test.tsx src/ui/SettingsDialog.test.tsx`
Expected: FAIL — `./Dialog` missing; Settings still shows calendar options.

- [ ] **Step 3: Implement `Dialog`**

Create `src/ui/Dialog.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose(): void;
  labelledBy: string; // id of the element that names the dialog
  className?: string;
  children: ReactNode;
}

/** Modal shell: focus moves in on open and back to the opener on close; Tab stays inside; Escape and a backdrop click close. */
export function Dialog({ open, onClose, labelledBy, className, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleClose = () => {
    previousFocus.current?.focus();
    onCloseRef.current();
  };

  // Move focus into the dialog when it opens; give it back to the opener when it closes.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialog)?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);

  // Escape closes from anywhere on the page while open; Tab/Shift+Tab stay inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div
        className={className ? `dialog ${className}` : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Slim down `SettingsDialog`**

Replace `src/ui/SettingsDialog.tsx` with:

```tsx
import { useState, type Dispatch } from "react";
import { todayIso } from "../core/dates";
import type { AppState, Theme } from "../core/types";
import { LANGUAGE_NAMES, SUPPORTED_LANGS, type MessageKey } from "../i18n";
import { useI18n } from "../i18n/I18nProvider";
import { downloadText, exportStateJson } from "../state/exportImport";
import type { Action } from "../state/reducer";
import { parseStateText } from "../state/schema";
import { Dialog } from "./Dialog";

interface Props {
  open: boolean;
  onClose(): void;
  state: AppState;
  dispatch: Dispatch<Action>;
}

export function SettingsDialog({ open, onClose, state, dispatch }: Props) {
  const { t } = useI18n();
  const [importError, setImportError] = useState<string | null>(null);

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
    <Dialog open={open} onClose={onClose} labelledBy="settings-title">
      <h2 id="settings-title">{t("settings.title")}</h2>

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
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const input = e.target;
              void importFile(input.files?.[0]).finally(() => {
                input.value = "";
              });
            }}
          />
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
    </Dialog>
  );
}
```

- [ ] **Step 5: Remove the unused messages**

Delete these keys from **both** `src/i18n/en.json` and `src/i18n/el.json`: `settings.calendar`, `settings.search`, `settings.regions`, `settings.regionsHint`, `settings.observances`, `confirm.changeCalendar`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/Dialog.test.tsx src/ui/SettingsDialog.test.tsx src/i18n`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Dialog.tsx src/ui/Dialog.test.tsx src/ui/SettingsDialog.tsx src/ui/SettingsDialog.test.tsx src/i18n
git commit -m "refactor(ui): extract the dialog shell and drop calendar options from settings (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 6: Calendar picker dialog

**Files:**
- Create: `src/ui/CalendarPickerDialog.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/el.json` (add `picker.*`)
- Modify: `src/styles.css`
- Test: `src/ui/CalendarPickerDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog` (Task 5), `useCalendars`, `matchesQuery` (Task 4), `calendarRegions` (existing), `SelectedCalendar` (Task 1).
- Produces:
  ```ts
  export interface CalendarChoice { calendars: SelectedCalendar[]; includeObservances: boolean }
  export interface CalendarPickerProps {
    open: boolean;
    year: number;          // shown in the title: "from {year} onwards"
    firstRun: boolean;     // first-run title, "Continue", no "Cancel"; Escape/×/backdrop save
    index: CalendarIndexEntry[] | null;
    initial: CalendarChoice; // read once, when the dialog opens
    onSave(choice: CalendarChoice): void; // unknown ids and stale regions removed, regions sorted
    onClose(): void;
  }
  export function CalendarPickerDialog(props: CalendarPickerProps): JSX.Element | null;
  ```

- [ ] **Step 1: Add the messages**

Add to `src/i18n/en.json`:

```json
  "picker.title": "Holiday calendars · from {year} onwards",
  "picker.firstRunTitle": "Please choose your holiday calendars",
  "picker.search": "Search calendars…",
  "picker.loading": "Loading calendars…",
  "picker.loadingRegions": "Loading regions…",
  "picker.regionsFor": "Regions · {name}",
  "picker.regionsHint": "Nothing selected = national holidays only.",
  "picker.searchRegions": "Search regions…",
  "picker.selectAll": "Select all",
  "picker.observances": "Treat observances as holidays",
  "picker.save": "Save",
  "picker.cancel": "Cancel",
  "picker.continue": "Continue",
  "picker.close": "Close",
```

Add to `src/i18n/el.json`:

```json
  "picker.title": "Ημερολόγια αργιών · ισχύουν από το {year} και μετά",
  "picker.firstRunTitle": "Παρακαλώ επιλέξτε ημερολόγια",
  "picker.search": "Αναζήτηση ημερολογίου…",
  "picker.loading": "Φόρτωση ημερολογίων…",
  "picker.loadingRegions": "Φόρτωση περιοχών…",
  "picker.regionsFor": "Περιοχές · {name}",
  "picker.regionsHint": "Χωρίς επιλογή = μόνο οι εθνικές αργίες.",
  "picker.searchRegions": "Αναζήτηση περιοχής…",
  "picker.selectAll": "Επιλογή όλων",
  "picker.observances": "Οι εορτές να μετράνε ως αργίες",
  "picker.save": "Αποθήκευση",
  "picker.cancel": "Άκυρο",
  "picker.continue": "Συνέχεια",
  "picker.close": "Κλείσιμο",
```

- [ ] **Step 2: Write the failing test**

Create `src/ui/CalendarPickerDialog.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarPickerDialog, type CalendarPickerProps } from "./CalendarPickerDialog";
import { clearCalendarCache } from "../data/calendars";
import { christianFixture, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 0 },
  { id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 },
];
const FILES: Record<string, unknown> = { "en.ch": zurichFixture, "en.christian": christianFixture };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const id = url.split("/").pop()!.replace(".json", "");
    return FILES[id] ? { ok: true, status: 200, json: async () => FILES[id] } : { ok: false, status: 404, json: async () => ({}) };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCalendarCache();
});

function setup(props: Partial<CalendarPickerProps> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(
    <CalendarPickerDialog
      open
      year={2026}
      firstRun={false}
      index={INDEX}
      initial={{ calendars: [{ id: "en.ch", regions: ["Zurich"] }], includeObservances: false }}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose };
}

const listNames = () =>
  within(screen.getByRole("list")).getAllByRole("checkbox").map((cb) => cb.closest("label")!.textContent!.trim());
const swissRegions = () => screen.findByRole("group", { name: "Regions · Holidays in Switzerland" });

describe("CalendarPickerDialog", () => {
  test("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("title names the year; chosen calendars first, then the rest by name", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" })).toBeInTheDocument();
    expect(listNames()).toEqual(["Holidays in Switzerland", "Christian Holidays", "Διακοπές στην Ελλάδα"]);
  });

  test("the order does not jump while checking", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    expect(listNames()).toEqual(["Holidays in Switzerland", "Christian Holidays", "Διακοπές στην Ελλάδα"]);
  });

  test("search ignores case and accents", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search calendars…" }), "ελλαδα");
    expect(listNames()).toEqual(["Διακοπές στην Ελλάδα"]);
  });

  test("shows a loading text until the index is there", () => {
    setup({ index: null });
    expect(screen.getByText("Loading calendars…")).toBeInTheDocument();
  });

  test("regions: select all is tri-state and follows the region search", async () => {
    const { onSave } = setup();
    const group = await swissRegions();
    const selectAll = within(group).getByLabelText("Select all") as HTMLInputElement;
    expect(within(group).getByLabelText("Zurich")).toBeChecked();
    expect(selectAll.indeterminate).toBe(true);

    await userEvent.click(selectAll);
    expect(within(group).getByLabelText("Bern")).toBeChecked();
    expect(within(group).getByLabelText("Lucerne")).toBeChecked();
    expect(selectAll.indeterminate).toBe(false);

    await userEvent.type(within(group).getByRole("searchbox"), "luc");
    expect(within(group).queryByLabelText("Bern")).not.toBeInTheDocument();
    await userEvent.click(selectAll); // all visible are checked → unchecks only Lucerne
    await userEvent.clear(within(group).getByRole("searchbox"));
    expect(within(group).getByLabelText("Lucerne")).not.toBeChecked();
    expect(within(group).getByLabelText("Bern")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      calendars: [{ id: "en.ch", regions: ["Bern", "Zurich"] }],
      includeObservances: false,
    });
  });

  test("checking adds a calendar; unchecking removes it with its regions", async () => {
    const { onSave } = setup();
    await swissRegions();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    await userEvent.click(screen.getByLabelText("Holidays in Switzerland"));
    expect(screen.queryByRole("group", { name: "Regions · Holidays in Switzerland" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "en.christian", regions: [] }], includeObservances: false });
  });

  test("observances are part of the choice", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByLabelText("Treat observances as holidays"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ includeObservances: true }));
  });

  test("saving with nothing checked is allowed", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByLabelText("Holidays in Switzerland"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ calendars: [], includeObservances: false });
  });

  test("Cancel, × and Escape discard the draft", async () => {
    const { onSave, onClose } = setup();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("first run: own title, Continue, no Cancel, and Escape saves the checked calendars", async () => {
    const { onSave, onClose } = setup({
      firstRun: true,
      initial: { calendars: [{ id: "el.greek", regions: [] }], includeObservances: false },
    });
    expect(screen.getByRole("dialog", { name: "Please choose your holiday calendars" })).toBeInTheDocument();
    expect(screen.getByLabelText("Διακοπές στην Ελλάδα")).toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "el.greek", regions: [] }], includeObservances: false });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("REVIEW FOCUS: an unknown calendar id and a stale region are dropped on save", async () => {
    const { onSave } = setup({
      initial: {
        calendars: [{ id: "en.ch", regions: ["Geneva", "Zurich"] }, { id: "en.gone", regions: [] }],
        includeObservances: false,
      },
    });
    await swissRegions();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "en.ch", regions: ["Zurich"] }], includeObservances: false }),
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/ui/CalendarPickerDialog.test.tsx`
Expected: FAIL — cannot resolve `./CalendarPickerDialog`.

- [ ] **Step 4: Implement**

Create `src/ui/CalendarPickerDialog.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarIndexEntry, SelectedCalendar } from "../core/types";
import { calendarRegions, matchesQuery } from "../data/calendars";
import { useCalendars } from "../data/hooks";
import { useI18n } from "../i18n/I18nProvider";
import { Dialog } from "./Dialog";

export interface CalendarChoice {
  calendars: SelectedCalendar[];
  includeObservances: boolean;
}

export interface CalendarPickerProps {
  open: boolean;
  year: number;
  firstRun: boolean;
  index: CalendarIndexEntry[] | null;
  initial: CalendarChoice;
  onSave(choice: CalendarChoice): void;
  onClose(): void;
}

export function CalendarPickerDialog(props: CalendarPickerProps) {
  // Mounting the body on open gives every opening a fresh draft taken from `initial`.
  return props.open ? <PickerBody {...props} /> : null;
}

function PickerBody({ year, firstRun, index, initial, onSave, onClose }: CalendarPickerProps) {
  const { t, lang } = useI18n();
  const [draft, setDraft] = useState<CalendarChoice>(initial);
  const [query, setQuery] = useState("");
  const [initialIds] = useState(() => new Set(initial.calendars.map((c) => c.id)));
  const files = useCalendars(draft.calendars.map((c) => c.id));

  // Fixed while the dialog is open (so rows never jump): chosen calendars first, then the rest by name.
  const ordered = useMemo(() => {
    const collator = new Intl.Collator(lang);
    const byName = [...(index ?? [])].sort((a, b) => collator.compare(a.name, b.name));
    return [...byName.filter((c) => initialIds.has(c.id)), ...byName.filter((c) => !initialIds.has(c.id))];
  }, [index, lang, initialIds]);
  const visible = ordered.filter((c) => matchesQuery(c.name, query));

  const isChecked = (id: string) => draft.calendars.some((c) => c.id === id);
  const toggleCalendar = (id: string) =>
    setDraft((d) => ({
      ...d,
      calendars: d.calendars.some((c) => c.id === id)
        ? d.calendars.filter((c) => c.id !== id)
        : [...d.calendars, { id, regions: [] }],
    }));
  const setRegions = (id: string, regions: string[]) =>
    setDraft((d) => ({ ...d, calendars: d.calendars.map((c) => (c.id === id ? { ...c, regions } : c)) }));

  /** Drops ids missing from the index and regions missing from their (loaded) calendar. */
  const cleaned = (): CalendarChoice => {
    const known = index ? new Set(index.map((c) => c.id)) : null;
    const calendars = draft.calendars
      .filter((c) => !known || known.has(c.id))
      .map((c) => {
        const file = files.calendars.find((f) => f.id === c.id);
        const available = file ? calendarRegions(file) : null;
        return { ...c, regions: c.regions.filter((r) => !available || available.includes(r)).sort() };
      });
    return { ...draft, calendars };
  };

  const save = () => onSave(cleaned());
  const close = firstRun ? save : onClose;

  return (
    <Dialog open onClose={close} labelledBy="picker-title" className="picker">
      <h2 id="picker-title">{firstRun ? t("picker.firstRunTitle") : t("picker.title", { year: String(year) })}</h2>
      <input
        type="search"
        aria-label={t("picker.search")}
        placeholder={t("picker.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {index === null ? (
        <p className="muted">{t("picker.loading")}</p>
      ) : (
        <ul className="picker-list">
          {visible.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={isChecked(c.id)} onChange={() => toggleCalendar(c.id)} /> {c.name}
              </label>
            </li>
          ))}
        </ul>
      )}

      {draft.calendars.map((selected) => {
        const file = files.calendars.find((f) => f.id === selected.id);
        if (!file) {
          return files.loading ? (
            <p key={selected.id} className="muted">
              {t("picker.loadingRegions")}
            </p>
          ) : null;
        }
        const regions = calendarRegions(file);
        if (regions.length === 0) return null;
        const name = index?.find((c) => c.id === selected.id)?.name ?? file.name;
        return (
          <RegionGroup
            key={selected.id}
            name={name}
            regions={regions}
            selected={selected.regions}
            onChange={(next) => setRegions(selected.id, next)}
          />
        );
      })}

      <label>
        <input
          type="checkbox"
          checked={draft.includeObservances}
          onChange={(e) => setDraft((d) => ({ ...d, includeObservances: e.target.checked }))}
        />{" "}
        {t("picker.observances")}
      </label>

      <div className="dialog-footer">
        {!firstRun && (
          <button type="button" onClick={onClose}>
            {t("picker.cancel")}
          </button>
        )}
        <button type="button" className="primary" onClick={save}>
          {firstRun ? t("picker.continue") : t("picker.save")}
        </button>
      </div>
      <button type="button" className="dialog-close" aria-label={t("picker.close")} onClick={close}>
        ×
      </button>
    </Dialog>
  );
}

interface RegionGroupProps {
  name: string;
  regions: string[];
  selected: string[];
  onChange(regions: string[]): void;
}

function RegionGroup({ name, regions, selected, onChange }: RegionGroupProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visible = regions.filter((r) => matchesQuery(r, query));
  const chosen = visible.filter((r) => selected.includes(r)).length;
  const all = visible.length > 0 && chosen === visible.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = chosen > 0 && !all;
  }, [chosen, all]);

  const toggle = (region: string) =>
    onChange(selected.includes(region) ? selected.filter((r) => r !== region) : [...selected, region]);
  // "Select all" acts on the regions that match the current search only.
  const toggleAll = () =>
    onChange(all ? selected.filter((r) => !visible.includes(r)) : [...new Set([...selected, ...visible])]);

  return (
    <fieldset>
      <legend>{t("picker.regionsFor", { name })}</legend>
      <p className="muted">{t("picker.regionsHint")}</p>
      <div className="region-tools">
        <input
          type="search"
          aria-label={`${t("picker.searchRegions")} (${name})`}
          placeholder={t("picker.searchRegions")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input ref={selectAllRef} type="checkbox" checked={all} onChange={toggleAll} /> {t("picker.selectAll")}
        </label>
      </div>
      <div className="regions">
        {visible.map((region) => (
          <label key={region}>
            <input type="checkbox" checked={selected.includes(region)} onChange={() => toggle(region)} /> {region}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: Styles**

In `src/styles.css`, in the existing `.dialog { … }` rule add `position: relative;`. Then, right after the `.regions { … }` rule, add:

```css
.picker-list { list-style: none; margin: 0; padding: 6px; max-height: 40vh; overflow: auto; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border); border-radius: 10px; }
.region-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dialog-footer { position: sticky; bottom: -16px; display: flex; justify-content: flex-end; gap: 8px; padding: 8px 0; background: var(--surface); }
.dialog-footer button, .dialog-close { cursor: pointer; }
.dialog-footer .primary { background: var(--accent); color: var(--surface); border: none; border-radius: 8px; padding: 6px 14px; }
.dialog-close { position: absolute; top: 8px; right: 8px; border: none; background: none; font-size: 22px; line-height: 1; color: var(--muted); }
@media (max-width: 600px) {
  .dialog-backdrop:has(> .picker) { padding: 0; }
  .dialog.picker { width: 100%; height: 100dvh; max-height: none; border-radius: 0; }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/CalendarPickerDialog.test.tsx src/i18n`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/CalendarPickerDialog.tsx src/ui/CalendarPickerDialog.test.tsx src/i18n src/styles.css
git commit -m "feat(ui): add the multi-calendar picker with region selection (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 7: Calendars panel in the left column

**Files:**
- Create: `src/ui/CalendarsPanel.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/el.json` (add `calendars.*`)
- Modify: `src/styles.css`
- Test: `src/ui/CalendarsPanel.test.tsx`

**Interfaces:**
- Consumes: `profileFor`, `profileYearFor`, `Profiles` (Task 1), `calendarRegions` (existing).
- Produces:
  ```ts
  export interface CalendarsPanelProps {
    year: number;                     // the year on screen
    profiles: Profiles;
    index: CalendarIndexEntry[] | null;
    loaded: CalendarFile[];           // for hiding regions that no longer exist
    failed: string[];                 // ids that failed to load
    onEdit(): void;                   // opens the picker
    onRemoveProfile(year: number): void;
  }
  export function CalendarsPanel(props: CalendarsPanelProps): JSX.Element;
  ```
  Open/closed state is kept in `localStorage["los-feier.calendarsPanel.open"]` (`"1"`/`"0"`).

- [ ] **Step 1: Add the messages**

`src/i18n/en.json`:

```json
  "calendars.title": "Calendars ({n})",
  "calendars.none": "No calendar",
  "calendars.from": "from {year}",
  "calendars.edit": "Change",
  "calendars.choose": "Choose",
  "calendars.removeProfile": "Remove the {year} settings",
  "calendars.loadFailed": "could not be loaded",
  "calendars.unknown": "no longer available",
```

`src/i18n/el.json`:

```json
  "calendars.title": "Ημερολόγια ({n})",
  "calendars.none": "Κανένα ημερολόγιο",
  "calendars.from": "από {year}",
  "calendars.edit": "Αλλαγή",
  "calendars.choose": "Επιλογή",
  "calendars.removeProfile": "Κατάργηση ρυθμίσεων {year}",
  "calendars.loadFailed": "δεν φορτώθηκε",
  "calendars.unknown": "δεν είναι πια διαθέσιμο",
```

- [ ] **Step 2: Write the failing test**

Create `src/ui/CalendarsPanel.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CalendarsPanel, type CalendarsPanelProps } from "./CalendarsPanel";
import { makeProfile, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 },
];
const two = makeProfile({ calendars: [{ id: "en.ch", regions: ["Bern", "Zurich"] }, { id: "en.christian", regions: [] }] });

function setup(props: Partial<CalendarsPanelProps> = {}) {
  const onEdit = vi.fn();
  const onRemoveProfile = vi.fn();
  const view = renderWithI18n(
    <CalendarsPanel
      year={2026}
      profiles={{ "2026": two }}
      index={INDEX}
      loaded={[]}
      failed={[]}
      onEdit={onEdit}
      onRemoveProfile={onRemoveProfile}
      {...props}
    />,
  );
  return { onEdit, onRemoveProfile, ...view };
}

const toggle = (name: RegExp) => screen.getByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("CalendarsPanel", () => {
  test("collapsed by default; expanding lists calendars with regions and is remembered", async () => {
    const { unmount } = setup();
    const button = toggle(/Calendars \(2\) · from 2026/);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Christian Holidays")).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByText("Holidays in Switzerland — Bern, Zurich")).toBeInTheDocument();
    expect(screen.getByText("Christian Holidays")).toBeInTheDocument();
    unmount();

    setup();
    expect(toggle(/Calendars \(2\)/)).toHaveAttribute("aria-expanded", "true");
  });

  test("'from' names the configured year that covers the year on screen", () => {
    setup({ profiles: { "2024": two } });
    expect(toggle(/from 2024/)).toBeInTheDocument();
  });

  test("Change opens the picker", async () => {
    const { onEdit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onEdit).toHaveBeenCalled();
  });

  test("no calendars: 'No calendar' and 'Choose'", async () => {
    const { onEdit } = setup({ profiles: {} });
    expect(toggle(/No calendar/)).toBeInTheDocument();
    expect(screen.queryByText(/from/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(onEdit).toHaveBeenCalled();
  });

  test("remove shows only for a configured year that is not the only one", async () => {
    const { onRemoveProfile, unmount } = setup({ profiles: { "2020": two, "2026": two } });
    await userEvent.click(toggle(/Calendars/));
    await userEvent.click(screen.getByRole("button", { name: "Remove the 2026 settings" }));
    expect(onRemoveProfile).toHaveBeenCalledWith(2026);
    unmount();

    setup({ year: 2027, profiles: { "2020": two, "2026": two } }); // 2027 has no profile of its own
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  test("the only profile cannot be removed", async () => {
    setup();
    await userEvent.click(toggle(/Calendars/));
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  test("REVIEW FOCUS: failed and unknown calendars are marked; stale regions are hidden", async () => {
    const profile = makeProfile({
      calendars: [
        { id: "en.ch", regions: ["Geneva", "Zurich"] },
        { id: "en.christian", regions: [] },
        { id: "en.gone", regions: [] },
      ],
    });
    setup({ profiles: { "2026": profile }, loaded: [zurichFixture], failed: ["en.christian"] });
    await userEvent.click(toggle(/Calendars \(3\)/));
    expect(screen.getByText("Holidays in Switzerland — Zurich")).toBeInTheDocument();
    expect(screen.getByText("Christian Holidays").closest("li")).toHaveTextContent("could not be loaded");
    expect(screen.getByText("en.gone").closest("li")).toHaveTextContent("no longer available");
  });

  test("REVIEW FOCUS: blocked localStorage still lets the panel open and close", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup();
    await userEvent.click(toggle(/Calendars/));
    expect(toggle(/Calendars/)).toHaveAttribute("aria-expanded", "true");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/ui/CalendarsPanel.test.tsx`
Expected: FAIL — cannot resolve `./CalendarsPanel`.

- [ ] **Step 4: Implement**

Create `src/ui/CalendarsPanel.tsx`:

```tsx
import { useState } from "react";
import { profileFor, profileYearFor, type Profiles } from "../core/profiles";
import type { CalendarFile, CalendarIndexEntry } from "../core/types";
import { calendarRegions } from "../data/calendars";
import { useI18n } from "../i18n/I18nProvider";

const OPEN_KEY = "los-feier.calendarsPanel.open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Only a per-browser convenience; the panel works without it.
  }
}

export interface CalendarsPanelProps {
  year: number;
  profiles: Profiles;
  index: CalendarIndexEntry[] | null;
  loaded: CalendarFile[];
  failed: string[];
  onEdit(): void;
  onRemoveProfile(year: number): void;
}

export function CalendarsPanel({ year, profiles, index, loaded, failed, onEdit, onRemoveProfile }: CalendarsPanelProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const profile = profileFor(profiles, year);
  const from = profileYearFor(profiles, year);
  const empty = profile.calendars.length === 0;
  const canRemove = Object.hasOwn(profiles, String(year)) && Object.keys(profiles).length > 1;

  const toggle = () => {
    setOpen(!open);
    writeOpen(!open);
  };

  return (
    <section className="panel calendars-panel" aria-labelledby="calendars-title">
      <div className="panel-head">
        <h2 id="calendars-title">
          <button type="button" className="disclosure" aria-expanded={open} onClick={toggle}>
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
            {empty ? t("calendars.none") : t("calendars.title", { n: String(profile.calendars.length) })}
            {from !== null && <small> · {t("calendars.from", { year: String(from) })}</small>}
          </button>
        </h2>
        <button type="button" onClick={onEdit}>
          {empty ? t("calendars.choose") : t("calendars.edit")}
        </button>
      </div>
      {open && (
        <>
          <ul>
            {profile.calendars.map((c) => {
              const entry = index?.find((e) => e.id === c.id);
              const file = loaded.find((f) => f.id === c.id);
              // Regions the loaded calendar no longer has are not shown (they are dropped on the next save).
              const regions = file ? c.regions.filter((r) => calendarRegions(file).includes(r)) : c.regions;
              return (
                <li key={c.id}>
                  <span>{[entry?.name ?? c.id, regions.join(", ")].filter(Boolean).join(" — ")}</span>
                  {index && !entry && <small className="error-text"> · {t("calendars.unknown")}</small>}
                  {failed.includes(c.id) && <small className="error-text"> · {t("calendars.loadFailed")}</small>}
                </li>
              );
            })}
          </ul>
          {canRemove && (
            <button type="button" onClick={() => onRemoveProfile(year)}>
              {t("calendars.removeProfile", { year: String(year) })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Styles**

Append to the panel section of `src/styles.css` (after the `.panel ul { … }` rule):

```css
.panel-stack { display: flex; flex-direction: column; gap: 16px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.panel-head > button { border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 2px 10px; cursor: pointer; }
.disclosure { border: none; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.disclosure small { color: var(--muted); font-weight: normal; }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/CalendarsPanel.test.tsx src/i18n`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/CalendarsPanel.tsx src/ui/CalendarsPanel.test.tsx src/i18n src/styles.css
git commit -m "feat(ui): add the collapsible calendars panel with per-year settings (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 8: Holiday list without the scope choice

**Files:**
- Modify: `src/ui/HolidayListPanel.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/el.json` (remove keys)
- Modify: `src/styles.css` (`.holiday` grid)
- Test: `src/ui/HolidayListPanel.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `Action` (Task 2), `ResolvedHoliday.calendarIds` (Task 3).
- Produces:
  ```ts
  interface Props {
    year: number;
    holidays: ResolvedHoliday[];
    profile: YearProfile;                    // the profile that applies to `year`
    calendarNames: Record<string, string>;   // calendar id -> display name
    dispatch: Dispatch<Action>;
  }
  export function HolidayListPanel(props: Props): JSX.Element;
  ```
  Every action it dispatches carries `year`.

- [ ] **Step 1: Write the failing test**

Replace `src/ui/HolidayListPanel.test.tsx` with:

```tsx
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HolidayListPanel } from "./HolidayListPanel";
import { resolveYearHolidays } from "../core/holidays";
import { christianFixture, makeProfile, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarFile, YearProfile } from "../core/types";

const NAMES = { "en.ch": "Holidays in Switzerland", "en.christian": "Christian Holidays" };

function setup(profile: YearProfile = makeProfile(), calendars: CalendarFile[] = [zurichFixture]) {
  const dispatch = vi.fn();
  renderWithI18n(
    <HolidayListPanel
      year={2026}
      holidays={resolveYearHolidays(profile, calendars, 2026)}
      profile={profile}
      calendarNames={NAMES}
      dispatch={dispatch}
    />,
  );
  return dispatch;
}

const row = (name: string, index = 0) => screen.getAllByText(name)[index].closest("li")!;

describe("HolidayListPanel", () => {
  test("lists visible holidays including observances, without a scope choice", () => {
    setup();
    expect(screen.getByText("Good Friday")).toBeInTheDocument();
    expect(screen.getAllByText("Knabenschiessen (Zurich)")).toHaveLength(3);
    expect(screen.queryByText("Saint Joseph's Day")).not.toBeInTheDocument();
    expect(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("enabling an observance writes a rule for the year on screen", async () => {
    const dispatch = setup();
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", year: 2026, name: "Knabenschiessen (Zurich)", rule: { enabled: true },
    });
  });

  test("making a holiday half keeps the existing rule fields", async () => {
    const dispatch = setup(makeProfile({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true } } }));
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", year: 2026, name: "Knabenschiessen (Zurich)", rule: { enabled: true, fraction: 0.5 },
    });
  });

  test("custom holiday: checkbox writes a rule, ½ edits it, × deletes it", async () => {
    const dispatch = setup(
      makeProfile({ customHolidays: [{ id: "c1", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }] }),
    );
    const r = row("Company day");
    await userEvent.click(within(r).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", year: 2026, name: "Company day", rule: { enabled: false } });
    await userEvent.click(within(r).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "updateCustomHoliday", year: 2026, id: "c1", changes: { fraction: 0.5 } });
    await userEvent.click(within(r).getByRole("button", { name: /Delete/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "removeCustomHoliday", year: 2026, id: "c1" });
  });

  test("with several calendars each holiday names its calendars", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }] });
    setup(profile, [zurichFixture, christianFixture]);
    expect(row("Good Friday")).toHaveTextContent("Holidays in Switzerland, Christian Holidays");
    expect(row("Christmas Eve")).toHaveTextContent("Christian Holidays");
  });

  test("with one calendar no calendar names are shown", () => {
    setup();
    expect(row("Good Friday")).not.toHaveTextContent("Holidays in Switzerland");
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
      year: 2026,
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

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/HolidayListPanel.test.tsx`
Expected: FAIL (scope combobox present; old action shapes).

- [ ] **Step 3: Implement**

Replace `src/ui/HolidayListPanel.tsx` with:

```tsx
import { useState, type Dispatch } from "react";
import type { HolidayRule, ResolvedHoliday, YearProfile } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";
import type { Action } from "../state/reducer";
import { CustomHolidayForm } from "./CustomHolidayForm";

interface Props {
  year: number;
  holidays: ResolvedHoliday[];
  profile: YearProfile;
  calendarNames: Record<string, string>;
  dispatch: Dispatch<Action>;
}

export function HolidayListPanel({ year, holidays, profile, calendarNames, dispatch }: Props) {
  const { t, formatDate } = useI18n();
  const [adding, setAdding] = useState(false);
  const showSources = profile.calendars.length > 1;

  const setRule = (h: ResolvedHoliday, change: HolidayRule) => {
    const current = Object.hasOwn(profile.holidayRules, h.name) ? profile.holidayRules[h.name] : {};
    dispatch({ type: "setHolidayRule", year, name: h.name, rule: { ...current, ...change } });
  };

  const toggleFraction = (h: ResolvedHoliday) => {
    const fraction = h.fraction === 1 ? 0.5 : 1;
    if (h.source === "custom" && h.customId) {
      dispatch({ type: "updateCustomHoliday", year, id: h.customId, changes: { fraction } });
    } else {
      setRule(h, { fraction });
    }
  };

  return (
    <section className="panel" aria-labelledby="holidays-title">
      <h2 id="holidays-title">{t("holidays.title", { year: String(year) })}</h2>
      {holidays.length === 0 && <p className="muted">{t("holidays.empty")}</p>}
      <ul>
        {holidays.map((h) => (
          <li key={`${h.date}|${h.name}`} className="holiday" data-enabled={h.enabled}>
            <input
              type="checkbox"
              checked={h.enabled}
              aria-label={`${t("holidays.enabled")}: ${h.name}`}
              onChange={(e) => setRule(h, { enabled: e.target.checked })}
            />
            <span>{formatDate(h.date, "short")}</span>
            <span>
              <span className="holiday-name">{h.name}</span>
              {h.type === "observance" && <small> · {t("holidays.observance")}</small>}
              {h.tentative && <small> · {t("holidays.tentative")}</small>}
              {showSources && h.calendarIds.length > 0 && (
                <small> · {h.calendarIds.map((id) => calendarNames[id] ?? id).join(", ")}</small>
              )}
            </span>
            <button
              type="button"
              className="fraction"
              aria-label={`${h.name}: ${h.fraction === 1 ? t("holidays.makeHalf") : t("holidays.makeFull")}`}
              onClick={() => toggleFraction(h)}
            >
              {h.fraction === 1 ? "1" : "½"}
            </button>
            {h.source === "custom" && h.customId ? (
              <button
                type="button"
                aria-label={`${t("holidays.delete")}: ${h.name}`}
                onClick={() => dispatch({ type: "removeCustomHoliday", year, id: h.customId! })}
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <CustomHolidayForm
          year={year}
          onSave={(holiday) => {
            dispatch({ type: "addCustomHoliday", year, holiday });
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

In `src/styles.css` change the `.holiday` rule's `grid-template-columns: auto 4.5em 1fr auto auto auto;` to `grid-template-columns: auto 4.5em 1fr auto auto;`, and change `.fraction, .badge, .holiday button` to `.fraction, .holiday button`.

Delete from **both** `src/i18n/en.json` and `src/i18n/el.json`: `holidays.scope`, `holidays.scopeAll`, `holidays.scopeYear`, `holidays.thisYearBadge`, `holidays.resetYear`, `holidays.customAllYearsHint`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/HolidayListPanel.test.tsx src/i18n`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/HolidayListPanel.tsx src/ui/HolidayListPanel.test.tsx src/i18n src/styles.css
git commit -m "feat(ui): holiday changes apply to the year's profile, no scope choice (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 9: Wire it together — layout, first run, banners

**Files:**
- Modify: `src/ui/Layout.tsx`
- Modify: `src/data/hooks.ts` (delete `useCalendar`)
- Modify: `src/i18n/en.json`, `src/i18n/el.json`
- Modify: `src/styles.css` (remove `.calendar-button`)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: everything above — `profileFor`, `calendarIdsFor` (Task 1); `useCalendars` (Task 4); `SettingsDialog` (Task 5); `CalendarPickerDialog`, `CalendarChoice` (Task 6); `CalendarsPanel` (Task 7); `HolidayListPanel` (Task 8); `useYearModel(state, calendars, year)` (Task 3).
- Produces: the finished app; no new exports.

- [ ] **Step 1: Write the failing app tests**

In `src/App.test.tsx`:
- add `{ id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 }` and `{ id: "en.long", name: "Long Calendar", lang: "en", from: 2021, to: 2031, count: 0 }` to `INDEX`; in `stubFetch` also answer `en.christian.json` with `christianFixture` and `en.long.json` with `longFixture`, where (at the top of the file) `const longFixture = makeCalendar("en.long", "Long Calendar", [], 2021, 2031);` — import `christianFixture` and `makeCalendar` from `./test/fixtures`.
- replace the two first-run tests ("first run picks a calendar from the browser language" and "first run without a suggestion opens the settings") with:

```tsx
  test("first run asks for calendars with the browser-language suggestion checked", async () => {
    stubFetch();
    setLanguages(["de-CH"]);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: "Please choose your holiday calendars" });
    expect(within(dialog).getByLabelText("Holidays in Switzerland")).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const thisYear = String(new Date().getFullYear());
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[thisYear].calendars).toEqual([{ id: "en.ch", regions: [] }]),
    );
  });

  test("REVIEW FOCUS: first run without a suggestion, closed with Escape, saves an empty profile and does not reopen", async () => {
    stubFetch();
    setLanguages(["xx"]);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: "Please choose your holiday calendars" });
    expect(within(dialog).getAllByRole("checkbox").filter((cb) => (cb as HTMLInputElement).checked)).toEqual([]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const thisYear = String(new Date().getFullYear());
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[thisYear].calendars).toEqual([]));
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2026-04-07"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
  });

  test("a change in another year creates that year's settings, which can be removed", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Counts as holiday: New Year's Day" }));
    const stored = () => Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles).sort();
    await waitFor(() => expect(stored()).toEqual(["2020", "2027"]));
    expect(screen.getByRole("button", { name: /Calendars \(1\) · from 2027/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous year" }));
    expect(screen.getByRole("button", { name: /from 2020/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Counts as holiday: New Year's Day" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    await userEvent.click(screen.getByRole("button", { name: /Calendars \(1\)/ }));
    await userEvent.click(screen.getByRole("button", { name: "Remove the 2027 settings" }));
    await waitFor(() => expect(stored()).toEqual(["2020"]));
    expect(screen.getByRole("checkbox", { name: "Counts as holiday: New Year's Day" })).toBeChecked();
  });

  test("Change opens the picker for the year on screen and saves a second calendar", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const dialog = screen.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" });
    await userEvent.click(within(dialog).getByLabelText("Christian Holidays"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles["2026"].calendars).toEqual([
        { id: "en.ch", regions: ["Zurich"] },
        { id: "en.christian", regions: [] },
      ]),
    );
    expect(await screen.findByText("Christmas Eve")).toBeInTheDocument();
  });

  test("a year where only some calendars have data names the missing ones", async () => {
    stubFetch();
    seed({ calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.long", regions: [] }] });
    window.location.hash = "#2028";
    render(<App />);
    // zurichFixture ends in 2027, the "Long Calendar" fixture runs to 2031:
    expect(await screen.findByText("There is no 2028 holiday data for: Holidays in Switzerland.")).toBeInTheDocument();
    expect(screen.queryByText(/There is no holiday data for 2028/)).not.toBeInTheDocument();
  });
```

- in "calendar load failure shows retry" change `seed({ calendar: { id: "el.greek", regions: [], includeObservances: false } })` to `seed({ calendars: [{ id: "el.greek", regions: [] }] })`.
- delete the test "F3: header omits a stale region no longer present in the loaded calendar" (covered by `CalendarsPanel.test.tsx`).
- add `within` and `fireEvent` to the `@testing-library/react` import.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL (Layout still uses `state.calendar`).

- [ ] **Step 3: Rewrite the layout**

In `src/ui/Layout.tsx`:

Replace the imports with:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { datesBetween, todayIso } from "../core/dates";
import { calendarIdsFor, profileFor } from "../core/profiles";
import { hasDataForYear, suggestCalendarId } from "../data/calendars";
import { useCalendarIndex, useCalendars } from "../data/hooks";
import { useI18n } from "../i18n/I18nProvider";
import { downloadText } from "../state/exportImport";
import { useStore } from "../state/StoreProvider";
import { CalendarPickerDialog, type CalendarChoice } from "./CalendarPickerDialog";
import { CalendarsPanel } from "./CalendarsPanel";
import { HolidayListPanel } from "./HolidayListPanel";
import { SettingsDialog } from "./SettingsDialog";
import { SummaryPanel } from "./SummaryPanel";
import { useYearModel } from "./useYearModel";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { YearGrid } from "./YearGrid";
```

Inside `Layout`:
- delete the `firstRunName` state, the `const cal = useCalendar(...)` line, the whole first-run `useEffect` (the one calling `suggestCalendarId`), and the `calendarName` / `visibleRegions` / `calendarLabel` / `loadFailed` / `noData` constants.
- add `const [pickerOpen, setPickerOpen] = useState(false);` next to the other `useState`s.
- replace `const model = useYearModel(state, cal.calendar, year);` with:

```tsx
  const profile = profileFor(state.profiles, year);
  // Neighbouring years too: breaks that cross New Year read the other year's holidays.
  const cals = useCalendars(calendarIdsFor(state.profiles, [year - 1, year, year + 1]));
  const model = useYearModel(state, cals.calendars, year);
```

- after the `highlightDays` memo add:

```tsx
  const firstRun = Object.keys(state.profiles).length === 0 && index.status === "ready";
  const pickerYear = firstRun ? new Date().getFullYear() : year;
  const pickerInitial = (): CalendarChoice => {
    if (!firstRun) return { calendars: profile.calendars, includeObservances: profile.includeObservances };
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const suggested = index.index ? suggestCalendarId(languages, index.index) : null;
    return { calendars: suggested ? [{ id: suggested, regions: [] }] : [], includeObservances: false };
  };

  const calendarNames = useMemo(
    () => Object.fromEntries((index.index ?? []).map((c) => [c.id, c.name])),
    [index.index],
  );

  const loadFailed = index.status === "error" || cals.failed.length > 0;
  const yearCalendars = cals.calendars.filter((c) => profile.calendars.some((s) => s.id === c.id));
  const withoutData = cals.loading ? [] : yearCalendars.filter((c) => !hasDataForYear(c, year));
  const noData = withoutData.length > 0 && withoutData.length === yearCalendars.length;
```

In the JSX:
- delete the `<button type="button" className="calendar-button" …>{calendarLabel}</button>` element (the ⚙ button stays).
- change the retry button's handler to `onClick={() => (index.status === "error" ? index.retry() : cals.retry())}`.
- replace the `noData` banner and the whole `firstRunName` banner with:

```tsx
        {noData && <div className="banner">{t("errors.noData", { year: String(year) })}</div>}
        {!noData && withoutData.length > 0 && (
          <div className="banner">
            {t("errors.noDataSome", { year: String(year), names: withoutData.map((c) => c.name).join(", ") })}
          </div>
        )}
```

- replace the `plan` and `holidays` slots with:

```tsx
        {slot(
          "plan",
          <WeeklyPlanPanel plan={profile.weeklyPlan} onCycle={(weekday) => dispatch({ type: "cycleWeekly", year, weekday })} />,
        )}
```

```tsx
        {slot(
          "holidays",
          <div className="panel-stack">
            <CalendarsPanel
              year={year}
              profiles={state.profiles}
              index={index.index}
              loaded={cals.calendars}
              failed={cals.failed}
              onEdit={() => setPickerOpen(true)}
              onRemoveProfile={(y) => dispatch({ type: "removeProfile", year: y })}
            />
            <HolidayListPanel
              year={year}
              holidays={model.holidays}
              profile={profile}
              calendarNames={calendarNames}
              dispatch={dispatch}
            />
          </div>,
        )}
```

(keep the `breaks` slot as it is, between them).

- replace the `<SettingsDialog … />` element with:

```tsx
      <CalendarPickerDialog
        open={pickerOpen || firstRun}
        year={pickerYear}
        firstRun={firstRun}
        index={index.index}
        initial={pickerInitial()}
        onSave={(choice) => {
          dispatch({ type: "setCalendars", year: pickerYear, ...choice });
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} dispatch={dispatch} />
```

- [ ] **Step 4: Remove dead code and messages**

- In `src/data/hooks.ts` delete the `useCalendar` function (and drop `CalendarFile` from the type import only if it becomes unused — `useCalendars` still uses it).
- In `src/styles.css` delete the `.calendar-button { … }` rule.
- Delete from **both** i18n files: `firstRun.using`, `firstRun.change`, `header.noCalendar`.
- Add to `src/i18n/en.json`: `"errors.noDataSome": "There is no {year} holiday data for: {names}.",`
- Add to `src/i18n/el.json`: `"errors.noDataSome": "Δεν υπάρχουν δεδομένα αργιών του {year} για: {names}.",`

Check nothing else still uses the removed names:

Run: `grep -rn "useCalendar(\|calendar-button\|firstRun\.\|header.noCalendar\|state\.calendar\|yearOverrides\|hasYearOverride\|scope:" src`
Expected: no output.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm run test:run`
Expected: all test files PASS.

Run: `npm run build`
Expected: `tsc` reports no errors and Vite builds `dist/`.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(ui): first-run calendar picker, calendars panel and per-year edits in the layout (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```

---

### Task 10: End-to-end tests and README

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the finished app (Task 9). Real data used: `en.ch` has "Easter Monday (regional holiday)" on 2026-04-06 and 2027-03-29 (region Zurich) and a region "Bern"; `el.greek` has a public holiday on 2026-03-25.

- [ ] **Step 1: Update and extend the e2e tests**

In `tests/e2e/app.spec.ts` replace `seededState` with:

```ts
const seededState = {
  version: 2,
  language: null,
  theme: "system",
  leave: {},
  profiles: {
    "2026": {
      calendars: [{ id: "en.ch", regions: ["Zurich"] }],
      includeObservances: false,
      holidayRules: {},
      customHolidays: [],
      weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    },
  },
};
```

Add inside `test.describe("with a Zurich profile", …)`:

```ts
  test("adding a second calendar and a region", async ({ page }) => {
    await page.goto("./#2026");
    await page.getByRole("tab", { name: "Holidays" }).click();
    await page.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" });
    await dialog.getByRole("searchbox", { name: "Search calendars…" }).fill("christian");
    await dialog.getByRole("checkbox", { name: "Christian Holidays" }).check();
    const regions = dialog.getByRole("group", { name: "Regions · Holidays in Switzerland" });
    await regions.getByRole("checkbox", { name: "Bern", exact: true }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const panel = page.locator(".calendars-panel");
    await panel.getByRole("button", { name: /Calendars \(2\)/ }).click();
    await expect(panel.getByText("Holidays in Switzerland — Bern, Zurich")).toBeVisible();
    await expect(panel.getByText("Christian Holidays", { exact: true })).toBeVisible();
  });

  test("a change in 2027 keeps 2026 as it was and can be undone", async ({ page }) => {
    await page.goto("./#2027");
    await page.getByRole("tab", { name: "Holidays" }).click();
    const easter2027 = page.locator('[data-date="2027-03-29"]');
    await expect(easter2027).toHaveAttribute("data-holiday", "1");
    await page.getByRole("checkbox", { name: "Counts as holiday: Easter Monday (regional holiday)" }).uncheck();
    await expect(easter2027).not.toHaveAttribute("data-holiday");
    await expect(page.getByRole("button", { name: /from 2027/ })).toBeVisible();

    await page.getByRole("button", { name: "Previous year" }).click();
    await expect(page.locator('[data-date="2026-04-06"]')).toHaveAttribute("data-holiday", "1");
    await expect(page.getByRole("button", { name: /from 2026/ })).toBeVisible();

    await page.getByRole("button", { name: "Next year" }).click();
    await page.getByRole("button", { name: /Calendars \(1\)/ }).click();
    await page.getByRole("button", { name: "Remove the 2027 settings" }).click();
    await expect(page.locator('[data-date="2027-03-29"]')).toHaveAttribute("data-holiday", "1");
  });
```

Replace the test inside `test.describe("first run in Greek", …)` with:

```ts
  test("asks for calendars with the Greek one suggested, then shows the Greek UI", async ({ page }) => {
    await page.goto("./#2026");
    const dialog = page.getByRole("dialog", { name: "Παρακαλώ επιλέξτε ημερολόγια" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Διακοπές στην Ελλάδα" })).toBeChecked();
    await dialog.getByRole("button", { name: "Συνέχεια" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Αργίες", level: 1 })).toBeVisible();
    await expect(page.locator('[data-date="2026-03-25"]')).toHaveAttribute("data-holiday", "1");
  });
```

- [ ] **Step 2: Run the e2e tests**

Run: `npx playwright install chromium` (first time only), then `npm run test:e2e`
Expected: all tests PASS (the web server builds and previews the app automatically).

- [ ] **Step 3: Update the README**

In `README.md`, in the "Features" list replace the first two bullets with:

```markdown
- Holiday calendars for ~220 countries plus religious calendars (Google public holiday calendars). Pick several at once, each with its own regions (e.g. Swiss cantons); the first visit asks which ones you want.
- Enable/disable any holiday, make it a half day, add your own holidays.
- Settings apply from the year you make them onwards: change something in 2027 and 2026 stays as it was, while 2028+ follows 2027. The first configured year also covers every earlier year.
```

and replace `- Weekly plan with half days (e.g. Friday afternoon off, 4-day week).` with `- Weekly plan with half days (e.g. Friday afternoon off, 4-day week), also per year.`

- [ ] **Step 4: Final verification**

Run: `npm run test:run && npm run build && npm run test:e2e`
Expected: everything PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/app.spec.ts README.md
git commit -m "test(e2e): cover the calendar picker and per-year settings; update README (#2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X6yHrRXNtxGP4sjjZsvEzu"
```
