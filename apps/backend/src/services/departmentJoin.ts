/**
 * Beitritt zu Abteilungen/Vereinen. Eine Person hat genau eine Heimabteilung (users.home_department_id) und
 * kann beliebig vielen weiteren beitreten (department_members.joined_at). Hier liegen die Regeln, die für
 * beide Wege gelten: Beitrittsmodus (OPEN, LINK_ONLY, INVITE_ONLY), Einladungs-Token und Stufen.
 */
import type { OrganizationType, PrismaClient } from '../db.js';
import { normalizePermissions, type DepartmentPermission } from '@schichtplan/shared';
import { verifyDepartmentInviteToken } from './inviteToken.js';
import { isCeviNameProfile } from './nicknameLogin.js';

type Db = Pick<PrismaClient, 'department' | 'departmentMember' | 'eventOrganizer' | 'userHitobitoRole' | 'hitobitoGroup'>;

/**
 * Abteilungen, die laut Verbands-DB zu den eigenen Gruppen gehören: an der Gruppe einer Rolle, ihrer Jungschar oder
 * Ortsgruppe, dazu die Jungscharen der eigenen Ortsgruppen (geteilte Ortsgruppe, Rolle z. B. nur im Vorstand).
 * Nur diese darf ein Verbands-Konto ohne Link aus der Liste wählen; fremde nur per Link oder Einladung.
 */
export async function ownProviderDepartmentIds(
  prisma: Pick<PrismaClient, 'userHitobitoRole' | 'hitobitoGroup' | 'department'>,
  userId: string,
  provider: OrganizationType
): Promise<Set<string>> {
  const roles = await prisma.userHitobitoRole.findMany({ where: { userId }, select: { groupId: true } });
  const roleGroupIds = [...new Set(roles.flatMap((r) => (r.groupId !== null ? [r.groupId] : [])))];
  if (roleGroupIds.length === 0) return new Set();
  const groups = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: roleGroupIds } } });
  const ortsgruppeIds = [...new Set(groups.flatMap((g) => (g.ortsgruppeId !== null ? [g.ortsgruppeId] : [])))];
  const jungscharen = ortsgruppeIds.length
    ? await prisma.hitobitoGroup.findMany({
        where: { provider, ortsgruppeId: { in: ortsgruppeIds }, jungscharId: { not: null } },
        select: { jungscharId: true },
      })
    : [];
  const candidateIds = [
    ...new Set(
      [
        ...roleGroupIds,
        ...groups.flatMap((g) => [g.jungscharId, g.ortsgruppeId]),
        ...jungscharen.map((j) => j.jungscharId),
      ].filter((id): id is number => id !== null)
    ),
  ];
  const departments = await prisma.department.findMany({
    where: { organization: provider, hitobitoGroupId: { in: candidateIds } },
    select: { id: true },
  });
  return new Set(departments.map((d) => d.id));
}
type Tx = Pick<PrismaClient, 'departmentMember' | 'userStufe'>;

export type JoinCheck =
  | { ok: false; status: number; code?: string; error: string }
  | {
      ok: true;
      /** Gültige Einladung: Zugehörigkeit gilt als bestätigt */
      invited: boolean;
      /** Rechte aus einer Einladung mit Rechte-Vorlage (nie für Spitznamen-Profile) */
      grantedPermissions: DepartmentPermission[];
    };

/**
 * Darf die Person der Abteilung beitreten (als Heimabteilung oder zusätzlich)?
 * Wer schon dazugehört (Heimabteilung, Beitritt, Rechte, OK), darf immer; sonst entscheidet der Beitrittsmodus.
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
    };
    departmentId: string;
    inviteToken?: string | null;
    viaLink?: boolean;
    tenantId?: string | null;
  }
): Promise<JoinCheck> {
  const { userId, user, departmentId } = params;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, joinMode: true, inviteToken: true, organization: true },
  });
  if (!dept) return { ok: false, status: 400, error: 'Diese Abteilung gibt es nicht' };

  const invite = verifyDepartmentInviteToken(dept.id, dept.inviteToken, params.inviteToken);
  if (invite.valid) {
    return {
      ok: true,
      invited: true,
      grantedPermissions: !isCeviNameProfile(user) && invite.permissions.length > 0 ? invite.permissions : [],
    };
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

  if (dept.joinMode === 'INVITE_ONLY') {
    return {
      ok: false,
      status: 403,
      code: 'INVITE_REQUIRED',
      error: 'Beitritt nur per Einladung möglich. Bitte nutze einen gültigen Einladungs-Link.',
    };
  }
  // LINK_ONLY ist bewusst keine Zugriffsschranke: Der Abteilungs-Link (Subdomain) ist öffentlich,
  // und viaLink setzt der Browser selbst. Die Prüfung hält die Abteilung nur aus der allgemeinen
  // Auswahl heraus. Ein Beitritt ohne Einladung bleibt unbestätigt; wer wirklich geschlossen sein
  // will, wählt INVITE_ONLY (dort zählt nur Einladung oder Bestätigung durch die Leitung).
  if (dept.joinMode === 'LINK_ONLY' && !params.viaLink && params.tenantId !== departmentId) {
    // Verbands-Konten, deren Rollen keine eindeutige Abteilung ergeben (z. B. geteilte Ortsgruppe), landen ohne
    // Subdomain auf login.<domain>/abteilung. Dort dürfen sie nur Abteilungen ihrer eigenen Gruppen wählen.
    const sameProvider = user.providerId !== null && (!user.provider || user.provider === dept.organization);
    const own = sameProvider && (await ownProviderDepartmentIds(prisma, userId, dept.organization)).has(dept.id);
    if (own) return { ok: true, invited: false, grantedPermissions: [] };
    return {
      ok: false,
      status: 403,
      code: 'LINK_REQUIRED',
      error: 'Beitritt nur über den Link der Abteilung/des Vereins oder per Einladung möglich.',
    };
  }
  return { ok: true, invited: false, grantedPermissions: [] };
}

/**
 * Beitritt speichern: joined_at setzen (bestehenden Zeitpunkt behalten), bei Einladung bestätigen
 * (eine frühere Bestätigung bleibt mit Zeitpunkt und Person) und Rechte aus der Einladung ergänzen.
 * Mit join: false nur Rechte ergänzen (z. B. Einladung in die eigene Heimabteilung).
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
  }
) {
  const join = opts.join ?? true;
  const existing = await tx.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { joinedAt: true, confirmedAt: true, permissions: true },
  });
  const now = new Date();
  const permissions = normalizePermissions([...(existing?.permissions ?? []), ...(opts.grantedPermissions ?? [])]);
  const confirm = join && opts.confirmed && !existing?.confirmedAt;
  await tx.departmentMember.upsert({
    where: { departmentId_userId: { departmentId, userId } },
    update: {
      ...(join ? { joinedAt: existing?.joinedAt ?? now } : {}),
      ...(confirm ? { confirmedAt: now, confirmedById: opts.confirmedById ?? null } : {}),
      ...(opts.grantedPermissions?.length ? { permissions } : {}),
    },
    create: {
      departmentId,
      userId,
      role: 'HELPER',
      permissions,
      joinedAt: join ? now : null,
      confirmedAt: confirm ? now : null,
      confirmedById: confirm ? (opts.confirmedById ?? null) : null,
    },
  });
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
