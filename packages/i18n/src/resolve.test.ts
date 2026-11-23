import { describe, expect, it } from 'vitest';
import type { Locale } from './config.js';
import { matchAcceptLanguage, parseAcceptLanguage, resolveLocale, resolveRecipientLocale } from './resolve.js';

const ALL: Locale[] = ['de', 'fr', 'it', 'en'];

describe('parseAcceptLanguage', () => {
  it('sortiert nach Gewichtung und behält bei Gleichstand die Reihenfolge', () => {
    expect(parseAcceptLanguage('de;q=0.5, fr-CH, en;q=0.8, it')).toEqual([
      { tag: 'fr-ch', q: 1 },
      { tag: 'it', q: 1 },
      { tag: 'en', q: 0.8 },
      { tag: 'de', q: 0.5 },
    ]);
  });

  it('ignoriert *, q=0 und Kaputtes', () => {
    expect(parseAcceptLanguage('*, fr;q=0, ;q=1, en;q=abc')).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it('begrenzt sehr lange Header', () => {
    const header = Array.from({ length: 500 }, () => 'fr').join(',');
    expect(parseAcceptLanguage(header).length).toBeLessThanOrEqual(20);
  });
});

describe('matchAcceptLanguage', () => {
  it('liefert nur freigeschaltete Sprachen ohne Duplikate', () => {
    expect(matchAcceptLanguage('fr-CH, fr;q=0.9, de;q=0.8, rm;q=0.7', ['de', 'fr'])).toEqual(['fr', 'de']);
    expect(matchAcceptLanguage('fr-CH', ['de'])).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('folgt der Prioritätenkette', () => {
    const base = { acceptLanguage: 'it', department: 'en', enabled: ALL };
    expect(resolveLocale({ ...base, explicit: 'fr', cookie: 'en', user: 'it' })).toEqual({ locale: 'fr', source: 'explicit' });
    expect(resolveLocale({ ...base, cookie: 'en', user: 'it' })).toEqual({ locale: 'en', source: 'cookie' });
    expect(resolveLocale({ ...base, user: 'FR' })).toEqual({ locale: 'fr', source: 'user' });
    expect(resolveLocale(base)).toEqual({ locale: 'it', source: 'accept-language' });
    expect(resolveLocale({ department: 'FR', enabled: ALL })).toEqual({ locale: 'fr', source: 'department' });
    expect(resolveLocale({ enabled: ALL })).toEqual({ locale: 'de', source: 'default' });
  });

  it('überspringt nicht freigeschaltete Sprachen auf jeder Stufe', () => {
    expect(
      resolveLocale({ explicit: 'fr', cookie: 'it', user: 'en', acceptLanguage: 'fr', department: 'FR', enabled: ['de'] }),
    ).toEqual({ locale: 'de', source: 'default' });
    expect(resolveLocale({ cookie: 'fr', user: 'en', enabled: ['de', 'en'] })).toEqual({ locale: 'en', source: 'user' });
  });

  it('ignoriert ungültige Cookies und Profilwerte', () => {
    expect(resolveLocale({ cookie: 'klingonisch', user: '', department: 'IT', enabled: ALL })).toEqual({
      locale: 'it',
      source: 'department',
    });
  });

  it('bevorzugt die Abteilungssprache, wenn Englisch nur Gerätesprache ist', () => {
    // Englisches Handy, versteht aber Deutsch → Deutsch wie die Abteilung
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9,de-CH;q=0.8', department: 'DE', enabled: ALL })).toEqual({
      locale: 'de',
      source: 'department',
    });
    // Nur Englisch → Englisch
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9', department: 'DE', enabled: ALL })).toEqual({
      locale: 'en',
      source: 'accept-language',
    });
    // Andere Erstsprache als Englisch gilt immer
    expect(resolveLocale({ acceptLanguage: 'fr-CH,de;q=0.8', department: 'DE', enabled: ALL })).toEqual({
      locale: 'fr',
      source: 'accept-language',
    });
    // Explizite Wahl schlägt die Regel
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'en,de', department: 'DE', enabled: ALL }).locale).toBe('en');
  });
});

describe('resolveRecipientLocale', () => {
  it('nimmt Profil, dann Abteilung, dann Deutsch', () => {
    expect(resolveRecipientLocale({ user: 'FR', department: 'IT', enabled: ALL })).toBe('fr');
    expect(resolveRecipientLocale({ user: null, department: 'IT', enabled: ALL })).toBe('it');
    expect(resolveRecipientLocale({ enabled: ALL })).toBe('de');
    expect(resolveRecipientLocale({ user: 'FR', enabled: ['de'] })).toBe('de');
  });
});
