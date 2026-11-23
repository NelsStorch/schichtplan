import { describe, expect, it } from 'vitest';
import { checkCatalogs, checkEnabledCoverage, totalCoverage } from './check.js';
import { CATALOGS } from './messages/index.js';
import { pseudoLocalize, pseudoLocalizeMessages } from './pseudo.js';

const source = {
  common: {
    hello: 'Hallo {name}',
    shifts: '{count, plural, one {# Schicht} other {# Schichten}}',
    terms: 'Mit <link>Nutzungsbedingungen</link>',
    plain: 'Speichern',
  },
};

describe('checkCatalogs', () => {
  it('die echten Kataloge sind fehlerfrei', () => {
    const { issues } = checkCatalogs(CATALOGS as never);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('akzeptiert korrekte Übersetzungen und zählt die Abdeckung', () => {
    const { issues, coverage } = checkCatalogs({
      de: source,
      fr: {
        common: {
          hello: 'Bonjour {name}',
          shifts: '{count, plural, one {# créneau} other {# créneaux}}',
          terms: '',
        },
      },
    });
    expect(issues).toEqual([]);
    expect(coverage).toEqual([{ locale: 'fr', namespace: 'common', translated: 2, total: 4, percent: 50 }]);
    expect(totalCoverage(coverage, 'fr')).toBe(50);
  });

  it('meldet abweichende Platzhalter, Tags, ungültiges ICU und verwaiste Schlüssel', () => {
    const { issues } = checkCatalogs({
      de: source,
      fr: {
        common: {
          hello: 'Bonjour {nom}',
          shifts: '{count, plural, one {# créneau}',
          terms: 'Avec les conditions',
          plain: 'Enregistrer',
          extra: 'x',
        },
        neu: { a: 'b' },
      },
    });
    const byKey = Object.fromEntries(issues.map((i) => [`${i.namespace}.${i.key}`, i.message]));
    expect(byKey['common.hello']).toMatch(/Platzhalter/);
    expect(byKey['common.shifts']).toMatch(/ICU/);
    expect(byKey['common.terms']).toMatch(/<link>/);
    expect(byKey['common.extra']).toMatch(/verwaist/);
    expect(byKey['neu.*']).toMatch(/Namespace/);
    expect(byKey['common.plain']).toBeUndefined();
  });

  it('erkennt die typische Apostroph-Falle im Französischen', () => {
    // ASCII-Apostroph vor einem Platzhalter maskiert ihn: «l'{name}» gibt «l{name}» ohne Wert aus
    const { issues } = checkCatalogs({ de: { c: { x: 'Anlass {name}' } }, fr: { c: { x: "l'{name}" } } });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/Platzhalter/);
  });

  it('prüft die Quellsprache streng', () => {
    const { issues } = checkCatalogs({ de: { c: { leer: '', zahl: 3, 'mit-strich': 'x', kaputt: '{a' } } });
    expect(issues.map((i) => i.key).sort()).toEqual(['kaputt', 'leer', 'mit-strich', 'zahl']);
  });
});

describe('checkEnabledCoverage', () => {
  it('meldet freigeschaltete Sprachen unter dem Minimum, Deutsch nie', () => {
    const coverage = [
      { locale: 'fr', namespace: 'common', translated: 9, total: 10, percent: 90 },
      { locale: 'en', namespace: 'common', translated: 10, total: 10, percent: 100 },
    ];
    expect(checkEnabledCoverage(coverage, ['de', 'en'], 95)).toEqual([]);
    expect(checkEnabledCoverage(coverage, ['de', 'fr', 'en'], 95)).toHaveLength(1);
  });
});

describe('pseudoLocalize', () => {
  it('akzentuiert Text, verlängert ihn und lässt Platzhalter, Plural und Tags intakt', () => {
    expect(pseudoLocalize('Hallo {name}')).toMatch(/^\[Ħåļļø \{name\} ~+\]$/);
    const plural = pseudoLocalize(source.common.shifts);
    expect(plural).toMatch(/\{count,\s*plural,/);
    expect(plural).toContain('# Šçħïçħţ');
    expect(pseudoLocalize(source.common.terms)).toContain('<link>Ñûţžûñĝšƀéðïñĝûñĝéñ</link>');
  });

  it('bleibt gültiges ICU mit denselben Platzhaltern', () => {
    const pseudo = pseudoLocalizeMessages(source);
    const { issues } = checkCatalogs({ de: source, fr: pseudo });
    expect(issues).toEqual([]);
  });

  it('lässt ungültige Nachrichten unverändert', () => {
    expect(pseudoLocalize('{kaputt')).toBe('{kaputt');
  });
});
