import { describe, expect, it, vi } from 'vitest';
import { checkDepartmentJoin, syncProviderMemberships } from './departmentJoin.js';
import { createDepartmentInviteToken } from './inviteToken.js';

function makePrisma(
  dept: {
    id: string;
    joinMode: string;
    inviteToken?: string | null;
    organization?: string;
  } | null,
  hitobito: {
    roleGroupIds?: number[];
    groups?: { id: number; jungscharId: number | null; ortsgruppeId: number | null }[];
    /** Abteilungen mit ihrer Hitobito-Gruppe */
    departments?: { id: string; hitobitoGroupId: number }[];
  } = {},
  extra: { removedAt?: Date | null; redeemed?: boolean } = {}
) {
  const groups = hitobito.groups ?? [];
  return {
    department: {
      findUnique: vi.fn().mockResolvedValue(
        dept
          ? {
              inviteToken: null,
              organization: 'CEVI',
              ...dept,
            }
          : null
      ),
      findMany: vi.fn(async ({ where }: { where: { hitobitoGroupId: { in: number[] } } }) =>
        (hitobito.departments ?? [])
          .filter((d) => where.hitobitoGroupId.in.includes(d.hitobitoGroupId))
          .map((d) => ({ id: d.id, hitobitoGroupId: d.hitobitoGroupId }))
      ),
    },
    userHitobitoRole: {
      findMany: vi.fn().mockResolvedValue((hitobito.roleGroupIds ?? []).map((groupId) => ({ groupId }))),
    },
    hitobitoGroup: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: number[] }; ortsgruppeId?: { in: number[] } } }) =>
        where.id
          ? groups.filter((g) => where.id.in.includes(g.id))
          : groups.filter((g) => g.ortsgruppeId !== null && where.ortsgruppeId.in.includes(g.ortsgruppeId) && g.jungscharId !== null)
      ),
    },
    departmentMember: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(extra.removedAt ? { removedAt: extra.removedAt } : null),
    },
    eventOrganizer: {
      count: vi.fn().mockResolvedValue(0),
    },
    departmentInviteRedemption: {
      count: vi.fn().mockResolvedValue(extra.redeemed ? 1 : 0),
    },
  } as unknown as Parameters<typeof checkDepartmentJoin>[0];
}

