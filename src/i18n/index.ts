import en from "./en.json";
import el from "./el.json";

export const MESSAGES = { en, el } as const;
export type Lang = keyof typeof MESSAGES;
export type MessageKey = keyof typeof en;
export const SUPPORTED_LANGS = Object.keys(MESSAGES) as Lang[];

/** Shown in the language picker in their own language. */
export const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", el: "Ελληνικά" };

export function isLang(value: string): value is Lang {
  return (SUPPORTED_LANGS as string[]).includes(value);
}

export function detectLang(preference: string | null, navigatorLanguages: readonly string[]): Lang {
  const candidates = preference ? [preference, ...navigatorLanguages] : navigatorLanguages;
  for (const tag of candidates) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

export function translate(lang: Lang, key: MessageKey, vars: Record<string, string> = {}): string {
  const table = MESSAGES[lang] as Record<string, string>;
  const template = table[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
