import { describe, expect, it } from 'vitest';
import { errorTranslator, TranslatableError } from '../plugins/i18n.js';
import { inviteReasonError } from './inviteToken.js';
import { registrationAccepted } from './authSession.js';
import { missingSensitiveConsent, validateAnswers } from '../routes/eventParticipation.js';
import { NOT_ELIGIBLE_KEYS, NOT_ELIGIBLE_MESSAGES } from '../routes/departments/shared.js';

describe('Hilfsfunktionen liefern Meldungen in der Sprache der Anfrage', () => {
  it('ohne Übersetzer bleibt alles deutsch wie bisher', () => {
    expect(inviteReasonError('USED')).toBe('Diese Einladung wurde schon eingelöst. Bitte lass dich nochmals einladen.');
    expect(registrationAccepted('a@b.ch').message).toMatch(/^Bitte überprüfe dein Postfach/);
    expect(validateAnswers([{ id: 'q', label: 'Grösse', type: 'CHOICE', options: ['S'] }], { q: 'XL' })).toBe(
      'Ungültige Antwort bei «Grösse»'
    );
  });

  it('mit Übersetzer in der gewählten Sprache', () => {
    const fr = errorTranslator('fr');
    expect(inviteReasonError('EXPIRED', fr)).toMatch(/^Cette invitation a expiré \(valable \d+ jours\)/);
    expect(registrationAccepted('a@b.ch', errorTranslator('en')).message).toBe(
      'Please check your inbox: we have sent you an email to sign in.'
    );
    expect(validateAnswers([{ id: 'q', label: 'Taille', type: 'YES_NO', options: [] }], { q: 'peut-être' }, fr)).toBe(
      'Merci de répondre oui ou non à «Taille»'
    );
    expect(missingSensitiveConsent([{ id: 'q', sensitive: true }], { q: 'x' }, false, errorTranslator('it'))).toBe(
      'Conferma il consenso per i dati sulla salute.'
    );
  });

  it('Gründe für «Abteilung anlegen nicht möglich»: Schlüssel decken alle deutschen Texte ab', () => {
    const de = errorTranslator('de');
    for (const reason of Object.keys(NOT_ELIGIBLE_MESSAGES) as (keyof typeof NOT_ELIGIBLE_MESSAGES)[]) {
      expect(de(NOT_ELIGIBLE_KEYS[reason])).toBe(NOT_ELIGIBLE_MESSAGES[reason]);
    }
  });

  it('TranslatableError trägt Schlüssel und deutsche Meldung', () => {
    const err = new TranslatableError('catering.batchNotFound');
    expect(err.message).toBe('Tranche nicht gefunden');
    expect(errorTranslator('en')(err.key, err.values)).toBe('Batch not found');
  });
});
