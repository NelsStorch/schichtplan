export type OrganizationSlug = 'cevi' | 'pfadi' | 'jubla' | 'verein';
export type OrganizationType = 'CEVI' | 'PFADI' | 'JUBLA' | 'OTHER';

export interface OrganizationConfig {
  slug: OrganizationSlug;
  dbType: OrganizationType;
  name: string;
  orgName: string;
  domain: string;
  targetGroup: string;
  unitTerm: string;
  unitTermPlural: string;
  nicknameTerm: string;
  /** Leitung der Einheit in der Anrede des Hilfe-Centers (z. B. «Abteilungsleitung») */
  leadTerm: string;
  /** Endung der Umgebungsvariablen für den Mailversand (SMTP_USER_<ENV_SUFFIX>) */
  envSuffix: string;
  authProviderName: string;
  authProviderShort: string;
  primaryColor: string;
  /** Akzentfarbe für Text auf hellem bzw. dunklem Grund (Hilfe-Center), je mit ausreichendem Kontrast */
  accentInkLight: string;
  accentInkDark: string;
  logoUrl: string;
  /** Optionaler Hinweis, dass das Projekt unabhängig vom Verband ist (Footer, Login) */
  independentNotice?: string;
  metaDescription: string;
  heroHeadlineHighlight: string;
}

export const ORGANIZATIONS: Record<OrganizationSlug, OrganizationConfig> = {
  cevi: {
    slug: 'cevi',
    dbType: 'CEVI',
    name: 'Cevi Schichtplan',
    orgName: 'Cevi',
    domain: 'cevi-schichtplan.ch',
    targetGroup: 'Cevi-Abteilungen',
    unitTerm: 'Abteilung',
    unitTermPlural: 'Abteilungen',
    nicknameTerm: 'Cevi-Name',
    leadTerm: 'Abteilungsleitung',
    envSuffix: 'CEVI',
    authProviderName: 'Cevi.DB (Hitobito)',
    authProviderShort: 'Cevi.DB',
    primaryColor: '#e11d48',
    accentInkLight: '#be123c',
    accentInkDark: '#fb7185',
    logoUrl: '/images/cevi-logo.svg',
    independentNotice: 'Kein offizielles Angebot von Cevi Schweiz.',
    metaDescription:
      'Kostenlose Helferliste online für Chilbi, Lager und Anlässe von Cevi-Abteilungen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Cevi-Abteilungen',
  },
  pfadi: {
    slug: 'pfadi',
    dbType: 'PFADI',
    name: 'Pfadi Schichtplan',
    orgName: 'Pfadi',
    domain: 'pfadi-schichtplan.ch',
    targetGroup: 'Pfadi-Abteilungen',
    unitTerm: 'Abteilung',
    unitTermPlural: 'Abteilungen',
    nicknameTerm: 'Pfadiname',
    leadTerm: 'Abteilungsleitung',
    envSuffix: 'PFADI',
    authProviderName: 'PBS MiData (Hitobito)',
    authProviderShort: 'PBS MiData',
    primaryColor: '#20553e',
    accentInkLight: '#20553e',
    accentInkDark: '#5dbb8a',
    logoUrl: '/images/pfadi-schichtplan-logo.svg',
    independentNotice: 'Unabhängiges Projekt, nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.',
    metaDescription:
      'Kostenlose Helferliste online für Pfingstlager, SoLa und Anlässe von Pfadi-Abteilungen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Pfadi-Abteilungen',
  },
  jubla: {
    slug: 'jubla',
    dbType: 'JUBLA',
    name: 'Jubla Schichtplan',
    orgName: 'Jubla',
    domain: 'jubla-schichtplan.ch',
    targetGroup: 'Jubla-Scharen',
    unitTerm: 'Schar',
    unitTermPlural: 'Scharen',
    nicknameTerm: 'Leitername',
    leadTerm: 'Scharleitung',
    envSuffix: 'JUBLA',
    authProviderName: 'Jubla-Datenbank (Hitobito)',
    authProviderShort: 'Jubla-DB',
    primaryColor: '#283583',
    accentInkLight: '#283583',
    accentInkDark: '#66b1e2',
    logoUrl: '/images/jubla-logo.svg',
    independentNotice: 'Kein offizielles Angebot von Jungwacht Blauring Schweiz.',
    metaDescription:
      'Kostenlose Helferliste online für Lager, Scharanlässe und Feste von Jubla-Scharen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Jubla-Scharen',
  },
  verein: {
    slug: 'verein',
    dbType: 'OTHER',
    name: 'Vereins Schichtplan',
    orgName: 'Verein',
    domain: 'vereins-schichtplan.ch',
    targetGroup: 'Vereine & Festkomitees',
    unitTerm: 'Verein',
    unitTermPlural: 'Vereine',
    nicknameTerm: 'Spitzname',
    leadTerm: 'Vereinsleitung / Vorstand',
    envSuffix: 'VEREIN',
    authProviderName: 'E-Mail & Passwort',
    authProviderShort: 'E-Mail',
    primaryColor: '#2563eb',
    accentInkLight: '#1d4ed8',
    accentInkDark: '#93c5fd',
    logoUrl: '/images/verein-logo.svg',
    metaDescription:
      'Kostenlose Helferliste online für Vereinsfeste, Turniere und Anlässe aller Art. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.',
    heroHeadlineHighlight: 'für Vereine & Feste',
  },
};

