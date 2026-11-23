import { describe, expect, it } from 'vitest';
import { localeAlternates, localizedPath, preferredLocalePath, routing } from '@/i18n/routing';

const ALL = ['de', 'fr', 'it', 'en'];

describe('Lokalisierte Pfade', () => {
  it('Deutsch ohne Präfix, andere Sprachen mit Präfix und eigenem Pfad', () => {
    expect(localizedPath('de', '/')).toBe('/');
    expect(localizedPath('fr', '/')).toBe('/fr');
    expect(localizedPath('de', '/datenschutz')).toBe('/datenschutz');
    expect(localizedPath('fr', '/datenschutz')).toBe('/fr/protection-des-donnees');
    expect(localizedPath('it', '/impressum')).toBe('/it/note-legali');
    expect(localizedPath('en', '/nutzungsbedingungen')).toBe('/en/terms');
    expect(localizedPath('en', '/login')).toBe('/en/login');
  });

  it('nie doppelte oder Intl-Sprachcodes (/en/fr/…, /fr-CH/…)', () => {
    for (const locale of routing.locales) {
      for (const internal of Object.keys(routing.pathnames) as (keyof typeof routing.pathnames)[]) {
        const path = localizedPath(locale, internal);
        const segments = path.split('/').filter(Boolean);
        const codes = segments.filter((s) => (routing.locales as readonly string[]).includes(s) || /-CH$/.test(s));
        expect(codes.length, path).toBeLessThanOrEqual(1);
      }
    }
  });

  it('kanonische URL und hreflang je Sprache (nicht der französische Pfad für alle)', () => {
    const it = localeAlternates('https://cevi-schichtplan.ch', 'it', '/datenschutz');
    expect(it.canonical).toBe('https://cevi-schichtplan.ch/it/protezione-dei-dati');
    expect(it.languages).toEqual({
      'x-default': 'https://cevi-schichtplan.ch/datenschutz',
      de: 'https://cevi-schichtplan.ch/datenschutz',
      fr: 'https://cevi-schichtplan.ch/fr/protection-des-donnees',
      it: 'https://cevi-schichtplan.ch/it/protezione-dei-dati',
      en: 'https://cevi-schichtplan.ch/en/privacy',
    });
  });
});

describe('Umleitung von Seiten ohne Sprach-Präfix', () => {
  it('Browser bzw. Cookie bestimmen die Sprache', () => {
    expect(preferredLocalePath({ pathname: '/', acceptLanguage: 'fr-CH', enabled: ALL })).toBe('/fr');
    expect(preferredLocalePath({ pathname: '/datenschutz', acceptLanguage: 'it-CH', enabled: ALL })).toBe(
      '/it/protezione-dei-dati'
    );
    expect(preferredLocalePath({ pathname: '/', cookie: 'en', acceptLanguage: 'de-CH', enabled: ALL })).toBe('/en');
  });

  it('ausdrücklich gewähltes Deutsch bleibt Deutsch, auch bei französischem Browser', () => {
    expect(preferredLocalePath({ pathname: '/', cookie: 'de', acceptLanguage: 'fr-CH', enabled: ALL })).toBeNull();
  });

  it('nicht freigeschaltete Sprachen, Pseudo-Sprache, Präfix und unbekannte Pfade: keine Umleitung', () => {
    expect(preferredLocalePath({ pathname: '/', acceptLanguage: 'fr-CH', enabled: ['de'] })).toBeNull();
    expect(preferredLocalePath({ pathname: '/', cookie: 'xx', acceptLanguage: 'en', enabled: ALL })).toBeNull();
    expect(preferredLocalePath({ pathname: '/fr', cookie: 'en', enabled: ALL })).toBeNull();
    expect(preferredLocalePath({ pathname: '/en/privacy', cookie: 'fr', enabled: ALL })).toBeNull();
    expect(preferredLocalePath({ pathname: '/gibt-es-nicht', acceptLanguage: 'fr', enabled: ALL })).toBeNull();
  });

  it('Schrägstrich am Ende wird toleriert', () => {
    expect(preferredLocalePath({ pathname: '/impressum/', acceptLanguage: 'en', enabled: ALL })).toBe('/en/legal');
  });
});
