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
    const updated = selected.includes(region) ? selected.filter((r) => r !== region) : [...selected, region];
    dispatch({
      type: "setRegions",
      regions: updated.sort(),
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
