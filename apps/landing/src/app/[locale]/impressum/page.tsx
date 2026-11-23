import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@schichtplan/i18n";
import { setRequestLocale } from "next-intl/server";
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
    alternates: { canonical: locale === DEFAULT_LOCALE ? "/impressum" : `/${locale}/mentions-legales` },
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

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);

  return (
    <LegalPage org={org} title="Impressum">
      <Section id="betrieb" title="Betrieb und Kontakt">
        <p>
          Der {org.name} ist ein unabhängiges, ehrenamtliches und nicht
          kommerzielles Projekt.
          {org.independentNotice && <> {org.independentNotice}</>}
        </p>
        <ContactReveal />
      </Section>

      <Section id="quellcode" title="Quellcode">
        <p>
          Der Quellcode ist öffentlich auf{" "}
          <a
            href="https://github.com/NelsStorch/schichtplan_v2"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{" "}
          und steht unter der Lizenz GNU AGPL v3.
        </p>
      </Section>

      <Section id="weiteres" title="Weiteres">
        <p>
          Wie wir mit Personendaten umgehen, steht in der{" "}
          <Link href="/datenschutz">Datenschutzerklärung</Link>. Für{" "}
          {org.unitTermPlural} gelten die{" "}
          <Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
