import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translate, type Lang, type MessageKey } from "./index";

export interface I18n {
  lang: Lang;
  t(key: MessageKey, vars?: Record<string, string>): string;
  formatNumber(n: number): string;
  monthName(month: number): string; // 1–12
  weekdayShort(index: number): string; // 0 = Monday
  formatDate(iso: string, style?: "long" | "short"): string;
  formatRange(startIso: string, endIso: string): string;
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function createI18n(lang: Lang): I18n {
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const month = new Intl.DateTimeFormat(lang, { month: "long", timeZone: "UTC" });
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const short = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return {
    lang,
    t: (key, vars) => translate(lang, key, vars),
    formatNumber: (n) => number.format(n),
    monthName: (m) => month.format(utc(`2024-${String(m).padStart(2, "0")}-01`)),
    weekdayShort: (i) => weekday.format(utc(`2024-01-0${i + 1}`)), // 2024-01-01 was a Monday
    formatDate: (iso, style = "long") => (style === "long" ? long : short).format(utc(iso)),
    formatRange: (a, b) => (a === b ? short.format(utc(a)) : short.formatRange(utc(a), utc(b))),
  };
}

const I18nContext = createContext<I18n>(createI18n("en"));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => createI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
