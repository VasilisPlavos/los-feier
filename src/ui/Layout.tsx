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
