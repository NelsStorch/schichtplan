import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConsoleBanner, OrganizationProvider, SkipLink, ThemeScript, UsageTracker, UmamiScript, accentVars } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { LocaleSettingsProvider } from '@schichtplan/ui/i18n';
import { getRequestLocale } from '@schichtplan/ui/i18n/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';

export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const [t, locale] = await Promise.all([getTranslations('login.meta'), getLocale()]);
  const org = getOrganization(host, locale);
  const title = t('rootTitle', { name: org.name });
  const description = t('rootDescription', { name: org.name });
  const image = ogImage(`${origin}/og`, t('rootImageTitle', { name: org.name }));
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${org.name}` },
    description,
    icons: {
      icon: [{ url: org.logoUrl, type: 'image/svg+xml' }],
      // PNG, denn iOS kann kein SVG als Homescreen-Icon
      apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    },
    openGraph: { type: 'website', siteName: org.name, locale: locale.replace('-', '_'), title, description, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: org.primaryColor,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verband schon auf dem Server aus dem Host bestimmen: Logo und Name stimmen ab dem ersten Rendern
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const orgSlug = getOrganizationSlugFromHost(host);
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
          <LocaleSettingsProvider enabled={i18n.enabled} pseudo={i18n.pseudo} pseudoAvailable={i18n.pseudoAvailable}>
            <OrganizationProvider slug={orgSlug}>{children}</OrganizationProvider>
          </LocaleSettingsProvider>
        </NextIntlClientProvider>
        <UsageTracker app="login" />
        <UmamiScript host={host} />
        <ConsoleBanner />
      </body>
    </html>
  );
}
