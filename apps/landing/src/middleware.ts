import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { getOrganizationTypeFromHost, isPageLoadRequest, reportPageLoad } from '@schichtplan/shared';

/**
 * Zählt Seitenaufrufe (siehe unten). Nur lokale Entwicklung: leitet /api/* an das Backend weiter (in Produktion
 * erledigt das Traefik, Requests auf /api erreichen Next.js dort gar nicht).
 * Die Landingpage hat keinen Mandanten, darum ohne x-tenant-slug.
 */
export function middleware(request: NextRequest, event: NextFetchEvent) {
  // Seitenaufrufe serverseitig zählen (nur Tagessumme pro Verband/App, siehe pageLoad.ts)
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    if (isPageLoadRequest(request.method, request.nextUrl.pathname, request.headers)) {
      const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
      event.waitUntil(reportPageLoad('landing', host.split(',')[0].trim(), process.env.INTERNAL_API_URL));
    }
    return NextResponse.next();
  }

  const backend = process.env.INTERNAL_API_URL;
  if (process.env.NODE_ENV !== 'development' || !backend) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  const headers = new Headers(request.headers);
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const detectedOrg = getOrganizationTypeFromHost(host);
  headers.set('x-tenant-org', process.env.DEV_TENANT_ORG ?? detectedOrg.toLowerCase());
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  // /api: lokaler Proxy zum Backend; Rest: Seitenaufrufe (ohne _next und Dateien mit Endung)
  matcher: ['/api/:path*', '/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
