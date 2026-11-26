'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  LOCALE_LABELS,
  PSEUDO_LOCALE,
  parseLocale,
  type Locale,
} from '@schichtplan/i18n';
import { LocaleMenu, useLocaleSettings, writeLocaleCookie, type LocaleMenuOption } from '@schichtplan/ui/i18n';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export interface LandingLocaleSwitcherProps {
  className?: string;
  /** Liste öffnet nach oben (z. B. im Footer) */
  placement?: 'bottom' | 'top';
}

/**
 * Sprachwähler für die Landingpage mit lokalisiertem Routing:
 * Schreibt das sprachweite Cookie auf der Root-Domain und wechselt zur lokalisierten URL (/fr, /en, etc.).
 */
export function LandingLocaleSwitcher({ className, placement }: LandingLocaleSwitcherProps) {
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

  const options: LocaleMenuOption[] = [
    ...routing.locales.map((loc) => ({
      value: loc,
      label: LOCALE_LABELS[loc],
      lang: loc,
      code: loc.toUpperCase(),
    })),
    ...(pseudoAvailable ? [{ value: PSEUDO_LOCALE, label: 'Pseudo (Dev)', code: '··' }] : []),
  ];

  return (
    <LocaleMenu
      value={value}
      options={options}
      onChange={change}
      disabled={pending}
      ariaLabel={`${t('switch')} / Sprache`}
      placement={placement}
      className={className}
    />
  );
}
