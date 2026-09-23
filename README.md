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
