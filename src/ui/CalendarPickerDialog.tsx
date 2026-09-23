import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalendarIndexEntry, SelectedCalendar } from "../core/types";
import { calendarRegions, matchesQuery } from "../data/calendars";
import { useCalendars } from "../data/hooks";
import { useI18n } from "../i18n/I18nProvider";
import { Dialog } from "./Dialog";

export interface CalendarChoice {
  calendars: SelectedCalendar[];
  includeObservances: boolean;
}

export interface CalendarPickerProps {
  open: boolean;
  year: number;
  firstRun: boolean;
  index: CalendarIndexEntry[] | null;
  initial: CalendarChoice;
  onSave(choice: CalendarChoice): void;
  onClose(): void;
}

export function CalendarPickerDialog(props: CalendarPickerProps) {
  // Mounting the body on open gives every opening a fresh draft taken from `initial`.
  return props.open ? <PickerBody {...props} /> : null;
}

function PickerBody({ year, firstRun, index, initial, onSave, onClose }: CalendarPickerProps) {
  const { t, lang } = useI18n();
  const [draft, setDraft] = useState<CalendarChoice>(initial);
  const [query, setQuery] = useState("");
  const [initialIds] = useState(() => new Set(initial.calendars.map((c) => c.id)));
  const files = useCalendars(draft.calendars.map((c) => c.id));

  // Fixed while the dialog is open (so rows never jump): chosen calendars first, then the rest by name.
  const ordered = useMemo(() => {
    const collator = new Intl.Collator(lang);
    const byName = [...(index ?? [])].sort((a, b) => collator.compare(a.name, b.name));
    return [...byName.filter((c) => initialIds.has(c.id)), ...byName.filter((c) => !initialIds.has(c.id))];
  }, [index, lang, initialIds]);
  const visible = ordered.filter((c) => matchesQuery(c.name, query));

  const isChecked = (id: string) => draft.calendars.some((c) => c.id === id);
  const toggleCalendar = (id: string) =>
    setDraft((d) => ({
      ...d,
      calendars: d.calendars.some((c) => c.id === id)
        ? d.calendars.filter((c) => c.id !== id)
        : [...d.calendars, { id, regions: [] }],
    }));
  const setRegions = (id: string, regions: string[]) =>
    setDraft((d) => ({ ...d, calendars: d.calendars.map((c) => (c.id === id ? { ...c, regions } : c)) }));

  /** Drops ids missing from the index and regions missing from their (loaded) calendar. */
  const cleaned = (): CalendarChoice => {
    const known = index ? new Set(index.map((c) => c.id)) : null;
    const calendars = draft.calendars
      .filter((c) => !known || known.has(c.id))
      .map((c) => {
        const file = files.calendars.find((f) => f.id === c.id);
        const available = file ? calendarRegions(file) : null;
        return { ...c, regions: c.regions.filter((r) => !available || available.includes(r)).sort() };
      });
    return { ...draft, calendars };
  };

  const save = () => onSave(cleaned());
  const close = firstRun ? save : onClose;

  return (
    <Dialog open onClose={close} labelledBy="picker-title" className="picker">
      <h2 id="picker-title">{firstRun ? t("picker.firstRunTitle") : t("picker.title", { year: String(year) })}</h2>
      <input
        type="search"
        aria-label={t("picker.search")}
        placeholder={t("picker.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {index === null ? (
        <p className="muted">{t("picker.loading")}</p>
      ) : (
        <ul className="picker-list">
          {visible.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={isChecked(c.id)} onChange={() => toggleCalendar(c.id)} /> {c.name}
              </label>
            </li>
          ))}
        </ul>
      )}

      {draft.calendars.map((selected) => {
        const file = files.calendars.find((f) => f.id === selected.id);
        if (!file) {
          return files.loading ? (
            <p key={selected.id} className="muted">
              {t("picker.loadingRegions")}
            </p>
          ) : null;
        }
        const regions = calendarRegions(file);
        if (regions.length === 0) return null;
        const name = index?.find((c) => c.id === selected.id)?.name ?? file.name;
        return (
          <RegionGroup
            key={selected.id}
            name={name}
            regions={regions}
            selected={selected.regions}
            onChange={(next) => setRegions(selected.id, next)}
          />
        );
      })}

      <label>
        <input
          type="checkbox"
          checked={draft.includeObservances}
          onChange={(e) => setDraft((d) => ({ ...d, includeObservances: e.target.checked }))}
        />{" "}
        {t("picker.observances")}
      </label>

      <div className="dialog-footer">
        {!firstRun && (
          <button type="button" onClick={onClose}>
            {t("picker.cancel")}
          </button>
        )}
        <button type="button" className="primary" onClick={save}>
          {firstRun ? t("picker.continue") : t("picker.save")}
        </button>
      </div>
      <button type="button" className="dialog-close" aria-label={t("picker.close")} onClick={close}>
        ×
      </button>
    </Dialog>
  );
}

interface RegionGroupProps {
  name: string;
  regions: string[];
  selected: string[];
  onChange(regions: string[]): void;
}

function RegionGroup({ name, regions, selected, onChange }: RegionGroupProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);
  const visible = regions.filter((r) => matchesQuery(r, query));
  const chosen = visible.filter((r) => selected.includes(r)).length;
  const all = visible.length > 0 && chosen === visible.length;

  // Before paint, so the box never flashes the wrong state.
  useLayoutEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = chosen > 0 && !all;
  }, [chosen, all]);

  const toggle = (region: string) =>
    onChange(selected.includes(region) ? selected.filter((r) => r !== region) : [...selected, region]);
  // "Select all" acts on the regions that match the current search only.
  const toggleAll = () =>
    onChange(all ? selected.filter((r) => !visible.includes(r)) : [...new Set([...selected, ...visible])]);

  return (
    <fieldset>
      <legend>{t("picker.regionsFor", { name })}</legend>
      <p className="muted">{t("picker.regionsHint")}</p>
      <div className="region-tools">
        <input
          type="search"
          aria-label={`${t("picker.searchRegions")} (${name})`}
          placeholder={t("picker.searchRegions")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input ref={selectAllRef} type="checkbox" checked={all} onChange={toggleAll} /> {t("picker.selectAll")}
        </label>
      </div>
      <div className="regions">
        {visible.map((region) => (
          <label key={region}>
            <input type="checkbox" checked={selected.includes(region)} onChange={() => toggle(region)} /> {region}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
