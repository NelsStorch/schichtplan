import { cache } from 'react';
import { headers } from 'next/headers';
import { getRootDomain, RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX } from '@schichtplan/shared';
import { trustedHost } from '@schichtplan/ui/og';
import type { getTranslations } from 'next-intl/server';

export interface DepartmentPreview {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Ebene über der Abteilung/Schar (z. B. «Bund»), sonst null */
  levelName?: string | null;
  /** Standardsprache der Abteilung (de, fr, it, en) */
  defaultLocale?: string | null;
}

/** Abteilungs-Slug aus dem Host (`illnau.cevi-schichtplan.ch` → `illnau`), null auf der Hauptdomain. */
export function slugFromHost(host: string): string | null {
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === 'localhost') return process.env.DEV_TENANT_SLUG ?? (process.env.NODE_ENV === 'production' ? null : 'demo');
  const root = getRootDomain(hostname);
  if (hostname === root) return null;
  const sub = hostname.slice(0, -(root.length + 1));
  if (!sub || sub.includes('.')) return null;
  if (!SUBDOMAIN_REGEX.test(sub)) return null;
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(sub)) return null;
  return sub;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEPT_CACHE_TTL_MS = 60_000;
const MAX_DEPT_CACHE_SIZE = 500;
const departmentPreviewCache = new Map<string, CacheEntry<DepartmentPreview | null>>();
const departmentPreviewInFlight = new Map<string, Promise<DepartmentPreview | null>>();

function setDepartmentPreviewCache(key: string, value: DepartmentPreview | null): void {
  if (departmentPreviewCache.size >= MAX_DEPT_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, entry] of departmentPreviewCache) {
      if (now >= entry.expiresAt) {
        departmentPreviewCache.delete(k);
      }
    }
    if (departmentPreviewCache.size >= MAX_DEPT_CACHE_SIZE) {
      const toRemove = departmentPreviewCache.size - MAX_DEPT_CACHE_SIZE + 50;
      let i = 0;
      for (const k of departmentPreviewCache.keys()) {
        if (i++ >= toRemove) break;
        departmentPreviewCache.delete(k);
      }
    }
  }
  departmentPreviewCache.set(key, {
    value,
    expiresAt: Date.now() + DEPT_CACHE_TTL_MS,
  });
}

/** Nur für Tests: In-Memory-Cache zurücksetzen */
export function clearDepartmentPreviewCache(): void {
  departmentPreviewCache.clear();
  departmentPreviewInFlight.clear();
}

/**
 * Öffentliche Eckdaten der Abteilung dieser Subdomain für Link-Vorschauen (Server-seitig, direkt am Backend).
 * Liefert null, wenn es keine Abteilung gibt oder das Backend nicht antwortet: die Vorschau fällt dann auf «Cevi Schichtplan» zurück.
 *
 * Optimiert durch:
 * 1. React.cache() zur automatischen Deduplizierung im selben Server-Render (Metadata, Viewport, Layout)
 * 2. In-Memory-TTL-Cache (60s) inkl. negativem Caching bei 404, um unbekannte/gescannte Subdomains abzufedern
 * 3. In-Flight-Promise-Sharing zur Vermeidung paralleler doppelter Backend-Anfragen
 */
export const getDepartmentPreview = cache(async (): Promise<DepartmentPreview | null> => {
  const backend = process.env.INTERNAL_API_URL;
  if (!backend) return null;
  const h = await headers();
  // Nur die eigene Domain (oder lokal localhost); sonst gibt es keine Abteilung
  const host = trustedHost(h.get('x-forwarded-host') ?? h.get('host'));
  const slug = slugFromHost(host);
  if (!slug) return null;

  const cacheKey = `${host}:${slug}`;
  const now = Date.now();
  const cached = departmentPreviewCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const existingInFlight = departmentPreviewInFlight.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const inFlight = (async () => {
    try {
      const res = await fetch(new URL('/api/departments/current', backend), {
        headers: { 'x-tenant-slug': slug, 'x-tenant-org': host },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(3000),
      });
      let result: DepartmentPreview | null = null;
      if (res.ok) {
        const d = (await res.json()) as DepartmentPreview;
        result = {
          name: d.name,
          slug: d.slug,
          logoUrl: d.logoUrl ?? null,
          primaryColor: d.primaryColor ?? null,
          levelName: d.levelName ?? null,
          defaultLocale: d.defaultLocale ?? null,
        };
        setDepartmentPreviewCache(cacheKey, result);
      } else if (res.status === 404) {
        // Negativer Cache: Unbekannte Subdomains dämpfen (kein Dauerfeuer auf Fastify)
        setDepartmentPreviewCache(cacheKey, null);
      }
      return result;
    } catch {
      return null;
    } finally {
      departmentPreviewInFlight.delete(cacheKey);
    }
  })();

  departmentPreviewInFlight.set(cacheKey, inFlight);
  return inFlight;
});

