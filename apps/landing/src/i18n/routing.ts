import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES, PSEUDO_LOCALE, resolveLocale, type Locale } from '@schichtplan/i18n';

/**
 * Nur Konfiguration und reine Hilfsfunktionen (auch in Proxy und Unit-Tests nutzbar). `Link`, `useRouter` usw.
 * stehen in `./navigation`, weil sie `next/navigation` brauchen.
 *
 * Sprach-Routing der Landingpage: Deutsch ohne Präfix (as-needed),
 * Französisch (/fr), Italienisch (/it) und Englisch (/en) mit Präfix und lokalisierten Pfaden.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  // Sprache für Seiten ohne Präfix bestimmt der Proxy mit derselben Logik wie alle Apps (resolveLocale:
  // Cookie auf der Root-Domain → Browser → Deutsch, nur freigeschaltete Sprachen). next-intl soll weder selbst
  // erkennen noch ein eigenes, nur für den Host gültiges NEXT_LOCALE-Cookie schreiben: Zwei Cookies mit
  // gleichem Namen führten zu zufälligem Umschalten, und schon das Öffnen eines /fr-Links stellte um.
  localeDetection: false,
  localeCookie: false,
  pathnames: {
    '/': '/',
    '/datenschutz': {
      de: '/datenschutz',
      fr: '/protection-des-donnees',
      it: '/protezione-dei-dati',
      en: '/privacy',
    },
    '/nutzungsbedingungen': {
      de: '/nutzungsbedingungen',
      fr: '/conditions-utilisation',
      it: '/condizioni-di-utilizzo',
      en: '/terms',
    },
    '/impressum': {
      de: '/impressum',
      fr: '/mentions-legales',
      it: '/note-legali',
      en: '/legal',
    },
    '/abteilung-erstellen': {
      de: '/abteilung-erstellen',
      fr: '/creer-un-groupe',
      it: '/creare-una-sezione',
      en: '/create-department',
    },
    '/profil': {
      de: '/profil',
      fr: '/profil',
      it: '/profilo',
      en: '/profile',
    },
    '/login': '/login',
  },
});

export type Pathnames = keyof typeof routing.pathnames;

/** Ist das ein interner (deutscher) Pfad aus `routing.pathnames`? */
export function isInternalPathname(pathname: string): pathname is Pathnames {
  return Object.hasOwn(routing.pathnames, pathname);
}

/** Öffentlicher Pfad einer Seite in einer Sprache, z. B. ('fr', '/datenschutz') → '/fr/protection-des-donnees' */
export function localizedPath(locale: Locale, internal: Pathnames): string {
  const entry = routing.pathnames[internal];
  const path = typeof entry === 'string' ? entry : entry[locale];
  if (locale === routing.defaultLocale) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

/** Kanonische URL und hreflang-Alternativen einer Seite (für `generateMetadata`) */
export function localeAlternates(origin: string, locale: Locale, internal: Pathnames) {
  const languages: Record<string, string> = { 'x-default': `${origin}${localizedPath(routing.defaultLocale, internal)}` };
  for (const loc of routing.locales) languages[loc] = `${origin}${localizedPath(loc, internal)}`;
  return { canonical: `${origin}${localizedPath(locale, internal)}`, languages };
}

/**
 * Ziel für eine Seite ohne Sprach-Präfix (/, /datenschutz …), oder null, wenn sie deutsch bleibt. Sprache wie in
 * allen Apps (`resolveLocale`: Cookie auf der Root-Domain → Browser → Deutsch, nur freigeschaltete Sprachen).
 * Ein Präfix in der URL (/fr/…) ist eine ausdrückliche Wahl und wird nie umgeleitet; unbekannte Pfade auch nicht.
 */
export function preferredLocalePath(input: {
  pathname: string;
  cookie?: string | null;
  acceptLanguage?: string | null;
  enabled: readonly string[];
}): string | null {
  const firstSegment = input.pathname.split('/')[1] ?? '';
  if ((routing.locales as readonly string[]).includes(firstSegment)) return null;
  const internal =
    input.pathname !== '/' && input.pathname.endsWith('/') ? input.pathname.slice(0, -1) : input.pathname;
  if (!isInternalPathname(internal)) return null;
  // Pseudo-Sprache (nur Entwicklung) bleibt auf der deutschen Seite
  if (input.cookie === PSEUDO_LOCALE) return null;
  const enabled = routing.locales.filter((l) => input.enabled.includes(l));
  const { locale } = resolveLocale({ cookie: input.cookie, acceptLanguage: input.acceptLanguage, enabled });
  return locale === routing.defaultLocale ? null : localizedPath(locale, internal);
}
