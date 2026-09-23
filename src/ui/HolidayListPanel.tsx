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
