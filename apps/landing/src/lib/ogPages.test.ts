import { describe, expect, it } from 'vitest';
import { getOrganization } from '@schichtplan/shared';
import { landingPage } from './ogPages';

describe('landingPage OG metadata', () => {
  const org = getOrganization('cevi-schichtplan.ch', 'de');

  it('liefert deutsche Texte als Standard', () => {
    const page = landingPage('datenschutz', org, 'de');
    expect(page?.title).toBe('Datenschutzerklärung');
    expect(page?.subtitle).toBe('Welche Daten wir bearbeiten und welche Rechte du hast.');
  });

  it('liefert französische Texte für fr', () => {
    const orgFr = getOrganization('cevi-schichtplan.ch', 'fr');
    const page = landingPage('datenschutz', orgFr, 'fr');
    expect(page?.title).toBe('Protection des données');
    expect(page?.subtitle).toBe('Quelles données nous traitons et quels sont vos droits.');
  });

  it('liefert italienische Texte für it', () => {
    const orgIt = getOrganization('cevi-schichtplan.ch', 'it');
    const page = landingPage('nutzungsbedingungen', orgIt, 'it');
    expect(page?.title).toBe('Condizioni di utilizzo');
  });

  it('liefert englische Texte für en', () => {
    const orgEn = getOrganization('cevi-schichtplan.ch', 'en');
    const page = landingPage('impressum', orgEn, 'en');
    expect(page?.title).toBe('Legal Notice');
  });

  it('gibt null für unbekannte Seiten zurück', () => {
    expect(landingPage('unbekannt', org)).toBeNull();
  });
});
