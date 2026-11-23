import {
  type OrganizationType,
  getOrganizationTypeFromHost,
} from './organizations.js';

export interface OrganizationVocabulary {
  /** Begriff für die Abteilung / Schar / den Verein (z. B. 'Abteilung', 'Schar', 'Verein') */
  department: string;
  /** Plural der Abteilung / Schar (z. B. 'Abteilungen', 'Scharen', 'Vereine') */
  departmentPlural: string;
  /** Begriff für die Leitung der Abteilung / Schar (z. B. 'Abteilungsleitung', 'Scharleitung', 'Vorstand') */
  departmentLeader: string;
  /** Singular für ein Mitglied (z. B. 'Cevianer*in', 'Pfadfinder*in', 'Jublaner*in', 'Mitglied') */
  member: string;
  /** Plural für Mitglieder (z. B. 'Cevianer*innen', 'Pfadfinder*innen', 'Jublaner*innen', 'Mitglieder') */
  memberPlural: string;
  /** Begriff für eine Untergruppe / Stufe / Einheit (z. B. 'Stufe', 'Einheit', 'Gruppe', 'Team') */
  group: string;
  /** Plural für Untergruppen (z. B. 'Stufen', 'Einheiten', 'Gruppen', 'Teams') */
  groupPlural: string;
  /** Begriff für die Leitung einer Untergruppe (z. B. 'Stufenleitung', 'Einheitsleitung', 'Gruppenleitung', 'Teamleitung') */
  groupLeader: string;
  /** Begriff für den Cevi-Namen / Pfadinamen / Spitznamen (z. B. 'Cevi-Name', 'Pfadiname', 'Leitername', 'Spitzname') */
  nickname: string;
  /** Name des Authentifizierungs-Providers (z. B. 'Cevi.DB', 'PBS MiData', 'Jubla-DB', 'E-Mail & Passwort') */
  authProvider: string;
}

export const SUPPORTED_VOCABULARY_LOCALES = ['de', 'fr', 'it', 'en'] as const;
export type VocabularyLocale = (typeof SUPPORTED_VOCABULARY_LOCALES)[number];

