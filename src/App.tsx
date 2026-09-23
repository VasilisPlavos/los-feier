import type { ReactNode } from "react";
import { detectLang } from "./i18n";
import { I18nProvider } from "./i18n/I18nProvider";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { Layout } from "./ui/Layout";

function I18nRoot({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return <I18nProvider lang={detectLang(state.language, languages)}>{children}</I18nProvider>;
}

export default function App({ storage }: { storage?: Storage | null }) {
  return (
    <StoreProvider storage={storage}>
      <I18nRoot>
        <Layout />
      </I18nRoot>
    </StoreProvider>
  );
}
