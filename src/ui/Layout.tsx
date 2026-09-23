import { useEffect, useMemo, useState, type ReactNode } from "react";
import { datesBetween, todayIso } from "../core/dates";
import { calendarIdsFor, profileFor } from "../core/profiles";
import { clampYear, hasDataForYear, suggestCalendarId, yearBounds } from "../data/calendars";
import { useCalendarIndex, useCalendars } from "../data/hooks";
import { useI18n } from "../i18n/I18nProvider";
import { downloadText } from "../state/exportImport";
import { useStore } from "../state/StoreProvider";
import { AboutDialog } from "./AboutDialog";
import { CalendarPickerDialog, type CalendarChoice } from "./CalendarPickerDialog";
import { CalendarsPanel } from "./CalendarsPanel";
import { Hero } from "./Hero";
import { HolidayListPanel } from "./HolidayListPanel";
import { SettingsDialog } from "./SettingsDialog";
import { SummaryPanel } from "./SummaryPanel";
import { useYearModel } from "./useYearModel";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { YearGrid } from "./YearGrid";
import { YearPicker } from "./YearPicker";

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  const index = useCalendarIndex();
  const bounds = useMemo(() => (index.index ? yearBounds(index.index) : null), [index.index]);
  const profile = profileFor(state.profiles, year);
  // Neighbouring years too: breaks that cross New Year read the other year's holidays. Ids the
  // index no longer lists are not fetched: they can never load, and the panel marks them instead.
  const wantedIds = calendarIdsFor(state.profiles, [year - 1, year, year + 1]);
  const cals = useCalendars(
    index.status === "ready" && index.index ? wantedIds.filter((id) => index.index!.some((c) => c.id === id)) : wantedIds,
  );
  const model = useYearModel(state, cals.calendars, year);
  const today = todayIso();

  // A year from the link (or today) outside the calendar data moves to the nearest year the list offers.
  useEffect(() => {
    setYear((y) => clampYear(y, bounds));
  }, [bounds]);

  useEffect(() => {
    history.replaceState(null, "", `#${year}`);
    setSelectedStart(null);
  }, [year]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = state.theme;
  }, [state.theme]);

  const stretchDays = useMemo(
    () => new Set(model.stretches.flatMap((s) => datesBetween(s.start, s.end))),
    [model.stretches],
  );
  // Derived from the current model instead of stored, so an edit that shifts or removes the
  // selected stretch can never leave a stale (or vanished) range highlighted.
  const selectedStretch = useMemo(
    () => (selectedStart ? (model.stretches.find((s) => s.start === selectedStart) ?? null) : null),
    [model.stretches, selectedStart],
  );
  const highlightDays = useMemo(
    () => new Set(selectedStretch ? datesBetween(selectedStretch.start, selectedStretch.end) : []),
    [selectedStretch],
  );

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

  const slot = (name: Tab, content: ReactNode) => (
    <div className="panel-slot" data-panel={name} data-active={tab === name}>
      {content}
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>{t("app.title")}</h1>
        <span className="spacer" />
        <YearPicker year={year} bounds={bounds} onChange={setYear} />
        <button type="button" className="header-link" onClick={() => setAboutOpen(true)}>
          {t("header.about")}
        </button>
        <button type="button" className="icon-button" aria-label={t("header.settings")} onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
        <div className="summary-bar" data-testid="summary-bar" aria-live="polite">
          {t("summary.compact", { n: formatNumber(model.leaveTotal), breaks: String(model.stretches.length) })}
        </div>
      </header>

      <main className="main">
        <Hero year={year} />
        {recoveredBackup !== null && (
          <div className="banner" data-kind="error" role="alert">
            {t("errors.recovered")}
            <button type="button" onClick={() => downloadText("los-feier-backup.json", recoveredBackup)}>
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
            <button type="button" onClick={() => (index.status === "error" ? index.retry() : cals.retry())}>
              {t("errors.retry")}
            </button>
          </div>
        )}
        {noData && <div className="banner">{t("errors.noData", { year: String(year) })}</div>}
        {!noData && withoutData.length > 0 && (
          <div className="banner">
            {t("errors.noDataSome", { year: String(year), names: withoutData.map((c) => c.name).join(", ") })}
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
        {slot(
          "plan",
          <WeeklyPlanPanel plan={profile.weeklyPlan} onCycle={(weekday) => dispatch({ type: "cycleWeekly", year, weekday })} />,
        )}
        {slot(
          "breaks",
          <SummaryPanel
            leaveTotal={model.leaveTotal}
            stretches={model.stretches}
            selected={selectedStretch}
            onSelect={(s) => setSelectedStart(s ? s.start : null)}
          />,
        )}
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
      </aside>

      <nav className="tabbar" role="tablist">
        {(["plan", "breaks", "holidays"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {t(`tabs.${name}`)}
          </button>
        ))}
      </nav>

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

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} dispatch={dispatch} />
    </div>
  );
}
