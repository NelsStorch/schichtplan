import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { DEFAULT_LOCALE, LOCALES } from '@schichtplan/i18n';

/**
 * Sprach-Routing der Landingpage: Deutsch ohne Präfix (as-needed),
 * Französisch (/fr), Italienisch (/it) und Englisch (/en) mit Präfix und lokalisierten Pfaden.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
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
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
