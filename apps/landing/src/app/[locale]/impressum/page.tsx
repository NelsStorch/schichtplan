import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@schichtplan/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOrganization } from "@schichtplan/shared";
import { getRequestOrigin } from "@schichtplan/ui/og";
import { LEGAL_ROBOTS, LegalPage, Section } from "@/components/LegalPage";
import { ContactReveal } from "../datenschutz/ContactReveal";
import { landingPageMetadata } from "@/lib/ogPages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const base = await landingPageMetadata("impressum", locale);
  return {
    ...base,
    robots: LEGAL_ROBOTS,
  };
}

export default async function ImpressumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "landing.imprint" });

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);

  const base = {
    org: org.slug,
    name: org.name,
    units: locale === "de" ? org.unitTermPlural : org.unitTermPlural.toLowerCase(),
    notice: org.independentNotice ? ` ${org.independentNotice}` : "",
  };
  const p = { ...base, theUnits: t("term.theUnits", base) };

  const tags = {
    github: (chunks: ReactNode) => (
      <a href="https://github.com/NelsStorch/schichtplan" target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    ),
    privacy: (chunks: ReactNode) => <Link href="/datenschutz">{chunks}</Link>,
    terms: (chunks: ReactNode) => <Link href="/nutzungsbedingungen">{chunks}</Link>,
  };

  return (
    <LegalPage org={org} title={t("title")}>
      <Section id="betrieb" title={t("operation.title")}>
        <p>{t("operation.p1", p)}</p>
        <ContactReveal />
      </Section>

      <Section id="quellcode" title={t("source.title")}>
        <p>{t.rich("source.p1", tags)}</p>
      </Section>

      <Section id="weiteres" title={t("more.title")}>
        <p>{t.rich("more.p1", { ...tags, ...p })}</p>
      </Section>
    </LegalPage>
  );
}
