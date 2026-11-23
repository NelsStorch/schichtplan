import { describe, expect, it } from 'vitest';
import { fromDbLocale, getEnabledLocales, isLocale, LOCALES, parseLocale, toDbLocale } from './config.js';

describe('parseLocale', () => {
  it('erkennt Kurzformen, Regionen, Grossschreibung und Datenbankwerte', () => {
    expect(parseLocale('fr')).toBe('fr');
    expect(parseLocale('FR')).toBe('fr');
    expect(parseLocale('fr-CH')).toBe('fr');
    expect(parseLocale(' it_ch ')).toBe('it');
    expect(parseLocale('en-US')).toBe('en');
    expect(parseLocale('de-CH')).toBe('de');
  });

  it('lehnt Unbekanntes ab', () => {
    expect(parseLocale('rm')).toBeNull();
    expect(parseLocale('')).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
    expect(parseLocale(42)).toBeNull();
    expect(parseLocale('xx')).toBeNull();
  });
});

describe('Datenbank-Enum', () => {
  it('wandelt in beide Richtungen', () => {
    for (const locale of LOCALES) {
      expect(fromDbLocale(toDbLocale(locale))).toBe(locale);
    }
    expect(toDbLocale('en')).toBe('EN');
    expect(fromDbLocale(null)).toBeNull();
  });

  it('isLocale prüft exakt', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('de-CH')).toBe(false);
  });
});

describe('getEnabledLocales', () => {
  it('liefert alle vier Sprachen für alle Verbände', () => {
    for (const org of ['CEVI', 'PFADI', 'JUBLA', 'OTHER', 'verein', null]) {
      expect(getEnabledLocales(org)).toEqual(['de', 'fr', 'it', 'en']);
    }
  });

  it('übernimmt eine Umgebungs-Liste, Deutsch immer zuerst und ohne Duplikate', () => {
    expect(getEnabledLocales('PFADI', 'fr,en')).toEqual(['de', 'fr', 'en']);
    expect(getEnabledLocales('CEVI', 'en, de, EN, rm')).toEqual(['de', 'en']);
    expect(getEnabledLocales('CEVI', '  ')).toEqual(['de', 'fr', 'it', 'en']);
  });
});