describe('checkDepartmentJoin', () => {
  it('blockiert E-Mail-Konten bei LINK_ONLY ohne Abteilungs-Link', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: 'hash', providerId: null, provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'LINK_REQUIRED' });
  });

  it('erlaubt E-Mail-Konten bei LINK_ONLY mit viaLink', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: 'hash', providerId: null, provider: 'CEVI' },
      departmentId: 'dept-1',
      viaLink: true,
    });
    expect(res).toEqual({ ok: true, invited: false, grantedPermissions: [] });
  });

  it('erlaubt Verbands-Konten bei LINK_ONLY ohne Link nur die Abteilung der eigenen Gruppen', async () => {
    // Rolle im Vorstand der Ortsgruppe 161 mit zwei Jungscharen (295 → dept-1, 726 → dept-2)
    const hitobito = {
      roleGroupIds: [170],
      groups: [
        { id: 170, jungscharId: null, ortsgruppeId: 161 },
        { id: 295, jungscharId: 295, ortsgruppeId: 161 },
        { id: 726, jungscharId: 726, ortsgruppeId: 161 },
      ],
      departments: [
        { id: 'dept-1', hitobitoGroupId: 295 },
        { id: 'dept-2', hitobitoGroupId: 726 },
      ],
    };
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'CEVI' }, hitobito);
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toEqual({ ok: true, invited: false, grantedPermissions: [] });
  });

  it('blockiert Verbands-Konten bei LINK_ONLY ohne Link für fremde Abteilungen', async () => {
    const hitobito = {
      roleGroupIds: [31],
      groups: [{ id: 31, jungscharId: null, ortsgruppeId: 30 }],
      departments: [
        { id: 'dept-eigene', hitobitoGroupId: 30 },
        { id: 'dept-fremd', hitobitoGroupId: 40 },
      ],
    };
    const prisma = makePrisma({ id: 'dept-fremd', joinMode: 'LINK_ONLY', organization: 'JUBLA' }, hitobito);
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'JUBLA' },
      departmentId: 'dept-fremd',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'LINK_REQUIRED' });
  });

  it('blockiert Verbands-Konten ohne Rollen bei LINK_ONLY ohne Link', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'LINK_ONLY', organization: 'JUBLA' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'JUBLA' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'LINK_REQUIRED' });
  });

  it('blockiert bei INVITE_ONLY ohne gültigen Einladungs-Token auch Verbands-Konten', async () => {
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'INVITE_ONLY', organization: 'CEVI' });
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_REQUIRED' });
  });

  it('lässt bei INVITE_ONLY ohne Einladung beitreten, wenn die Rollen die Abteilung belegen (bestätigt)', async () => {
    // Leiterin in einer Kindergruppe (41) der Schar 40
    const hitobito = {
      roleGroupIds: [41],
      groups: [{ id: 41, jungscharId: null, ortsgruppeId: 40 }],
      departments: [{ id: 'dept-wetzikon', hitobitoGroupId: 40 }],
    };
    const prisma = makePrisma({ id: 'dept-wetzikon', joinMode: 'INVITE_ONLY', organization: 'JUBLA' }, hitobito);
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: 'dept-uster', passwordHash: null, providerId: '101', provider: 'JUBLA' },
      departmentId: 'dept-wetzikon',
    });
    expect(res).toEqual({ ok: true, invited: false, fromProvider: true, grantedPermissions: [] });
  });

  it('bestätigt bei geteilter Ortsgruppe nicht automatisch (welche Jungschar, sagt die DB nicht)', async () => {
    const hitobito = {
      roleGroupIds: [170],
      groups: [
        { id: 170, jungscharId: null, ortsgruppeId: 161 },
        { id: 295, jungscharId: 295, ortsgruppeId: 161 },
      ],
      departments: [{ id: 'dept-1', hitobitoGroupId: 295 }],
    };
    const prisma = makePrisma({ id: 'dept-1', joinMode: 'INVITE_ONLY', organization: 'CEVI' }, hitobito);
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: null, providerId: '101', provider: 'CEVI' },
      departmentId: 'dept-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_REQUIRED' });
  });

  it('nutzt bei Vereinen keine Verbands-Rollen', async () => {
    const hitobito = {
      roleGroupIds: [41],
      groups: [{ id: 41, jungscharId: null, ortsgruppeId: 40 }],
      departments: [{ id: 'verein-1', hitobitoGroupId: 40 }],
    };
    const prisma = makePrisma({ id: 'verein-1', joinMode: 'INVITE_ONLY', organization: 'OTHER' }, hitobito);
    const res = await checkDepartmentJoin(prisma, {
      userId: 'u-1',
      user: { homeDepartmentId: null, passwordHash: 'hash', providerId: null, provider: 'OTHER' },
      departmentId: 'verein-1',
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_REQUIRED' });
    expect(prisma.userHitobitoRole.findMany).not.toHaveBeenCalled();
  });
});

