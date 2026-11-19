/**
 * Seitenaufrufe serverseitig zählen (Kennzahl PAGE_LOAD): Die Middleware von Web, Landing und Login meldet
 * jede echte Seitenladung ans Backend. Gezählt wird nur die Tagessumme pro Verband und App (bei Web zusätzlich
 * die Abteilung), ohne IP, URL, Cookie oder Browser-Kennung. Darum gilt das auch bei «nicht verfolgen».
 */
import { RESERVED_SUBDOMAINS } from './constants.js';
import { getOrganizationSlugFromHost } from './organizations.js';
import type { PageLoadDim, STATS_APPS } from './stats.js';

type StatsApp = keyof typeof STATS_APPS;

/** Crawler, Link-Vorschauen, Monitoring und Skripte zählen nicht */
const NON_HUMAN_AGENT =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|skype|preview|monitor|uptime|kuma|pingdom|lighthouse|pagespeed|headless|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|httpclient|libwww/i;

/**
 * Ist das eine echte Seitenladung im Browser? Nur GET-Dokumente, keine Next-Navigationen (RSC), kein
 * Prefetch/Prerender, keine Bots. Clientseitige Navigationen innerhalb der App zählen damit nicht.
 */
export function isPageLoadRequest(method: string, pathname: string, headers: Headers): boolean {
  if (method !== 'GET') return false;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || /\.[a-z0-9]+$/i.test(pathname)) return false;
  if (headers.has('rsc') || headers.has('next-router-prefetch') || headers.has('next-router-state-tree')) return false;
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-purpose') ?? ''}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return false;
  const dest = headers.get('sec-fetch-dest');
  if (dest ? dest !== 'document' : !(headers.get('accept') ?? '').includes('text/html')) return false;
  const agent = headers.get('user-agent') ?? '';
  return agent.length > 0 && !NON_HUMAN_AGENT.test(agent);
}

/** Unterteilung von PAGE_LOAD: Verband der Domain und App */
export function pageLoadDim(app: StatsApp, host: string): PageLoadDim {
  return `${getOrganizationSlugFromHost(host)}_${app}`;
}

/** Abteilung aus dem Host einer Abteilungsseite (illnau.cevi-schichtplan.ch, illnau.dev.cevi-schichtplan.ch) */
function departmentSlug(host: string): string | null {
  const parts = host.split(':')[0].toLowerCase().split('.');
  if (parts.length < 3) return null;
  const slug = parts[0];
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(slug) ? null : slug;
}

/**
 * Seitenaufruf intern ans Backend melden (`backend` = INTERNAL_API_URL). Wirft nie; ohne Adresse passiert nichts.
 * In der Middleware mit `event.waitUntil(...)` aufrufen, damit die Antwort nicht wartet.
 */
export async function reportPageLoad(app: StatsApp, host: string, backend: string | undefined): Promise<void> {
  if (!backend || !host) return;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-tenant-org': getOrganizationSlugFromHost(host),
  };
  const slug = app === 'web' ? departmentSlug(host) : null;
  if (slug) headers['x-tenant-slug'] = slug;
  try {
    await fetch(new URL('/api/stats/page-load', backend), {
      method: 'POST',
      headers,
      body: JSON.stringify({ dim: pageLoadDim(app, host) }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Statistik darf nie eine Seite stören
  }
}
