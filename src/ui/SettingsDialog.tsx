import { useEffect, useRef, useState, type Dispatch } from "react";
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

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function SettingsDialog({ open, onClose, index, calendar, state, dispatch }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleClose = () => {
    previousFocus.current?.focus();
    onClose();
  };

  // Move focus into the dialog when it opens; keep the opener so we can restore it on close.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialog)?.focus();
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

  const q = query.trim().toLowerCase();
  const options = (index ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q));
  const regions = calendar
    ? [...new Set([...calendarRegions(calendar), ...state.calendar.regions])].sort((a, b) => a.localeCompare(b))
    : [];

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
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={dialogRef}
        tabIndex={-1}
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

        <button type="button" onClick={handleClose}>
          {t("settings.close")}
        </button>
      </div>
    </div>
  );
}
