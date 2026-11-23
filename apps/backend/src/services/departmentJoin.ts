/**
 * Beitritt zu Abteilungen/Vereinen. Eine Person hat genau eine Heimabteilung (users.home_department_id) und
 * kann beliebig vielen weiteren beitreten (department_members.joined_at). Hier liegen die Regeln, die für
 * beide Wege gelten: Beitrittsmodus (OPEN, LINK_ONLY, INVITE_ONLY), Einladungs-Token und Stufen.
 */
import type { OrganizationType, PrismaClient } from '../db.js';
import { isPassiveRoleClass, normalizePermissions, type DepartmentPermission } from '@schichtplan/shared';
import type { FastifyBaseLogger } from 'fastify';
import { INVITE_REASON_ERRORS, inviteReasonError, verifyDepartmentInviteToken } from './inviteToken.js';
import { recordDepartmentAction } from './departmentAudit.js';
import { personLabel } from './profile.js';
import { isCeviNameProfile } from './nicknameLogin.js';
import { errorTranslator, type ErrorTranslator } from '../plugins/i18n.js';

type Db = Pick<
  PrismaClient,
  'department' | 'departmentMember' | 'eventOrganizer' | 'userHitobitoRole' | 'hitobitoGroup' | 'departmentInviteRedemption'
>;

export interface ProviderDepartments {
  /**
   * Laut Rollen belegt: Abteilung an der Gruppe einer Rolle, ihrer Jungschar oder Ortsgruppe (wie beim Login).
   * Beitritt geht hier ohne Link und ohne Einladung und gilt als bestätigt.
   */
  verified: Set<string>;
  /**
   * Belegt plus die Jungscharen der eigenen Ortsgruppen (geteilte Ortsgruppe, Rolle z. B. nur im Vorstand): Welche
   * Jungschar es ist, sagt die DB nicht. Wählbar ohne Link, aber nicht bestätigt (das macht die Abteilungsleitung).
   */
  candidates: Set<string>;
}

/** Abteilungen, die laut Verbands-DB zu den eigenen Gruppen gehören (aus den Rollen vom letzten Login) */
export async function ownProviderDepartments(
  prisma: Pick<PrismaClient, 'userHitobitoRole' | 'hitobitoGroup' | 'department'>,
  userId: string,
  provider: OrganizationType
): Promise<ProviderDepartments> {
  const roles = await prisma.userHitobitoRole.findMany({ where: { userId }, select: { groupId: true, roleClass: true } });
  // Ehemalige, Externe, Versandadressen … ordnen keiner Abteilung zu
  const roleGroupIds = [
    ...new Set(roles.flatMap((r) => (r.groupId !== null && !isPassiveRoleClass(r.roleClass) ? [r.groupId] : []))),
  ];
  if (roleGroupIds.length === 0) return { verified: new Set(), candidates: new Set() };
  const groups = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: roleGroupIds } } });
  const ortsgruppeIds = [...new Set(groups.flatMap((g) => (g.ortsgruppeId !== null ? [g.ortsgruppeId] : [])))];
  const jungscharen = ortsgruppeIds.length
    ? await prisma.hitobitoGroup.findMany({
        where: { provider, ortsgruppeId: { in: ortsgruppeIds }, jungscharId: { not: null } },
        select: { jungscharId: true },
      })
    : [];
  const notNull = (ids: (number | null)[]) => ids.filter((id): id is number => id !== null);
  const verifiedGroupIds = new Set(notNull([...roleGroupIds, ...groups.flatMap((g) => [g.jungscharId, g.ortsgruppeId])]));
  const candidateGroupIds = new Set([...verifiedGroupIds, ...notNull(jungscharen.map((j) => j.jungscharId))]);
  const departments = await prisma.department.findMany({
    where: { organization: provider, hitobitoGroupId: { in: [...candidateGroupIds] } },
    select: { id: true, hitobitoGroupId: true },
  });
  return {
    verified: new Set(departments.filter((d) => verifiedGroupIds.has(d.hitobitoGroupId!)).map((d) => d.id)),
    candidates: new Set(departments.map((d) => d.id)),
  };
}

