/**
 * Sprachen des Schichtplans. Deutsch (de-CH, «ss» statt «ß») ist Quellsprache, immer vollständig und
 * letzte Stufe jedes Fallbacks. Konzept: docs/internal/i18n-konzept.md
 */

export const LOCALES = ['de', 'fr', 'it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Quellsprache und letzter Fallback */
export const DEFAULT_LOCALE: Locale = 'de';

/** Pseudo-Sprache für die Entwicklung: macht vergessene Texte und zu knappe Layouts sichtbar */
export const PSEUDO_LOCALE = 'xx';

/** Zeitzone aller Ausgaben, unabhängig von der Sprache (siehe packages/shared/src/timezone.ts) */
export const I18N_TIME_ZONE = 'Europe/Zurich';

/** BCP-47-Tag für Intl (Datum, Zahlen, Plural): Schweizer Varianten, z. B. 1'234.5 und 24.10.2026 */
export const INTL_LOCALES: Record<Locale, string> = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-CH',
};

/** Namen der Sprachen in der eigenen Sprache (Endonyme) für den Sprachwähler, bewusst ohne Flaggen */
export const LOCALE_LABELS: Record<Locale, string> = {
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  en: 'English',
};

/** Werte des Prisma-Enums `Locale` */
export type DbLocale = 'DE' | 'FR' | 'IT' | 'EN';

/**
 * Verbände wie `OrganizationType` in `@schichtplan/shared`. Bewusst hier dupliziert, damit dieses Paket
 * ohne Abhängigkeit gebaut werden kann (später nutzt `shared` die Sprachen für die Formatter).
 */
export type OrganizationKey = 'CEVI' | 'PFADI' | 'JUBLA' | 'OTHER';

/**
 * Freigeschaltete Sprachen pro Verband. Eine Sprache wird erst freigeschaltet, wenn ihre Übersetzung die
 * Mindestabdeckung erreicht (siehe `MIN_COVERAGE_ENABLED`, geprüft von `npm run i18n:check`).
 * Bis dahin sehen Nutzer*innen nur Deutsch, auch wenn sie eine andere Sprache gewählt haben.
 */
export const ENABLED_LOCALES: Record<OrganizationKey, readonly Locale[]> = {
  CEVI: ['de', 'fr', 'it', 'en'],
  PFADI: ['de', 'fr', 'it', 'en'],
  JUBLA: ['de', 'fr', 'it', 'en'],
  OTHER: ['de', 'fr', 'it', 'en'],
};

/** Mindestabdeckung in Prozent, die eine freigeschaltete Sprache haben muss */
export const MIN_COVERAGE_ENABLED = 95;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Liest eine Sprache aus Cookie, Profil, Datenbank oder Header: «fr», «FR», «fr-CH», «fr_CH» → 'fr'.
 * Unbekanntes ergibt null (dann greift die nächste Stufe der Sprachermittlung).
 */
export function parseLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

export function toDbLocale(locale: Locale): DbLocale {
  return locale.toUpperCase() as DbLocale;
}

export function fromDbLocale(value: string | null | undefined): Locale | null {
  return parseLocale(value);
}

function normalizeOrganization(org?: string | null): OrganizationKey {
  switch (org?.toUpperCase()) {
    case 'PFADI':
      return 'PFADI';
    case 'JUBLA':
      return 'JUBLA';
    case 'OTHER':
    case 'VEREIN':
      return 'OTHER';
    default:
      return 'CEVI';
  }
}

/**
 * Freigeschaltete Sprachen eines Verbands (Datenbank-Enum oder Slug), Deutsch immer zuerst.
 *
 * `override`: kommagetrennte Liste aus der Umgebung (z. B. `I18N_ENABLED_LOCALES=de,fr,en` auf Dev), ersetzt
 * die Freischaltung für alle Verbände. Unbekannte Einträge werden ignoriert.
 */
export function getEnabledLocales(org?: string | null, override?: string | null): Locale[] {
  const configured = override?.trim()
    ? override.split(',').map(parseLocale).filter((l): l is Locale => l !== null)
    : ENABLED_LOCALES[normalizeOrganization(org)];
  return [DEFAULT_LOCALE, ...configured.filter((l) => l !== DEFAULT_LOCALE)].filter(
    (l, i, all) => all.indexOf(l) === i,
  );
}
