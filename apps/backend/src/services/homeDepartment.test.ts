import { describe, expect, it, vi } from 'vitest';
import { syncCeviDbHomeDepartment } from './homeDepartment.js';
import type { CeviDbPlacement } from './hitobito.js';

const placement = (over: Partial<CeviDbPlacement> = {}): CeviDbPlacement => ({
  verified: true,
  complete: true,
  homeDepartmentId: null,
  departmentIds: [],
  leaderDepartmentIds: [],
  selfDeclaredDepartmentId: null,
  ortsgruppeId: 10,
  ortsgruppeName: 'Sim-Uster',
  ortsgruppeIds: [10],
  jungscharIds: [],
  ...over,
});

/** Nur was syncCeviDbHomeDepartment braucht; Stufen gibt es keine */
function db(home: { id: string; hitobitoGroupId: number | null } | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ homeDepartmentId: home?.id ?? null, provider: 'JUBLA' }),
      update: vi.fn().mockResolvedValue({}),
    },
    department: {
      findUnique: vi.fn(async ({ where }: any) =>
        home && where.id === home.id
          ? { id: home.id, slug: 'eigene', organization: 'JUBLA', hitobitoGroupId: home.hitobitoGroupId }
          : null
      ),
    },
    hitobitoGroup: {
      findUnique: vi.fn(async ({ where }: any) => ({ ortsgruppeId: where.provider_id.id === 31 ? 30 : where.provider_id.id })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userHitobitoStufe: { findMany: vi.fn().mockResolvedValue([]) },
    departmentStufe: { findMany: vi.fn().mockResolvedValue([]) },
    userStufe: { deleteMany: vi.fn(), upsert: vi.fn() },
  } as any;
}

describe('syncCeviDbHomeDepartment', () => {
  it('behält eine selbst gewählte Heimabteilung, auch wenn die Rollen zu keinem Schichtplan führen', async () => {
    const prisma = db({ id: 'dept-self', hitobitoGroupId: null });
    const result = await syncCeviDbHomeDepartment(
      prisma,
      { id: 'u-1', homeDepartmentSource: 'SELF', departmentSetupAt: new Date() },
      placement(),
      'JUBLA'
    );
    expect(result).toMatchObject({ id: 'dept-self', slug: 'eigene' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hebt eine Heimabteilung aus der DB auf, wenn die Rollen nachweislich woanders liegen', async () => {
    const prisma = db({ id: 'dept-alt', hitobitoGroupId: 99 });
    const result = await syncCeviDbHomeDepartment(
      prisma,
      { id: 'u-1', homeDepartmentSource: 'CEVIDB', departmentSetupAt: new Date() },
      placement(),
      'JUBLA'
    );
    expect(result).toBeNull();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null },
    });
  });

  it('lässt die Bestätigung bestehen, wenn irgendeine Rolle in der Ortsgruppe der Abteilung liegt', async () => {
    const prisma = db({ id: 'dept-confirmed', hitobitoGroupId: 31 });
    await syncCeviDbHomeDepartment(
      prisma,
      { id: 'u-1', homeDepartmentSource: 'CONFIRMED', departmentSetupAt: new Date() },
      // Erste Ortsgruppe ist 10, die der Abteilung (30) ist die zweite
      placement({ ortsgruppeId: 10, ortsgruppeIds: [10, 30] }),
      'JUBLA'
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('beendet die Bestätigung, wenn keine Rolle mehr in der Ortsgruppe der Abteilung liegt', async () => {
    const prisma = db({ id: 'dept-confirmed', hitobitoGroupId: 31 });
    await syncCeviDbHomeDepartment(
      prisma,
      { id: 'u-1', homeDepartmentSource: 'CONFIRMED', departmentSetupAt: new Date() },
      placement({ ortsgruppeIds: [10] }),
      'JUBLA'
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { homeDepartmentSource: 'SELF', homeDepartmentConfirmedAt: null, homeDepartmentConfirmedById: null },
    });
  });
});
