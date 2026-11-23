import { describe, expect, it, vi } from 'vitest';
import { IntlError, IntlErrorCode } from 'use-intl/core';
import { getMessages, mergeMessages, pickMessages } from './load.js';
import { CATALOGS } from './messages/index.js';
import { createI18nErrorHandler, getTranslator } from './translator.js';

describe('mergeMessages', () => {
  it('füllt Lücken mit der Quelle, leere Strings zählen als unübersetzt', () => {
    const base = { a: 'A', nested: { b: 'B', c: 'C' } };
    expect(mergeMessages(base, { a: 'α', nested: { b: '  ' } })).toEqual({ a: 'α', nested: { b: 'B', c: 'C' } });
  });

  it('übernimmt keine Schlüssel, die es in der Quelle nicht gibt, und keine falschen Typen', () => {
    const base = { a: 'A', nested: { b: 'B' } };
    expect(mergeMessages(base, { a: 1, extra: 'x', nested: 'kaputt' })).toEqual(base);
  });
});

describe('getMessages', () => {
  it('liefert für Deutsch die Quelle und zwischengespeicherte Ergebnisse', () => {
    expect(getMessages('de')).toBe(CATALOGS.de);
    expect(getMessages('fr')).toBe(getMessages('fr'));
  });

  it('pickMessages liefert nur die gewünschten Namespaces', () => {
    expect(Object.keys(pickMessages('en', ['common']))).toEqual(['common']);
  });
});

describe('getTranslator', () => {
  it('übersetzt in allen Sprachen', () => {
    expect(getTranslator('de', { namespace: 'common.actions' })('save')).toBe('Speichern');
    expect(getTranslator('fr', { namespace: 'common.actions' })('save')).toBe('Enregistrer');
    expect(getTranslator('it', { namespace: 'common.actions' })('save')).toBe('Salva');
    expect(getTranslator('en', { namespace: 'common.actions' })('save')).toBe('Save');
  });

  it('setzt Platzhalter ein', () => {
    const values = { date: '24.10.2026', time: '18:00' };
    expect(getTranslator('de')('common.dateTimeAt', values)).toBe('24.10.2026 um 18:00 Uhr');
    expect(getTranslator('fr')('common.dateTimeAt', values)).toBe('24.10.2026 à 18:00');
    expect(getTranslator('en')('common.dateTimeAt', values)).toBe('24.10.2026 at 18:00');
  });

  it('wirft in Tests bei unbekannten Schlüsseln', () => {
    const t = getTranslator('de') as unknown as (key: string) => string;
    expect(() => t('common.gibtEsNicht')).toThrow(/MISSING_MESSAGE/);
  });

  it('zeigt im Log-Modus den Schlüsselpfad und meldet jeden Fehler nur einmal', () => {
    const log = vi.fn();
    const t = getTranslator('de', { onError: createI18nErrorHandler({ mode: 'log', log }) }) as unknown as (
      key: string,
    ) => string;
    expect(t('common.gibtEsNicht')).toBe('common.gibtEsNicht');
    t('common.gibtEsNicht');
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('createI18nErrorHandler', () => {
  it('ignoriert Umgebungs-Hinweise', () => {
    const handler = createI18nErrorHandler({ mode: 'throw' });
    expect(() => handler(new IntlError(IntlErrorCode.ENVIRONMENT_FALLBACK, 'x'))).not.toThrow();
    expect(() => handler(new IntlError(IntlErrorCode.FORMATTING_ERROR, 'x'))).toThrow();
  });
});
