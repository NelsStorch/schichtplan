import { getOrganization } from '@schichtplan/shared';
import { type OgSubpage, getRequestOrigin, ogSubpageMetadata } from '@schichtplan/ui/og';
import type { Locale } from '@schichtplan/i18n';

type Org = ReturnType<typeof getOrganization>;

/** Unterseiten der Landingpage mit eigener Link-Vorschau. Schlüssel = Pfad ohne Schrägstrich. */
export const LANDING_PAGES: Record<string, (org: Org, locale?: Locale) => OgSubpage> = {
  datenschutz: (org: Org, locale?: Locale) => {
    switch (locale) {
      case 'fr':
        return {
          title: 'Protection des données',
          description: `Quelles données personnelles ${org.name} traite, dans quel but et quels sont vos droits (LPD).`,
          subtitle: 'Quelles données nous traitons et quels sont vos droits.',
        };
      case 'it':
        return {
          title: 'Protezione dei dati',
          description: `Quali dati personali ${org.name} tratta, a quale scopo e quali sono i tuoi diritti (LPD).`,
          subtitle: 'Quali dati trattiamo e quali sono i tuoi diritti.',
        };
      case 'en':
        return {
          title: 'Privacy Policy',
          description: `Which personal data ${org.name} processes, for what purpose and what rights you have (FADP).`,
          subtitle: 'What data we process and what rights you have.',
        };
      default:
        return {
          title: 'Datenschutzerklärung',
          description: `Welche Personendaten der ${org.name} bearbeitet, wozu und welche Rechte du hast (nDSG).`,
          subtitle: 'Welche Daten wir bearbeiten und welche Rechte du hast.',
        };
    }
  },
  nutzungsbedingungen: (org: Org, locale?: Locale) => {
    switch (locale) {
      case 'fr':
        return {
          title: "Conditions d'utilisation",
          description: `Règles pour les ${org.unitTermPlural} et les organisateurs dans ${org.name}, y compris le traitement des commandes.`,
          subtitle: `Règles pour les ${org.unitTermPlural} et les organisateurs.`,
        };
      case 'it':
        return {
          title: 'Condizioni di utilizzo',
          description: `Regole per ${org.unitTermPlural} e organizzatori in ${org.name}, compresa l'elaborazione dei dati.`,
          subtitle: `Regole per ${org.unitTermPlural} e organizzatori.`,
        };
      case 'en':
        return {
          title: 'Terms of Service',
          description: `Rules for ${org.unitTermPlural} and organizers in ${org.name}, including data processing.`,
          subtitle: `Rules for ${org.unitTermPlural} and organizers.`,
        };
      default:
        return {
          title: 'Nutzungsbedingungen',
          description: `Regeln für ${org.unitTermPlural} und Planende im ${org.name}, inklusive Auftragsbearbeitung.`,
          subtitle: `Regeln für ${org.unitTermPlural} und Planende.`,
        };
    }
  },
  impressum: (org: Org, locale?: Locale) => {
    switch (locale) {
      case 'fr':
        return {
          title: 'Mentions légales',
          description: `Qui gère ${org.name} et comment nous contacter.`,
          subtitle: 'Exploitation et contact.',
        };
      case 'it':
        return {
          title: 'Note legali',
          description: `Chi gestisce ${org.name} e come contattarci.`,
          subtitle: 'Gestione e contatto.',
        };
      case 'en':
        return {
          title: 'Legal Notice',
          description: `Who operates ${org.name} and how to reach us.`,
          subtitle: 'Operations and contact.',
        };
      default:
        return {
          title: 'Impressum',
          description: `Wer den ${org.name} betreibt und wie du uns erreichst.`,
          subtitle: 'Betrieb und Kontakt.',
        };
    }
  },
  profil: (org: Org, locale?: Locale) => {
    switch (locale) {
      case 'fr':
        return {
          title: 'Mon profil',
          description: `Gérer vos données, votre ${org.unitTerm}, vos groupes et vos créneaux dans ${org.name}.`,
          subtitle: `Gérer vos données, votre ${org.unitTerm} et vos créneaux.`,
        };
      case 'it':
        return {
          title: 'Il mio profilo',
          description: `Gestire i tuoi dati, ${org.unitTerm}, gruppi e i propri turni in ${org.name}.`,
          subtitle: `Gestire i dati, ${org.unitTerm} e i propri turni.`,
        };
      case 'en':
        return {
          title: 'My Profile',
          description: `Manage your details, ${org.unitTerm}, groups and own shifts in ${org.name}.`,
          subtitle: `Manage details, ${org.unitTerm} and own shifts.`,
        };
      default:
        return {
          title: 'Mein Profil',
          description: `Deine Angaben, ${org.unitTerm}, Stufen und eigenen Schichten im ${org.name} verwalten.`,
          subtitle: `Angaben, ${org.unitTerm} und eigene Schichten verwalten.`,
        };
    }
  },
  'abteilung-erstellen': (org: Org, locale?: Locale) => {
    switch (locale) {
      case 'fr':
        return {
          title: `Créer un(e) ${org.unitTerm}`,
          description: `Configurer la planification des créneaux pour votre ${org.unitTerm} sur ${org.name}.`,
          subtitle: `Configurer la planification pour votre ${org.unitTerm}.`,
        };
      case 'it':
        return {
          title: `Creare una ${org.unitTerm}`,
          description: `Configurare la pianificazione dei turni per la tua ${org.unitTerm} su ${org.name}.`,
          subtitle: `Configurare la pianificazione per la tua ${org.unitTerm}.`,
        };
      case 'en':
        return {
          title: `Create ${org.unitTerm}`,
          description: `Set up shift scheduling for your ${org.unitTerm} on ${org.name}.`,
          subtitle: `Set up shift scheduling for your ${org.unitTerm}.`,
        };
      default:
        return {
          title: `${org.unitTerm} erfassen`,
          description: `Schichtplan für deine ${org.unitTerm} auf ${org.name} einrichten.`,
          subtitle: `Schichtplan für deine ${org.unitTerm} einrichten.`,
        };
    }
  },
};

export type LandingPageKey = keyof typeof LANDING_PAGES;

export function landingPage(key: string | null | undefined, org: Org, locale?: Locale): OgSubpage | null {
  return key && Object.hasOwn(LANDING_PAGES, key) ? LANDING_PAGES[key](org, locale) : null;
}

/** Metadaten samt eigenem Vorschaubild für eine Unterseite der Landingpage */
export async function landingPageMetadata(key: LandingPageKey, locale: Locale = 'de') {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const page = landingPage(key, org, locale) ?? LANDING_PAGES[key](org, 'de');
  return ogSubpageMetadata(key, `/${key}`, page, locale);
}
