import { describe, expect, it } from 'vitest';
import { departmentCreationEligibility } from './shared.js';
import type { PrismaClient } from '../../db.js';

describe('departmentCreationEligibility für Vereine und Verbände', () => {
  const vereinUser = {
    provider: 'CEVI',
    providerId: null,
    departmentLeader: false,
    leaderGroupIds: [],
    leaderGroupName: null,
    email: 'leiter@turnverein.ch',
    emailVerified: true,
    passwordHash: '$2a$10$hashedpassword',
  };
  const mockPrisma = (user: object | null, ledVereine = 0) =>
    ({
      user: { findUnique: async () => user },
      departmentMember: { count: async () => ledVereine },
    }) as unknown as PrismaClient;

  it('erlaubt Vereinserstellung für Benutzer mit bestätigter E-Mail bei organization = OTHER', async () => {
    const result = await departmentCreationEligibility(mockPrisma(vereinUser), 'user-1', 'OTHER');
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.provider).toBe('OTHER');
    expect(result.ortsgruppeId).toBeNull();
  });

  it('lehnt Vereinserstellung mit unbestätigter E-Mail ab', async () => {
    const result = await departmentCreationEligibility(mockPrisma({ ...vereinUser, emailVerified: false }), 'user-1', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  it('begrenzt auf 3 geleitete Vereine', async () => {
    expect((await departmentCreationEligibility(mockPrisma(vereinUser, 2), 'user-1', 'OTHER')).eligible).toBe(true);
    const result = await departmentCreationEligibility(mockPrisma(vereinUser, 3), 'user-1', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('LIMIT');
  });

  it('erlaubt mit provider = OTHER ohne Vereins-Domain keine Erstellung', async () => {
    const result = await departmentCreationEligibility(mockPrisma({ ...vereinUser, provider: 'OTHER' }), 'user-1');
    expect(result.eligible).toBe(false);
  });

  it('lehnt eine Cevi.DB-Leitung auf der Pfadi-Domain ab (Gruppen-IDs überschneiden sich)', async () => {
    const ceviLeader = { ...vereinUser, providerId: '123', departmentLeader: true, leaderGroupIds: [42] };
    const result = await departmentCreationEligibility(mockPrisma(ceviLeader), 'user-1', 'PFADI');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  it('lehnt Vereinserstellung ab, wenn der Benutzer kein Passwort und keine verifizierte E-Mail hat', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'OTHER',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: null,
          emailVerified: false,
          passwordHash: null,
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-guest', 'OTHER');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  it('lehnt Abteilungserstellung für Benutzer ohne Cevi.DB bei organization = CEVI weiterhin mit NOT_CEVIDB ab', async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          provider: 'CEVI',
          providerId: null,
          departmentLeader: false,
          leaderGroupIds: [],
          leaderGroupName: null,
          email: 'cevi@example.com',
          emailVerified: true,
          passwordHash: '$2a$10$hashedpassword',
        }),
      },
    } as unknown as PrismaClient;

    const result = await departmentCreationEligibility(prisma, 'user-cevi', 'CEVI');
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('NOT_CEVIDB');
  });

  describe('Pfadi und Jubla: Abteilung, Region, Kantonalverband', () => {
    const groupRows = [
      // Pfadi: Region 906 und Abteilung 1045 bilden selbst eine Ebene (keine Jungscharen)
      { provider: 'PFADI', id: 906, name: 'RG-coachland', jungscharId: null, ortsgruppeId: 906, jungscharCount: 0, groupType: 'Region' },
      { provider: 'PFADI', id: 1045, name: 'Benoît de Pontverre', jungscharId: null, ortsgruppeId: 1045, jungscharCount: 0, groupType: 'Abteilung' },
      // Jubla: Regionalleitung 21 ist eine Untergruppe der Region 20
      { provider: 'JUBLA', id: 21, name: 'Regionalleitung', jungscharId: null, ortsgruppeId: 20, jungscharCount: null },
      { provider: 'JUBLA', id: 20, name: 'Region Oberland', jungscharId: null, ortsgruppeId: 20, jungscharCount: 0, groupType: 'Region' },
      // Cevi: Ortsgruppe 161 hat (inzwischen) nur noch die Jungschar 295
      { provider: 'CEVI', id: 161, name: 'Illnau', jungscharId: null, ortsgruppeId: 161, jungscharCount: 1, groupType: 'Ortsgruppe' },
      { provider: 'CEVI', id: 295, name: 'JS Illnau', jungscharId: 295, ortsgruppeId: 161, jungscharCount: null },
    ];
    const hitobitoPrisma = (user: object, existing: number[] = []) =>
      ({
        user: { findUnique: async () => user },
        hitobitoGroup: {
          findMany: async ({ where }: any) =>
            groupRows.filter(
              (g) =>
                g.provider === where.provider &&
                (where.id ? where.id.in.includes(g.id) : g.ortsgruppeId === where.ortsgruppeId && g.jungscharId !== null)
            ),
          findUnique: async ({ where }: any) =>
            groupRows.find((g) => g.provider === where.provider_id.provider && g.id === where.provider_id.id) ?? null,
        },
        department: {
          findFirst: async ({ where }: any) =>
            where.hitobitoGroupId.in.some((id: number) => existing.includes(id)) ? { name: 'Bestehend', slug: 'bestehend' } : null,
        },
      }) as unknown as PrismaClient;
    const leader = (provider: string, leaderGroupIds: number[]) => ({
      ...vereinUser,
      provider,
      providerId: '7',
      departmentLeader: true,
      leaderGroupIds,
      leaderGroupName: 'Leitung',
    });

    it('lässt die Regionsleitung der Pfadi einen Schichtplan für die Region anlegen', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('PFADI', [906])), 'user-1', 'PFADI');
      expect(result).toMatchObject({ eligible: true, ortsgruppeId: 906, ortsgruppeName: 'RG-coachland' });
    });

    it('lässt die Abteilungsleitung der Pfadi ihre Abteilung anlegen', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('PFADI', [1045])), 'user-1', 'PFADI');
      expect(result).toMatchObject({ eligible: true, ortsgruppeId: 1045 });
    });

    it('meldet eine bereits angelegte Region', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('PFADI', [906]), [906]), 'user-1', 'PFADI');
      expect(result).toMatchObject({ eligible: false, reason: 'EXISTS' });
    });

    it('erkennt einen Schichtplan an der einzigen Jungschar der Ortsgruppe (kein zweiter für dieselbe Gruppe)', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('CEVI', [295]), [295]), 'user-1', 'CEVI');
      expect(result).toMatchObject({ eligible: false, reason: 'EXISTS', existingDepartment: { slug: 'bestehend' } });
      const free = await departmentCreationEligibility(hitobitoPrisma(leader('CEVI', [295])), 'user-1', 'CEVI');
      expect(free).toMatchObject({ eligible: true, ortsgruppeId: 161 });
    });

    it('ordnet die Jubla-Regionalleitung der Region darüber zu', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('JUBLA', [21])), 'user-1', 'JUBLA');
      expect(result).toMatchObject({ eligible: true, ortsgruppeId: 20, ortsgruppeName: 'Region Oberland' });
    });
    it('bietet bei Abteilungs- und Regionsleitung beide Ebenen an, die Abteilung zuerst', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('PFADI', [906, 1045])), 'user-1', 'PFADI');
      expect(result).toMatchObject({ eligible: true, ortsgruppeId: 1045 });
      expect(result.options?.map((o) => [o.hitobitoGroupId, o.groupType, o.level])).toEqual([
        [1045, 'Abteilung', 0],
        [906, 'Region', 1],
      ]);
    });

    it('schlägt die Region vor, wenn die Abteilung schon einen Schichtplan hat', async () => {
      const result = await departmentCreationEligibility(hitobitoPrisma(leader('PFADI', [906, 1045]), [1045]), 'user-1', 'PFADI');
      expect(result).toMatchObject({ eligible: true, ortsgruppeId: 906 });
      expect(result.options?.[0].existingDepartment).toEqual({ name: 'Bestehend', slug: 'bestehend' });
    });

    it('lässt Abteilungsleitung anlegen, selbst wenn nur ein Teil der vielen Leitergruppen synchronisiert ist', async () => {
      // Benutzer hat 32 Leitergruppen (z. B. auf PBS MiData Staging), aber im Cache sind nur wenige
      const leaderWithManyGroups = leader('PFADI', [1045, 9991, 9992, 9993, 9994]);
      const result = await departmentCreationEligibility(hitobitoPrisma(leaderWithManyGroups), 'user-1', 'PFADI');
      expect(result.eligible).toBe(true);
      expect(result.ortsgruppeId).toBe(1045);
      expect(result.ortsgruppeName).toBe('Benoît de Pontverre');
    });
  });
});
