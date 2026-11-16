/**
 * Simulierte Verbands-DB (Hitobito) für Dev und lokal: Statt bei db.cevi.ch, db.scout.ch oder db.jubla.ch meldet
 * man sich als eine erfundene Person mit festen Rollen an (z. B. Bundesleitung, Leiterin in zwei Scharen). So lassen
 * sich Rollen, Ebenen und Abteilungen testen, ohne echte Konten.
 *
 * Sicherheit: nur aktiv mit HITOBITO_SIMULATION=true UND auf einem Dev- oder lokalen Host (nie auf Prod-Domains).
 * Personen und Gruppen haben eigene IDs ab SIM_ID_BASE, damit sie nie mit echten Hitobito-IDs zusammenfallen
 * (Dev hängt teils an der produktiven Verbands-DB).
 */
import type { OrganizationType } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { getHitobitoConfig } from '@schichtplan/shared';
import type { CeviDbGroupInfo } from './hitobito.js';
import { parseCeviDbGroup } from './hitobitoGroups.js';

/** Eigener ID-Bereich: echte Hitobito-IDs liegen weit darunter */
export const SIM_ID_BASE = 900_000_000;
const gid = (n: number) => SIM_ID_BASE + n;

/** Simulation eingeschaltet (Server-.env) und Host ist Dev oder lokal */
export function simulationEnabled(host: string | undefined | null): boolean {
  if (process.env.HITOBITO_SIMULATION !== 'true') return false;
  return isDevOrLocalHost(host);
}

