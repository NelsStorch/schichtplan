import { getOrganizationSlugFromHost } from '@schichtplan/shared';

/**
 * Optionale Web-Statistik mit Umami (selbst gehostet). Ohne Konfiguration wird nichts geladen.
 *
 * - `UMAMI_SCRIPT_URL`: Adresse des Tracking-Skripts, z. B. `https://stats.example.ch/script.js`. Muss schon beim
 *   Build gesetzt sein (Build-Argument), weil die Content-Security-Policy in `next.config.ts` den Ursprung erlaubt.
 * - `UMAMI_WEBSITE_IDS`: Website-ID pro Verband, z. B. `cevi=<uuid>,pfadi=<uuid>,jubla=<uuid>,verein=<uuid>`.
 *   Verbände ohne Eintrag werden nicht erfasst. Dev und Prod bekommen über ihre `.env` eigene IDs.
 *
 * Nur auf dem Server lesen (Root-Layout), die Variablen sind nicht NEXT_PUBLIC.
 */
export function umamiConfig(host: string | null | undefined): { src: string; websiteId: string } | null {
  const src = process.env.UMAMI_SCRIPT_URL?.trim();
  const ids = process.env.UMAMI_WEBSITE_IDS?.trim();
  if (!src || !ids) return null;
  const slug = getOrganizationSlugFromHost(host);
  for (const pair of ids.split(',')) {
    const [key, value] = pair.split('=').map((part) => part.trim());
    if (key === slug && value) return { src, websiteId: value };
  }
  return null;
}

/** Ist die Web-Statistik für diesen Host aktiv? (z. B. für den Hinweis in der Datenschutzerklärung) */
export function umamiEnabled(host: string | null | undefined): boolean {
  return umamiConfig(host) !== null;
}

/**
 * Bindet das Umami-Skript für den Verband des Hosts ein. Ohne Cookies; Query-String und Anker werden nie
 * übermittelt (dort stehen Token und Codes, z. B. beim Passwort-Zurücksetzen oder Bon-Scan). «Nicht verfolgen»
 * im Browser wird respektiert.
 */
export function UmamiScript({ host }: { host: string | null | undefined }) {
  const config = umamiConfig(host);
  if (!config) return null;
  return (
    <script
      async
      src={config.src}
      data-website-id={config.websiteId}
      data-exclude-search="true"
      data-exclude-hash="true"
      data-do-not-track="true"
    />
  );
}
