import { useState, type FormEvent } from "react";
import { isValidIsoDate, parseIso } from "../core/dates";
import type { CustomHoliday } from "../core/types";
import { useI18n } from "../i18n/I18nProvider";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

interface Props {
  year: number;
  onSave(holiday: CustomHoliday): void;
  onCancel(): void;
}

export function CustomHolidayForm({ year, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [date, setDate] = useState(`${year}-01-01`);
  const [yearly, setYearly] = useState(true);
  const [half, setHalf] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !isValidIsoDate(date)) return;
    const { month, day } = parseIso(date);
    onSave({
      id: newId(),
      name: name.trim(),
      fraction: half ? 0.5 : 1,
      rule: yearly ? { type: "yearly", month, day } : { type: "once", date },
    });
  };

  return (
    <form className="custom-form" onSubmit={submit}>
      <label>
        {t("custom.name")}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {t("custom.date")}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} /> {t("custom.yearly")}
      </label>
      <label>
        <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} /> {t("custom.half")}
      </label>
      <div>
        <button type="submit">{t("custom.save")}</button> <button type="button" onClick={onCancel}>{t("custom.cancel")}</button>
      </div>
    </form>
  );
}
