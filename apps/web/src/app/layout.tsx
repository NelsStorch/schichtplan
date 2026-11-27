import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';
import { ConsoleBanner, FeedbackProvider, OrganizationProvider, SkipLink, ThemeScript, UsageTracker, UmamiScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { LocaleSettingsProvider } from '@schichtplan/ui/i18n';
import { getRequestLocale } from '@schichtplan/ui/i18n/server';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { getRequestOrigin, ogImage, ogVersion, safeAccent } from '@schichtplan/ui/og';
import { CommandPalette, CommandPaletteProvider } from '@/components/command';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { PullToRefresh } from '@/components/PullToRefresh';
import { appName, getDepartmentPreview, previewTitle } from '@/lib/og';
import { departmentOgResponse, warmOgImage } from '@/lib/ogRender';
import { PortalProvider } from '@/lib/portal';

/**
 * Pro Abteilung (Subdomain) eigener Titel für Link-Vorschauen: Abteilungsname und -logo. Anlässe haben ihre
 * eigene Vorschau (events/[slug]/metadata.ts), soweit die Anlass-Seite sie auch ohne Login zeigt.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const department = await getDepartmentPreview();
  const brandName = org.name;
  // Vorschau: Abteilung zuerst (WhatsApp kürzt den Titel). Browser-Tab und Verlauf: wie die installierte App.
  const title = previewTitle(department?.name, brandName);
  const tabTitle = department ? appName(department.name) : brandName;
  // ?v= ändert sich mit Name, Logo und Farbe: Messenger holen dann das neue Bild statt der alten Kopie
  const version = [department?.name, department?.logoUrl, department?.primaryColor];
  const v = ogVersion(...version);
  const image = ogImage(`${origin}/og`, title, ...version);
  // Vorschaubild schon vorbereiten, damit es bereitliegt, wenn ein Messenger es abholt
  warmOgImage(departmentOgResponse);
  const t = await getTranslations('web.meta');
  const description = department ? t('deptDescription') : t('orgDescription', { orgName: org.orgName });
  return {
    metadataBase: new URL(origin),
    title: { default: tabTitle, template: `%s · ${brandName}` },
    description,
    robots: { index: false, follow: false },
    manifest: '/manifest.webmanifest',
    icons: {
      // Browser-Tab: Logo der Abteilung (klein gerechnet, ohne Hintergrund), sonst das Verbandslogo
      icon: department
        ? [{ url: `/app-icon?size=64&plain=1&v=${v}`, sizes: '64x64', type: 'image/png' }]
        : [{ url: org.logoUrl, type: 'image/svg+xml' }],
      // PNG, denn iOS kann kein SVG als Homescreen-Icon
      apple: { url: `/apple-touch-icon.png?v=${v}`, sizes: '180x180', type: 'image/png' },
    },
    appleWebApp: { capable: true, title: 'Schichtplan', statusBarStyle: 'black-translucent' },
    openGraph: { type: 'website', siteName: brandName, locale: 'de_CH', title, description, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

// Kein maximum-scale/user-scalable: Zoomen muss möglich bleiben (Barrierefreiheit).
// Das iOS-Auto-Zoom auf Inputs verhindern stattdessen 16px-Schriftgrössen in Feldern.
export async function generateViewport(): Promise<Viewport> {
  const { host } = await getRequestOrigin();
  const department = await getDepartmentPreview();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // Abteilungsfarbe: färbt die Browserleiste und den Rand der Vorschau in Discord/Telegram
    themeColor: safeAccent(department?.primaryColor ?? getOrganization(host).primaryColor),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { host } = await getRequestOrigin();
  const orgSlug = getOrganizationSlugFromHost(host);
  // Ebene der Abteilung (Region, Kanton, Bund …): bestimmt die Begriffe in der Oberfläche
  const department = await getDepartmentPreview();
  const i18n = await getRequestLocale(department?.defaultLocale ?? null);
  return (
    <html lang={i18n.intlLocale} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh]">
        <SkipLink />
        <NextIntlClientProvider>
        <LocaleSettingsProvider enabled={i18n.enabled} pseudo={i18n.pseudo} pseudoAvailable={i18n.pseudoAvailable}>
        <OrganizationProvider slug={orgSlug} levelName={department?.levelName ?? null}>
        <FeedbackProvider>
          <PortalProvider>
            <CommandPaletteProvider>
              {children}
              <CommandPalette />
              <PwaInstallBanner />
              <PullToRefresh />
            </CommandPaletteProvider>
          </PortalProvider>
          <ServiceWorkerRegister />
        </FeedbackProvider>
        </OrganizationProvider>
        </LocaleSettingsProvider>
        </NextIntlClientProvider>
        <UsageTracker app="web" />
        <UmamiScript host={host} />
        <ConsoleBanner />
      </body>
    </html>
  );
}
