'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { OrganizationConfig } from '@schichtplan/shared';
import { ThemeToggle } from '@schichtplan/ui';
import { useTranslations } from 'next-intl';
import { useAppLocale } from '@schichtplan/ui/i18n';
import { BrandLogo } from '@/components/BrandLogo';
import { LandingLocaleSwitcher } from './LandingLocaleSwitcher';
import { Link } from '@/i18n/navigation';

/** Gemeinsamer Rahmen der Rechtsseiten (Datenschutz, Nutzungsbedingungen, Impressum) */
export function LegalPage({
  org,
  title,
  intro,
  stand,
  children,
}: {
  org: OrganizationConfig;
  title: string;
  intro?: ReactNode;
  stand?: string;
  children: ReactNode;
}) {
  const t = useTranslations('landing.legal');
  const locale = useAppLocale();

  return (
    <div className="min-h-[100dvh] bg-canvas text-fg">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-campfire opacity-60"
      />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-4" />{' '}
          <BrandLogo logoUrl={org.logoUrl} alt={org.name} className="size-7" />{' '}
          {org.name}
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <LandingLocaleSwitcher />
        </div>
      </header>

      <main
        id="inhalt"
        className="mx-auto w-full max-w-3xl space-y-10 px-4 pb-20 pt-4 text-[15px] leading-relaxed text-fg-muted sm:px-6 [&_a]:font-medium [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-fg"
      >
        {locale !== 'de' && (
          <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-fg flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                {t('originalTitle')}
              </p>
              <p className="mt-0.5 text-fg-muted">
                {t('originalText')}
              </p>
            </div>
          </div>
        )}

        {/* Rechtstext nur auf Deutsch: Sprache auszeichnen (Screenreader, Übersetzungsfunktion des Browsers) */}
        <div lang="de" className="space-y-10">
        <div className="space-y-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {title}
          </h1>
          {intro}
          {stand && <p className="text-sm text-fg-subtle">{t('updated', { date: stand })}</p>}
        </div>
        {children}
        </div>
        <nav
          aria-label={t('navLabel')}
          className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm"
        >
          <Link href="/datenschutz">{t('privacy')}</Link>
          <Link href="/nutzungsbedingungen">{t('terms')}</Link>
          <Link href="/impressum">{t('imprint')}</Link>
        </nav>
      </main>
    </div>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-fg-subtle">
      {children}
    </ul>
  );
}

/** Rechtsseiten: nicht in Suchmaschinen, keine Kopie im Cache */
export const LEGAL_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  'max-snippet': 0,
} as const;