type Tx = Pick<PrismaClient, 'departmentMember' | 'userStufe'>;

export type JoinCheck =
  | { ok: false; status: number; code?: string; error: string }
  | {
      ok: true;
      /** Gültige Einladung: Zugehörigkeit gilt als bestätigt */
      invited: boolean;
      /** Laut Rollen der Verbands-DB belegt: gilt ebenfalls als bestätigt (Herkunft CEVIDB) */
      fromProvider?: boolean;
      /** Rechte aus einer Einladung mit Rechte-Vorlage (nie für Spitznamen-Profile) */
      grantedPermissions: DepartmentPermission[];
      /** Einladung mit Rechten: beim Speichern als eingelöst vermerken (recordInviteRedemption), nur einmal gültig */
      redeemTokenHash?: string;
    };

/**
 * Darf die Person der Abteilung beitreten (als Heimabteilung oder zusätzlich)?
 * Wer schon dazugehört (Heimabteilung, Beitritt, Rechte, OK), darf immer; sonst entscheidet der Beitrittsmodus.
 *
 * Einladungen: Der Abteilungs-Link gilt für alle als Mitglied. Persönliche Einladungen laufen ab, mit Rechten gelten
 * sie nur für die eingeladene (bestätigte) E-Mail und nur einmal. Hat die Leitung die Person entfernt, gilt nur eine
 * Einladung, die danach ausgestellt wurde (der Abteilungs-Link nicht mehr).
 */
