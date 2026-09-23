import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../i18n/I18nProvider";
import type { Lang } from "../i18n";

export function renderWithI18n(ui: ReactElement, lang: Lang = "en") {
  return render(<I18nProvider lang={lang}>{ui}</I18nProvider>);
}
