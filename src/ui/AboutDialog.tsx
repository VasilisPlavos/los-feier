import { useI18n } from "../i18n/I18nProvider";
import { Dialog } from "./Dialog";

const SOURCE_URL = "https://github.com/VasilisPlavos/los-feier";

export function AboutDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} labelledBy="about-title" className="about">
      <h2 id="about-title">{t("about.title")}</h2>
      <p>{t("about.what")}</p>
      <h3>{t("about.nameTitle")}</h3>
      <p>{t("about.name")}</p>
      <p className="muted">{t("about.data")}</p>
      <p>
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          {t("about.source")}
        </a>{" "}
        · {t("about.license")}
      </p>
      <div className="dialog-footer">
        <button type="button" onClick={onClose}>
          {t("about.close")}
        </button>
      </div>
    </Dialog>
  );
}