export const VOCABULARIES_BY_LOCALE: Record<VocabularyLocale, Record<OrganizationType, OrganizationVocabulary>> = {
  de: {
    CEVI: {
      department: 'Abteilung',
      departmentPlural: 'Abteilungen',
      departmentLeader: 'Abteilungsleitung',
      member: 'Cevianer*in',
      memberPlural: 'Cevianer*innen',
      group: 'Stufe',
      groupPlural: 'Stufen',
      groupLeader: 'Stufenleitung',
      nickname: 'Cevi-Name',
      authProvider: 'Cevi.DB',
    },
    PFADI: {
      department: 'Abteilung',
      departmentPlural: 'Abteilungen',
      departmentLeader: 'Abteilungsleitung',
      member: 'Pfadfinder*in',
      memberPlural: 'Pfadfinder*innen',
      group: 'Einheit',
      groupPlural: 'Einheiten',
      groupLeader: 'Einheitsleitung',
      nickname: 'Pfadiname',
      authProvider: 'PBS MiData',
    },
    JUBLA: {
      department: 'Schar',
      departmentPlural: 'Scharen',
      departmentLeader: 'Scharleitung',
      member: 'Jublaner*in',
      memberPlural: 'Jublaner*innen',
      group: 'Gruppe',
      groupPlural: 'Gruppen',
      groupLeader: 'Gruppenleitung',
      nickname: 'Leitername',
      authProvider: 'Jubla-DB',
    },
    OTHER: {
      department: 'Verein',
      departmentPlural: 'Vereine',
      departmentLeader: 'Vorstand',
      member: 'Mitglied',
      memberPlural: 'Mitglieder',
      group: 'Team',
      groupPlural: 'Teams',
      groupLeader: 'Teamleitung',
      nickname: 'Spitzname',
      authProvider: 'E-Mail & Passwort',
    },
  },
  fr: {
    CEVI: {
      department: 'Section',
      departmentPlural: 'Sections',
      departmentLeader: 'Direction de section',
      member: 'Membre Cevi',
      memberPlural: 'Membres Cevi',
      group: 'Groupe',
      groupPlural: 'Groupes',
      groupLeader: 'Responsable de groupe',
      nickname: 'Nom Cevi',
      authProvider: 'Cevi.DB',
    },
    PFADI: {
      department: 'Groupe',
      departmentPlural: 'Groupes',
      departmentLeader: 'Responsable de groupe',
      member: 'Scout',
      memberPlural: 'Scouts',
      group: 'Unité',
      groupPlural: 'Unités',
      groupLeader: "Responsable d'unité",
      nickname: 'Totem',
      authProvider: 'MSdS MiData',
    },
    JUBLA: {
      department: 'Groupe',
      departmentPlural: 'Groupes',
      departmentLeader: 'Direction de groupe',
      member: 'Membre Jubla',
      memberPlural: 'Membres Jubla',
      group: 'Groupe',
      groupPlural: 'Groupes',
      groupLeader: 'Responsable de groupe',
      nickname: "Nom d'animateur",
      authProvider: 'Jubla-DB',
    },
    OTHER: {
      department: 'Association',
      departmentPlural: 'Associations',
      departmentLeader: 'Comité',
      member: 'Membre',
      memberPlural: 'Membres',
      group: 'Équipe',
      groupPlural: 'Équipes',
      groupLeader: "Responsable d'équipe",
      nickname: 'Surnom',
      authProvider: 'E-mail & mot de passe',
    },
  },
  it: {
    CEVI: {
      department: 'Sezione',
      departmentPlural: 'Sezioni',
      departmentLeader: 'Direzione di sezione',
      member: 'Membro Cevi',
      memberPlural: 'Membri Cevi',
      group: 'Gruppo',
      groupPlural: 'Gruppi',
      groupLeader: 'Responsabile di gruppo',
      nickname: 'Nome Cevi',
      authProvider: 'Cevi.DB',
    },
    PFADI: {
      department: 'Sezione',
      departmentPlural: 'Sezioni',
      departmentLeader: 'Direzione di sezione',
      member: 'Scout',
      memberPlural: 'Scouts',
      group: 'Unità',
      groupPlural: 'Unità',
      groupLeader: "Responsabile d'unità",
      nickname: 'Nome scout',
      authProvider: 'MSS MiData',
    },
    JUBLA: {
      department: 'Gruppo',
      departmentPlural: 'Gruppi',
      departmentLeader: 'Direzione di gruppo',
      member: 'Membro Jubla',
      memberPlural: 'Membri Jubla',
      group: 'Gruppo',
      groupPlural: 'Gruppi',
      groupLeader: 'Responsabile di gruppo',
      nickname: 'Nome animatore',
      authProvider: 'Jubla-DB',
    },
    OTHER: {
      department: 'Associazione',
      departmentPlural: 'Associazioni',
      departmentLeader: 'Comitato',
      member: 'Membro',
      memberPlural: 'Membri',
      group: 'Squadra',
      groupPlural: 'Squadre',
      groupLeader: 'Caposquadra',
      nickname: 'Soprannome',
      authProvider: 'E-mail e password',
    },
  },
  en: {
    CEVI: {
      department: 'Department',
      departmentPlural: 'Departments',
      departmentLeader: 'Department Lead',
      member: 'Cevi member',
      memberPlural: 'Cevi members',
      group: 'Group',
      groupPlural: 'Groups',
      groupLeader: 'Group Lead',
      nickname: 'Cevi nickname',
      authProvider: 'Cevi.DB',
    },
    PFADI: {
      department: 'Group',
      departmentPlural: 'Groups',
      departmentLeader: 'Group Lead',
      member: 'Scout',
      memberPlural: 'Scouts',
      group: 'Unit',
      groupPlural: 'Units',
      groupLeader: 'Unit Lead',
      nickname: 'Scout name',
      authProvider: 'PBS MiData',
    },
    JUBLA: {
      department: 'Group',
      departmentPlural: 'Groups',
      departmentLeader: 'Group Lead',
      member: 'Jubla member',
      memberPlural: 'Jubla members',
      group: 'Group',
      groupPlural: 'Groups',
      groupLeader: 'Group Lead',
      nickname: 'Leader nickname',
      authProvider: 'Jubla-DB',
    },
    OTHER: {
      department: 'Club',
      departmentPlural: 'Clubs',
      departmentLeader: 'Board',
      member: 'Member',
      memberPlural: 'Members',
      group: 'Team',
      groupPlural: 'Teams',
      groupLeader: 'Team Lead',
      nickname: 'Nickname',
      authProvider: 'Email & Password',
    },
  },
};

/** Deutsches Vokabular für Abwärtskompatibilität */
export const VOCABULARIES: Record<OrganizationType, OrganizationVocabulary> = VOCABULARIES_BY_LOCALE.de;

/**
 * Liefert das verbandsspezifische Vokabular für einen OrganizationType in der gewünschten Sprache.
 * Fallback-Verband ist immer CEVI, Fallback-Sprache ist immer Deutsch.
 */
export function getVocabulary(
  orgType?: OrganizationType | string | null,
  locale?: string | null,
): OrganizationVocabulary {
  const normLocale = (locale ?? 'de').trim().toLowerCase().split(/[-_]/)[0] as VocabularyLocale;
  const dict = VOCABULARIES_BY_LOCALE[normLocale] ?? VOCABULARIES_BY_LOCALE.de;
  switch (orgType?.toUpperCase()) {
    case 'PFADI':
      return dict.PFADI;
    case 'JUBLA':
      return dict.JUBLA;
    case 'OTHER':
    case 'VEREIN':
      return dict.OTHER;
    default:
      return dict.CEVI;
  }
}

/**
 * Ermittelt das Vokabular anhand eines Hostnamens oder Slugs in der gewünschten Sprache.
 */
export function getVocabularyFromHost(
  hostnameOrSlug?: string | null,
  locale?: string | null,
): OrganizationVocabulary {
  const orgType = getOrganizationTypeFromHost(hostnameOrSlug);
  return getVocabulary(orgType, locale);
}
