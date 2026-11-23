import crypto from 'crypto';
import {
  DEPARTMENT_PERMISSION_PRESETS,
  normalizePermissions,
  type DepartmentPermission,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';
import { resolveJwtSecret } from '../plugins/jwt.js';
import { errorTranslator, type ErrorKey, type ErrorTranslator } from '../plugins/i18n.js';

export type InvitePreset = 'MEMBER' | DepartmentPermissionPreset;

/**
 * Einladungen zu einer Abteilung gibt es in zwei Formen:
 *
 * - **Abteilungs-Link** (`departments.invite_token`, zum Kopieren): gilt, bis die Abteilung ihn neu erzeugt,
 *   für alle, nur als Mitglied (ohne Rechte).
 * - **Persönliche Einladung** per E-Mail: `<basis>.<vorlage>.<zeitpunkt>.<signatur>`. Läuft nach
 *   PERSONAL_INVITE_TTL_DAYS ab. Mit Rechte-Vorlage gilt sie nur für die eingeladene E-Mail-Adresse und lässt sich
 *   nur einmal einlösen (department_invite_redemptions). Der Zeitpunkt zählt auch, wenn die Leitung jemanden
 *   entfernt hat: Danach hilft nur eine neuere Einladung (siehe checkDepartmentJoin).
 *
 * Wird das Basis-Token neu erzeugt, werden alle Einladungen ungültig.
 */
export const PERSONAL_INVITE_TTL_DAYS = 14;
const PERSONAL_INVITE_TTL_MS = PERSONAL_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

const NO_INVITE: InviteCheck = { valid: false, preset: 'MEMBER', permissions: [], issuedAt: null, tokenHash: null };

export interface InviteCheck {
  valid: boolean;
  preset: InvitePreset;
  /** Rechte aus der Vorlage (nur bei gültiger persönlicher Einladung mit Rechten) */
  permissions: DepartmentPermission[];
  /** Ausstellungszeitpunkt einer persönlichen Einladung; null beim Abteilungs-Link */
  issuedAt: Date | null;
  /** SHA-256 der Einladung mit Rechten: nur einmal einlösbar */
  tokenHash: string | null;
  /** Warum eine persönliche Einladung nicht gilt (für eine verständliche Meldung) */
  reason?: 'EXPIRED' | 'OTHER_EMAIL';
}

function hmac(payload: string, length = 22): string {
  return crypto.createHmac('sha256', resolveJwtSecret()).update(payload).digest('base64url').slice(0, length);
}

/** Frühere Form `<basis>.<vorlage>.<signatur>` (ohne Ablauf, für alle): gilt nur noch wie der Abteilungs-Link */
function signLegacyInvite(departmentId: string, baseToken: string, preset: DepartmentPermissionPreset): string {
  return hmac(`dept-invite:${departmentId}:${baseToken}:${preset}`);
}

function signPersonalInvite(
  departmentId: string,
  baseToken: string,
  preset: InvitePreset,
  issued: string,
  email: string
): string {
  return hmac(`dept-invite:v2:${departmentId}:${baseToken}:${preset}:${issued}:${email}`);
}

function sameSignature(a: string, b: string): boolean {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Rechte-Einladungen hängen an der E-Mail-Adresse; Mitglieder-Einladungen nicht (auch für Profile ohne E-Mail) */
function bindsEmail(preset: InvitePreset): boolean {
  return preset !== 'MEMBER';
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Persönliche Einladung für eine E-Mail-Adresse. Mit Rechte-Vorlage nur für genau diese Adresse gültig.
 */
export function createDepartmentInviteToken(
  departmentId: string,
  baseToken: string,
  preset: InvitePreset,
  email: string,
  now: Date = new Date()
): string {
  const issued = Math.floor(now.getTime() / 1000).toString(36);
  const boundEmail = bindsEmail(preset) ? normalizeEmail(email) : '';
  return `${baseToken}.${preset}.${issued}.${signPersonalInvite(departmentId, baseToken, preset, issued, boundEmail)}`;
}

/** Extrahiert das Basis-Token vor dem ersten Punkt (für DB-Lookup in `departments.invite_token`). */
export function extractBaseInviteToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return token.trim().split('.')[0] || null;
}

/**
 * Prüft Abteilungs-Link oder persönliche Einladung gegen die Abteilung.
 * `email`: bestätigte E-Mail der Person, die einlöst (für Einladungen mit Rechten). Ob eine Einladung mit Rechten
 * schon eingelöst wurde, prüft checkDepartmentJoin (DB).
 */
export function verifyDepartmentInviteToken(
  departmentId: string,
  deptInviteToken: string | null | undefined,
  inputToken: string | null | undefined,
  opts: { email?: string | null; now?: Date } = {}
): InviteCheck {
  if (!deptInviteToken || !inputToken) return NO_INVITE;
  const clean = inputToken.trim();
  if (clean === deptInviteToken) return { ...NO_INVITE, valid: true };

  const parts = clean.split('.');
  if (parts[0] !== deptInviteToken) return NO_INVITE;

  if (parts.length === 3) {
    // Frühere Einladung mit Rechten (ohne Ablauf, an niemanden gebunden): nur noch als Mitglied
    const [, rawPreset, sig] = parts;
    if (rawPreset === 'MEMBER' || !Object.prototype.hasOwnProperty.call(DEPARTMENT_PERMISSION_PRESETS, rawPreset)) {
      return NO_INVITE;
    }
    const valid = sameSignature(sig, signLegacyInvite(departmentId, deptInviteToken, rawPreset as DepartmentPermissionPreset));
    return valid ? { ...NO_INVITE, valid: true } : NO_INVITE;
  }

  if (parts.length !== 4) return NO_INVITE;
  const [, rawPreset, issued, sig] = parts;
  if (rawPreset !== 'MEMBER' && !Object.prototype.hasOwnProperty.call(DEPARTMENT_PERMISSION_PRESETS, rawPreset)) {
    return NO_INVITE;
  }
  const preset = rawPreset as InvitePreset;
  const issuedSeconds = /^[0-9a-z]{1,10}$/.test(issued) ? parseInt(issued, 36) : NaN;
  if (!Number.isFinite(issuedSeconds)) return NO_INVITE;
  const issuedAt = new Date(issuedSeconds * 1000);

  const boundEmail = bindsEmail(preset) ? normalizeEmail(opts.email) : '';
  if (!sameSignature(sig, signPersonalInvite(departmentId, deptInviteToken, preset, issued, boundEmail))) {
    // Bei Rechte-Einladungen heisst eine falsche Signatur meist: andere E-Mail-Adresse (oder keine)
    return bindsEmail(preset) ? { ...NO_INVITE, preset, reason: 'OTHER_EMAIL' } : NO_INVITE;
  }
  const now = opts.now ?? new Date();
  if (now.getTime() - issuedAt.getTime() > PERSONAL_INVITE_TTL_MS || issuedAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return { ...NO_INVITE, preset, reason: 'EXPIRED' };
  }
  const permissions = preset === 'MEMBER' ? [] : normalizePermissions(DEPARTMENT_PERMISSION_PRESETS[preset].permissions);
  return {
    valid: true,
    preset,
    permissions,
    issuedAt,
    tokenHash: permissions.length > 0 ? hashInviteToken(clean) : null,
  };
}

/** Meldung, wenn eine persönliche Einladung nicht (mehr) gilt */
export const INVITE_REASON_ERRORS = {
  EXPIRED: `Diese Einladung ist abgelaufen (gültig ${PERSONAL_INVITE_TTL_DAYS} Tage). Bitte lass dich nochmals einladen.`,
  OTHER_EMAIL:
    'Diese Einladung gilt für eine andere E-Mail-Adresse. Melde dich mit dem Konto dieser Adresse an oder lass dich mit deiner Adresse einladen.',
  USED: 'Diese Einladung wurde schon eingelöst. Bitte lass dich nochmals einladen.',
  REMOVED: 'Die Leitung hat dich aus dieser Abteilung entfernt. Für einen neuen Beitritt braucht es eine neue Einladung.',
} as const;

const INVITE_REASON_KEYS = {
  EXPIRED: 'invite.expired',
  OTHER_EMAIL: 'invite.otherEmail',
  USED: 'invite.used',
  REMOVED: 'invite.removed',
} as const satisfies Record<keyof typeof INVITE_REASON_ERRORS, ErrorKey>;

/** Meldung zu einer ungültigen Einladung in der Sprache der Anfrage (Standard: Deutsch) */
export function inviteReasonError(
  reason: keyof typeof INVITE_REASON_ERRORS,
  t: ErrorTranslator = errorTranslator('de')
): string {
  return t(INVITE_REASON_KEYS[reason], { days: PERSONAL_INVITE_TTL_DAYS });
}