type LocalizedOrgFields = Partial<
  Pick<
    OrganizationConfig,
    | 'unitTerm'
    | 'unitTermPlural'
    | 'nicknameTerm'
    | 'leadTerm'
    | 'targetGroup'
    | 'authProviderName'
    | 'authProviderShort'
    | 'independentNotice'
    | 'metaDescription'
    | 'heroHeadlineHighlight'
  >
>;

const ORGANIZATION_LOCALIZATIONS: Record<string, Partial<Record<OrganizationSlug, LocalizedOrgFields>>> = {
  fr: {
    cevi: {
      unitTerm: 'Section',
      unitTermPlural: 'Sections',
      nicknameTerm: 'Nom Cevi',
      leadTerm: 'Direction de section',
      targetGroup: 'Sections Cevi',
      independentNotice: "Ce service n'est pas une offre officielle de Cevi Suisse.",
      metaDescription:
        "Planning des bénévoles en ligne et gratuit pour fêtes, camps et événements des sections Cevi. Les bénévoles s'inscrivent par lien, sans appli ni mot de passe.",
      heroHeadlineHighlight: 'pour les sections Cevi',
    },
    pfadi: {
      unitTerm: 'Groupe',
      unitTermPlural: 'Groupes',
      nicknameTerm: 'Totem',
      leadTerm: 'Responsable de groupe',
      targetGroup: 'Groupes scouts',
      authProviderName: 'MSdS MiData (Hitobito)',
      authProviderShort: 'MSdS MiData',
      independentNotice:
        'Projet indépendant, non exploité ni édité par le Mouvement Scout de Suisse (MSdS).',
      metaDescription:
        "Planning des bénévoles en ligne et gratuit pour camps de Pentecôte, camps d'été et événements des groupes scouts. Inscription par lien, sans appli ni mot de passe.",
      heroHeadlineHighlight: 'pour les groupes scouts',
    },
    jubla: {
      unitTerm: 'Groupe',
      unitTermPlural: 'Groupes',
      nicknameTerm: "Nom d'animateur",
      leadTerm: 'Direction de groupe',
      targetGroup: 'Groupes Jubla',
      authProviderName: 'Base de données Jubla (Hitobito)',
      authProviderShort: 'Jubla-DB',
      independentNotice: "Ce service n'est pas une offre officielle de Jungwacht Blauring Suisse.",
      metaDescription:
        "Planning des bénévoles en ligne et gratuit pour camps et fêtes des groupes Jubla. Inscription par lien, sans appli ni mot de passe.",
      heroHeadlineHighlight: 'pour les groupes Jubla',
    },
    verein: {
      unitTerm: 'Association',
      unitTermPlural: 'Associations',
      nicknameTerm: 'Surnom',
      leadTerm: 'Comité',
      targetGroup: 'Associations & comités',
      authProviderName: 'E-mail & mot de passe',
      authProviderShort: 'E-mail',
      metaDescription:
        "Planning des bénévoles en ligne et gratuit pour fêtes de village, tournois et manifestations. Inscription par lien, sans appli ni mot de passe.",
      heroHeadlineHighlight: 'pour associations & fêtes',
    },
  },
  it: {
    cevi: {
      unitTerm: 'Sezione',
      unitTermPlural: 'Sezioni',
      nicknameTerm: 'Nome Cevi',
      leadTerm: 'Direzione di sezione',
      targetGroup: 'Sezioni Cevi',
      independentNotice: 'Nessuna offerta ufficiale di Cevi Svizzera.',
      metaDescription:
        'Piano turni online gratuito per sagre, campi ed eventi delle sezioni Cevi. I volontari si iscrivono tramite link, senza app né password.',
      heroHeadlineHighlight: 'per le sezioni Cevi',
    },
    pfadi: {
      unitTerm: 'Sezione',
      unitTermPlural: 'Sezioni',
      nicknameTerm: 'Nome scout',
      leadTerm: 'Direzione di sezione',
      targetGroup: 'Sezioni scout',
      authProviderName: 'MSS MiData (Hitobito)',
      authProviderShort: 'MSS MiData',
      independentNotice:
        'Progetto indipendente, non gestito né pubblicato dal Movimento Scout Svizzero (MSS).',
      metaDescription:
        'Piano turni online gratuito per campi estivi, uscite ed eventi delle sezioni scout. I volontari si iscrivono tramite link, senza app né password.',
      heroHeadlineHighlight: 'per le sezioni scout',
    },
    jubla: {
      unitTerm: 'Gruppo',
      unitTermPlural: 'Gruppi',
      nicknameTerm: 'Nome animatore',
      leadTerm: 'Direzione di gruppo',
      targetGroup: 'Gruppi Jubla',
      authProviderName: 'Banca dati Jubla (Hitobito)',
      authProviderShort: 'Jubla-DB',
      independentNotice: 'Nessuna offerta ufficiale di Jungwacht Blauring Svizzera.',
      metaDescription:
        'Piano turni online gratuito per campi e feste dei gruppi Jubla. I volontari si iscrivono tramite link, senza app né password.',
      heroHeadlineHighlight: 'per i gruppi Jubla',
    },
    verein: {
      unitTerm: 'Associazione',
      unitTermPlural: 'Associazioni',
      nicknameTerm: 'Soprannome',
      leadTerm: 'Comitato',
      targetGroup: 'Associazioni & comitati',
      authProviderName: 'E-mail e password',
      authProviderShort: 'E-mail',
      metaDescription:
        'Piano turni online gratuito per feste campestri, tornei e manifestazioni. I volontari si iscrivono tramite link, senza app né password.',
      heroHeadlineHighlight: 'per associazioni & feste',
    },
  },
  en: {
    cevi: {
      unitTerm: 'Department',
      unitTermPlural: 'Departments',
      nicknameTerm: 'Cevi nickname',
      leadTerm: 'Department Lead',
      targetGroup: 'Cevi departments',
      independentNotice: 'Not an official service of Cevi Switzerland.',
      metaDescription:
        'Free online volunteer shift planner for fairs, camps, and events of Cevi departments. Volunteers sign up via link, no app or password needed.',
      heroHeadlineHighlight: 'for Cevi departments',
    },
    pfadi: {
      unitTerm: 'Group',
      unitTermPlural: 'Groups',
      nicknameTerm: 'Scout name',
      leadTerm: 'Group Lead',
      targetGroup: 'Scout groups',
      authProviderName: 'PBS MiData (Hitobito)',
      authProviderShort: 'PBS MiData',
      independentNotice:
        'Independent project, not operated or published by the Swiss Guide and Scout Movement (PBS).',
      metaDescription:
        'Free online volunteer shift planner for camps and events of scout groups. Volunteers sign up via link, no app or password needed.',
      heroHeadlineHighlight: 'for scout groups',
    },
    jubla: {
      unitTerm: 'Group',
      unitTermPlural: 'Groups',
      nicknameTerm: 'Leader nickname',
      leadTerm: 'Group Lead',
      targetGroup: 'Jubla groups',
      authProviderName: 'Jubla database (Hitobito)',
      authProviderShort: 'Jubla-DB',
      independentNotice: 'Not an official service of Jungwacht Blauring Switzerland.',
      metaDescription:
        'Free online volunteer shift planner for camps and events of Jubla groups. Volunteers sign up via link, no app or password needed.',
      heroHeadlineHighlight: 'for Jubla groups',
    },
    verein: {
      unitTerm: 'Club',
      unitTermPlural: 'Clubs',
      nicknameTerm: 'Nickname',
      leadTerm: 'Board',
      targetGroup: 'Clubs & committees',
      authProviderName: 'Email & Password',
      authProviderShort: 'Email',
      metaDescription:
        'Free online volunteer shift planner for club festivals, tournaments, and events. Volunteers sign up via link, no app or password needed.',
      heroHeadlineHighlight: 'for clubs & festivals',
    },
  },
};

