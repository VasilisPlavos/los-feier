# Holidays — Σχέδιο (design spec)

- **Ημερομηνία:** 2026-09-23
- **Repo:** `github.com/vasilisplavos/holidays` (open source, GitHub Pages)
- **Αφετηρία:** κλώνος του argies.gr (εκτός λειτουργίας — [αρχείο](https://web.archive.org/web/20260310213148/https://www.argies.gr/)), με μοντέρνο UI και υποστήριξη πολλών χωρών.

## 1. Σκοπός

Μια εφαρμογή ημερολογίου ανά έτος που επιτρέπει σε οποιονδήποτε να:

1. βλέπει τις αργίες της χώρας/περιοχής του και να τις προσαρμόζει (ακύρωση, ½ ημέρα, δικές του αργίες),
2. επιλέγει με κλικ πάνω στο ημερολόγιο τις ημέρες άδειας (ολόκληρες ή ½),
3. ορίζει εβδομαδιαίο πλάνο εργάσιμων/ρεπό (με ½ ημέρες),
4. βλέπει πόσες ημέρες άδειας ξόδεψε και ποια διαστήματα συνεχόμενων ελεύθερων ημερών (3-ήμερα, 4-ήμερα, …) προκύπτουν.

**Χρήστες:** ο συγγραφέας (Ζυρίχη) και οποιοσδήποτε άλλος, με ημερολόγια αργιών για ~220 χώρες.

**Κριτήρια επιτυχίας:**
- Χρήστης στη Ζυρίχη ρυθμίζει τις αργίες του (π.χ. ½ Sechseläuten, ½ Knabenschiessen) μία φορά και ισχύουν για όλα τα έτη.
- Κάθε αλλαγή (κλικ σε ημέρα, πλάνο, αργία) ενημερώνει αμέσως τη σύνοψη.
- Οι 12 μήνες φαίνονται σε πλέγμα 3 στηλών × 4 γραμμών, και στο κινητό (με οριζόντιο scroll).
- Όλα τα δεδομένα αποθηκεύονται τοπικά σε ένα JSON, εξαγώγιμο/εισαγώγιμο.

## 2. Αποφάσεις

| Θέμα | Απόφαση |
|---|---|
| Πηγή αργιών | Δημόσια ημερολόγια αργιών Google (ICS), κατεβασμένα και αποθηκευμένα στο repo |
| Πρόσβαση σε Google κατά το runtime | Καμία — μόνο στατικά αρχεία. Κανένα κλειδί/μυστικό στο repo |
| Αλλαγές αργιών | Ανά όνομα αργίας για όλα τα έτη, με εξαιρέσεις ανά έτος |
| Αποθήκευση | Ένα JSON (`AppState`) στο `localStorage`, με εξαγωγή/εισαγωγή αρχείου. Μελλοντικός συγχρονισμός θα στέλνει το ίδιο JSON |
| Μισές ημέρες | Ναι, για αργίες, άδειες και εβδομαδιαίο πλάνο |
| Εβδομαδιαίο πλάνο | Ένα για όλα τα έτη |
| Γλώσσα UI | Ελληνικά + αγγλικά, επεκτάσιμο (i18n). Default: γλώσσα συστήματος, fallback αγγλικά |
| Γλώσσα ονομάτων αργιών | Η γλώσσα του επιλεγμένου ημερολογίου Google |
| Stack | Vite + React + TypeScript, Vitest, Testing Library, Playwright |
| Hosting | GitHub Pages (`vasilisplavos.github.io/holidays/`) |

## 3. Δεδομένα αργιών

### 3.1 Λήψη

`scripts/fetch-google-holidays.mjs` (τρέχει με `npm run holidays:update`):

- Διαβάζει υποψήφια ids από `scripts/google-calendar-ids.txt` (ids του gist + `en.<ISO-3166 alpha-2>`), μαζί με τις τοπικές παραλλαγές `el.greek`, `de.ch`, `fr.ch`, `it.ch`.
- Κατεβάζει `https://calendar.google.com/calendar/ical/<id>%23holiday%40group.v.calendar.google.com/public/basic.ics`.
- Απορρίπτει αποτυχίες, άδεια ημερολόγια και διπλότυπα (ίδιο περιεχόμενο και γλώσσα).
- Αποθηκεύει:
  - `data/holidays/raw/<id>.ics` — το αρχείο όπως ήρθε από την Google,
  - `data/holidays/<id>.json` — συμπαγές JSON,
  - `data/holidays/index.json` — κατάλογος `{ id, name, lang, from, to, count }[]`.

Κατάσταση στις 2026-09-23: 225 ημερολόγια, έτη 2021–2031.

### 3.2 Μορφή

```ts
interface CalendarFile {
  id: string; name: string; lang: string;
  from: number; to: number; count: number; fetchedAt: string;
  events: GoogleHoliday[];
}
interface GoogleHoliday {
  date: string;              // "YYYY-MM-DD"
  name: string;              // SUMMARY
  type: "public" | "observance"; // κανονικοποιημένο (βλ. 3.3)
  regions?: string[];        // π.χ. ["Zurich", "Bern"] (πάντα αγγλικά ονόματα)· απουσία = εθνική
  days?: number;             // μόνο αν > 1
  tentative?: true;          // «Date is tentative and may change.»
}
```

### 3.3 Γνωστές ιδιαιτερότητες

- Οι ελβετικές αργίες έχουν `regions` ανά καντόνι· η Ζυρίχη προκύπτει με φίλτρο.
- Το `type` προκύπτει από την 1η γραμμή του DESCRIPTION των αγγλικών ημερολογίων: «Public holiday…» → `public`, οτιδήποτε άλλο (Observance, κενό, tentative) → `observance`.
- Στα τοπικά ημερολόγια (`el.greek`, `de.ch`, `fr.ch`, `it.ch`) η Google μεταφράζει το DESCRIPTION (π.χ. «Gedenktag in Zürich»). Το script παίρνει `type`/`regions`/`tentative` από το αγγλικό δίδυμο (`en.greek`, `en.ch`), ζευγαρώνοντας ανά ημερομηνία και πλήθος περιοχών (κόμματα). Τα `name` μένουν στη γλώσσα του ημερολογίου.
- Sechseläuten και Knabenschiessen είναι `Observance`. Το Knabenschiessen εμφανίζεται Σάββατο–Κυριακή–Δευτέρα· με ½ ανά όνομα μετράει ουσιαστικά μόνο η Δευτέρα (το Σαββατοκύριακο είναι ήδη ρεπό).
- Εκτός 2021–2031 δεν υπάρχουν δεδομένα.
- Τα `.ics` έχουν `DTSTAMP` που αλλάζει σε κάθε λήψη (θόρυβος στο git diff — αποδεκτό).
- Η αναδιανομή δεδομένων Google δεν έχει ρητούς όρους· το README αναφέρει την πηγή. Αν χρειαστεί, τα δεδομένα μπορούν να κατεβαίνουν κατά το build αντί να είναι στο repo.

## 4. Αρχιτεκτονική

```
holidays/
├─ data/holidays/                 # index.json, <id>.json, raw/*.ics
├─ scripts/
│  ├─ fetch-google-holidays.mjs
│  └─ google-calendar-ids.txt
├─ src/
│  ├─ core/                       # καθαρή λογική, χωρίς React
│  │  ├─ types.ts
│  │  ├─ dates.ts                 # πράξεις σε "YYYY-MM-DD" (χωρίς timezones)
│  │  ├─ holidays.ts              # ενεργές αργίες ανά ημερομηνία για ένα έτος
│  │  ├─ days.ts                  # DayInfo για κάθε ημέρα
│  │  └─ stats.ts                 # ημέρες άδειας, διαστήματα
│  ├─ state/                      # store, persistence, import/export, migration
│  ├─ data/                       # φόρτωση index/ημερολογίου
│  ├─ i18n/                       # el.json, en.json, ανίχνευση γλώσσας
│  └─ ui/                         # React components
├─ tests/e2e/                     # Playwright
├─ README.md
└─ .github/workflows/deploy.yml
```

**Αρχές:**
- Το `core/` είναι pure functions: `(AppState, CalendarFile, year) → DayInfo[] / Stats`. Δεν εξαρτάται από React, DOM ή `localStorage`.
- Ημερομηνίες μόνο ως strings `YYYY-MM-DD`· υπολογισμοί ημέρας εβδομάδας/διαδοχής μέσω UTC, χωρίς βιβλιοθήκη ημερομηνιών.
- Φόρτωση κατά ζήτηση: `index.json` και μόνο το επιλεγμένο `<id>.json`. Το `data/holidays/` (χωρίς `raw/`) αντιγράφεται στο build ως στατικά αρχεία.
- Vite `base: "/holidays/"`.

## 5. Μοντέλο κατάστασης (AppState)

```ts
type Fraction = 0.5 | 1;
type WeeklyValue = 0 | 0.5 | 1;

interface HolidayRule { enabled?: boolean; fraction?: Fraction }

interface CustomHoliday {
  id: string;
  name: string;
  fraction: Fraction;
  rule: { type: "yearly"; month: number; day: number }   // κάθε χρόνο
      | { type: "once"; date: string };                  // μία φορά
}

interface AppState {
  version: 1;
  language: string | null;                 // null = γλώσσα συστήματος
  calendar: {
    id: string | null;                     // null = δεν έχει επιλεγεί ακόμη
    regions: string[];                     // [] = μόνο εθνικές
    includeObservances: boolean;
  };
  holidayRules: Record<string, HolidayRule>;                   // κλειδί: όνομα αργίας
  yearOverrides: Record<string, Record<string, HolidayRule>>;  // "2026" → όνομα → rule
  customHolidays: CustomHoliday[];
  weeklyPlan: [WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue, WeeklyValue]; // ΔΕ..ΚΥ, τιμή = ρεπό
  leave: Record<string, Fraction>;         // "YYYY-MM-DD" → 0.5 | 1
  theme: "system" | "light" | "dark";
}
```

Default: `weeklyPlan = [0,0,0,0,0,1,1]`, `includeObservances = false`, `language = null`, `theme = "system"`, όλα τα υπόλοιπα κενά.

## 6. Λογική

### 6.1 Ενεργές αργίες ενός έτους

Για κάθε `GoogleHoliday` του έτους:
1. **Ορατή** αν `regions` απουσιάζει ή τέμνεται με `calendar.regions`. Οι μη ορατές αγνοούνται εντελώς.
2. **Προεπιλογή:** `enabled = type === "public" || includeObservances`, `fraction = 1`.
3. Εφαρμογή `holidayRules[name]`, μετά `yearOverrides[year][name]` (το τελευταίο υπερισχύει, ανά πεδίο).

Προστίθενται οι `customHolidays` που πέφτουν στο έτος (οι `yearly` για ανύπαρκτη ημερομηνία, π.χ. 29/2, παραλείπονται σε μη δίσεκτα έτη). Οι custom υπόκεινται επίσης σε `yearOverrides` με κλειδί το όνομά τους.

Όλες οι ορατές αργίες (ενεργές και μη) επιστρέφονται για τη λίστα του UI.

### 6.2 Ανά ημέρα

```
holiday(d)  = max(fraction των ενεργών αργιών της d), ή 0
weekly(d)   = weeklyPlan[weekday(d)]
base(d)     = min(1, holiday(d) + weekly(d))
room(d)     = 1 − base(d)
leaveEff(d) = min(leave[d] ?? 0, room(d))
free(d)     = base(d) + leaveEff(d) ≥ 1
redundant(d)= leave[d] > leaveEff(d)      // άδεια που δεν χρειάζεται
```

### 6.3 Κλικ σε ημέρα (άδεια)

| room | κύκλος |
|---|---|
| 0 | καμία ενέργεια (tooltip εξηγεί γιατί)· αν υπάρχει redundant άδεια, το κλικ τη διαγράφει |
| 0.5 | 0 → ½ → 0 |
| 1 | 0 → 1 → ½ → 0 |

### 6.4 Σύνοψη

- **Ημέρες άδειας** = Σ `leaveEff(d)` για τις ημέρες του εμφανιζόμενου έτους.
- **Διαστήματα** = μέγιστες σειρές συνεχόμενων `free` ημερών με μήκος ≥ 3. Ο υπολογισμός διασχίζει τα όρια έτους (ελέγχονται και ημέρες του προηγούμενου/επόμενου έτους)· κάθε διάστημα εμφανίζεται στο έτος της πρώτης του ημέρας. Ομαδοποίηση ανά μήκος, φθίνουσα. Για κάθε διάστημα: ημερομηνίες έναρξης–λήξης, μήκος, Σ `leaveEff` μέσα του.

## 7. UI / UX

- **Header:** επιλογή έτους (‹ έτος ›), ημερολόγιο/περιοχή, γλώσσα UI, ρυθμίσεις.
- **Πλέγμα μηνών:** 3 στήλες × 4 γραμμές. Κάθε μήνας σταθερού πλάτους (~260px). Σε μικρές οθόνες το πλέγμα διατηρεί 3 στήλες και γίνεται οριζόντιο scroll (με `scroll-snap` ανά στήλη) και κάθετο scroll για τις γραμμές. Στο άνοιγμα γίνεται scroll ώστε να φαίνεται ο τρέχων μήνας.
- **Desktop:** πλαϊνό πάνελ με εβδομαδιαίο πλάνο, σύνοψη, λίστα αργιών.
- **Mobile:** σταθερή μπάρα σύνοψης πάνω (π.χ. «Άδεια 12,5 · 4× 3-ήμερα»), κάτω tabs: Πλάνο / Διαστήματα / Αργίες.
- **Εβδομαδιαίο πλάνο:** 7 κουμπιά, κύκλος εργάσιμη → ½ → ρεπό.
- **Λίστα αργιών:** όλες οι ορατές του έτους (Observances αχνά). Ανά αργία: toggle ενεργή, ½/1, και επιλογή εμβέλειας «μόνο φέτος» / «όλα τα έτη». Κουμπί «+ Δική μου αργία» (όνομα, ημερομηνία, ½/1, κάθε χρόνο ή μία φορά).
- **Σύνοψη:** μετρητής άδειας, διαστήματα ανά μήκος· κλικ σε διάστημα το φωτίζει στο ημερολόγιο.
- **Ρυθμίσεις:** ημερολόγιο (αναζήτηση), περιοχές (από τα `regions` του ημερολογίου), «Observances ως αργίες», γλώσσα UI, θέμα, εξαγωγή/εισαγωγή JSON, επαναφορά.
- **Πρώτη εκκίνηση:** πρόταση ημερολογίου από `navigator.language`/region (π.χ. `el-GR` → `el.greek`, `de-CH` → `de.ch`), αλλάζει με ένα κλικ.
- **Οπτική κωδικοποίηση:**

  | Κατάσταση | Εμφάνιση |
  |---|---|
  | ρεπό πλάνου | απαλό κίτρινο (½: μισό) |
  | αργία | κόκκινος κύκλος (½: μισός) |
  | άδεια | πράσινο γέμισμα (½: μισό) |
  | redundant άδεια | πράσινο περίγραμμα με ένδειξη |
  | σήμερα | περίγραμμα |
  | μέλος διαστήματος | λεπτή γραμμή που ενώνει τις ημέρες |

- **Προσβασιμότητα:** ημέρες ως `button` με `aria-label` (π.χ. «Τρίτη 7 Απριλίου, άδεια»), πλοήγηση με βελάκια/Space, χρώμα ποτέ ως μοναδική ένδειξη.
- **Θέμα:** light/dark, default του συστήματος.

## 8. i18n

- Αρχεία `src/i18n/<lang>.json` (αρχικά `el`, `en`). Νέα γλώσσα = νέο αρχείο + εγγραφή σε λίστα.
- Ονόματα μηνών/ημερών μέσω `Intl.DateTimeFormat` για τη γλώσσα UI.
- Επιλογή: `state.language` → `navigator.languages` (πρώτη υποστηριζόμενη) → `en`.
- Αριθμοί με `Intl.NumberFormat` (π.χ. «12,5» στα ελληνικά).

## 9. Σφάλματα

- Αποτυχία φόρτωσης ημερολογίου: μήνυμα + «Ξαναδοκίμασε»· η εφαρμογή λειτουργεί χωρίς αργίες.
- Έτος εκτός `from..to` του ημερολογίου: μπάρα «Δεν υπάρχουν δεδομένα αργιών για αυτό το έτος»· φαίνονται μόνο custom αργίες.
- Άκυρο περιεχόμενο `localStorage`: εκκίνηση με default, το παλιό αποθηκεύεται σε κλειδί backup, ειδοποίηση με «Κατέβασε το backup».
- Εισαγωγή JSON: έλεγχος σχήματος και `version`· άκυρο → μήνυμα, καμία αλλαγή· έγκυρο → επιβεβαίωση αντικατάστασης.
- Αλλαγή ημερολογίου ενώ υπάρχουν `holidayRules`/`yearOverrides`: προειδοποίηση ότι ίσως δεν ταιριάζουν πλέον (οι κανόνες διατηρούνται).
- `version` μεγαλύτερο από το υποστηριζόμενο: άρνηση εισαγωγής με μήνυμα.

## 10. Tests

- **Vitest (`core/`):** αθροίσματα (½+½, ½ αργία + ρεπό, άδεια σε αργία → redundant), κύκλος κλικ, διαστήματα (και μεταξύ ετών), φίλτρο περιοχών, προτεραιότητα rules/overrides, custom αργίες (και 29/2), μετρητής άδειας.
- **Επαλήθευση με πραγματικά δεδομένα:** `en.ch`, Zurich, 2026, πλάνο ΔΕ–ΠΑ, χωρίς άδειες → περιλαμβάνει τα διαστήματα 3–6/4 (4 ημέρες) και 23–25/5 (3 ημέρες).
- **Vitest + Testing Library (`ui/`):** κλικ σε ημέρα, αλλαγή πλάνου, toggle αργίας ενημερώνουν τη σύνοψη.
- **Playwright:** smoke test σε mobile viewport — το πλέγμα έχει 3 στήλες και οριζόντιο scroll· κλικ σε ημέρα ενημερώνει τη σύνοψη.

## 11. Build, scripts, deploy

`package.json` scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:e2e": "playwright test",
  "holidays:update": "node scripts/fetch-google-holidays.mjs"
}
```

README: περιγραφή, τοπική εκτέλεση, `npm run holidays:update`, πηγή δεδομένων (Google Calendar public holiday calendars), άδεια (MIT).

GitHub Action (`.github/workflows/deploy.yml`): σε push στο `main` → install, test, build → deploy σε GitHub Pages.

## 12. Εκτός πρώτης έκδοσης

Συγχρονισμός JSON σε server, λογαριασμοί, PWA/offline install, αυτόματη ανανέωση δεδομένων με GitHub Action, περισσότερες γλώσσες UI.
