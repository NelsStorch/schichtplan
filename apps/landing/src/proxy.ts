import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { LOCALE_COOKIE, getEnabledLocales } from '@schichtplan/i18n';
import { getOrganizationTypeFromHost, isPageLoadRequest, reportPageLoad } from '@schichtplan/shared';
import { preferredLocalePath, routing } from './i18n/routing';

const handleI18nRouting = createIntlMiddleware(routing);

function requestHost(request: NextRequest): string {
  return (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').split(',')[0].trim();
}

/** Umleitung einer Seite ohne Sprach-Präfix auf die bevorzugte Sprache (Logik in `preferredLocalePath`) */
export function preferredLocaleRedirect(request: NextRequest): URL | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const path = preferredLocalePath({
    pathname: request.nextUrl.pathname,
    cookie: request.cookies.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: request.headers.get('accept-language'),
    enabled: getEnabledLocales(getOrganizationTypeFromHost(requestHost(request)), process.env.I18N_ENABLED_LOCALES),
  });
  if (!path) return null;
  const target = new URL(request.nextUrl);
  target.pathname = path;
  return target;
}

/**
 * Zählt Seitenaufrufe und steuert das Sprach-Routing (/fr, /en, lokalisierte Pfade via next-intl).
 * Nur lokale Entwicklung: leitet /api/* an das Backend weiter (in Produktion
 * erledigt das Traefik, Requests auf /api erreichen Next.js dort gar nicht).
 * Die Landingpage hat keinen Mandanten, darum ohne x-tenant-slug.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  // Seitenaufrufe serverseitig zählen (nur Tagessumme pro Verband/App, siehe pageLoad.ts)
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    const redirectTo = preferredLocaleRedirect(request);
    if (redirectTo) {
      // Kein Seitenaufruf zählen: das Ziel der Umleitung zählt
      const response = NextResponse.redirect(redirectTo, 307);
      // Antwort hängt von Cookie und Browsersprache ab: Caches dürfen sie nicht für alle wiederverwenden
      response.headers.set('Vary', 'Cookie, Accept-Language');
      return response;
    }
    if (isPageLoadRequest(request.method, request.nextUrl.pathname, request.headers)) {
      event.waitUntil(reportPageLoad('landing', requestHost(request), process.env.INTERNAL_API_URL));
    }
    return handleI18nRouting(request);
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
  // /api: lokaler Proxy zum Backend; Rest: internationalisierte Pfade & Seitenaufrufe
  // (ohne statische Dateien, _next, Robots, Sitemap, OG, llms.txt, datenschutz/kontakt)
  matcher: [
    '/api/:path*',
    '/((?!api/|datenschutz/kontakt|_next/|images/|favicon\\.ico|apple-touch-icon\\.png|robots\\.txt|sitemap\\.xml|og|llms\\.txt|llms-full\\.txt|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};
