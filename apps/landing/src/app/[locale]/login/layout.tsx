import type { Metadata } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';
import { localeAlternates, routing } from '@/i18n/routing';
import { DEFAULT_LOCALE, type Locale } from '@schichtplan/i18n';

const LOGIN_META: Record<Locale, { title: string; description: string }> = {
  de: {
    title: 'Weiterleitung zum Login',
    description: 'Du wirst zum zentralen Login des Schichtplans weitergeleitet.',
  },
  fr: {
    title: 'Redirection vers la connexion',
    description: 'Vous allez être redirigé vers le portail de connexion.',
  },
  it: {
    title: 'Reindirizzamento al login',
    description: 'Verrai reindirizzato al portale di accesso.',
  },
  en: {
    title: 'Redirecting to login',
    description: 'You will be redirected to the central login portal.',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  const meta = LOGIN_META[locale];
  const { origin } = await getRequestOrigin();
  return {
    title: meta.title,
    description: meta.description,
    // Eigene URL statt der geerbten der Startseite
    alternates: localeAlternates(origin, locale, '/login'),
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