export async function checkDepartmentJoin(
  prisma: Db,
  params: {
    userId: string;
    user: {
      homeDepartmentId: string | null;
      passwordHash: string | null;
      providerId: string | null;
      provider?: OrganizationType | null;
      /** Für Einladungen mit Rechten: zählt nur bestätigt */
      email?: string | null;
      emailVerified?: boolean | null;
    };
    departmentId: string;
    inviteToken?: string | null;
    viaLink?: boolean;
    tenantId?: string | null;
  },
  t: ErrorTranslator = errorTranslator('de')
): Promise<JoinCheck> {
  const { userId, user, departmentId } = params;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, joinMode: true, inviteToken: true, organization: true },
  });
  if (!dept) return { ok: false, status: 400, error: t('department.doesNotExistShort') };

  const member = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { removedAt: true },
  });
  const removedAt = member?.removedAt ?? null;

  const invite = verifyDepartmentInviteToken(dept.id, dept.inviteToken, params.inviteToken, {
    email: user.emailVerified ? user.email : null,
  });
  // Warum eine angegebene Einladung nicht gilt (abgelaufen, andere E-Mail, schon eingelöst, nach dem Entfernen)
  let inviteProblem: keyof typeof INVITE_REASON_ERRORS | null = invite.reason ?? null;
  if (invite.valid) {
    // Ausstellungszeit hat Sekunden-Genauigkeit: eine Einladung aus derselben Sekunde wie das Entfernen zählt als neuer
    if (removedAt && (!invite.issuedAt || invite.issuedAt.getTime() < Math.floor(removedAt.getTime() / 1000) * 1000)) {
      inviteProblem = 'REMOVED';
    } else if (
      invite.tokenHash &&
      (await prisma.departmentInviteRedemption.count({ where: { tokenHash: invite.tokenHash } })) > 0
    ) {
      inviteProblem = 'USED';
    } else {
      const grantedPermissions = !isCeviNameProfile(user) && invite.permissions.length > 0 ? invite.permissions : [];
      return {
        ok: true,
        invited: true,
        grantedPermissions,
        ...(grantedPermissions.length > 0 && invite.tokenHash ? { redeemTokenHash: invite.tokenHash } : {}),
      };
    }
  }

  const alreadyMember =
    user.homeDepartmentId === departmentId ||
    (await prisma.departmentMember.count({
      where: {
        departmentId,
        userId,
        OR: [{ role: { not: 'HELPER' } }, { permissions: { isEmpty: false } }, { joinedAt: { not: null } }],
      },
    })) > 0 ||
    (await prisma.eventOrganizer.count({ where: { userId, event: { departmentId } } })) > 0;
  if (alreadyMember) return { ok: true, invited: false, grantedPermissions: [] };

  // Abteilungen der eigenen Gruppen laut Verbands-DB (nur Konten desselben Verbands; Vereine haben keine DB)
  const sameProvider = user.providerId !== null && (!user.provider || user.provider === dept.organization);
  const own = sameProvider && dept.organization !== 'OTHER' ? await ownProviderDepartments(prisma, userId, dept.organization) : null;
  // Laut Rollen belegt: Beitritt auch bei INVITE_ONLY, bestätigt durch die DB
  if (own?.verified.has(dept.id)) return { ok: true, invited: false, fromProvider: true, grantedPermissions: [] };

  // Angegebene Einladung gilt nicht: lieber sagen warum, als still ohne Bestätigung und Rechte aufzunehmen
  if (inviteProblem) {
    return { ok: false, status: 403, code: `INVITE_${inviteProblem}`, error: inviteReasonError(inviteProblem, t) };
  }

  if (dept.joinMode === 'INVITE_ONLY') {
    if (removedAt) return { ok: false, status: 403, code: 'INVITE_REMOVED', error: inviteReasonError('REMOVED', t) };
    return {
      ok: false,
      status: 403,
      code: 'INVITE_REQUIRED',
      error: t('department.joinInviteOnly'),
    };
  }
  // LINK_ONLY ist bewusst keine Zugriffsschranke: Der Abteilungs-Link (Subdomain) ist öffentlich,
  // und viaLink setzt der Browser selbst. Die Prüfung hält die Abteilung nur aus der allgemeinen
  // Auswahl heraus. Ein Beitritt ohne Einladung bleibt unbestätigt; wer wirklich geschlossen sein
  // will, wählt INVITE_ONLY (dort zählt nur Einladung oder Bestätigung durch die Leitung).
  if (dept.joinMode === 'LINK_ONLY' && !params.viaLink && params.tenantId !== departmentId) {
    // Verbands-Konten, deren Rollen keine eindeutige Abteilung ergeben (z. B. geteilte Ortsgruppe), landen ohne
    // Subdomain auf login.<domain>/abteilung. Dort dürfen sie Abteilungen ihrer eigenen Gruppen wählen (unbestätigt).
    if (own?.candidates.has(dept.id)) return { ok: true, invited: false, grantedPermissions: [] };
    return {
      ok: false,
      status: 403,
      code: 'LINK_REQUIRED',
      error: t('department.joinLinkOnly'),
    };
  }
  return { ok: true, invited: false, grantedPermissions: [] };
}

/**
 * Beitritt speichern: joined_at setzen (bestehenden Zeitpunkt behalten), bei Einladung bestätigen
 * (eine frühere Bestätigung bleibt mit Zeitpunkt und Person) und Rechte aus der Einladung ergänzen.
 * Mit join: false nur Rechte ergänzen (z. B. Einladung in die eigene Heimabteilung).
 *
 * Beitritt laut Rollen der Verbands-DB (`fromProvider`): Ohne bestehenden Beitritt entsteht er mit Herkunft
 * PROVIDER_JOIN_SOURCE und endet wieder, wenn die Rolle fehlt. Einen selbst gewählten Beitritt übernimmt die DB nicht:
 * Ist er unbestätigt, bestätigt sie ihn nur (PROVIDER_CONFIRM_SOURCE); fehlt die Rolle, fällt nur diese Bestätigung weg.
 * Eine Bestätigung durch Einladung oder Leitung bleibt immer unberührt.
 */
