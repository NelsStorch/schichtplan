'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import {
  LOCALE_LABELS,
  PSEUDO_LOCALE,
  parseLocale,
  type Locale,
} from '@schichtplan/i18n';
import { useLocaleSettings, writeLocaleCookie } from '@schichtplan/ui/i18n';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export interface LandingLocaleSwitcherProps {
  className?: string;
  selectClassName?: string;
}

/**
 * Sprachwähler für die Landingpage mit lokalisiertem Routing:
 * Schreibt das sprachweite Cookie auf der Root-Domain und wechselt zur lokalisierten URL (/fr, /en, etc.).
 */
export function LandingLocaleSwitcher({ className, selectClassName }: LandingLocaleSwitcherProps) {
  const t = useTranslations('common.language');
  const rawLocale = useLocale();
  const current = (parseLocale(rawLocale) ?? 'de') as Locale;
  const { pseudo, pseudoAvailable } = useLocaleSettings();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const value = pseudo ? PSEUDO_LOCALE : current;

  const change = (next: string) => {
    if (next === PSEUDO_LOCALE) {
      writeLocaleCookie(PSEUDO_LOCALE);
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const nextLocale = parseLocale(next) ?? 'de';
    writeLocaleCookie(nextLocale);
    startTransition(() => {
      // router.replace mit Ziel-Locale nutzt automatisch die konfigurierten Pathnames
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <label
      className={`inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition ${
        pending ? 'opacity-50 pointer-events-none' : ''
      } ${className ?? ''}`}
    >
      <Languages className="size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      <span className="sr-only">{t('switch')}</span>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label="Sprache / Langue"
        className={`cursor-pointer appearance-none bg-transparent font-medium text-fg-muted hover:text-fg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded pr-1 ${
          selectClassName ?? ''
        }`}
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc} lang={loc} className="bg-surface text-fg">
            {LOCALE_LABELS[loc]}
          </option>
        ))}
        {pseudoAvailable && (
          <option value={PSEUDO_LOCALE} className="bg-surface text-fg">
            Pseudo (Dev)
          </option>
        )}
      </select>
    </label>
  );
}
