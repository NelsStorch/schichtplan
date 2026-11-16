import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCeviDbFields, placeCeviDbPerson } from './hitobito.js';
import {
  SIM_ID_BASE,
  findSimPersona,
  isDevOrLocalHost,
  simGroupInfos,
  simPersonas,
  simProfile,
  simulationEnabled,
} from './hitobitoSimulation.js';

const sim = (n: number) => SIM_ID_BASE + n;

describe('Simulierte Verbands-DB: Schranken', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('ist nur mit Schalter und nur auf Dev- oder lokalen Hosts aktiv', () => {
    vi.stubEnv('HITOBITO_SIMULATION', 'true');
    expect(simulationEnabled('login.dev.jubla-schichtplan.ch')).toBe(true);
    expect(simulationEnabled('dev.cevi-schichtplan.ch')).toBe(true);
    expect(simulationEnabled('localhost')).toBe(true);
    expect(simulationEnabled('login.jubla-schichtplan.ch')).toBe(false);
    expect(simulationEnabled('cevi-schichtplan.ch')).toBe(false);
    expect(simulationEnabled('devil.cevi-schichtplan.ch')).toBe(false);
    expect(simulationEnabled(undefined)).toBe(false);
  });

  it('ist ohne Schalter auch auf Dev aus', () => {
    vi.stubEnv('HITOBITO_SIMULATION', '');
    expect(simulationEnabled('login.dev.jubla-schichtplan.ch')).toBe(false);
  });

  it('erkennt Hosts mit Port', () => {
    expect(isDevOrLocalHost('localhost:3001')).toBe(true);
    expect(isDevOrLocalHost('pfadi-schichtplan.ch:443')).toBe(false);
  });
});

describe('Simulierte Verbands-DB: Daten', () => {
  it('nutzt nur IDs aus dem eigenen Bereich', () => {
    for (const provider of ['CEVI', 'PFADI', 'JUBLA'] as const) {
      for (const g of simGroupInfos(provider)) expect(g.id).toBeGreaterThan(SIM_ID_BASE);
      for (const p of simPersonas(provider)) {
        const profile = simProfile(provider, p);
        expect(profile.id as number).toBeGreaterThan(SIM_ID_BASE);
        expect(String(profile.email)).toMatch(/@simulation\.invalid$/);
      }
    }
  });

  it('ordnet die Jubla-Struktur wie echte Gruppen zu', () => {
    const groups = new Map(simGroupInfos('JUBLA').map((g) => [g.id, g]));
    expect(groups.get(sim(2))?.ortsgruppeId).toBe(sim(1)); // Bundesleitung → Bund
    expect(groups.get(sim(11))?.ortsgruppeId).toBe(sim(10)); // Kantonsleitung → Kanton
    expect(groups.get(sim(21))?.ortsgruppeId).toBe(sim(20)); // Regionalleitung → Region
    expect(groups.get(sim(31))?.ortsgruppeId).toBe(sim(30)); // Kindergruppe → Schar
  });

  it('zählt bei der Cevi die Jungscharen einer Ortsgruppe', () => {
    const groups = new Map(simGroupInfos('CEVI').map((g) => [g.id, g]));
    expect(groups.get(sim(40))?.jungscharCount).toBe(2);
    expect(groups.get(sim(30))?.jungscharCount).toBe(1);
    expect(groups.get(sim(43))).toMatchObject({ jungscharId: sim(41), ortsgruppeId: sim(40) });
    expect(groups.get(sim(2))?.ortsgruppeId).toBe(sim(1)); // Geschäftsstelle → Dachverband
  });

  it('macht die Bundesleitung zur Leitung, die Kasse nicht', () => {
    const leader = deriveCeviDbFields(simProfile('JUBLA', findSimPersona('JUBLA', 'bundesleitung')!), 'JUBLA');
    expect(leader).toMatchObject({ isDepartmentLeader: true, leaderGroupIds: [sim(2)] });
    const kasse = deriveCeviDbFields(simProfile('JUBLA', findSimPersona('JUBLA', 'bund-kasse')!), 'JUBLA');
    expect(kasse.isDepartmentLeader).toBe(false);
  });

  it('platziert eine Leiterin in zwei Scharen in beiden', () => {
    const groups = new Map(simGroupInfos('JUBLA').map((g) => [g.id, g]));
    const derived = deriveCeviDbFields(simProfile('JUBLA', findSimPersona('JUBLA', 'zwei-scharen')!), 'JUBLA');
    const departments = new Map([
      [sim(30), 'dep-uster'],
      [sim(40), 'dep-wetzikon'],
    ]);
    const placement = placeCeviDbPerson(derived, groups, departments, null);
    expect(placement.departmentIds.sort()).toEqual(['dep-uster', 'dep-wetzikon']);
    expect(placement.leaderDepartmentIds).toEqual([]);
  });

  it('wertet Pfadi- und Cevi-Personas mit den echten Leitungsrollen aus', () => {
    expect(deriveCeviDbFields(simProfile('PFADI', findSimPersona('PFADI', 'geschaeftsstelle')!), 'PFADI').isDepartmentLeader).toBe(true);
    expect(deriveCeviDbFields(simProfile('PFADI', findSimPersona('PFADI', 'bund-geschaeftsleitung')!), 'PFADI').isDepartmentLeader).toBe(false);
    expect(deriveCeviDbFields(simProfile('CEVI', findSimPersona('CEVI', 'al-dorf')!), 'CEVI').isDepartmentLeader).toBe(true);
    expect(deriveCeviDbFields(simProfile('CEVI', findSimPersona('CEVI', 'stufenleiterin')!), 'CEVI').isDepartmentLeader).toBe(false);
  });
});
