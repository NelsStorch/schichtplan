import { DEFAULT_LOCALE, type Locale, parseLocale } from './config.js';

export type LocaleSource = 'explicit' | 'cookie' | 'user' | 'accept-language' | 'department' | 'default';

export interface LocaleInputs {
  /** Explizite Wahl im Request, z. B. `?lang=fr` aus einem Mail-Link */
  explicit?: string | null;
  /** Cookie `NEXT_LOCALE` (Root-Domain, gilt für Login, Web und Hilfe) */
  cookie?: string | null;
  /** `User.locale` aus dem Profil */
  user?: string | null;
  /** Roher `Accept-Language`-Header */
  acceptLanguage?: string | null;
  /** `Department.defaultLocale` der Subdomain */
  department?: string | null;
  /** Für den Verband freigeschaltete Sprachen (`getEnabledLocales`) */
  enabled: readonly Locale[];
}

export interface ResolvedLocale {
  locale: Locale;
  source: LocaleSource;
}

/** Cookie-Name, den auch next-intl verwendet */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Gültigkeit des Sprach-Cookies: ein Jahr */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const MAX_ACCEPT_LANGUAGE_LENGTH = 512;
const MAX_ACCEPT_LANGUAGE_ENTRIES = 20;

export interface AcceptedLanguage {
  tag: string;
  q: number;
}

/**
 * Zerlegt einen `Accept-Language`-Header nach Gewichtung (höchste zuerst, bei Gleichstand in Reihenfolge).
 * Lange oder kaputte Header werden begrenzt statt abgelehnt.
 */
export function parseAcceptLanguage(header?: string | null): AcceptedLanguage[] {
  if (!header) return [];
  return header
    .slice(0, MAX_ACCEPT_LANGUAGE_LENGTH)
    .split(',')
    .slice(0, MAX_ACCEPT_LANGUAGE_ENTRIES)
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag: rawTag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag, q }) => ({ tag, q }));
}

/** Freigeschaltete Sprachen, die der Browser akzeptiert, in seiner Reihenfolge */
export function matchAcceptLanguage(header: string | null | undefined, enabled: readonly Locale[]): Locale[] {
  const matches: Locale[] = [];
  for (const { tag } of parseAcceptLanguage(header)) {
    const locale = parseLocale(tag);
    if (locale && enabled.includes(locale) && !matches.includes(locale)) matches.push(locale);
  }
  return matches;
}

/**
 * Ermittelt die Sprache einer Anfrage. Dieselbe Funktion nutzen Next.js (`i18n/request.ts`), das Backend und
 * Jobs, damit überall dieselbe Sprache herauskommt. Jede Stufe zählt nur, wenn ihre Sprache freigeschaltet ist:
 *
 * 1. explizite Wahl (`?lang=`)  2. Cookie  3. Profil  4. Browser (`Accept-Language`)
 * 5. Standardsprache der Abteilung  6. Deutsch
 *
 * Englisch als Gerätesprache: Viele Geräte in der Schweiz stehen auf Englisch, obwohl die Person die
 * Landessprache der Abteilung versteht. Ist Englisch der beste Treffer des Browsers, akzeptiert er aber auch
 * die Standardsprache der Abteilung, gewinnt die Abteilungssprache. Wer Englisch will, wählt es explizit.
 */
export function resolveLocale(inputs: LocaleInputs): ResolvedLocale {
  const { enabled } = inputs;
  const pick = (value: string | null | undefined): Locale | null => {
    const locale = parseLocale(value);
    return locale && enabled.includes(locale) ? locale : null;
  };

  const explicit = pick(inputs.explicit);
  if (explicit) return { locale: explicit, source: 'explicit' };

  const cookie = pick(inputs.cookie);
  if (cookie) return { locale: cookie, source: 'cookie' };

  const user = pick(inputs.user);
  if (user) return { locale: user, source: 'user' };

  const department = pick(inputs.department);
  const accepted = matchAcceptLanguage(inputs.acceptLanguage, enabled);
  if (accepted.length > 0) {
    if (accepted[0] === 'en' && department && department !== 'en' && accepted.includes(department)) {
      return { locale: department, source: 'department' };
    }
    return { locale: accepted[0], source: 'accept-language' };
  }

  if (department) return { locale: department, source: 'department' };

  return { locale: DEFAULT_LOCALE, source: 'default' };
}

/**
 * Sprache für Mails, Push und PDFs aus Jobs ohne Anfrage (Erinnerungen, Ersatz gefunden, Löschhinweise):
 * Profil der Empfänger*in, sonst Abteilung, sonst Deutsch.
 */
export function resolveRecipientLocale(inputs: {
  user?: string | null;
  department?: string | null;
  enabled: readonly Locale[];
}): Locale {
  return resolveLocale({ user: inputs.user, department: inputs.department, enabled: inputs.enabled }).locale;
}