export interface EventPreview {
  title: string;
  slug: string;
  logoUrl: string | null;
  startDate: string;
  endDate: string;
  dayCutoffTime: string;
  /** null: Eintragen nicht mehr möglich */
  openSlots: number | null;
  updatedAt: string;
  bannerUrl: string | null;
  /** Nur mit Schicht-Link (`?schicht=ID`) */
  shift: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    openSlots: number | null;
    /** Wie viele Eingetragene Ersatz suchen */
    replacementWanted: number;
  } | null;
}

/**
 * Eckdaten eines Anlasses für die Link-Vorschau. Das Backend liefert nur, was die Anlass-Seite auch ohne Login
 * zeigt; bei Entwürfen und internen Anlässen von Abteilungen «nur für Mitglieder» kommt null (Abteilungs-Vorschau).
 */
export const getEventPreview = cache(
  async (eventSlug: string, shiftId?: string | null): Promise<EventPreview | null> => {
    if (!/^[a-z0-9-]{1,200}$/i.test(eventSlug)) return null;
    const query = shiftId && isUuid(shiftId) ? `?schicht=${shiftId}` : '';
    return fetchPreview<EventPreview>(`/api/events/${encodeURIComponent(eventSlug)}/preview${query}`);
  }
);

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * QR-Code zum Anlass im Design der Abteilung (QR-Farben, Stil, Logo; derselbe Generator wie beim Check-in-Aushang)
 * als SVG-Text. null, wenn er nicht verfügbar ist.
 */
export const getEventQrSvg = cache(async (eventSlug: string): Promise<string | null> => {
  if (!/^[a-z0-9-]{1,200}$/i.test(eventSlug)) return null;
  return fetchPreview(`/api/events/${encodeURIComponent(eventSlug)}/preview/qr`, (res) => res.text());
});

async function fetchPreview<T>(apiPath: string, read: (res: Response) => Promise<T> = (res) => res.json() as Promise<T>): Promise<T | null> {
  const backend = process.env.INTERNAL_API_URL;
  if (!backend) return null;
  const h = await headers();
  // Nur die eigene Domain (oder lokal localhost); sonst gibt es keine Abteilung
  const host = trustedHost(h.get('x-forwarded-host') ?? h.get('host'));
  const slug = slugFromHost(host);
  if (!slug) return null;
  try {
    const res = await fetch(new URL(apiPath, backend), {
      // Verband mitschicken: intern ist der Host «backend», sonst gälte immer Cevi
      headers: { 'x-tenant-slug': slug, 'x-tenant-org': host },
      // Eckdaten ändern sich selten: kurz cachen, damit nicht jeder Seiten-Render, Prefetch und Bot das Backend trifft.
      // Der Cache-Schlüssel enthält die Header, gilt also pro Abteilung und Verband.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return await read(res);
  } catch {
    return null;
  }
}

/** Seitentitel für Link-Vorschauen: «Jubla Greifensee-Nänikon – Schichtplan» statt doppeltem «Jubla» */
export function previewTitle(departmentName: string | null | undefined, brandName: string): string {
  return departmentName ? `${departmentName} – Schichtplan` : brandName;
}

/** «Noch 12 Plätze frei» / «Alle Schichten besetzt» für die Anlass-Vorschau (null: nichts anzeigen) */
export function openSlotsLabel(
  openSlots: number | null,
  full: 'all' | 'shift' = 'all',
  t?: MetaT
): string | null {
  if (openSlots === null) return null;
  if (openSlots === 0) {
    if (t) return t(full === 'shift' ? 'slotsShiftFull' : 'slotsAllFull');
    return full === 'shift' ? 'Schicht ist besetzt' : 'Alle Schichten besetzt';
  }
  if (t) return t('slotsFree', { count: openSlots });
  return openSlots === 1 ? 'Noch 1 Platz frei' : `Noch ${openSlots} Plätze frei`;
}

/** Übersetzer für Link-Vorschauen (Katalog `web.meta`) */
export type MetaT = Awaited<ReturnType<typeof getTranslations<'web.meta'>>>;

/**
 * Name der installierten App: «Schichtplan – Jubla Greifensee-Nänikon». Die meisten haben nur eine Abteilung,
 * darum steht «Schichtplan» vorne (und allein unter dem Icon, dort ist nur Platz für etwa 12 Zeichen).
 */
export function appName(departmentName: string | null | undefined): string {
  const name = departmentName?.trim();
  return name ? `Schichtplan – ${name}` : 'Schichtplan';
}
