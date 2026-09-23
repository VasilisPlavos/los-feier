import { useState } from "react";
import { profileFor, profileYearFor, type Profiles } from "../core/profiles";
import type { CalendarFile, CalendarIndexEntry } from "../core/types";
import { calendarRegions } from "../data/calendars";
import { useI18n } from "../i18n/I18nProvider";

const OPEN_KEY = "los-feier.calendarsPanel.open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Only a per-browser convenience; the panel works without it.
  }
}

export interface CalendarsPanelProps {
  year: number;
  profiles: Profiles;
  index: CalendarIndexEntry[] | null;
  loaded: CalendarFile[];
  failed: string[];
  onEdit(): void;
  onRemoveProfile(year: number): void;
}

export function CalendarsPanel({ year, profiles, index, loaded, failed, onEdit, onRemoveProfile }: CalendarsPanelProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const profile = profileFor(profiles, year);
  const from = profileYearFor(profiles, year);
  const empty = profile.calendars.length === 0;
  const canRemove = Object.hasOwn(profiles, String(year)) && Object.keys(profiles).length > 1;

  const toggle = () => {
    setOpen(!open);
    writeOpen(!open);
  };

  return (
    <section className="panel calendars-panel" aria-labelledby="calendars-title">
      <div className="panel-head">
        <h2 id="calendars-title">
          <button type="button" className="disclosure" aria-expanded={open} onClick={toggle}>
            <span aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
            {empty ? t("calendars.none") : t("calendars.title", { n: String(profile.calendars.length) })}
            {from !== null && (
              <>
                {" "}
                <small>· {t("calendars.from", { year: String(from) })}</small>
              </>
            )}
          </button>
        </h2>
        <button type="button" onClick={onEdit}>
          {empty ? t("calendars.choose") : t("calendars.edit")}
        </button>
      </div>
      {open && (
        <>
          <ul>
            {profile.calendars.map((c) => {
              const entry = index?.find((e) => e.id === c.id);
              const file = loaded.find((f) => f.id === c.id);
              // Regions the loaded calendar no longer has are not shown (they are dropped on the next save).
              const regions = file ? c.regions.filter((r) => calendarRegions(file).includes(r)) : c.regions;
              return (
                <li key={c.id}>
                  <span>{[entry?.name ?? c.id, regions.join(", ")].filter(Boolean).join(" — ")}</span>
                  {index && !entry && <small className="error-text"> · {t("calendars.unknown")}</small>}
                  {failed.includes(c.id) && <small className="error-text"> · {t("calendars.loadFailed")}</small>}
                </li>
              );
            })}
          </ul>
          {canRemove && (
            <button type="button" onClick={() => onRemoveProfile(year)}>
              {t("calendars.removeProfile", { year: String(year) })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
