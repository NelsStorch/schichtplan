import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { errorCode, errorTranslator, requestLocale } from './i18n.js';
import { clientErrorBody, validationMessage } from '../app.js';

function fakeRequest(opts: {
  cookie?: string;
  acceptLanguage?: string;
  organization?: string;
  departmentLocale?: string | null;
}): FastifyRequest {
  return {
    cookies: opts.cookie ? { NEXT_LOCALE: opts.cookie } : {},
    headers: opts.acceptLanguage ? { 'accept-language': opts.acceptLanguage } : {},
    organization: opts.organization ?? 'CEVI',
    tenant: opts.departmentLocale === undefined ? null : { defaultLocale: opts.departmentLocale },
  } as unknown as FastifyRequest;
}

describe('Sprache einer API-Anfrage', () => {
  const original = process.env.I18N_ENABLED_LOCALES;
  afterEach(() => {
    process.env.I18N_ENABLED_LOCALES = original;
  });

  it('bleibt Deutsch, wenn nur Deutsch freigeschaltet ist', () => {
    process.env.I18N_ENABLED_LOCALES = 'de';
    expect(requestLocale(fakeRequest({ cookie: 'fr', acceptLanguage: 'fr-CH', departmentLocale: 'FR' }))).toBe('de');
  });

  it('fällt auf Deutsch zurück bei nicht unterstützter Sprache', () => {
    delete process.env.I18N_ENABLED_LOCALES;
    expect(requestLocale(fakeRequest({ cookie: 'es', acceptLanguage: 'es-ES' }))).toBe('de');
  });

  it('folgt Cookie, Browser und Abteilung', () => {
    process.env.I18N_ENABLED_LOCALES = 'de,fr,it,en';
    expect(requestLocale(fakeRequest({ cookie: 'it', acceptLanguage: 'fr-CH' }))).toBe('it');
    expect(requestLocale(fakeRequest({ acceptLanguage: 'fr-CH,fr;q=0.9' }))).toBe('fr');
    expect(requestLocale(fakeRequest({ departmentLocale: 'EN' }))).toBe('en');
    // Englisches Gerät, versteht Deutsch, Abteilung deutsch → Deutsch
    expect(requestLocale(fakeRequest({ acceptLanguage: 'en-US,en;q=0.9,de;q=0.5', departmentLocale: 'DE' }))).toBe('de');
    expect(requestLocale(fakeRequest({}))).toBe('de');
  });
});

describe('Fehlermeldungen', () => {
  it('übersetzt mit Platzhaltern und Plural', () => {
    expect(errorTranslator('de')('signup.taskFull', { task: 'Bar' })).toBe(
      'Für die Arbeit «Bar» sind alle Plätze belegt. Bitte wähle eine andere Arbeit.'
    );
    expect(errorTranslator('fr')('signup.shiftFull')).toBe('Ce créneau est déjà complet');
    expect(errorTranslator('en')('signup.signoffDeadline', { date: '24.10.2026', time: '18:00', days: 1 })).toContain(
      '(1 day before'
    );
    expect(errorTranslator('de')('signup.signoffDeadline', { date: '24.10.2026', time: '18:00', days: 3 })).toContain(
      '(3 Tage vor Anlassbeginn)'
    );
  });

  it('leitet stabile Codes aus den Schlüsseln ab', () => {
    expect(errorCode('signup.shiftFull')).toBe('SIGNUP_SHIFT_FULL');
    expect(errorCode('auth.adminSessionTooOld')).toBe('AUTH_ADMIN_SESSION_TOO_OLD');
  });

  it('Fastify-Fehler bleiben ohne Sprache deutsch, sonst übersetzt', () => {
    expect(clientErrorBody(400, 'FST_ERR_CTP_INVALID_JSON_BODY').error).toBe('Die Anfrage enthält kein gültiges JSON.');
    expect(clientErrorBody(404, 'NOT_FOUND', errorTranslator('it')).error).toBe('Non trovato.');
    expect(clientErrorBody(418).error).toBe('Die Anfrage konnte nicht verarbeitet werden.');
  });
});

describe('Validierungsmeldungen', () => {
  const tooSmall = {
    keyword: 'too_small',
    message: 'Vorname ist zu kurz',
    params: { origin: 'string', minimum: 2, inclusive: true },
  };

  it('Deutsch: eigene Meldung des Schemas wie bisher', () => {
    expect(validationMessage(tooSmall, 'de')).toBe('Vorname ist zu kurz');
  });

  it('andere Sprachen: Zods Meldung in dieser Sprache', () => {
    expect(validationMessage(tooSmall, 'fr')).toMatch(/^Trop petit/);
    expect(validationMessage(tooSmall, 'en')).toMatch(/^Too small/);
    expect(validationMessage({ keyword: 'invalid_format', params: { format: 'email' } }, 'it')).toMatch(/email/);
  });

  it('ohne Eintrag kein Text (dann allgemeine Meldung)', () => {
    expect(validationMessage(undefined, 'fr')).toBeNull();
  });
});
