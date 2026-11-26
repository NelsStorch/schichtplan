/**
 * Sprache einer Anfrage in den Next.js-Apps (nur Server: Cookies, Header). Gleiche Prioritätenkette wie im
 * Backend (`resolveLocale` aus @schichtplan/i18n): Cookie → Browser → Standardsprache der Abteilung → Deutsch,
 * jeweils nur freigeschaltete Sprachen des Verbands. Konzept: docs/public/i18n.md
 *
 * Nutzung in `src/i18n/request.ts` jeder App:
 *   export default getRequestConfig(() => createRequestConfig({ namespaces: ['common'] }));
 */
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import {
  I18N_TIME_ZONE,
  INTL_LOCALES,
  LOCALE_COOKIE,
  PSEUDO_LOCALE,
  createI18nErrorHandler,
  getEnabledLocales,
  getMessageFallback,
  pickMessages,
  resolveLocale,
  type Locale,
  type LocaleSource,
  type Namespace,
} from '@schichtplan/i18n';
import { getOrganizationTypeFromHost } from '@schichtplan/shared';
import { getRequestOrigin } from '../og';

export interface RequestLocaleInfo {
  /** Kurzcode (de, fr, it, en) */
  locale: Locale;
  /** BCP-47 für Intl und `<html lang>` (de-CH …) */
  intlLocale: string;
  source: LocaleSource;
  /** Freigeschaltete Sprachen für den Sprachwähler */
  enabled: Locale[];
  /** Pseudo-Sprache aktiv (nur Entwicklung) */
  pseudo: boolean;
  /** Pseudo-Sprache im Sprachwähler anbieten (nur Entwicklung) */
  pseudoAvailable: boolean;
}

const isDev = process.env.NODE_ENV !== 'production';

/** Pro Anfrage zwischengespeichert: Layout und `request.ts` rechnen nicht doppelt */
export const getRequestLocale = cache(
  async (
    department?: string | null,
    explicitLocale?: string | null,
    enabledOverride?: readonly Locale[],
  ): Promise<RequestLocaleInfo> => {
    const [{ host }, cookieStore, h] = await Promise.all([getRequestOrigin(), cookies(), headers()]);
    // Zur Laufzeit gelesen: auf Dev lassen sich Sprachen mit I18N_ENABLED_LOCALES=de,fr,en freischalten
    const baseEnabled = getEnabledLocales(getOrganizationTypeFromHost(host), process.env.I18N_ENABLED_LOCALES);
    const enabled = enabledOverride ? [...enabledOverride] : baseEnabled;
    const effectiveEnabled =
      explicitLocale && !enabled.includes(explicitLocale as Locale)
        ? [explicitLocale as Locale, ...enabled]
        : enabled;
    const cookie = cookieStore.get(LOCALE_COOKIE)?.value ?? null;
    const pseudo = isDev && cookie === PSEUDO_LOCALE;
    const { locale, source } = resolveLocale({
      explicit: explicitLocale,
      cookie: pseudo ? null : cookie,
      acceptLanguage: h.get('accept-language'),
      department,
      enabled: effectiveEnabled,
    });
    return { locale, intlLocale: INTL_LOCALES[locale], source, enabled, pseudo, pseudoAvailable: isDev };
  },
);

/** Konfiguration für `getRequestConfig` von next-intl: nur die genannten Namespaces, Lücken auf Deutsch */
export async function createRequestConfig({
  namespaces,
  department,
  locale: explicitLocale,
  enabledLocales,
  localeFormat = 'intl',
}: {
  namespaces: readonly Namespace[];
  /** Standardsprache der Abteilung dieser Subdomain (z. B. aus /api/departments/current) */
  department?: string | null;
  /** Explizit angeforderte Sprache (z. B. aus `requestLocale` in `next-intl`) */
  locale?: string | null;
  /** Für diese App freigeschaltete Sprachen (z. B. Routing-Locales der Landingpage) */
  enabledLocales?: readonly Locale[];
  /**
   * Welche Form next-intl als Sprache bekommt:
   * - `intl` (Apps ohne Sprach-Routing): `de-CH`, `fr-CH` … – Swiss-Formate direkt aus `useLocale()`.
   * - `routing` (Landingpage mit `/fr`, `/en` …): `de`, `fr` … – muss exakt einem Eintrag in `routing.locales`
   *   entsprechen, sonst bauen `Link`, `usePathname` und `useRouter` Pfade wie `/fr-CH/…` (404) oder
   *   `/en/fr/…` (doppelter Sprachcode). Für Datums-/Zahlenformate dann `useIntlLocale()` nutzen.
   */
  localeFormat?: 'intl' | 'routing';
}) {
  const info = await getRequestLocale(department ?? null, explicitLocale, enabledLocales);
  let messages: Record<string, unknown> = pickMessages(info.locale, namespaces);
  if (info.pseudo) {
    const { pseudoLocalizeMessages } = await import('@schichtplan/i18n/pseudo');
    messages = pseudoLocalizeMessages(messages);
  }
  return {
    locale: localeFormat === 'routing' ? info.locale : info.intlLocale,
    messages,
    timeZone: I18N_TIME_ZONE,
    onError: createI18nErrorHandler(),
    getMessageFallback,
  };
}
