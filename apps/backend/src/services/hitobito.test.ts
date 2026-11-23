import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HITOBITO_SCOPES,
  classifyUnitRole,
  getHitobitoConfig,
  getHitobitoConfigFromHost,
  getOrganization,
  getUnitRoleKey,
  getVocabulary,
  getVocabularyFromHost,
  isDepartmentLeaderRole,
  isPassiveRoleClass,
  isUnitRoleClass,
} from '@schichtplan/shared';
import { creationRoles, deriveCeviDbFields, hitobitoRoleKind, hitobitoRoles, ownUnitGroups, type CeviDbGroupInfo } from './hitobito.js';

describe('ownUnitGroups (eigene Scharen beim Anlegen)', () => {
  const group = (id: number, name: string, ortsgruppeId: number | null, extra: Partial<CeviDbGroupInfo> = {}): CeviDbGroupInfo => ({
    id,
    name,
    jungscharId: null,
    ortsgruppeId,
    jungscharCount: null,
    groupType: null,
    ...extra,
  });

  it('listet jede Schar einmal, die ohne Schichtplan zuerst', () => {
    const groups = new Map(
      [
        group(30, 'Jubla Uster', 30, { groupType: 'Schar', jungscharCount: 0 }),
        group(31, 'Blauring 3. Klasse', 30),
        group(32, 'Jungwacht 5. Klasse', 30),
        group(40, 'Jubla Wetzikon', 40, { groupType: 'Schar', jungscharCount: 0 }),
        group(41, 'Leiterteam', 40),
      ].map((g) => [g.id, g])
    );
    const departments = [{ name: 'Jubla Uster', slug: 'uster', hitobitoGroupId: 30 }];
    expect(ownUnitGroups([31, 32, 41], groups, departments)).toEqual([
      { hitobitoGroupId: 40, name: 'Jubla Wetzikon', groupType: 'Schar', existingDepartment: null },
      { hitobitoGroupId: 30, name: 'Jubla Uster', groupType: 'Schar', existingDepartment: { name: 'Jubla Uster', slug: 'uster' } },
    ]);
  });

  it('nimmt bei mehreren Jungscharen die Jungschar (Cevi)', () => {
    const groups = new Map(
      [
        group(161, 'Illnau-Effretikon', 161, { groupType: 'Ortsgruppe', jungscharCount: 2 }),
        group(295, 'JS Illnau', 161, { jungscharId: 295, groupType: 'Jungschar' }),
        group(806, 'Joschija', 161, { jungscharId: 295 }),
      ].map((g) => [g.id, g])
    );
    expect(ownUnitGroups([806], groups, [{ name: 'Cevi Illnau', slug: 'illnau', hitobitoGroupId: 295 }])).toEqual([
      { hitobitoGroupId: 295, name: 'JS Illnau', groupType: 'Jungschar', existingDepartment: { name: 'Cevi Illnau', slug: 'illnau' } },
    ]);
  });

  it('übergeht Gruppen ohne bekannte Struktur', () => {
    expect(ownUnitGroups([99], new Map(), [])).toEqual([]);
  });
});

describe('Passive Rollen (Ehemalige, Externe …)', () => {
  it('erkennt passive Rollen in allen Verbänden', () => {
    expect(isPassiveRoleClass('Group::Flock::Alumnus')).toBe(true);
    expect(isPassiveRoleClass('Group::FederalAlumnusGroup::Member')).toBe(true);
    expect(isPassiveRoleClass('Group::FlockAlumnusGroup::Leader')).toBe(true);
    expect(isPassiveRoleClass('Group::Flock::External')).toBe(true);
    expect(isPassiveRoleClass('Group::Flock::DispatchAddress')).toBe(true);
    expect(isPassiveRoleClass('Group::Ehemalige::Mitglied')).toBe(true);
    expect(isPassiveRoleClass('Group::Abteilung::Passivmitglied')).toBe(true);
    expect(isPassiveRoleClass('Group::JungscharExterne::Externer')).toBe(true);
    expect(isPassiveRoleClass('Group::Elternrat::Mitglied')).toBe(true);
    // Aktive Rollen
    expect(isPassiveRoleClass('Group::Flock::Leader')).toBe(false);
    expect(isPassiveRoleClass('Group::ChildGroup::Leader')).toBe(false);
    expect(isPassiveRoleClass('Group::FederalBoard::Member')).toBe(false);
    expect(isPassiveRoleClass('Group::Stufe::Teilnehmer')).toBe(false);
  });

  it('ordnet über passive Rollen keiner Abteilung zu', () => {
    const derived = deriveCeviDbFields(
      {
        primary_group_id: 90,
        roles: [
          { role_class: 'Group::FlockAlumnusGroup::Member', group_id: 90 },
          { role_class: 'Group::ChildGroup::Leader', group_id: 31 },
        ],
      },
      'JUBLA'
    );
    expect(derived.roleGroupIds).toEqual([31]);
    // Hauptgruppe ist die Ehemaligen-Gruppe: zählt nicht
    expect(derived.primaryGroupId).toBeNull();
    // Für die Diagnose bleiben alle Rollen sichtbar
    expect(derived.roles).toHaveLength(2);
  });
});

