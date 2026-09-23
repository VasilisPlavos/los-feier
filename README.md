# los-feier

Plan your leave around public holidays. See the whole year as 12 months (3 × 4), pick your country and region, adjust holidays, set your weekly working days, click the days you take off, and instantly see how many leave days you used and every 3-, 4-, … day break you get.

A modern, open-source successor of the old argies.gr calendar.

**Live:** https://vasilisplavos.github.io/los-feier/

## Features

- Holiday calendars for ~220 countries plus religious calendars (Google public holiday calendars). Pick several at once, each with its own regions (e.g. Swiss cantons); the first visit asks which ones you want.
- Enable/disable any holiday, make it a half day, add your own holidays.
- Settings apply from the year you make them onwards: change something in 2027 and 2026 stays as it was, while 2028+ follows 2027. The first configured year also covers every earlier year.
- Weekly plan with half days (e.g. Friday afternoon off, 4-day week), also per year.
- Click a day: full leave → half leave → none. Half holiday + half leave = a full free day.
- Leave counter and list of breaks, grouped by length.
- English and Greek UI (system language by default). Light/dark theme.
- Everything is stored in your browser (`localStorage`); export/import as JSON.

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173/los-feier/
npm run test         # unit tests (watch mode)
npm run test:run     # unit tests once
npm run test:e2e     # Playwright mobile tests (first time: npx playwright install chromium)
npm run build        # production build into dist/
npm run preview      # serve dist/ at http://localhost:4173/los-feier/
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

## Deployment

The included workflow (`.github/workflows/deploy.yml`) publishes `dist/` to GitHub Pages on every push to `main`; GitHub Pages must be set once, in Settings → Pages → Source, to “GitHub Actions” for it to take effect.

## Data source

Holiday data: Google Calendar public holiday calendars (`https://calendar.google.com/calendar/ical/<id>%23holiday%40group.v.calendar.google.com/public/basic.ics`). Dates may change; always double-check with official sources.

## License

MIT — see [LICENSE](LICENSE).
