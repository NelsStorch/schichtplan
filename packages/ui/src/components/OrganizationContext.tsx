'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import {
  ORGANIZATIONS,
  organizationForLevel,
  type OrganizationConfig,
  type OrganizationSlug,
} from '@schichtplan/shared';
import { applyAccent } from '../theme/accent';

/**
 * Verband der aktuellen Domain (cevi, pfadi, jubla, verein). Das Server-Layout ermittelt ihn aus dem Host
 * und reicht ihn hier hinein: So rendert schon der Server das richtige Logo und den richtigen Namen,
 * statt erst nach der Hydration vom Cevi-Standard umzuschalten.
 *
 * `levelName`: Ebene des Schichtplans dieser Subdomain über der Abteilung/Schar (z. B. «Bund», «Kanton»). Dann
 * heisst sie in der Oberfläche «Organisation» mit «Leitung» statt «Schar» mit «Scharleitung».
 */
const OrganizationContext = createContext<{ slug: OrganizationSlug; levelName: string | null } | null>(null);

export function OrganizationProvider({
  slug,
  levelName = null,
  children,
}: {
  slug: OrganizationSlug;
  levelName?: string | null;
  children: ReactNode;
}) {
  const org = ORGANIZATIONS[slug ?? 'cevi'];
  useEffect(() => {
    applyAccent(org.primaryColor);
  }, [org.primaryColor]);

  return <OrganizationContext.Provider value={{ slug, levelName }}>{children}</OrganizationContext.Provider>;
}

/** Slug aus dem Provider, null ohne Provider (dann bleibt es beim bisherigen Verhalten) */
export function useOrganizationSlug(): OrganizationSlug | null {
  return useContext(OrganizationContext)?.slug ?? null;
}

/** Konfiguration des Verbands dieser Domain (ohne Provider: Cevi), mit den Begriffen der Ebene */
export function useOrganization(): OrganizationConfig {
  const ctx = useContext(OrganizationContext);
  return organizationForLevel(ORGANIZATIONS[ctx?.slug ?? 'cevi'], ctx?.levelName);
}