describe('creationRoles (eigene Rollen beim Anlegen)', () => {
  it('zeigt Bezeichnung und Gruppe und ob die Rolle als Leitung zählt', () => {
    expect(
      creationRoles(
        [
          { roleClass: 'Group::FederalBoard::Member', roleName: 'Mitglied', groupName: 'Bundesleitung' },
          { roleClass: 'Group::FederalBoard::Treasurer', roleName: 'Kassier*in', groupName: 'Bundesleitung' },
          { roleClass: 'Group::Flock::CampLeader', roleName: null, groupName: null },
        ],
        'JUBLA'
      )
    ).toEqual([
      { roleName: 'Mitglied', groupName: 'Bundesleitung', isLeader: true },
      { roleName: 'Kassier*in', groupName: 'Bundesleitung', isLeader: false },
      // Ohne Bezeichnung: letzter Teil der Rollenklasse
      { roleName: 'CampLeader', groupName: null, isLeader: false },
    ]);
  });

  it('wertet Cevi-Rollen wie beim Login aus', () => {
    expect(creationRoles([{ roleClass: 'Group::Jungschar::Abteilungsleiter', roleName: 'AL', groupName: 'JS Illnau' }], 'CEVI')).toEqual([
      { roleName: 'AL', groupName: 'JS Illnau', isLeader: true },
    ]);
  });
});

