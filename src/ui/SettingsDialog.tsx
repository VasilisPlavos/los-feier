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
