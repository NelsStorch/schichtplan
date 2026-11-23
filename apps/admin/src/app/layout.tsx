import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConsoleBanner, FeedbackProvider, OrganizationProvider, SkipLink, ThemeScript, accentVars } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { getRequestLocale } from '@schichtplan/ui/i18n/server';
import { NextIntlClientProvider } from 'next-intl';
import { getRequestOrigin } from '@schichtplan/ui/og';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const title = `Admin · ${org.name}`;
  return {
    title,
    description: `Verwaltung für globale Admins (Cevi, Pfadi, Jubla und Vereine), aufgerufen über ${org.domain}`,
    robots: { index: false, follow: false },
    openGraph: { siteName: org.name, locale: 'de_CH', title },
    icons: {
      icon: [{ url: org.logoUrl, type: 'image/svg+xml' }],
      apple: org.logoUrl,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { host } = await getRequestOrigin();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: getOrganization(host).primaryColor,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Verband der Domain (admin.<verband>-schichtplan.ch) schon auf dem Server: Logo, Name und Akzentfarbe
  // stimmen ab dem ersten Rendern. Verwaltet werden trotzdem immer alle Verbände.
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const i18n = await getRequestLocale(null);
  return (
    <html
      lang={i18n.intlLocale}
      className={fontVariables}
      style={accentVars(org.primaryColor) as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh]">
        <SkipLink />
        <NextIntlClientProvider>
          <OrganizationProvider slug={getOrganizationSlugFromHost(host)}>
            <ConsoleBanner />
            <FeedbackProvider>{children}</FeedbackProvider>
          </OrganizationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
