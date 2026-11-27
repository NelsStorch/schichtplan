'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reagiert live auf eine CSS-Media-Query. Serverseitig (und beim ersten Render) gilt `serverFallback`.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback
  );
}

/** Unter dem Tailwind-Breakpoint `md` (768 px): Handy-Layout */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}
