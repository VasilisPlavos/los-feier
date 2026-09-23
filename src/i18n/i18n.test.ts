import { describe, expect, test } from "vitest";
import en from "./en.json";
import el from "./el.json";
import { createI18n } from "./I18nProvider";
import { detectLang, translate } from "./index";

describe("i18n", () => {
  test("every language has exactly the English keys", () => {
    expect(Object.keys(el).sort()).toEqual(Object.keys(en).sort());
  });

  test("detectLang: explicit preference, then browser languages, then English", () => {
    expect(detectLang("el", ["en-US"])).toBe("el");
    expect(detectLang(null, ["el-GR", "en"])).toBe("el");
    expect(detectLang(null, ["de-CH", "en-GB"])).toBe("en");
    expect(detectLang(null, ["fr-FR"])).toBe("en");
    expect(detectLang("xx", [])).toBe("en");
  });

  test("translate interpolates and keeps unknown placeholders", () => {
    expect(translate("en", "summary.leaveDays", { n: "3" })).toBe("Leave days: 3");
    expect(translate("el", "summary.leaveDays", { n: "3" })).toBe("Ημέρες άδειας: 3");
    expect(translate("en", "summary.leaveDays")).toBe("Leave days: {n}");
  });

  test("formatters", () => {
    const enI18n = createI18n("en");
    const elI18n = createI18n("el");
    expect(enI18n.weekdayShort(0)).toBe("Mon");
    expect(enI18n.monthName(4)).toBe("April");
    expect(elI18n.formatNumber(12.5)).toBe("12,5");
    expect(enI18n.formatDate("2026-04-07")).toBe("Tuesday, April 7, 2026");
    expect(enI18n.formatRange("2026-04-03", "2026-04-06")).toMatch(/Apr 3.+6/);
    expect(enI18n.formatRange("2026-04-03", "2026-04-03")).toBe("Apr 3");
  });
});