export async function markMembershipJoined(
  tx: Pick<PrismaClient, 'departmentMember'>,
  departmentId: string,
  userId: string,
  opts: {
    join?: boolean;
    confirmed: boolean;
    confirmedById?: string | null;
    grantedPermissions?: DepartmentPermission[];
    /** Beitritt laut Rollen der Verbands-DB */
    fromProvider?: boolean;
  }
): Promise<{ created: boolean }> {
  const join = opts.join ?? true;
  const existing = await tx.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { joinedAt: true, confirmedAt: true, permissions: true, joinSource: true },
  });
  const now = new Date();
  const permissions = normalizePermissions([...(existing?.permissions ?? []), ...(opts.grantedPermissions ?? [])]);
  const confirm = join && opts.confirmed && !existing?.confirmedAt;
  const wasJoined = Boolean(existing?.joinedAt);
  // Herkunft nur setzen, wenn die DB den Beitritt anlegt oder (bei einem eigenen) die Bestätigung beisteuert
  const source =
    join && opts.fromProvider && !isProviderJoinSource(existing?.joinSource)
      ? !wasJoined
        ? { joinSource: PROVIDER_JOIN_SOURCE }
        : confirm
          ? { joinSource: PROVIDER_CONFIRM_SOURCE }
          : {}
      : {};
  await tx.departmentMember.upsert({
    where: { departmentId_userId: { departmentId, userId } },
    update: {
      ...(join ? { joinedAt: existing?.joinedAt ?? now } : {}),
      ...(confirm ? { confirmedAt: now, confirmedById: opts.confirmedById ?? null } : {}),
      ...(opts.grantedPermissions?.length ? { permissions } : {}),
      ...source,
    },
    create: {
      departmentId,
      userId,
      role: 'HELPER',
      permissions,
      joinedAt: join ? now : null,
      confirmedAt: confirm ? now : null,
      confirmedById: confirm ? (opts.confirmedById ?? null) : null,
      ...source,
    },
  });
  return { created: join && !wasJoined };
}

/**
 * Einladung mit Rechten als eingelöst vermerken (in derselben Transaktion wie der Beitritt). Wurde sie gleichzeitig
 * schon eingelöst, scheitert das am eindeutigen Hash (Prisma P2002) und die Transaktion fällt zurück.
 */
export async function recordInviteRedemption(
  tx: Pick<PrismaClient, 'departmentInviteRedemption'>,
  departmentId: string,
  userId: string,
  tokenHash: string | undefined
) {
  if (!tokenHash) return;
  await tx.departmentInviteRedemption.create({ data: { departmentId, userId, tokenHash } });
}

/** Herkunft eines Beitritts, den die Verbands-DB laut Rollen angelegt hat (endet, wenn die Rolle fehlt) */
export const PROVIDER_JOIN_SOURCE = 'CEVIDB';
/** Selbst gewählter Beitritt, den die Verbands-DB laut Rollen bestätigt (nur die Bestätigung endet mit der Rolle) */
export const PROVIDER_CONFIRM_SOURCE = 'CEVIDB_CONFIRMED';

/** Hängt der Beitritt (oder seine Bestätigung) an den Rollen der Verbands-DB? Dann lässt er sich nur dort ändern. */
export function isProviderJoinSource(source: string | null | undefined): boolean {
  return source === PROVIDER_JOIN_SOURCE || source === PROVIDER_CONFIRM_SOURCE;
}

/**
 * Beim Verbands-Login: In jeder Abteilung, zu der laut Rollen eine Gruppe gehört (ausser der Heimabteilung), gilt die
 * Person als bestätigt beigetreten, auch bei INVITE_ONLY. Was die DB beigesteuert hat und deren Rolle fehlt, endet
 * wieder (nur mit vollständiger Gruppenstruktur, sonst wäre ein fehlender Treffer keine Aussage). Selbst gewählte
 * Beitritte, Bestätigungen durch Einladung oder Leitung und Rechte bleiben unberührt.
 * Ist eine solche Abteilung inzwischen die Heimabteilung, verliert der Eintrag still seine Herkunft: Die Person gehört
 * über die Heimabteilung dazu, ein «Ausgetreten» im Protokoll wäre falsch.
 */