/** Alle Verbandsdomains (cevi-, pfadi-, jubla-, vereins-schichtplan.ch): einzige Quelle für Listen im Code */
export const ORGANIZATION_DOMAINS: readonly string[] = Object.values(ORGANIZATIONS).map((o) => o.domain);

/**
 * Ermittelt den Verbands-Slug aus einem Hostnamen oder Slug.
 * Fallback ist immer 'cevi'.
 */
export function getOrganizationSlugFromHost(hostnameOrSlug?: string | null): OrganizationSlug {
  if (!hostnameOrSlug) return 'cevi';
  let clean = hostnameOrSlug.toLowerCase().trim();
  // Ganze URLs (z. B. return_to) auf den Hostnamen reduzieren
  if (clean.includes('://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      return 'cevi';
    }
  }
  clean = clean.split(',')[0].trim().split(':')[0].replace(/\.$/, '');

  if (clean === 'pfadi') return 'pfadi';
  if (clean === 'jubla') return 'jubla';
  if (clean === 'verein' || clean === 'other') return 'verein';
  if (clean === 'cevi') return 'cevi';

  // Nur über das Domain-Ende: «pfadi-schichtplan-fans.vereins-schichtplan.ch» ist ein Verein, keine Pfadi
  for (const org of Object.values(ORGANIZATIONS)) {
    if (clean === org.domain || clean.endsWith(`.${org.domain}`)) return org.slug;
  }

  // Lokale Entwicklung oder Test-Hosts ohne Verbandsdomain (z. B. pfadi.localhost oder illnau.pfadi.localhost):
  // erst die Verbände mit eigener Kennung, dann Cevi
  for (const org of Object.values(ORGANIZATIONS)) {
    if (org.slug !== 'cevi' && clean.includes(org.slug)) return org.slug;
  }

  return 'cevi';
}