describe('checkDepartmentJoin mit Einladungen', () => {
  const BASE = 'basis-token-abcdefghijkl';
  const dept = { id: 'dept-1', joinMode: 'INVITE_ONLY', organization: 'CEVI', inviteToken: BASE };
  const passwordUser = (email: string) => ({
    homeDepartmentId: null,
    passwordHash: 'hash',
    providerId: null,
    provider: 'CEVI' as const,
    email,
    emailVerified: true,
  });

  it('gibt Rechte aus einer persönlichen Einladung an die eingeladene Adresse (einmal einzulösen)', async () => {
    const token = createDepartmentInviteToken('dept-1', BASE, 'ADMINISTRATION', 'Anna@Beispiel.ch');
    const res = await checkDepartmentJoin(makePrisma(dept), {
      userId: 'u-1',
      user: passwordUser('anna@beispiel.ch'),
      departmentId: 'dept-1',
      inviteToken: token,
    });
    expect(res).toMatchObject({ ok: true, invited: true });
    if (!res.ok) throw new Error('erwartet ok');
    expect(res.grantedPermissions.length).toBeGreaterThan(0);
    expect(res.redeemTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lehnt eine weitergeleitete Einladung mit Rechten ab (andere E-Mail)', async () => {
    const token = createDepartmentInviteToken('dept-1', BASE, 'ADMINISTRATION', 'anna@beispiel.ch');
    const res = await checkDepartmentJoin(makePrisma(dept), {
      userId: 'u-2',
      user: passwordUser('mallory@beispiel.ch'),
      departmentId: 'dept-1',
      inviteToken: token,
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_OTHER_EMAIL' });
  });

  it('lehnt eine schon eingelöste Einladung mit Rechten ab', async () => {
    const token = createDepartmentInviteToken('dept-1', BASE, 'ADMINISTRATION', 'anna@beispiel.ch');
    const res = await checkDepartmentJoin(makePrisma(dept, {}, { redeemed: true }), {
      userId: 'u-1',
      user: passwordUser('anna@beispiel.ch'),
      departmentId: 'dept-1',
      inviteToken: token,
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_USED' });
  });

  it('lässt eine entfernte Person mit dem alten Abteilungs-Link nicht wieder hinein', async () => {
    const res = await checkDepartmentJoin(makePrisma(dept, {}, { removedAt: new Date() }), {
      userId: 'u-1',
      user: passwordUser('anna@beispiel.ch'),
      departmentId: 'dept-1',
      inviteToken: BASE,
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: 'INVITE_REMOVED' });
  });

  it('nimmt eine entfernte Person mit einer neueren Einladung wieder auf', async () => {
    const removedAt = new Date(Date.now() - 60 * 60 * 1000);
    const token = createDepartmentInviteToken('dept-1', BASE, 'MEMBER', 'anna@beispiel.ch');
    const res = await checkDepartmentJoin(makePrisma(dept, {}, { removedAt }), {
      userId: 'u-1',
      user: passwordUser('anna@beispiel.ch'),
      departmentId: 'dept-1',
      inviteToken: token,
    });
    expect(res).toEqual({ ok: true, invited: true, grantedPermissions: [] });
  });
});

describe('syncProviderMemberships', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Parameters<typeof syncProviderMemberships>[1];
  /** `fromProviderBefore`: Einträge mit Herkunft aus der DB; `existing`: bestehende Mitgliedschaften pro Abteilung */
  function memberDb(
    fromProviderBefore: (string | { departmentId: string; joinSource: string })[] = [],
    existing: Record<string, { joinedAt: Date | null; confirmedAt: Date | null; joinSource: string | null }> = {}
  ) {
    return {
      departmentMember: {
        findUnique: vi.fn(async ({ where }: { where: { departmentId_userId: { departmentId: string; userId: string } } }) => {
          const m = existing[where.departmentId_userId.departmentId];
          return m ? { permissions: [], ...m } : null;
        }),
        findMany: vi.fn().mockResolvedValue(
          fromProviderBefore.map((m) => (typeof m === 'string' ? { departmentId: m, joinSource: 'CEVIDB' } : m))
        ),
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ firstName: 'Lea', lastName: 'Muster', nickname: 'Sim' }) },
      departmentAuditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as Parameters<typeof syncProviderMemberships>[0];
  }

  it('trägt weitere Abteilungen laut Rollen bestätigt ein und protokolliert sie, die Heimabteilung nicht', async () => {
    const db = memberDb();
    await syncProviderMemberships(db, log, 'u-1', 'dept-home', ['dept-home', 'dept-2'], true, 'Jubla-DB');
    expect(db.departmentMember.upsert).toHaveBeenCalledTimes(1);
    const call = db.departmentMember.upsert.mock.calls[0][0];
    expect(call.where.departmentId_userId).toEqual({ departmentId: 'dept-2', userId: 'u-1' });
    expect(call.create).toMatchObject({ joinSource: 'CEVIDB', role: 'HELPER' });
    expect(call.create.joinedAt).toBeInstanceOf(Date);
    expect(call.create.confirmedAt).toBeInstanceOf(Date);
    expect(db.departmentAuditLog.create).toHaveBeenCalledTimes(1);
    expect(db.departmentAuditLog.create.mock.calls[0][0].data).toMatchObject({
      departmentId: 'dept-2',
      action: 'MEMBER_JOIN',
      actorName: 'Jubla-DB (automatisch)',
    });
  });

  it('protokolliert bestehende DB-Beitritte nicht erneut', async () => {
    const db = memberDb(['dept-2'], { 'dept-2': { joinedAt: new Date(), confirmedAt: new Date(), joinSource: 'CEVIDB' } });
    await syncProviderMemberships(db, log, 'u-1', null, ['dept-2'], true, 'Jubla-DB');
    expect(db.departmentAuditLog.create).not.toHaveBeenCalled();
    expect(db.departmentMember.updateMany).not.toHaveBeenCalled();
  });

  it('übernimmt einen selbst gewählten Beitritt nicht: unbestätigt nur bestätigen, bestätigt gar nicht anfassen', async () => {
    const db = memberDb([], {
      'dept-self': { joinedAt: new Date('2026-01-01'), confirmedAt: null, joinSource: null },
      'dept-invited': { joinedAt: new Date('2026-01-01'), confirmedAt: new Date('2026-01-02'), joinSource: null },
    });
    await syncProviderMemberships(db, log, 'u-1', null, ['dept-self', 'dept-invited'], true, 'Cevi.DB');
    const [self, invited] = (db.departmentMember.upsert as unknown as { mock: { calls: Array<[{ update: Record<string, unknown> }]> } }).mock.calls.map((c) => c[0].update);
    expect(self).toMatchObject({ joinSource: 'CEVIDB_CONFIRMED' });
    expect(self.confirmedAt).toBeInstanceOf(Date);
    expect(invited.joinSource).toBeUndefined();
    expect(invited.confirmedAt).toBeUndefined();
    // Kein «Dazugekommen»: die Person war schon dabei
    expect(db.departmentAuditLog.create).not.toHaveBeenCalled();
  });

  it('beendet DB-Beitritte ohne Rolle nur mit vollständiger Gruppenstruktur', async () => {
    const db = memberDb(['dept-2', 'dept-alt']);
    await syncProviderMemberships(db, log, 'u-1', null, ['dept-2'], true, 'Cevi.DB');
    expect(db.departmentMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', joinSource: 'CEVIDB', departmentId: { in: ['dept-alt'] } },
      data: { joinedAt: null, confirmedAt: null, confirmedById: null, joinSource: null },
    });
    expect(db.departmentAuditLog.create.mock.calls.at(-1)[0].data).toMatchObject({
      departmentId: 'dept-alt',
      action: 'MEMBER_LEAVE',
    });

    const incomplete = memberDb(['dept-alt']);
    await syncProviderMemberships(incomplete, log, 'u-1', null, [], false, 'Cevi.DB');
    expect(incomplete.departmentMember.updateMany).not.toHaveBeenCalled();
  });

  it('nimmt bei selbst gewählten Beitritten ohne Rolle nur die Bestätigung der DB weg', async () => {
    const db = memberDb([{ departmentId: 'dept-self', joinSource: 'CEVIDB_CONFIRMED' }]);
    await syncProviderMemberships(db, log, 'u-1', null, [], true, 'Cevi.DB');
    expect(db.departmentMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', joinSource: 'CEVIDB_CONFIRMED', departmentId: { in: ['dept-self'] } },
      data: { confirmedAt: null, confirmedById: null, joinSource: null },
    });
    expect(db.departmentAuditLog.create).not.toHaveBeenCalled();
  });

  it('schreibt kein «Ausgetreten», wenn der DB-Beitritt zur Heimabteilung geworden ist', async () => {
    const db = memberDb(['dept-neu-home']);
    await syncProviderMemberships(db, log, 'u-1', 'dept-neu-home', ['dept-neu-home'], true, 'Cevi.DB');
    expect(db.departmentMember.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', departmentId: { in: ['dept-neu-home'] } },
      data: { joinedAt: null, confirmedAt: null, confirmedById: null, joinSource: null },
    });
    expect(db.departmentAuditLog.create).not.toHaveBeenCalled();
  });
});
