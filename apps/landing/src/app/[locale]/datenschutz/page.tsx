import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@schichtplan/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ORGANIZATIONS,
  getOrganization,
  getVocabulary,
  helpUrl,
  type OrganizationSlug,
} from "@schichtplan/shared";
import { umamiEnabled } from "@schichtplan/ui";
import { getRequestOrigin } from "@schichtplan/ui/og";
import { LEGAL_ROBOTS, LegalPage, List, Section } from "@/components/LegalPage";
import { ContactReveal } from "./ContactReveal";
import { landingPageMetadata } from "@/lib/ogPages";
import { termInSentence } from "@/lib/landingVocab";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const base = await landingPageMetadata("datenschutz", locale);
  return {
    ...base,
    robots: LEGAL_ROBOTS,
  };
}

/**
 * Datenbank des Verbands (Hitobito), über die man sich anmelden kann, samt Link auf deren Datenschutz-Seite.
 * Die Beschreibungen («betrieben vom …») stehen im Katalog (`landing.privacy.fed`). Vereine haben keine
 * Verbandsdatenbank (Anmeldung mit E-Mail und Passwort).
 */
const FEDERATION_POLICY_URL: Record<OrganizationSlug, string | null> = {
  cevi: "https://www.cevi.ch/datenschutz/",
  pfadi: "https://pfadi.swiss/de/verband/datenschutz/",
  jubla: "https://www.jubla.ch/datenschutz",
  verein: null,
};

