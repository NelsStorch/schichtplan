import { describe, expect, it, vi } from 'vitest';
import { checkDepartmentJoin } from './departmentJoin.js';

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
  } = {}
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
      findMany: vi.fn(async ({ where }: any) =>
        (hitobito.departments ?? [])
          .filter((d) => where.hitobitoGroupId.in.includes(d.hitobitoGroupId))
          .map((d) => ({ id: d.id }))
      ),
    },
    userHitobitoRole: {
      findMany: vi.fn().mockResolvedValue((hitobito.roleGroupIds ?? []).map((groupId) => ({ groupId }))),
    },
    hitobitoGroup: {
      findMany: vi.fn(async ({ where }: any) =>
        where.id
          ? groups.filter((g) => where.id.in.includes(g.id))
          : groups.filter((g) => g.ortsgruppeId !== null && where.ortsgruppeId.in.includes(g.ortsgruppeId) && g.jungscharId !== null)
      ),
    },
    departmentMember: {
      count: vi.fn().mockResolvedValue(0),
    },
    eventOrganizer: {
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
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
});