export async function syncProviderMemberships(
  prisma: Pick<PrismaClient, 'departmentMember' | 'user' | 'departmentAuditLog'>,
  log: FastifyBaseLogger,
  userId: string,
  homeDepartmentId: string | null,
  roleDepartmentIds: string[],
  complete: boolean,
  providerName: string
) {
  const wanted = roleDepartmentIds.filter((id) => id !== homeDepartmentId);
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, nickname: true },
  });
  const targetLabel = person ? personLabel(person) : 'Unbekannt';

  for (const departmentId of wanted) {
    const { created } = await markMembershipJoined(prisma, departmentId, userId, { confirmed: true, fromProvider: true });
    // Ins Protokoll der Abteilung, damit die Leitung sieht, warum jemand dazugehört (nur neue Beitritte)
    if (created) {
      await recordDepartmentAction(prisma, log, {
        departmentId,
        actorId: null,
        automaticBy: providerName,
        action: 'MEMBER_JOIN',
        targetUserId: userId,
        targetLabel,
        details: { source: 'CEVIDB' },
      });
    }
  }

  const fromProvider = await prisma.departmentMember.findMany({
    where: { userId, joinSource: { in: [PROVIDER_JOIN_SOURCE, PROVIDER_CONFIRM_SOURCE] } },
    select: { departmentId: true, joinSource: true },
  });
  const notWanted = fromProvider.filter((m) => !wanted.includes(m.departmentId));
  const atHome = notWanted.filter((m) => m.departmentId === homeDepartmentId);
  const ended = complete ? notWanted.filter((m) => m.departmentId !== homeDepartmentId) : [];
  const ids = (list: typeof notWanted, source: string) =>
    list.filter((m) => m.joinSource === source).map((m) => m.departmentId);

  // Heimabteilung: kein zusätzlicher Beitritt mehr, ohne Protokoll
  if (atHome.length) {
    await prisma.departmentMember.updateMany({
      where: { userId, departmentId: { in: atHome.map((m) => m.departmentId) } },
      data: { joinedAt: null, confirmedAt: null, confirmedById: null, joinSource: null },
    });
  }
  if (ended.length === 0) return;

  // Von der DB angelegt: Beitritt endet
  const leave = ids(ended, PROVIDER_JOIN_SOURCE);
  if (leave.length) {
    await prisma.departmentMember.updateMany({
      where: { userId, joinSource: PROVIDER_JOIN_SOURCE, departmentId: { in: leave } },
      data: { joinedAt: null, confirmedAt: null, confirmedById: null, joinSource: null },
    });
    for (const departmentId of leave) {
      await recordDepartmentAction(prisma, log, {
        departmentId,
        actorId: null,
        automaticBy: providerName,
        action: 'MEMBER_LEAVE',
        targetUserId: userId,
        targetLabel,
        details: { reason: 'NO_ROLE' },
      });
    }
  }
  // Selbst gewählt, von der DB bestätigt: Beitritt bleibt, nur die Bestätigung der DB fällt weg
  const unconfirm = ids(ended, PROVIDER_CONFIRM_SOURCE);
  if (unconfirm.length) {
    await prisma.departmentMember.updateMany({
      where: { userId, joinSource: PROVIDER_CONFIRM_SOURCE, departmentId: { in: unconfirm } },
      data: { confirmedAt: null, confirmedById: null, joinSource: null },
    });
  }
}

/** Selbst angegebene Stufen einer Abteilung ersetzen; Stufen aus Cevi.DB und anderer Abteilungen bleiben */
export async function replaceSelfStufen(
  tx: Tx,
  userId: string,
  departmentId: string,
  wanted: { stufeId: string; role: string }[]
) {
  const ceviDbStufen = await tx.userStufe.findMany({ where: { userId, source: 'CEVIDB' }, select: { stufeId: true } });
  const locked = new Set(ceviDbStufen.map((s) => s.stufeId));
  await tx.userStufe.deleteMany({ where: { userId, source: 'SELF', stufe: { departmentId } } });
  const own = wanted.filter((s) => !locked.has(s.stufeId));
  if (own.length) {
    await tx.userStufe.createMany({
      data: own.map((s) => ({ userId, stufeId: s.stufeId, role: s.role, source: 'SELF' })),
      skipDuplicates: true,
    });
  }
}
