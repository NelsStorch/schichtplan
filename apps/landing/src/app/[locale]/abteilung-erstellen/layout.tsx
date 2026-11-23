import type { Metadata } from 'next';
import { landingPageMetadata } from '@/lib/ogPages';
import { routing } from '@/i18n/routing';
import { DEFAULT_LOCALE, type Locale } from '@schichtplan/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  return landingPageMetadata('abteilung-erstellen', locale);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
