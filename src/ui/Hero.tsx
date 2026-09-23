import { useI18n } from "../i18n/I18nProvider";

/** Short intro above the calendar: what the page is and how to use it. */
export function Hero({ year }: { year: number }) {
  const { t } = useI18n();
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h2 id="hero-title">{t("hero.title", { year: String(year) })}</h2>
      <p>{t("hero.text")}</p>
    </section>
  );
}
