import '../globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import { LocaleSettingsProvider } from '@schichtplan/ui/i18n';
import { getRequestLocale } from '@schichtplan/ui/i18n/server';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  FeedbackProvider,
  OrganizationProvider,
  SkipLink,
  ThemeScript,
  ConsoleBanner,
  UsageTracker,
  UmamiScript,
  accentVars,
} from '@schichtplan/ui';
import type { Metadata, Viewport } from 'next';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { JsonLd } from '@/components/JsonLd';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';
import { DEFAULT_LOCALE, type Locale } from '@schichtplan/i18n';
import { routing } from '@/i18n/routing';
import { landingVocab } from '@/lib/landingVocab';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const t = await getTranslations({ locale, namespace: 'landing.meta' });
  const title = t('title', landingVocab(org, locale));
  const description = org.metaDescription;

  const image = ogImage(
    `${origin}/og${locale !== DEFAULT_LOCALE ? `?lang=${locale}` : ''}`,
    `${org.name}: Kostenlose Schicht- und Helferplanung für ${org.targetGroup}`,
  );

  const languages: Record<string, string> = {
    'x-default': `${origin}/`,
  };
  for (const loc of routing.locales) {
    languages[loc] = loc === DEFAULT_LOCALE ? `${origin}/` : `${origin}/${loc}`;
  }

  const canonical = locale === DEFAULT_LOCALE ? `${origin}/` : `${origin}/${locale}`;

  const ogLocales: Record<Locale, string> = {
    de: 'de_CH',
    fr: 'fr_CH',
    it: 'it_CH',
    en: 'en_CH',
  };

  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${org.name}` },
    description,
    authors: [{ name: org.name, url: canonical }],
    creator: `${org.name} Team`,
    publisher: org.name,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical,
      languages,
    },
    icons: {
      icon: [{ url: org.logoUrl, type: 'image/svg+xml' }],
      // PNG, denn iOS kann kein SVG als Homescreen-Icon
      apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    },
    openGraph: {
      type: 'website',
      siteName: org.name,
      locale: ogLocales[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
      title,
      description,
      url: canonical,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    category: 'technology',
  };
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Viewport> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: org.primaryColor,
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!routing.locales.includes(rawLocale as Locale)) {
    notFound();
  }
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const i18n = await getRequestLocale(null, locale, routing.locales);

  return (
    <html
      lang={i18n.intlLocale}
      className={`${fontVariables} scroll-smooth`}
      data-scroll-behavior="smooth"
      style={accentVars(org.primaryColor) as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <JsonLd origin={origin} locale={locale} org={org} />
        <link rel="alternate" type="text/markdown" href="/llms.txt" title="LLM context" />
        <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="Full LLM context" />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-fg antialiased flex flex-col selection:bg-accent selection:text-white grain">
        <SkipLink />
        <NextIntlClientProvider>
          <LocaleSettingsProvider enabled={i18n.enabled} pseudo={i18n.pseudo} pseudoAvailable={i18n.pseudoAvailable}>
            <OrganizationProvider slug={getOrganizationSlugFromHost(host)}>
              <FeedbackProvider>{children}</FeedbackProvider>
            </OrganizationProvider>
          </LocaleSettingsProvider>
        </NextIntlClientProvider>
        <UsageTracker app="landing" />
        <UmamiScript host={host} />
        <ConsoleBanner />
      </body>
    </html>
  );
}
