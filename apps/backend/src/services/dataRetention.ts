/**
 * Aufbewahrungsfristen (Datensparsamkeit, Art. 6 Abs. 4 DSG). Läuft täglich (server.ts).
 *
 * - Protokoll der Ein- und Austragungen und Nachrichtenverlauf des OK: 1 Jahr nach Ende des Anlasses
 * - Protokolle der Abteilungen und des Admin-Portals: 2 Jahre; die IP-Adresse im Admin-Protokoll nur 90 Tage
 * - Inaktive Konten: nach 24 Monaten ohne Nutzung Hinweis-Mail, 30 Tage später Löschung. Konten ohne
 *   E-Mail-Adresse (z. B. nur Cevi-Name) werden ohne Hinweis gelöscht. Die Eintragungen bleiben im Anlass
 *   als «Gelöschte Person» stehen (services/userErasure.ts). Nie gelöscht werden globale Admins und
 *   die einzige Leitung einer Abteilung.
 *
 * Die Anlässe selbst (samt Namen der Eintragungen) bleiben, bis die Abteilung sie löscht.
 * Fristen müssen mit Abschnitt 8 der Datenschutzerklärung (apps/landing/src/app/datenschutz) übereinstimmen.
 */
import { formatZurichDate, getOrganizationByDbType, isPlaceholderEmail, type OrganizationType } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { sendInactiveAccountEmail } from './email.js';
import { anonymizeUserTraces, detachSignupsAnonymously } from './userErasure.js';

export const DATA_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SIGNUP_LOG_RETENTION_DAYS = 365;
export const EVENT_MESSAGE_RETENTION_DAYS = 365;
export const AUDIT_LOG_RETENTION_DAYS = 730;
export const AUDIT_IP_RETENTION_DAYS = 90;
export const INACTIVE_ACCOUNT_DAYS = 730;
export const INACTIVE_WARNING_DAYS = 30;
/** Seit diesem Tag wird `last_seen_on` geführt (Migration 20261026000000_usage_stats). Davor zählt dieser Tag. */
export const LAST_SEEN_TRACKING_START = new Date('2026-10-26T00:00:00Z');

/** Höchstens so viele Konten pro Lauf (Rest beim nächsten Lauf) */
const ACCOUNT_BATCH = 200;

export interface RetentionResult {
  signupLogs: number;
  messages: number;
  auditLogs: number;
  auditIps: number;
  warned: number;
  deletedAccounts: number;
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** Letzte Nutzung, wobei Konten ohne Eintrag ab Konto-Erstellung bzw. Beginn der Erfassung zählen */
export function lastActivity(user: { lastSeenOn: Date | null; createdAt: Date }): Date {
  if (user.lastSeenOn) return user.lastSeenOn;
  return user.createdAt > LAST_SEEN_TRACKING_START ? user.createdAt : LAST_SEEN_TRACKING_START;
}

function loginUrlFor(org: OrganizationType, env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== 'production') return (env.LOGIN_PORTAL_URL || 'http://localhost:3002').replace(/\/$/, '');
  const defaultDomain = (env.COOKIE_DOMAIN || env.DOMAIN || '').replace(/^\./, '');
  const staging = defaultDomain.startsWith('dev.') || defaultDomain.includes('.dev.');
  const root = getOrganizationByDbType(org).domain.replace(/^dev\./, '');
  return `https://login.${staging ? `dev.${root}` : root}`;
}

function formatDay(date: Date): string {
  return formatZurichDate(date);
}

async function purgeLogs(prisma: PrismaClient, now: Date) {
  const [signupLogs, messages, deptLogs, adminLogs, auditIps] = await prisma.$transaction([
    prisma.shiftSignupLog.deleteMany({ where: { event: { endDate: { lt: daysAgo(now, SIGNUP_LOG_RETENTION_DAYS) } } } }),
    prisma.eventMessage.deleteMany({ where: { event: { endDate: { lt: daysAgo(now, EVENT_MESSAGE_RETENTION_DAYS) } } } }),
    prisma.departmentAuditLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, AUDIT_LOG_RETENTION_DAYS) } } }),
    prisma.adminAuditLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, AUDIT_LOG_RETENTION_DAYS) } } }),
    prisma.adminAuditLog.updateMany({
      where: { ip: { not: null }, createdAt: { lt: daysAgo(now, AUDIT_IP_RETENTION_DAYS) } },
      data: { ip: null },
    }),
  ]);
  return {
    signupLogs: signupLogs.count,
    messages: messages.count,
    auditLogs: deptLogs.count + adminLogs.count,
    auditIps: auditIps.count,
  };
}