/** login.dev.jubla-schichtplan.ch, dev.cevi-schichtplan.ch, localhost … aber nie eine Prod-Domain */
export function isDevOrLocalHost(host: string | undefined | null): boolean {
  const h = (host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return true;
  return h.startsWith('dev.') || h.includes('.dev.');
}

interface SimGroup {
  n: number;
  name: string;
  /** Gruppentyp wie ihn die Gruppen-API übersetzt liefert (z. B. «Schar», «Kindergruppe») */
  type: string;
  parent: number | null;
}

interface SimRole {
  group: number;
  roleClass: string;
  roleName: string;
}

export interface SimPersona {
  key: string;
  label: string;
  description: string;
  roles: SimRole[];
  /** Hauptgruppe (`primary_group_id`); ohne Angabe die Gruppe der ersten Rolle */
  primary?: number;
}

interface SimOrg {
  groups: SimGroup[];
  personas: SimPersona[];
}

const JUBLA: SimOrg = {
  groups: [
    { n: 1, name: 'Jubla Schweiz (Sim)', type: 'Bund', parent: null },
    { n: 2, name: 'Bundesleitung', type: 'Bundesleitung', parent: 1 },
    { n: 3, name: 'Projektgruppe Bundesanlass', type: 'Arbeitsgruppe', parent: 1 },
    { n: 10, name: 'Jubla Sim-Kanton', type: 'Kanton', parent: 1 },
    { n: 11, name: 'Kantonsleitung', type: 'Kantonsleitung', parent: 10 },
    { n: 20, name: 'Region Sim-Oberland', type: 'Region', parent: 10 },
    { n: 21, name: 'Regionalleitung', type: 'Regionalleitung', parent: 20 },
    { n: 30, name: 'Jubla Sim-Uster', type: 'Schar', parent: 20 },
    { n: 31, name: 'Blauring 3. Klasse', type: 'Kindergruppe', parent: 30 },
    { n: 40, name: 'Jubla Sim-Wetzikon', type: 'Schar', parent: 20 },
    { n: 41, name: 'Jungwacht 5. Klasse', type: 'Kindergruppe', parent: 40 },
  ],
  personas: [
    {
      key: 'bundesleitung',
      label: 'Bundesleitung',
      description: 'Mitglied der Bundesleitung, sonst nichts',
      roles: [{ group: 2, roleClass: 'Group::FederalBoard::Member', roleName: 'Mitglied' }],
    },
    {
      key: 'bundesleitung-schar',
      label: 'Bundesleitung mit Schar',
      description: 'Bundesleitung und Leiterin in Sim-Uster (Hauptgruppe)',
      roles: [
        { group: 2, roleClass: 'Group::FederalBoard::Member', roleName: 'Mitglied' },
        { group: 31, roleClass: 'Group::ChildGroup::Leader', roleName: 'Leiter*in' },
      ],
      primary: 31,
    },
    {
      key: 'bund-kasse',
      label: 'Kasse Bundesleitung',
      description: 'Kassier*in der Bundesleitung (keine Leitung)',
      roles: [{ group: 2, roleClass: 'Group::FederalBoard::Treasurer', roleName: 'Kassier*in' }],
    },
    {
      key: 'projektgruppe',
      label: 'Nationale Projektgruppe',
      description: 'Mitglied einer Arbeitsgruppe auf Bundesebene',
      roles: [{ group: 3, roleClass: 'Group::FederalWorkGroup::Member', roleName: 'Mitglied' }],
    },
    {
      key: 'kantonsleitung',
      label: 'Kantonsleitung',
      description: 'Leitung in der Kantonsleitung',
      roles: [{ group: 11, roleClass: 'Group::StateBoard::Leader', roleName: 'Leitung' }],
    },
    {
      key: 'regional-und-schar',
      label: 'Regional- und Scharleitung',
      description: 'Regionalleitung und Scharleitung von Sim-Uster',
      roles: [
        { group: 21, roleClass: 'Group::RegionalBoard::Leader', roleName: 'Leitung' },
        { group: 30, roleClass: 'Group::Flock::Leader', roleName: 'Scharleitung' },
      ],
      primary: 30,
    },
    {
      key: 'scharleitung-uster',
      label: 'Scharleitung Sim-Uster',
      description: 'Scharleitung',
      roles: [{ group: 30, roleClass: 'Group::Flock::Leader', roleName: 'Scharleitung' }],
    },
    {
      key: 'scharleitung-wetzikon',
      label: 'Scharleitung Sim-Wetzikon',
      description: 'Scharleitung',
      roles: [{ group: 40, roleClass: 'Group::Flock::Leader', roleName: 'Scharleitung' }],
    },
    {
      key: 'lagerleitung',
      label: 'Lagerleitung',
      description: 'Lagerleitung in Sim-Uster (keine Scharleitung)',
      roles: [{ group: 30, roleClass: 'Group::Flock::CampLeader', roleName: 'Lagerleitung' }],
    },
    {
      key: 'leiterin',
      label: 'Leiterin',
      description: 'Leiterin einer Kindergruppe in Sim-Uster',
      roles: [{ group: 31, roleClass: 'Group::ChildGroup::Leader', roleName: 'Leiter*in' }],
    },
    {
      key: 'zwei-scharen',
      label: 'Leiterin in zwei Scharen',
      description: 'Leiterin in Sim-Uster und Sim-Wetzikon',
      roles: [
        { group: 31, roleClass: 'Group::ChildGroup::Leader', roleName: 'Leiter*in' },
        { group: 41, roleClass: 'Group::ChildGroup::Leader', roleName: 'Leiter*in' },
      ],
    },
    {
      key: 'kind',
      label: 'Kind',
      description: 'Kind in einer Kindergruppe',
      roles: [{ group: 31, roleClass: 'Group::ChildGroup::Child', roleName: 'Kind' }],
    },
    { key: 'ohne-rollen', label: 'Ohne Rollen', description: 'Konto ohne jede Rolle', roles: [] },
  ],
};

const PFADI: SimOrg = {
  groups: [
    { n: 1, name: 'Pfadibewegung Schweiz (Sim)', type: 'Bund', parent: null },
    { n: 10, name: 'Pfadi Sim-Kanton', type: 'Kantonalverband', parent: 1 },
    { n: 20, name: 'Region Sim-See', type: 'Region', parent: 10 },
    { n: 30, name: 'Pfadi Sim-Adler', type: 'Abteilung', parent: 20 },
    { n: 31, name: 'Meute Sim', type: 'Wölfe', parent: 30 },
    { n: 40, name: 'Pfadi Sim-Falken', type: 'Abteilung', parent: 20 },
    { n: 41, name: 'Trupp Sim', type: 'Pfadi', parent: 40 },
  ],
  personas: [
    {
      key: 'geschaeftsstelle',
      label: 'Mitarbeiter*in Geschäftsstelle',
      description: 'Bund, Mitarbeiter*in Geschäftsstelle',
      roles: [{ group: 1, roleClass: 'Group::Bund::MitarbeiterGs', roleName: 'Mitarbeiter*in GS' }],
    },
    {
      key: 'bund-geschaeftsleitung',
      label: 'Geschäftsleitung Bund',
      description: 'Bund, Geschäftsleitung (nur Leserechte, keine Leitung)',
      roles: [{ group: 1, roleClass: 'Group::Bund::Geschaeftsleitung', roleName: 'Geschäftsleitung' }],
    },
    {
      key: 'kantonsleitung',
      label: 'Kantonsleitung',
      description: 'Kantonsleitung',
      roles: [{ group: 10, roleClass: 'Group::Kantonalverband::Kantonsleitung', roleName: 'Kantonsleitung' }],
    },
    {
      key: 'regional-und-al',
      label: 'Regional- und Abteilungsleitung',
      description: 'Regionalleitung und Abteilungsleitung von Sim-Adler',
      roles: [
        { group: 20, roleClass: 'Group::Region::Regionalleitung', roleName: 'Regionalleitung' },
        { group: 30, roleClass: 'Group::Abteilung::Abteilungsleitung', roleName: 'Abteilungsleitung' },
      ],
      primary: 30,
    },
    {
      key: 'al-adler',
      label: 'Abteilungsleitung Sim-Adler',
      description: 'Abteilungsleitung',
      roles: [{ group: 30, roleClass: 'Group::Abteilung::Abteilungsleitung', roleName: 'Abteilungsleitung' }],
    },
    {
      key: 'al-falken',
      label: 'Abteilungsleitung Sim-Falken',
      description: 'Abteilungsleitung',
      roles: [{ group: 40, roleClass: 'Group::Abteilung::Abteilungsleitung', roleName: 'Abteilungsleitung' }],
    },
    {
      key: 'einheitsleitung',
      label: 'Einheitsleitung Wölfe',
      description: 'Einheitsleitung der Meute in Sim-Adler',
      roles: [{ group: 31, roleClass: 'Group::Woelfe::Einheitsleitung', roleName: 'Einheitsleitung' }],
    },
    {
      key: 'zwei-abteilungen',
      label: 'Leitung in zwei Abteilungen',
      description: 'Mitleitung in Sim-Adler und Sim-Falken',
      roles: [
        { group: 31, roleClass: 'Group::Woelfe::Mitleitung', roleName: 'Mitleitung' },
        { group: 41, roleClass: 'Group::Pfadi::Mitleitung', roleName: 'Mitleitung' },
      ],
    },
    {
      key: 'wolf',
      label: 'Wolf',
      description: 'Teilnehmer*in in der Meute',
      roles: [{ group: 31, roleClass: 'Group::Woelfe::Wolf', roleName: 'Wolf' }],
    },
    { key: 'ohne-rollen', label: 'Ohne Rollen', description: 'Konto ohne jede Rolle', roles: [] },
  ],
};

const CEVI: SimOrg = {
  groups: [
    { n: 1, name: 'Cevi Schweiz (Sim)', type: 'Dachverband', parent: null },
    { n: 2, name: 'Geschäftsstelle', type: 'Geschäftsstelle', parent: 1 },
    { n: 10, name: 'Cevi Region Sim', type: 'Mitgliederorganisation', parent: 1 },
    { n: 11, name: 'Vorstand', type: 'Vorstand', parent: 10 },
    { n: 30, name: 'Sim-Dorf', type: 'Ortsgruppe', parent: 10 },
    { n: 31, name: 'JS Sim-Dorf', type: 'Jungschar', parent: 30 },
    { n: 32, name: 'Hiskia', type: 'Stufe', parent: 31 },
    { n: 40, name: 'Sim-Stadt', type: 'Ortsgruppe', parent: 10 },
    { n: 41, name: 'JS Sim-Stadt Nord', type: 'Jungschar', parent: 40 },
    { n: 42, name: 'JS Sim-Stadt Süd', type: 'Jungschar', parent: 40 },
    { n: 43, name: 'Josua', type: 'Stufe', parent: 41 },
  ],
  personas: [
    {
      key: 'dachverband-gl',
      label: 'Geschäftsleitung Dachverband',
      description: 'Geschäftsleiter*in Cevi Schweiz',
      roles: [{ group: 2, roleClass: 'Group::DachverbandGeschaeftsstelle::Geschaeftsleiter', roleName: 'Geschäftsleiter*in' }],
    },
    {
      key: 'mo-praesidium',
      label: 'Präsidium Mitgliederorganisation',
      description: 'Präsidium Cevi Region Sim',
      roles: [{ group: 11, roleClass: 'Group::MitgliederorganisationVorstand::Praesidium', roleName: 'Präsidium' }],
    },
    {
      key: 'al-dorf',
      label: 'Abteilungsleitung Sim-Dorf',
      description: 'Abteilungsleiter*in JS Sim-Dorf',
      roles: [{ group: 31, roleClass: 'Group::Jungschar::Abteilungsleiter', roleName: 'Abteilungsleiter*in' }],
    },
    {
      key: 'al-stadt-nord',
      label: 'Abteilungsleitung Sim-Stadt Nord',
      description: 'Ortsgruppe mit zwei Jungscharen',
      roles: [{ group: 41, roleClass: 'Group::Jungschar::Abteilungsleiter', roleName: 'Abteilungsleiter*in' }],
    },
    {
      key: 'stufenleiterin',
      label: 'Stufenleiterin',
      description: 'Stufenleiter*in Hiskia in Sim-Dorf',
      roles: [{ group: 32, roleClass: 'Group::Stufe::Stufenleiter', roleName: 'Stufenleiter*in' }],
    },
    {
      key: 'zwei-abteilungen',
      label: 'Leitung in zwei Abteilungen',
      description: 'Gruppenleiter*in in Sim-Dorf und Sim-Stadt Nord',
      roles: [
        { group: 32, roleClass: 'Group::Stufe::Gruppenleiter', roleName: 'Gruppenleiter*in' },
        { group: 43, roleClass: 'Group::Stufe::Gruppenleiter', roleName: 'Gruppenleiter*in' },
      ],
    },
    {
      key: 'teilnehmer',
      label: 'Teilnehmer*in',
      description: 'Teilnehmer*in Hiskia',
      roles: [{ group: 32, roleClass: 'Group::Stufe::Teilnehmer', roleName: 'Teilnehmer*in' }],
    },
    { key: 'ohne-rollen', label: 'Ohne Rollen', description: 'Konto ohne jede Rolle', roles: [] },
  ],
};

const SIM_ORGS: Record<Exclude<OrganizationType, 'OTHER'>, SimOrg> = { CEVI, PFADI, JUBLA };

function simOrg(provider: OrganizationType): SimOrg | null {
  return provider === 'OTHER' ? null : SIM_ORGS[provider];
}

export function simPersonas(provider: OrganizationType): SimPersona[] {
  return simOrg(provider)?.personas ?? [];
}

export function findSimPersona(provider: OrganizationType, key: string): SimPersona | null {
  return simPersonas(provider).find((p) => p.key === key) ?? null;
}

/** Stabile Personen-ID je Verband und Persona, im eigenen ID-Bereich */
export function simPersonId(provider: OrganizationType, key: string): number {
  const personas = simPersonas(provider);
  const index = personas.findIndex((p) => p.key === key);
  const orgOffset = provider === 'CEVI' ? 1000 : provider === 'PFADI' ? 2000 : 3000;
  return SIM_ID_BASE + 100_000 + orgOffset + Math.max(0, index);
}

/** Profil wie `/oauth/profile` mit Scope with_roles */
export function simProfile(provider: OrganizationType, persona: SimPersona): Record<string, unknown> {
  const org = simOrg(provider)!;
  const groupName = (n: number) => org.groups.find((g) => g.n === n)?.name ?? `Gruppe ${n}`;
  const primary = persona.primary ?? persona.roles[0]?.group ?? null;
  const ortsgruppeField = getHitobitoConfig(provider).ortsgruppeField;
  return {
    id: simPersonId(provider, persona.key),
    email: `${persona.key}.${provider.toLowerCase()}@simulation.invalid`,
    first_name: persona.label,
    last_name: '(Simulation)',
    nickname: `Sim ${persona.label}`,
    birthday: '2000-01-01',
    primary_group_id: primary !== null ? gid(primary) : null,
    [ortsgruppeField]: null,
    roles: persona.roles.map((r) => ({
      group_id: gid(r.group),
      group_name: groupName(r.group),
      role_name: r.roleName,
      role_class: r.roleClass,
    })),
  };
}

/** Antwort wie `/groups/{id}.json`, damit der echte Parser die Struktur auswertet */
function simGroupResponse(org: SimOrg, group: SimGroup) {
  const byN = new Map(org.groups.map((g) => [g.n, g]));
  const chain: SimGroup[] = [];
  for (let g: SimGroup | undefined = group; g; g = g.parent !== null ? byN.get(g.parent) : undefined) chain.unshift(g);
  const children = org.groups.filter((g) => g.parent === group.n);
  return {
    groups: [
      {
        id: String(gid(group.n)),
        name: group.name,
        group_type: group.type,
        links: { hierarchies: chain.map((g) => String(gid(g.n))), children: children.map((g) => String(gid(g.n))) },
      },
    ],
    linked: {
      groups: [...chain, ...children].map((g) => ({ id: String(gid(g.n)), name: g.name, group_type: g.type })),
    },
  };
}

/** Simulierte Gruppenstruktur in den Zwischenspeicher schreiben (wie nach einem echten Login die Gruppen-API) */
export async function storeSimGroups(prisma: Pick<PrismaClient, 'hitobitoGroup'>, provider: OrganizationType): Promise<void> {
  const fetchedAt = new Date();
  for (const info of simGroupInfos(provider)) {
    await prisma.hitobitoGroup.upsert({
      where: { provider_id: { provider, id: info.id } },
      update: { ...info, fetchedAt },
      create: { provider, ...info, fetchedAt },
    });
  }
}

/** Ganze simulierte Gruppenstruktur eines Verbands, ausgewertet wie echte Antworten der Gruppen-API */
export function simGroupInfos(provider: OrganizationType): CeviDbGroupInfo[] {
  const org = simOrg(provider);
  if (!org) return [];
  return org.groups.flatMap((g) => parseCeviDbGroup(simGroupResponse(org, g), gid(g.n), provider) ?? []);
}
