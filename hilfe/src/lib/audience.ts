/** Zielgruppen der Hilfe. Farben bewusst ruhig: Akzent nur für die Hauptaktion. */
export const AUDIENCES = {
  helfer: { label: 'Helfer*innen', short: 'Helfer*in', href: '/helfen/eintragen/' },
  ok: { label: 'OK', short: 'OK', href: '/ok/rollen/' },
  abteilung: { label: 'Abteilungsleitung', short: 'AL', href: '/abteilung/anlegen/' },
} as const;

export type Audience = keyof typeof AUDIENCES;

export function getAudienceLabel(key: Audience, locale?: string): { label: string; href: string } {
  const prefix = locale && locale !== 'root' ? `/${locale}` : '';
  if (locale === 'fr') {
    const frLabels: Record<Audience, string> = {
      helfer: 'Bénévoles',
      ok: 'Comité d’organisation',
      abteilung: 'Direction',
    };
    return { label: frLabels[key], href: `${prefix}${AUDIENCES[key].href}` };
  }
  if (locale === 'it') {
    const itLabels: Record<Audience, string> = {
      helfer: 'Volontari',
      ok: 'Comitato',
      abteilung: 'Direzione',
    };
    return { label: itLabels[key], href: `${prefix}${AUDIENCES[key].href}` };
  }
  if (locale === 'en') {
    const enLabels: Record<Audience, string> = {
      helfer: 'Helpers',
      ok: 'Organizers',
      abteilung: 'Leadership',
    };
    return { label: enLabels[key], href: `${prefix}${AUDIENCES[key].href}` };
  }
  return { label: AUDIENCES[key].label, href: AUDIENCES[key].href };
}

/** Lesezeit in Minuten aus dem Markdown (ohne Komponenten-Tags und Frontmatter) */
export function readingMinutes(body: string | undefined): number {
  if (!body) return 1;
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|\-[\]()]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 190));
}
