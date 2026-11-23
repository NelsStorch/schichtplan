import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@schichtplan/i18n";
import { setRequestLocale } from "next-intl/server";
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
    alternates: { canonical: locale === DEFAULT_LOCALE ? "/nutzungsbedingungen" : `/${locale}/conditions-utilisation` },
    robots: LEGAL_ROBOTS,
  };
}

/** Bei inhaltlichen Änderungen auch TERMS_VERSION in packages/shared/src/constants.ts erhöhen */
const STAND = "19. November 2026";

export default async function NutzungsbedingungenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  setRequestLocale(locale);

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const isVerein = org.slug === "verein";
  const unit = org.unitTerm;
  const units = org.unitTermPlural;
  /** «die Abteilung», «die Schar», «der Verein» */
  const the = isVerein ? "der Verein" : `die ${unit}`;
  const The = isVerein ? "Der Verein" : `Die ${unit}`;
  /** «der Abteilung», «des Vereins» */
  const ofThe = isVerein ? "des Vereins" : `der ${unit}`;

  return (
    <LegalPage
      org={org}
      title="Nutzungsbedingungen"
      stand={STAND}
      intro={
        <p>
          Diese Bedingungen regeln die Nutzung des {org.name}s durch {units} und
          ihre Planenden. Wer eine {unit} anlegt, stimmt ihnen im Namen{" "}
          {ofThe} zu. Für Helfende, die sich nur eintragen, gilt vor allem die{" "}
          <Link href="/datenschutz">Datenschutzerklärung</Link>.
        </p>
      }
    >
      <Section id="angebot" title="1. Angebot">
        <p>
          Der {org.name} ist ein unabhängiges, ehrenamtliches Projekt.
          {org.independentNotice && <> {org.independentNotice}</>} Die Nutzung
          ist kostenlos. Wir bemühen uns um einen zuverlässigen Betrieb,
          können aber keine bestimmte Verfügbarkeit zusagen. Funktionen können
          sich ändern oder wegfallen; grössere Änderungen kündigen wir
          rechtzeitig an.
        </p>
      </Section>

      <Section id="rollen" title={`2. Rollen: ${the} und wir`}>
        <p>
          {The} entscheidet selbst, welche Anlässe sie anlegt, welche Angaben sie
          von Helfenden verlangt und wen sie einteilt. Für diese Personendaten
          ist {the} datenschutzrechtlich verantwortlich. Wir bearbeiten sie in
          ihrem Auftrag (Auftragsbearbeitung nach Art. 9 DSG). Für Konten,
          Anmeldung, Sicherheit und die anonyme Nutzungsstatistik sind wir selbst
          verantwortlich.
        </p>
      </Section>

      <Section id="auftragsbearbeitung" title="3. Auftragsbearbeitung">
        <p>Für die Daten, die wir im Auftrag {ofThe} bearbeiten, gilt:</p>
        <List>
          <li>
            Wir bearbeiten sie nur, um den Schichtplan bereitzustellen, und nicht
            für eigene Zwecke.
          </li>
          <li>
            Wir schützen sie mit angemessenen technischen und organisatorischen
            Massnahmen (siehe{" "}
            <Link href={{ pathname: "/datenschutz", hash: "sicherheit" }}>Datenschutzerklärung, Abschnitt 9</Link>
            ).
          </li>
          <li>
            Wir setzen nur die Dienstleister ein, die in der{" "}
            <Link href={{ pathname: "/datenschutz", hash: "dritte" }}>Datenschutzerklärung, Abschnitt 7</Link>{" "}
            genannt sind. Neue Dienstleister nehmen wir dort auf, bevor wir sie
            einsetzen.
          </li>
          <li>
            Zugriff haben nur die wenigen Personen, die den Schichtplan betreiben;
            sie sind zur Vertraulichkeit verpflichtet.
          </li>
          <li>
            Wir unterstützen {the}, wenn jemand Auskunft, Berichtigung oder
            Löschung verlangt.
          </li>
          <li>
            Erfahren wir von einer Verletzung der Datensicherheit, die die Daten{" "}
            {ofThe} betrifft, informieren wir {the} so rasch wie möglich.
          </li>
          <li>
            Löscht {the} Anlässe oder wird sie aufgelöst, löschen wir die Daten
            nach den Fristen in der{" "}
            <Link href={{ pathname: "/datenschutz", hash: "dauer" }}>Datenschutzerklärung, Abschnitt 8</Link>
            , auch aus den Sicherungen.
          </li>
        </List>
      </Section>

      <Section id="pflichten" title="4. Pflichten der Planenden">
        <List>
          <li>
            Erfragt nur Angaben, die ihr für den Anlass wirklich braucht, und
            wählt für Antworten eine kurze Löschfrist.
          </li>
          <li>
            Gesundheitsangaben (z.&nbsp;B. Allergien) nur über Fragen, die als
            «Gesundheitsangaben» markiert sind. Dann willigen die Helfenden
            ausdrücklich ein.
          </li>
          <li>
            Wenn ihr Personen ohne eigenes Konto von Hand eintragt, informiert
            sie darüber und darüber, wofür ihr ihre Angaben braucht.
          </li>
          <li>
            Exportierte Listen (PDF, Excel) bewahrt ihr sicher auf und löscht
            sie nach dem Anlass.
          </li>
          <li>
            Ladet keine Bilder von erkennbaren Personen ohne deren Einverständnis
            hoch und keine Inhalte, an denen ihr keine Rechte habt.
          </li>
          <li>
            Haltet eure Zugänge geheim und gebt Rechte nur Personen, die sie
            brauchen.
          </li>
          <li>
            Bei Schichten mit Mindestalter (z.&nbsp;B. Bar ab 18) prüft der
            Schichtplan nur das selbst angegebene Geburtsdatum. Ausweiskontrollen
            und der Jugendschutz vor Ort bleiben Sache des OK.
          </li>
        </List>
      </Section>

      <Section id="missbrauch" title="5. Missbrauch">
        <p>
          Der Schichtplan dient der Organisation von Helfereinsätzen. Bei
          Missbrauch, etwa Spam, rechtswidrigen Inhalten oder Angriffen auf die
          Plattform, können wir Inhalte entfernen und Konten oder {units}{" "}
          sperren oder löschen.
        </p>
      </Section>

      <Section id="haftung" title="6. Haftung">
        <p>
          Wir stellen den Schichtplan unentgeltlich zur Verfügung. Soweit das
          Gesetz es zulässt, haften wir nicht für Schäden aus der Nutzung oder
          aus Ausfällen, etwa für verpasste Schichten oder verlorene Daten.
          Für Vorsatz und grobe Fahrlässigkeit haften wir nach Gesetz. Bewahrt
          wichtige Listen zusätzlich selbst auf (z.&nbsp;B. als PDF).
        </p>
      </Section>

      <Section id="ende" title="7. Ende der Nutzung">
        <p>
          {The} kann den Schichtplan jederzeit nicht mehr nutzen und ihre
          Anlässe löschen. Möchte sie {isVerein ? "den Verein" : `die ${unit}`}{" "}
          ganz entfernen, genügt eine Nachricht an die Kontaktadresse im{" "}
          <Link href="/impressum">Impressum</Link>.
        </p>
      </Section>

      <Section id="aenderungen" title="8. Änderungen und anwendbares Recht">
        <p>
          Ändern sich diese Bedingungen wesentlich, informieren wir die
          Leitungen der {units} vorher. Es gilt Schweizer Recht.
        </p>
      </Section>
    </LegalPage>
  );
}
