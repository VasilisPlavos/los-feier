import { useState, type Dispatch } from "react";
import type { AppState, HolidayRule, ResolvedHoliday } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";
import type { Action } from "../state/reducer";
import { CustomHolidayForm } from "./CustomHolidayForm";

interface Props {
  year: number;
  holidays: ResolvedHoliday[];
  state: AppState;
  dispatch: Dispatch<Action>;
}

export function HolidayListPanel({ year, holidays, state, dispatch }: Props) {
  const { t, formatDate } = useI18n();
  const [scope, setScope] = useState<"all" | "year">("all");
  const [adding, setAdding] = useState(false);
  const yearLabel = String(year);

  const currentRule = (name: string): HolidayRule => {
    if (scope === "all") return Object.hasOwn(state.holidayRules, name) ? state.holidayRules[name] : {};
    const yearRules = state.yearOverrides[yearLabel];
    return yearRules && Object.hasOwn(yearRules, name) ? yearRules[name] : {};
  };

  const update = (h: ResolvedHoliday, change: HolidayRule) => {
    if (h.source === "custom" && scope === "all") {
      if (change.fraction !== undefined && h.customId) {
        dispatch({ type: "updateCustomHoliday", id: h.customId, changes: { fraction: change.fraction } });
      }
      return;
    }
    dispatch({
      type: "setHolidayRule",
      name: h.name,
      scope: scope === "all" ? "all" : year,
      rule: { ...currentRule(h.name), ...change },
    });
  };

  return (
    <section className="panel" aria-labelledby="holidays-title">
      <h2 id="holidays-title">{t("holidays.title", { year: yearLabel })}</h2>
      <label>
        {t("holidays.scope")}{" "}
        <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "year")}>
          <option value="all">{t("holidays.scopeAll")}</option>
          <option value="year">{t("holidays.scopeYear", { year: yearLabel })}</option>
        </select>
      </label>
      {holidays.length === 0 && <p className="muted">{t("holidays.empty")}</p>}
      <ul>
        {holidays.map((h) => {
          const customLocked = h.source === "custom" && scope === "all";
          return (
            <li key={`${h.date}|${h.name}`} className="holiday" data-enabled={h.enabled}>
              <input
                type="checkbox"
                checked={h.enabled}
                disabled={customLocked}
                title={customLocked ? t("holidays.customAllYearsHint", { year: yearLabel }) : undefined}
                aria-label={`${t("holidays.enabled")}: ${h.name}`}
                onChange={(e) => update(h, { enabled: e.target.checked })}
              />
              <span>{formatDate(h.date, "short")}</span>
              <span>
                <span className="holiday-name">{h.name}</span>
                {h.type === "observance" && <small> · {t("holidays.observance")}</small>}
                {h.tentative && <small> · {t("holidays.tentative")}</small>}
              </span>
              <button
                type="button"
                className="fraction"
                aria-label={`${h.name}: ${h.fraction === 1 ? t("holidays.makeHalf") : t("holidays.makeFull")}`}
                onClick={() => update(h, { fraction: h.fraction === 1 ? 0.5 : 1 })}
              >
                {h.fraction === 1 ? "1" : "½"}
              </button>
              {h.hasYearOverride ? (
                <button
                  type="button"
                  className="badge"
                  title={t("holidays.resetYear", { year: yearLabel })}
                  onClick={() => dispatch({ type: "setHolidayRule", name: h.name, scope: year, rule: null })}
                >
                  {t("holidays.thisYearBadge", { year: yearLabel })} ↺
                </button>
              ) : (
                <span />
              )}
              {h.source === "custom" && h.customId ? (
                <button
                  type="button"
                  aria-label={`${t("holidays.delete")}: ${h.name}`}
                  onClick={() => dispatch({ type: "removeCustomHoliday", id: h.customId! })}
                >
                  ×
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <CustomHolidayForm
          year={year}
          onSave={(holiday) => {
            dispatch({ type: "addCustomHoliday", holiday });
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