/** Einzige Leitung einer Abteilung? Dann bleibt das Konto (die Abteilung würde sonst führungslos). */
async function isSoleLeader(prisma: PrismaClient, userId: string): Promise<boolean> {
  const led = await prisma.departmentMember.findMany({ where: { userId, role: 'ADMIN' }, select: { departmentId: true } });
  for (const m of led) {
    const others = await prisma.departmentMember.count({
      where: { departmentId: m.departmentId, role: 'ADMIN', userId: { not: userId } },
    });
    if (others === 0) return true;
  }
  return false;
}

/** Löscht ein inaktives Konto; die Eintragungen bleiben anonym im Anlass. */
export async function deleteInactiveAccount(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.eventAccessLink.updateMany({ where: { boundUserId: userId }, data: { boundUserId: null } });
    await tx.eventAccessLink.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.eventDeregistration.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.cateringToken.updateMany({ where: { userId, status: 'REDEEMED' }, data: { userId: null } });
    await detachSignupsAnonymously(tx, [userId]);
    await anonymizeUserTraces(tx, [userId]);
    await tx.user.delete({ where: { id: userId } });
  });
}

async function handleInactiveAccounts(
  prisma: PrismaClient,
  now: Date,
  log?: { warn: (obj: object, msg: string) => void }
) {
  const cutoff = daysAgo(now, INACTIVE_ACCOUNT_DAYS);
  const candidates = await prisma.user.findMany({
    where: {
      isGlobalAdmin: false,
      OR: [
        { lastSeenOn: { lt: cutoff } },
        // Ohne Eintrag erst, wenn auch der Beginn der Erfassung lange genug zurückliegt
        ...(LAST_SEEN_TRACKING_START < cutoff ? [{ lastSeenOn: null, createdAt: { lt: cutoff } }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      providerId: true,
      provider: true,
      firstName: true,
      nickname: true,
      lastSeenOn: true,
      createdAt: true,
      inactivityWarnedAt: true,
      homeDepartment: { select: { organization: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: ACCOUNT_BATCH,
  });

  let warned = 0;
  let deletedAccounts = 0;
  for (const user of candidates) {
    if (lastActivity(user) >= cutoff) continue;
    if (await isSoleLeader(prisma, user.id)) continue;

    const reachable = Boolean(user.email && !isPlaceholderEmail(user.email) && (user.emailVerified || user.providerId));
    const warnedSinceInactive = user.inactivityWarnedAt && user.inactivityWarnedAt > lastActivity(user);

    try {
      if (!reachable || (warnedSinceInactive && user.inactivityWarnedAt! <= daysAgo(now, INACTIVE_WARNING_DAYS))) {
        await deleteInactiveAccount(prisma, user.id);
        deletedAccounts++;
      } else if (!warnedSinceInactive) {
        const org = (user.homeDepartment?.organization ?? user.provider) as OrganizationType;
        const sent = await sendInactiveAccountEmail({
          to: user.email!,
          name: user.nickname || user.firstName,
          loginUrl: loginUrlFor(org),
          deleteOn: formatDay(new Date(now.getTime() + INACTIVE_WARNING_DAYS * DAY_MS)),
          organization: org,
        });
        // Nur wenn die Mail rausging, läuft die Frist; sonst nächster Versuch beim nächsten Lauf
        if (sent) {
          await prisma.user.update({ where: { id: user.id }, data: { inactivityWarnedAt: now } });
          warned++;
        }
      }
    } catch (err) {
      log?.warn({ userId: user.id, err }, 'Inaktives Konto konnte nicht bearbeitet werden');
    }
  }
  return { warned, deletedAccounts };
}

export async function runDataRetention(
  prisma: PrismaClient,
  log?: { warn: (obj: object, msg: string) => void },
  now: Date = new Date()
): Promise<RetentionResult> {
  const logs = await purgeLogs(prisma, now);
  const accounts = await handleInactiveAccounts(prisma, now, log);
  return { ...logs, ...accounts };
}