describe('Hitobito & Vokabular (Multi-Verband)', () => {
  describe('Vokabular-Definitionen', () => {
    it('liefert das korrekte Vokabular für CEVI', () => {
      const vocab = getVocabulary('CEVI');
      expect(vocab).toMatchObject({
        department: 'Abteilung',
        departmentLeader: 'Abteilungsleitung',
        member: 'Cevianer*in',
        memberPlural: 'Cevianer*innen',
        group: 'Stufe',
        groupPlural: 'Stufen',
        groupLeader: 'Stufenleitung',
        nickname: 'Cevi-Name',
        authProvider: 'Cevi.DB',
      });
    });

    it('liefert das korrekte Vokabular für PFADI', () => {
      const vocab = getVocabulary('PFADI');
      expect(vocab).toMatchObject({
        department: 'Abteilung',
        departmentLeader: 'Abteilungsleitung',
        member: 'Pfadfinder*in',
        memberPlural: 'Pfadfinder*innen',
        group: 'Einheit',
        groupPlural: 'Einheiten',
        groupLeader: 'Einheitsleitung',
        nickname: 'Pfadiname',
        authProvider: 'PBS MiData',
      });
    });

    it('liefert das korrekte Vokabular für JUBLA', () => {
      const vocab = getVocabulary('JUBLA');
      expect(vocab).toMatchObject({
        department: 'Schar',
        departmentLeader: 'Scharleitung',
        member: 'Jublaner*in',
        memberPlural: 'Jublaner*innen',
        group: 'Gruppe',
        groupPlural: 'Gruppen',
        groupLeader: 'Gruppenleitung',
        nickname: 'Leitername',
        authProvider: 'Jubla-DB',
      });
    });

    it('liefert das korrekte Vokabular für OTHER (Verein)', () => {
      const vocab = getVocabulary('OTHER');
      expect(vocab).toMatchObject({
        department: 'Verein',
        departmentLeader: 'Vorstand',
        member: 'Mitglied',
        memberPlural: 'Mitglieder',
        group: 'Team',
        groupPlural: 'Teams',
        groupLeader: 'Teamleitung',
        nickname: 'Spitzname',
      });
      // Fallback über 'VEREIN'
      expect(getVocabulary('VEREIN')).toEqual(vocab);
    });

    it('ermittelt Vokabular korrekt aus Hostnamen', () => {
      expect(getVocabularyFromHost('pfadi-schichtplan.ch').member).toBe('Pfadfinder*in');
      expect(getVocabularyFromHost('dev.jubla-schichtplan.ch').department).toBe('Schar');
      expect(getVocabularyFromHost('vereins-schichtplan.ch').departmentLeader).toBe('Vorstand');
      expect(getVocabularyFromHost('cevi-schichtplan.ch').group).toBe('Stufe');
      expect(getVocabularyFromHost(null).group).toBe('Stufe'); // Default CEVI
    });

    it('liefert mehrsprachiges Vokabular für Französisch (fr)', () => {
      expect(getVocabulary('CEVI', 'fr')).toMatchObject({
        department: 'Section',
        departmentLeader: 'Direction de section',
        member: 'Membre Cevi',
        memberPlural: 'Membres Cevi',
        group: 'Groupe',
        nickname: 'Nom Cevi',
        authProvider: 'Cevi.DB',
      });
      expect(getVocabulary('PFADI', 'fr')).toMatchObject({
        department: 'Groupe',
        departmentLeader: 'Responsable de groupe',
        member: 'Scout',
        memberPlural: 'Scouts',
        group: 'Unité',
        nickname: 'Totem',
        authProvider: 'MSdS MiData',
      });
      expect(getVocabulary('JUBLA', 'fr')).toMatchObject({
        department: 'Groupe',
        departmentLeader: 'Direction de groupe',
        member: 'Membre Jubla',
        nickname: "Nom d'animateur",
        authProvider: 'Jubla-DB',
      });
      expect(getVocabulary('OTHER', 'fr')).toMatchObject({
        department: 'Association',
        departmentLeader: 'Comité',
        member: 'Membre',
        nickname: 'Surnom',
        authProvider: 'E-mail & mot de passe',
      });
    });

    it('liefert mehrsprachiges Vokabular für Italienisch (it)', () => {
      expect(getVocabulary('CEVI', 'it')).toMatchObject({
        department: 'Sezione',
        departmentLeader: 'Direzione di sezione',
        member: 'Membro Cevi',
        nickname: 'Nome Cevi',
      });
      expect(getVocabulary('PFADI', 'it')).toMatchObject({
        department: 'Sezione',
        departmentLeader: 'Direzione di sezione',
        member: 'Scout',
        nickname: 'Nome scout',
        authProvider: 'MSS MiData',
      });
      expect(getVocabulary('JUBLA', 'it')).toMatchObject({
        department: 'Gruppo',
        departmentLeader: 'Direzione di gruppo',
        nickname: 'Nome animatore',
      });
      expect(getVocabulary('OTHER', 'it')).toMatchObject({
        department: 'Associazione',
        departmentLeader: 'Comitato',
        nickname: 'Soprannome',
        authProvider: 'E-mail e password',
      });
    });

    it('liefert mehrsprachiges Vokabular für Englisch (en)', () => {
      expect(getVocabulary('CEVI', 'en')).toMatchObject({
        department: 'Department',
        departmentLeader: 'Department Lead',
        member: 'Cevi member',
        nickname: 'Cevi nickname',
      });
      expect(getVocabulary('PFADI', 'en')).toMatchObject({
        department: 'Group',
        departmentLeader: 'Group Lead',
        member: 'Scout',
        nickname: 'Scout name',
        authProvider: 'PBS MiData',
      });
      expect(getVocabulary('JUBLA', 'en')).toMatchObject({
        department: 'Group',
        departmentLeader: 'Group Lead',
        member: 'Jubla member',
        nickname: 'Leader nickname',
      });
      expect(getVocabulary('OTHER', 'en')).toMatchObject({
        department: 'Club',
        departmentLeader: 'Board',
        member: 'Member',
        nickname: 'Nickname',
        authProvider: 'Email & Password',
      });
    });

    it('ermittelt mehrsprachiges Vokabular aus Hostnamen mit Sprache', () => {
      expect(getVocabularyFromHost('pfadi-schichtplan.ch', 'fr').nickname).toBe('Totem');
      expect(getVocabularyFromHost('dev.jubla-schichtplan.ch', 'it').department).toBe('Gruppo');
      expect(getVocabularyFromHost('cevi-schichtplan.ch', 'en').member).toBe('Cevi member');
      expect(getVocabularyFromHost('vereins-schichtplan.ch', 'fr').department).toBe('Association');
    });

    it('liefert lokalisierte OrganizationConfig über getOrganization', () => {
      const pfadiFr = getOrganization('pfadi', 'fr');
      expect(pfadiFr.unitTerm).toBe('Groupe');
      expect(pfadiFr.nicknameTerm).toBe('Totem');
      expect(pfadiFr.leadTerm).toBe('Responsable de groupe');
      expect(pfadiFr.authProviderShort).toBe('MSdS MiData');
      expect(pfadiFr.independentNotice).toContain('Mouvement Scout de Suisse');

      const ceviIt = getOrganization('cevi', 'it');
      expect(ceviIt.unitTerm).toBe('Sezione');
      expect(ceviIt.nicknameTerm).toBe('Nome Cevi');

      const vereinEn = getOrganization('verein', 'en');
      expect(vereinEn.unitTerm).toBe('Club');
      expect(vereinEn.leadTerm).toBe('Board');
      expect(vereinEn.nicknameTerm).toBe('Nickname');
    });
  });

  describe('Hitobito-Konfiguration & Scopes', () => {
    it('enthält immer den zwingenden groups Scope', () => {
      for (const org of ['CEVI', 'PFADI', 'JUBLA'] as const) {
        const config = getHitobitoConfig(org);
        expect(config.oauthScopes).toContain('groups');
        expect(config.oauthScopes).toContain('with_roles');
        expect(config.oauthScopes).toBe(DEFAULT_HITOBITO_SCOPES);
      }
    });

    it('liefert die Verbands-spezifischen BaseURLs und Gruppenfelder', () => {
      expect(getHitobitoConfig('CEVI')).toMatchObject({
        defaultBaseUrl: 'https://db.cevi.ch',
        ortsgruppeField: 'ortsgruppe_id',
      });
      expect(getHitobitoConfig('PFADI')).toMatchObject({
        defaultBaseUrl: 'https://db.scout.ch',
        ortsgruppeField: 'abteilung_id',
      });
      expect(getHitobitoConfig('JUBLA')).toMatchObject({
        defaultBaseUrl: 'https://db.jubla.ch',
        ortsgruppeField: 'schar_id',
      });
    });

    it('unterstützt Abwärtskompatibilitäts-Aliase', () => {
      const cevi = getHitobitoConfig('CEVI');
      expect(cevi.stufeRoleClassPrefix).toBe('Group::Stufe::');
      expect(cevi.stufeLeaderRoles).toContain('Stufenleiter');
      expect(cevi.stufeParticipantRoles).toContain('Teilnehmer');
    });

    it('ermittelt Konfiguration anhand von Hostnamen', () => {
      expect(getHitobitoConfigFromHost('midata.pfadi-schichtplan.ch').name).toBe('PBS MiData');
      expect(getHitobitoConfigFromHost('jubla-schichtplan.ch').name).toBe('Jubla-DB');
    });
  });

  describe('Leitungsrollen-Erkennung (isDepartmentLeaderRole)', () => {
    it('erkennt Cevi-Leitungsrollen', () => {
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiterin', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Ortsgruppe::AdministratorCeviDB', 'CEVI')).toBe(false);
      // Regionen: Mitgliederorganisation und Sektion, ohne reine Datenpflege-Rollen
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationGeschaeftsstelle::Geschaeftsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationVorstand::Praesidium', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Sektion::Administrator', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Mitgliederorganisation::Administrator', 'CEVI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::MitgliederorganisationGeschaeftsstelle::AdminOrtsgruppen', 'CEVI')).toBe(false);
      // Dachverband: Geschäftsleitung und Präsidium, nicht Angestellte und Datenpflege
      expect(isDepartmentLeaderRole('Group::DachverbandGeschaeftsstelle::Geschaeftsleiter', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::DachverbandVorstand::Praesidium', 'CEVI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::DachverbandGeschaeftsstelle::Angestellter', 'CEVI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Dachverband::Administrator', 'CEVI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Stufe::Stufenleiter', 'CEVI')).toBe(false);
    });

    it('erkennt Pfadi-Leitungsrollen (hitobito_pbs), auch Regions- und Kantonsleitung', () => {
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::AbteilungsleitungStv', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Region::Regionalleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Region::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Kantonalverband::Kantonsleitung', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Kantonalverband::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Bund::MitarbeiterGs', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Bund::Sekretariat', 'PFADI')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Bund::Geschaeftsleitung', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Bund::ItSupport', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Bund::Adressverwaltung', 'PFADI')).toBe(false);
      // Präsidium darf in MiData nur lesen
      expect(isDepartmentLeaderRole('Group::Abteilung::Praesidium', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Abteilung::VizePraesidium', 'PFADI')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe(false);
    });

    it('erkennt Jubla-Leitungsrollen (Scharleitung, Regional- und Kantonsleitung)', () => {
      expect(isDepartmentLeaderRole('Group::Flock::Leader', 'JUBLA')).toBe(true);
      // Lagerleitung leitet das Lager, nicht die Schar
      expect(isDepartmentLeaderRole('Group::Flock::CampLeader', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::Flock::CampLeader')).toBe(false);
      expect(isDepartmentLeaderRole('Group::RegionalBoard::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::StateBoard::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::StateAgency::Leader', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::FederalBoard::Member', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::FederalBoard::President', 'JUBLA')).toBe(true);
      expect(isDepartmentLeaderRole('Group::FederalBoard::Treasurer', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::FederalWorkGroup::Leader', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::OrganizationBoard::Leader', 'JUBLA')).toBe(false);
      // Präses darf in der Jubla-DB nur lesen
      expect(isDepartmentLeaderRole('Group::Flock::President', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::RegionalBoard::Member', 'JUBLA')).toBe(false);
      expect(isDepartmentLeaderRole('Group::ChildGroup::Leader', 'JUBLA')).toBe(false);
    });

    it('funktioniert mit konfigurierten Arrays (Abwärtskompatibilität)', () => {
      const configured = ['Custom::Leader::Role'];
      expect(isDepartmentLeaderRole('Custom::Leader::Role', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleiter', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Group::Schar::Scharleitung', configured)).toBe(true);
      expect(isDepartmentLeaderRole('Unknown::Role', configured)).toBe(false);
    });

    it('prüft global, wenn kein Verband übergeben wird', () => {
      expect(isDepartmentLeaderRole('Group::Jungschar::Abteilungsleiter')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Abteilung::Abteilungsleitung')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Flock::Leader')).toBe(true);
      expect(isDepartmentLeaderRole('Group::Stufe::Teilnehmer')).toBe(false);
    });
  });

  describe('Stufen- und Einheiten-Rollen (classifyUnitRole, isUnitRoleClass)', () => {
    it('erkennt Einheiten-Rollenklassen nach Präfix', () => {
      expect(isUnitRoleClass('Group::Stufe::Stufenleiter', 'CEVI')).toBe(true);
      expect(isUnitRoleClass('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::Woelfe::Wolf', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::Biber::Biber', 'PFADI')).toBe(true);
      expect(isUnitRoleClass('Group::ChildGroup::Child', 'JUBLA')).toBe(true);
      expect(isUnitRoleClass('Group::Jungschar::Abteilungsleiter')).toBe(false);
    });

    it('extrahiert den Rollenschlüssel korrekt', () => {
      expect(getUnitRoleKey('Group::Stufe::Stufenleiter')).toBe('Stufenleiter');
      expect(getUnitRoleKey('Group::Pfadi::Einheitsleitung')).toBe('Einheitsleitung');
      expect(getUnitRoleKey('Leader')).toBe('Leader');
    });

    it('klassifiziert Leitende, Teilnehmende und Andere', () => {
      // Cevi
      expect(classifyUnitRole('Group::Stufe::Stufenleiter', 'CEVI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Stufe::Gruppenleiter', 'CEVI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Stufe::Teilnehmer', 'CEVI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Stufe::Coach', 'CEVI')).toBe('ANDERE');

      // Pfadi
      expect(classifyUnitRole('Group::Pfadi::Einheitsleitung', 'PFADI')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Woelfe::Mitleitung', 'PFADI')).toBe('LEITUNG');
      // Leitpfadi und Leitwolf sind Kinder mit einer Gruppenleitung innerhalb der Stufe
      expect(classifyUnitRole('Group::Pfadi::Leitpfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Woelfe::Leitwolf', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Pfadi::Pfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Woelfe::Wolf', 'PFADI')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Biber::Biber', 'PFADI')).toBe('TEILNEHMER');

      // Jubla
      expect(classifyUnitRole('Group::ChildGroup::Leader', 'JUBLA')).toBe('LEITUNG');
      expect(classifyUnitRole('Group::Flock::Guide', 'JUBLA')).toBe('ANDERE');
      expect(classifyUnitRole('Group::ChildGroup::Child', 'JUBLA')).toBe('TEILNEHMER');
      expect(classifyUnitRole('Group::Flock::Coach', 'JUBLA')).toBe('ANDERE');
    });
  });

  describe('Profil-Auswertung mit deriveCeviDbFields (Pfadi & Jubla)', () => {
    it('wertet Pfadi-Profil korrekt aus (Abteilungsleitung & Wölfe)', () => {
      const pfadiProfile = {
        first_name: 'Fiona',
        last_name: 'Muster',
        nickname: 'Chinchilla',
        email: 'chinchilla@pfadi-beispiel.ch',
        primary_group_id: 502,
        roles: [
          { role_class: 'Group::Abteilung::Abteilungsleitung', group_id: 501, group_name: 'Pfadi Uster' },
          { role_class: 'Group::Woelfe::Einheitsleitung', group_id: 502, group_name: 'Meute Rikki-Tikki' },
        ],
      };

      const derived = deriveCeviDbFields(pfadiProfile, 'PFADI');
      expect(derived.isDepartmentLeader).toBe(true);
      expect(derived.ortsgruppeId).toBe(501);
      expect(derived.leaderGroupIds).toContain(501);
      expect(derived.stufen).toHaveLength(1);
      expect(derived.stufen[0]).toMatchObject({
        groupId: 502,
        groupName: 'Meute Rikki-Tikki',
        kind: 'LEITUNG',
        isPrimary: true,
      });
    });

    it('wertet Jubla-Profil korrekt aus (Scharleitung & Kindergruppe)', () => {
      const jublaProfile = {
        first_name: 'Lukas',
        last_name: 'Keller',
        nickname: 'Panda',
        email: 'panda@jubla-beispiel.ch',
        primary_group_id: 602,
        roles: [
          { role_class: 'Group::Flock::Leader', group_id: 601, group_name: 'Jubla Sursee' },
          { role_class: 'Group::ChildGroup::Leader', group_id: 602, group_name: 'Gruppe Tiger' },
        ],
      };

      const derived = deriveCeviDbFields(jublaProfile, 'JUBLA');
      expect(derived.isDepartmentLeader).toBe(true);
      expect(derived.ortsgruppeId).toBe(601);
      expect(derived.leaderGroupIds).toContain(601);
      expect(derived.stufen).toHaveLength(1);
      expect(derived.stufen[0]).toMatchObject({
        groupId: 602,
        groupName: 'Gruppe Tiger',
        kind: 'LEITUNG',
        isPrimary: true,
      });
    });
  });

  describe('Rollen-Snapshot für die Berechtigungs-Diagnose', () => {
    it('speichert nur Rollentyp und Gruppe, ohne Duplikate und weitere Profilfelder', () => {
      const roles = hitobitoRoles({
        email: 'x@example.ch',
        address: 'Geheimweg 1',
        roles: [
          { role_class: 'Group::Jungschar::Abteilungsleiter', role_name: 'Abteilungsleiter', group_id: '161', group_name: 'JS Illnau', extra: 'x' },
          { role_class: 'Group::Jungschar::Abteilungsleiter', group_id: 161, group_name: 'JS Illnau' },
          { role_class: 'Group::Vorstand::Mitglied', group_name: 'Vorstand' },
          { group_id: 5 },
          'kaputt',
        ],
      });
      expect(roles).toEqual([
        { roleClass: 'Group::Jungschar::Abteilungsleiter', roleName: 'Abteilungsleiter', groupId: 161, groupName: 'JS Illnau' },
        { roleClass: 'Group::Vorstand::Mitglied', roleName: null, groupId: null, groupName: 'Vorstand' },
      ]);
      expect(hitobitoRoles(null)).toEqual([]);
    });

    it('ist Teil der abgeleiteten Felder', () => {
      const derived = deriveCeviDbFields({ roles: [{ role_class: 'Group::Flock::Leader', group_id: 601 }] }, 'JUBLA');
      expect(derived.roles).toEqual([{ roleClass: 'Group::Flock::Leader', roleName: null, groupId: 601, groupName: null }]);
    });

    it('wertet Rollen pro Verband aus (Cevi, Pfadi, Jubla)', () => {
      // Cevi
      expect(hitobitoRoleKind('Group::Jungschar::Abteilungsleiter', 'CEVI')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::Stufe::Stufenleiter', 'CEVI')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::Stufe::Teilnehmer', 'CEVI')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Vorstand::Mitglied', 'CEVI')).toBe('NONE');
      // Pfadi
      expect(hitobitoRoleKind('Group::Abteilung::Abteilungsleitung', 'PFADI')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::Woelfe::Einheitsleitung', 'PFADI')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::Pfadi::Pfadi', 'PFADI')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Abteilung::Coach', 'PFADI')).toBe('NONE');
      // Jubla
      expect(hitobitoRoleKind('Group::Flock::Leader', 'JUBLA')).toBe('DEPARTMENT_LEADER');
      expect(hitobitoRoleKind('Group::ChildGroup::Leader', 'JUBLA')).toBe('LEITUNG');
      expect(hitobitoRoleKind('Group::ChildGroup::Child', 'JUBLA')).toBe('TEILNEHMER');
      expect(hitobitoRoleKind('Group::Flock::Coach', 'JUBLA')).toBe('NONE');
    });
  });
});

describe('organizationForLevel (Begriffe pro Ebene)', () => {
  it('nennt höhere Ebenen «Organisation» mit «Leitung», Scharen und Vereine bleiben', async () => {
    const { ORGANIZATIONS, organizationForLevel } = await import('@schichtplan/shared');
    expect(organizationForLevel(ORGANIZATIONS.jubla, 'Bund')).toMatchObject({
      unitTerm: 'Organisation',
      unitTermPlural: 'Organisationen',
      leadTerm: 'Leitung',
      orgName: ORGANIZATIONS.jubla.orgName,
    });
    expect(organizationForLevel(ORGANIZATIONS.jubla, null).unitTerm).toBe('Schar');
    expect(organizationForLevel(ORGANIZATIONS.verein, 'Bund').unitTerm).toBe('Verein');
  });

  it('übersetzt höhere Ebenen für FR, IT und EN', async () => {
    const { ORGANIZATIONS, organizationForLevel } = await import('@schichtplan/shared');
    expect(organizationForLevel(ORGANIZATIONS.jubla, 'Bund', 'fr')).toMatchObject({
      unitTerm: 'Organisation',
      unitTermPlural: 'Organisations',
      leadTerm: 'Direction',
    });
    expect(organizationForLevel(ORGANIZATIONS.pfadi, 'Kanton', 'it')).toMatchObject({
      unitTerm: 'Organizzazione',
      unitTermPlural: 'Organizzazioni',
      leadTerm: 'Direzione',
    });
    expect(organizationForLevel(ORGANIZATIONS.cevi, 'Region', 'en')).toMatchObject({
      unitTerm: 'Organization',
      unitTermPlural: 'Organizations',
      leadTerm: 'Leadership',
    });
  });
});
