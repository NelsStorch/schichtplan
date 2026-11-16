import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { resolveJwtSecret } from '../plugins/jwt.js';
import {
  PERSONAL_INVITE_TTL_DAYS,
  createDepartmentInviteToken,
  extractBaseInviteToken,
  verifyDepartmentInviteToken,
} from './inviteToken.js';

const DEPT = 'dept-1';
const BASE = 'basis-token-abcdefghijkl';
const DAY = 24 * 60 * 60 * 1000;

describe('Einladungs-Token', () => {
  it('lässt den Abteilungs-Link als Mitglied gelten (ohne Ablauf)', () => {
    expect(verifyDepartmentInviteToken(DEPT, BASE, BASE)).toMatchObject({ valid: true, preset: 'MEMBER', permissions: [], issuedAt: null });
  });

  it('bindet Einladungen mit Rechten an die E-Mail (ohne Gross-/Kleinschreibung)', () => {
    const token = createDepartmentInviteToken(DEPT, BASE, 'EVENT_CREATION', 'Anna@Beispiel.ch');
    expect(extractBaseInviteToken(token)).toBe(BASE);
    const ok = verifyDepartmentInviteToken(DEPT, BASE, token, { email: 'anna@beispiel.ch' });
    expect(ok.valid).toBe(true);
    expect(ok.permissions.length).toBeGreaterThan(0);
    expect(ok.tokenHash).toBeTruthy();
    expect(verifyDepartmentInviteToken(DEPT, BASE, token, { email: 'mallory@beispiel.ch' })).toMatchObject({
      valid: false,
      reason: 'OTHER_EMAIL',
    });
    expect(verifyDepartmentInviteToken(DEPT, BASE, token)).toMatchObject({ valid: false, reason: 'OTHER_EMAIL' });
  });

  it('lässt Mitglieder-Einladungen ohne E-Mail gelten (z. B. Spitznamen-Profil)', () => {
    const token = createDepartmentInviteToken(DEPT, BASE, 'MEMBER', 'anna@beispiel.ch');
    expect(verifyDepartmentInviteToken(DEPT, BASE, token)).toMatchObject({ valid: true, permissions: [], tokenHash: null });
  });

  it('lässt persönliche Einladungen ablaufen', () => {
    const issued = new Date('2026-11-01T10:00:00Z');
    const token = createDepartmentInviteToken(DEPT, BASE, 'MEMBER', 'anna@beispiel.ch', issued);
    const inTime = new Date(issued.getTime() + (PERSONAL_INVITE_TTL_DAYS - 1) * DAY);
    const tooLate = new Date(issued.getTime() + (PERSONAL_INVITE_TTL_DAYS + 1) * DAY);
    expect(verifyDepartmentInviteToken(DEPT, BASE, token, { now: inTime }).valid).toBe(true);
    expect(verifyDepartmentInviteToken(DEPT, BASE, token, { now: tooLate })).toMatchObject({ valid: false, reason: 'EXPIRED' });
  });

  it('lehnt veränderte Vorlage, fremde Abteilung und neues Basis-Token ab', () => {
    const token = createDepartmentInviteToken(DEPT, BASE, 'MEMBER', 'anna@beispiel.ch');
    const forged = token.replace('.MEMBER.', '.ADMINISTRATION.');
    expect(verifyDepartmentInviteToken(DEPT, BASE, forged, { email: 'anna@beispiel.ch' }).valid).toBe(false);
    expect(verifyDepartmentInviteToken('dept-2', BASE, token).valid).toBe(false);
    expect(verifyDepartmentInviteToken(DEPT, 'neues-basis-token-xyz123', token).valid).toBe(false);
  });

  it('lässt frühere Einladungen mit Rechten nur noch als Mitglied gelten', () => {
    const sig = crypto
      .createHmac('sha256', resolveJwtSecret())
      .update(`dept-invite:${DEPT}:${BASE}:ADMINISTRATION`)
      .digest('base64url')
      .slice(0, 22);
    const legacy = `${BASE}.ADMINISTRATION.${sig}`;
    expect(verifyDepartmentInviteToken(DEPT, BASE, legacy)).toMatchObject({ valid: true, preset: 'MEMBER', permissions: [] });
  });
});