/**
 * Verband der Domain, auf der der Browser gerade ist (ohne Fenster: Cevi).
 * Nur in Ereignis-Handlern und Effekten verwenden. Beim Rendern fehlt auf dem Server der Host, dann ergäbe
 * das Cevi und React korrigiert Link-Attribute bei der Hydration nicht: dort `useOrganization()` aus
 * `@schichtplan/ui` bzw. `getOrganization(host)` mit dem Host der Anfrage nehmen.
 */
export function getBrowserOrganization(locale?: string | null): OrganizationConfig {
  return getOrganization(typeof window !== 'undefined' ? window.location.host : undefined, locale);
}

/**
 * Liefert die Konfiguration für eine Organisation (Cevi, Pfadi, Jubla oder Verein)
 * optional angepasst an die angegebene Sprache.
 */
export function getOrganization(hostnameOrSlug?: string | null, locale?: string | null): OrganizationConfig {
  const slug = getOrganizationSlugFromHost(hostnameOrSlug);
  const base = ORGANIZATIONS[slug] ?? ORGANIZATIONS.cevi;
  const l = (locale ?? 'de').trim().toLowerCase().split(/[-_]/)[0];
  const loc = ORGANIZATION_LOCALIZATIONS[l]?.[slug];
  if (!loc) return base;
  return { ...base, ...loc };
}

/**
 * Ermittelt den Datenbank-Enum-Wert (`OrganizationType`) aus einem Hostnamen oder Slug.
 */
export function getOrganizationTypeFromHost(hostnameOrSlug?: string | null): OrganizationType {
  return getOrganization(hostnameOrSlug).dbType;
}

/**
 * Liefert die Organisations-Konfiguration anhand des Datenbank-Enum-Werts (`OrganizationType`),
 * optional angepasst an die angegebene Sprache.
 */
export function getOrganizationByDbType(dbType?: string | null, locale?: string | null): OrganizationConfig {
  let slug: OrganizationSlug;
  switch (dbType?.toUpperCase()) {
    case 'PFADI':
      slug = 'pfadi';
      break;
    case 'JUBLA':
      slug = 'jubla';
      break;
    case 'OTHER':
    case 'VEREIN':
      slug = 'verein';
      break;
    default:
      slug = 'cevi';
      break;
  }
  return getOrganization(slug, locale);
}

/**
 * Begriffe für einen Schichtplan auf einer höheren Ebene (Region, Kanton, Bund, Mitgliederorganisation …): Dort ist
 * es keine «Schar» bzw. «Abteilung» mit «Scharleitung», sondern eine Organisation mit ihrer Leitung. Neutral
 * gewählt, damit Sätze wie «eure Organisation» grammatisch passen. Ohne Ebene bleibt alles beim Verband.
 */
export function organizationForLevel(
  org: OrganizationConfig,
  levelName?: string | null,
  locale?: string | null,
): OrganizationConfig {
  if (!levelName || org.slug === 'verein') return org;
  const l = (locale ?? 'de').trim().toLowerCase().split(/[-_]/)[0];
  switch (l) {
    case 'fr':
      return { ...org, unitTerm: 'Organisation', unitTermPlural: 'Organisations', leadTerm: 'Direction' };
    case 'it':
      return { ...org, unitTerm: 'Organizzazione', unitTermPlural: 'Organizzazioni', leadTerm: 'Direzione' };
    case 'en':
      return { ...org, unitTerm: 'Organization', unitTermPlural: 'Organizations', leadTerm: 'Leadership' };
    default:
      return { ...org, unitTerm: 'Organisation', unitTermPlural: 'Organisationen', leadTerm: 'Leitung' };
  }
}