function StorageTable({
  headers,
  rows,
}: {
  headers: [name: string, purpose: string, duration: string];
  rows: [name: string, purpose: string, duration: string][];
}) {
  // Mobil als Karten untereinander, ab sm als dreispaltige Tabelle
  return (
    <div className="overflow-hidden rounded-card border border-line text-sm">
      <div
        aria-hidden
        className="hidden border-b border-line bg-surface-2 px-3 py-2 font-semibold text-fg sm:grid sm:grid-cols-[11rem_1fr_9rem] sm:gap-4"
      >
        <span>{headers[0]}</span>
        <span>{headers[1]}</span>
        <span>{headers[2]}</span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([name, purpose, duration]) => (
          <div
            key={name}
            className="grid gap-1 px-3 py-2.5 sm:grid-cols-[11rem_1fr_9rem] sm:gap-4"
          >
            <dt className="break-all font-mono text-xs leading-6 text-fg">
              {name}
            </dt>
            <dd>{purpose}</dd>
            <dd className="text-fg-subtle sm:text-fg-muted">{duration}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const externalLink = (href: string) => (chunks: ReactNode) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {chunks}
  </a>
);

export default async function DatenschutzPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "landing.privacy" });

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const vocab = getVocabulary(org.dbType, locale);
  const policyUrl = FEDERATION_POLICY_URL[org.slug];
  const hasFederationDb = policyUrl !== null;
  // Web-Statistik (Umami) nur erwähnen, wenn sie für diese Domain eingerichtet ist
  const webStats = umamiEnabled(host);

  // Begriffe der Verbandsdomain. Deutsch bleibt gross geschrieben, andere Sprachen mitten im Satz klein.
  const isGerman = locale === "de";
  const lower = (term: string) => (isGerman ? term : term.toLowerCase());
  const unitLower = org.unitTerm.toLowerCase();
  const base = {
    org: org.slug,
    name: org.name,
    domain: org.domain,
    db: org.authProviderShort,
    authName: org.authProviderName,
    unit: lower(org.unitTerm),
    unitLower,
    units: lower(org.unitTermPlural),
    lead: lower(vocab.departmentLeader),
    groups: lower(vocab.groupPlural),
    nickname: termInSentence(org.nicknameTerm, locale, org.orgName),
    Nickname: org.nicknameTerm,
    subdomain: `<${unitLower}>.${org.domain}`,
  };

  // Satzteile mit Artikel und Fall, die je Sprache und Verband (Geschlecht des Begriffs) anders lauten
  const ofYourUnit = t("term.ofYourUnit", base);
  const p = {
    ...base,
    the: t("term.the", base),
    ofThe: t("term.ofThe", base),
    inThe: t("term.inThe", base),
    respective: t("term.respective", base),
    inConcerned: t("term.inConcerned", base),
    ofAUnit: t("term.ofAUnit", base),
    inOrg: t("term.inOrg", base),
    ofUnits: t("term.ofUnits", base),
    theUnits: t("term.theUnits", base),
    toUnits: t("term.toUnits", base),
    theGroups: t("term.theGroups", base),
    homeUnit: t("term.homeUnit", base),
    fedUnit: t("term.fedUnit", { ...base, ofYourUnit }),
    fedStructure: t("term.fedStructure", base),
    loginMethods: t("term.loginMethods", base),
    umami: webStats ? t("s6.umami") : "",
    fedOperator: t("fed.operator", base),
    fedWhere: t("fed.where", base),
    policyLabel: t("fed.policyLabel", base),
  };

  const tags = {
    b: (chunks: ReactNode) => <strong>{chunks}</strong>,
    code: (chunks: ReactNode) => <code>{chunks}</code>,
    terms: (chunks: ReactNode) => <Link href="/nutzungsbedingungen">{chunks}</Link>,
    help: (chunks: ReactNode) => <a href={helpUrl("/", host, locale)}>{chunks}</a>,
    crowdsec: externalLink("https://www.crowdsec.net/privacy-policy"),
    edoeb: externalLink("https://www.edoeb.admin.ch"),
    fedlink: externalLink(policyUrl ?? ""),
  };

  // Domainliste in der Sprache der Seite («a, b, c und d»), die Domains fett
  const domainParts = new Intl.ListFormat(INTL_LOCALES[locale], {
    style: "long",
    type: "conjunction",
  }).formatToParts(Object.values(ORGANIZATIONS).map((o) => o.domain));
  // Schlüssel: Domain bzw. «nach <Domain>» für die Trennzeichen dazwischen (stabil, ohne Listenposition)
  let previousDomain = "";
  const domainNodes = domainParts.map((part) => {
    if (part.type === "element") {
      previousDomain = part.value;
      return <strong key={part.value}>{part.value}</strong>;
    }
    return <span key={`after-${previousDomain}`}>{part.value}</span>;
  });

  const durations = {
    token: t("s6.dur.token"),
    min10: t("s6.dur.min10"),
    min15: t("s6.dur.min15"),
    days14: t("s6.dur.days14"),
    reset: t("s6.dur.reset"),
    delete: t("s6.dur.delete"),
    logout: t("s6.dur.logout"),
  };

  return (
    <LegalPage
      org={org}
      title={t("title")}
      stand={t("stand")}
      intro={<p>{t("intro", p)}</p>}
    >
      <Section id="verantwortlich" title={t("s1.title")}>
        <p>{t("s1.p1")}</p>
        <ContactReveal />
        <p>{t("s1.p2")}</p>
      </Section>

      <Section id="geltung" title={t("s2.title")}>
        <p>{t("s2.intro", p)}</p>
        <List>
          <li>{t.rich("s2.landing", { ...tags, ...p })}</li>
          <li>{t.rich("s2.login", { ...tags, ...p })}</li>
          <li>{t.rich("s2.plans", { ...tags, ...p })}</li>
          <li>{t.rich("s2.help", { ...tags, ...p })}</li>
          <li>{t.rich("s2.admin", tags)}</li>
        </List>
        <p>
          {t("s2.domainsIntro")}{" "}
          {domainNodes}
          {t("s2.domainsOutro")}
        </p>
        <p>{t.rich("s2.roles", { ...tags, ...p })}</p>
      </Section>

      <Section id="daten" title={t("s3.title")}>
        <h3 className="font-semibold text-fg">{t("s3.account.title")}</h3>
        <p>{t("s3.account.intro")}</p>
        <List>
          <li>{t.rich("s3.account.email", tags)}</li>
          {hasFederationDb && <li>{t.rich("s3.account.fed", { ...tags, ...p })}</li>}
          <li>{t.rich("s3.account.nickname", { ...tags, ...p })}</li>
        </List>
        <p>{t("s3.account.optional", p)}</p>
        <p>{t.rich("s3.account.noAddress", tags)}</p>

        <h3 className="pt-2 font-semibold text-fg">{t("s3.planning.title")}</h3>
        <List>
          <li>{t("s3.planning.i1")}</li>
          <li>{t("s3.planning.i2")}</li>
          <li>{t("s3.planning.i3")}</li>
          <li>{t("s3.planning.i4", p)}</li>
          <li>{t("s3.planning.i5")}</li>
          <li>{t("s3.planning.i6")}</li>
          <li>{t("s3.planning.i7")}</li>
          <li>{t("s3.planning.i8")}</li>
          <li>{t("s3.planning.i9")}</li>
        </List>

        <h3 className="pt-2 font-semibold text-fg">{t("s3.content.title")}</h3>
        <p>{t("s3.content.text", p)}</p>

        <h3 className="pt-2 font-semibold text-fg">{t("s3.tech.title")}</h3>
        <p>{t("s3.tech.p1", p)}</p>
        <p>{t("s3.tech.p2")}</p>

        <h3 className="pt-2 font-semibold text-fg">{t("s3.stats.title")}</h3>
        <p>{t.rich("s3.stats.p1", { ...tags, ...p })}</p>
        <p>{t.rich("s3.stats.p2", tags)}</p>
        <p>{t.rich("s3.stats.p3", tags)}</p>

        {webStats && (
          <>
            <h3 className="pt-2 font-semibold text-fg">{t("s3.web.title")}</h3>
            <p>{t.rich("s3.web.text", tags)}</p>
          </>
        )}
      </Section>

      <Section id="zweck" title={t("s4.title")}>
        <List>
          <li>{t("s4.i1")}</li>
          <li>{t("s4.i2")}</li>
          <li>{t("s4.i3", p)}</li>
          <li>{t("s4.i4")}</li>
          <li>{t("s4.i5")}</li>
          <li>{t("s4.i6")}</li>
          <li>{t("s4.i7")}</li>
          <li>{t("s4.i8")}</li>
        </List>
        <p>{t("s4.closing")}</p>
      </Section>

      <Section id="sichtbarkeit" title={t("s5.title")}>
        <List>
          <li>{t.rich("s5.i1", { ...tags, ...p })}</li>
          <li>{t.rich("s5.i2", { ...tags, ...p })}</li>
          <li>{t.rich("s5.i3", tags)}</li>
        </List>
      </Section>

      <Section id="speicher" title={t("s6.title")}>
        <p>{t.rich("s6.p1", { ...tags, ...p })}</p>
        <StorageTable
          headers={[t("table.name"), t("table.purpose"), t("table.duration")]}
          rows={[
            ["token", t("s6.cookie.token", p), durations.token],
            ...(hasFederationDb
              ? ([
                  ["cevidb_oauth_state", t("s6.cookie.oauth", p), durations.min10],
                  ["cevidb_link", t("s6.cookie.link", p), durations.min15],
                ] as [string, string, string][])
              : []),
            ["mfa_challenge", t("s6.cookie.mfa"), durations.min10],
            ["schichtplan_pwa_dismissed", t("s6.cookie.pwa"), durations.days14],
          ]}
        />
        <p>{t("s6.localIntro")}</p>
        <StorageTable
          headers={[t("table.name"), t("table.purpose"), t("table.duration")]}
          rows={[
            ["cevi-theme", t("s6.local.theme"), durations.reset],
            ["schichtplan.eventView", t("s6.local.eventView"), durations.delete],
            ["schichtplan.theme", t("s6.local.unitTheme", p), durations.reset],
            ["schichtplan.pwa_install_dismissed", t("s6.local.pwa"), durations.days14],
            ["ok-shift-view", t("s6.local.shiftView"), durations.delete],
            ["schichtplan.recent_commands", t("s6.local.commands"), durations.delete],
            ["schichtplan:other-levels-hint-dismissed", t("s6.local.hint"), durations.delete],
            ["schichtplan.offline_owner", t("s6.local.offlineOwner"), durations.logout],
            ["schichtplan.last_online_sync", t("s6.local.lastSync"), durations.logout],
            ["sp_staff_pin_<anlass>", t("s6.local.staffPin"), durations.delete],
            ["admin.orgFilter", t("s6.local.orgFilter"), durations.delete],
          ]}
        />
        <p>{t.rich("s6.session", tags)}</p>
        <p>{t("s6.offline")}</p>
        <p>{t.rich("s6.outro", tags)}</p>
      </Section>

      <Section id="dritte" title={t("s7.title")}>
        <p>{t("s7.intro")}</p>
        <List>
          <li>{t.rich("s7.hosting", tags)}</li>
          <li>{t.rich("s7.google", tags)}</li>
          <li>{t.rich("s7.infomaniak", tags)}</li>
          {hasFederationDb && <li>{t.rich("s7.fed", { ...tags, ...p })}</li>}
          <li>{t.rich("s7.crowdsec", tags)}</li>
          <li>{t.rich("s7.letsencrypt", tags)}</li>
          <li>{t.rich("s7.push", tags)}</li>
          <li>{t.rich("s7.discord", tags)}</li>
        </List>
        <p>{t("s7.other")}</p>
        <p>{t("s7.transfer")}</p>
      </Section>

      <Section id="dauer" title={t("s8.title")}>
        <List>
          <li>{t("s8.i1", p)}</li>
          <li>{t("s8.i2", p)}</li>
          <li>{t("s8.i3", p)}</li>
          <li>{t("s8.i4", p)}</li>
          <li>{t("s8.i5")}</li>
          <li>{t("s8.i6")}</li>
          <li>{t("s8.i7", p)}</li>
          <li>{t("s8.i8")}</li>
          <li>{t("s8.i9")}</li>
          <li>{t("s8.i10")}</li>
          <li>{t("s8.i11")}</li>
          <li>{t("s8.i12")}</li>
          <li>{t("s8.i13")}</li>
        </List>
      </Section>

      <Section id="sicherheit" title={t("s9.title")}>
        <p>{t("s9.p1")}</p>
      </Section>

      <Section id="kinder" title={t("s10.title")}>
        <p>{t("s10.p1", p)}</p>
        <p>{t("s10.p2")}</p>
      </Section>

      <Section id="rechte" title={t("s11.title")}>
        <p>{t("s11.intro")}</p>
        <List>
          <li>{t("s11.i1")}</li>
          <li>{t("s11.i2")}</li>
          <li>{t("s11.i3")}</li>
          <li>{t("s11.i4")}</li>
        </List>
        <p>{t("s11.download")}</p>
        <p>{t.rich("s11.contact", tags)}</p>
      </Section>

      <Section id="aenderungen" title={t("s12.title")}>
        <p>{t.rich("s12.p1", tags)}</p>
      </Section>
    </LegalPage>
  );
}
