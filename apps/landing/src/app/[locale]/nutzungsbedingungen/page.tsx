import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@schichtplan/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOrganization } from "@schichtplan/shared";
import { getRequestOrigin } from "@schichtplan/ui/og";
import { LEGAL_ROBOTS, LegalPage, List, Section } from "@/components/LegalPage";
import { landingPageMetadata } from "@/lib/ogPages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const base = await landingPageMetadata("nutzungsbedingungen", locale);
  return {
    ...base,
    robots: LEGAL_ROBOTS,
  };
}

// Texte und Stand-Datum (`landing.terms.stand`) stehen in den Katalogen aller Sprachen.
// Bei inhaltlichen Änderungen auch TERMS_VERSION in packages/shared/src/constants.ts erhöhen.

export default async function NutzungsbedingungenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "landing.terms" });

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);

  // Deutsch bleibt gross geschrieben, andere Sprachen mitten im Satz klein
  const lower = (term: string) => (locale === "de" ? term : term.toLowerCase());
  const base = {
    org: org.slug,
    name: org.name,
    unit: lower(org.unitTerm),
    units: lower(org.unitTermPlural),
    notice: org.independentNotice ? ` ${org.independentNotice}` : "",
  };
  // Satzteile mit Artikel, Fall und Geschlecht (je Sprache und Verband verschieden)
  const p = {
    ...base,
    the: t("term.the", base),
    theCap: t("term.theCap", base),
    theAcc: t("term.theAcc", base),
    aUnit: t("term.aUnit", base),
    ofThe: t("term.ofThe", base),
    she: t("term.she", base),
    poss: t("term.poss", base),
    onBehalf: t("term.onBehalf", base),
    byUnits: t("term.byUnits", base),
    ofUnits: t("term.ofUnits", base),
  };

  const tags = {
    privacy: (chunks: ReactNode) => <Link href="/datenschutz">{chunks}</Link>,
    imprint: (chunks: ReactNode) => <Link href="/impressum">{chunks}</Link>,
    p7: (chunks: ReactNode) => <Link href={{ pathname: "/datenschutz", hash: "dritte" }}>{chunks}</Link>,
    p8: (chunks: ReactNode) => <Link href={{ pathname: "/datenschutz", hash: "dauer" }}>{chunks}</Link>,
    p9: (chunks: ReactNode) => <Link href={{ pathname: "/datenschutz", hash: "sicherheit" }}>{chunks}</Link>,
  };

  return (
    <LegalPage
      org={org}
      title={t("title")}
      stand={t("stand")}
      intro={<p>{t.rich("intro", { ...tags, ...p })}</p>}
    >
      <Section id="angebot" title={t("s1.title")}>
        <p>{t("s1.p1", p)}</p>
      </Section>

      <Section id="rollen" title={t("s2.title", p)}>
        <p>{t("s2.p1", p)}</p>
      </Section>

      <Section id="auftragsbearbeitung" title={t("s3.title")}>
        <p>{t("s3.intro", p)}</p>
        <List>
          <li>{t("s3.i1")}</li>
          <li>{t.rich("s3.i2", tags)}</li>
          <li>{t.rich("s3.i3", tags)}</li>
          <li>{t("s3.i4")}</li>
          <li>{t("s3.i5", p)}</li>
          <li>{t("s3.i6", p)}</li>
          <li>{t.rich("s3.i7", { ...tags, ...p })}</li>
        </List>
      </Section>

      <Section id="pflichten" title={t("s4.title")}>
        <List>
          <li>{t("s4.i1")}</li>
          <li>{t("s4.i2")}</li>
          <li>{t("s4.i3")}</li>
          <li>{t("s4.i4")}</li>
          <li>{t("s4.i5")}</li>
          <li>{t("s4.i6")}</li>
          <li>{t("s4.i7")}</li>
        </List>
      </Section>

      <Section id="missbrauch" title={t("s5.title")}>
        <p>{t("s5.p1", p)}</p>
      </Section>

      <Section id="haftung" title={t("s6.title")}>
        <p>{t("s6.p1")}</p>
      </Section>

      <Section id="ende" title={t("s7.title")}>
        <p>{t.rich("s7.p1", { ...tags, ...p })}</p>
      </Section>

      <Section id="aenderungen" title={t("s8.title")}>
        <p>{t("s8.p1", p)}</p>
      </Section>
    </LegalPage>
  );
}
