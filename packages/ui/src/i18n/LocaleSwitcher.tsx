'use client';

/**
 * Sprachwahl in den Apps: Cookie auf der Root-Domain (gilt für Login, Abteilungen und Hilfe), optional im
 * Profil speichern, dann die Server-Komponenten neu rendern (kein voller Reload, Eingaben bleiben erhalten).
 * Angezeigt wird der Wähler erst, wenn der Verband mehr als eine Sprache freigeschaltet hat (in der
 * Entwicklung zusätzlich mit der Pseudo-Sprache).
 */
import { createContext, useContext, useEffect, useRef, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  INTL_LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  PSEUDO_LOCALE,
  parseLocale,
  type Locale,
} from '@schichtplan/i18n';
import { getRootDomain, setDefaultIntlLocale } from '@schichtplan/shared';
import { cn } from '../utils/cn';
import { LocaleMenu, type LocaleMenuOption } from './LocaleMenu';

interface LocaleSettings {
  enabled: readonly Locale[];
  pseudo: boolean;
  pseudoAvailable: boolean;
}

const LocaleSettingsContext = createContext<LocaleSettings>({ enabled: ['de'], pseudo: false, pseudoAvailable: false });

/** Vom Server-Layout befüllt (`getRequestLocale`) */
export function LocaleSettingsProvider({ children, ...settings }: LocaleSettings & { children: ReactNode }) {
  const intlLocale = useIntlLocale();
  // Datums- und Zahlenformate ohne ausdrückliche Sprache (timezone.ts) folgen im Browser der aktiven Sprache.
  // Vor den Kindern setzen, damit schon deren erstes Rendern stimmt; auf dem Server nie (mehrere Sprachen gleichzeitig).
  if (typeof window !== 'undefined') setDefaultIntlLocale(intlLocale);
  return <LocaleSettingsContext.Provider value={settings}>{children}</LocaleSettingsContext.Provider>;
}

export function useLocaleSettings(): LocaleSettings {
  return useContext(LocaleSettingsContext);
}

/** Aktuelle Sprache als Kurzcode (de, fr …), egal ob next-intl `de-CH` (Apps) oder `de` (Landing mit Routing) liefert */
export function useAppLocale(): Locale {
  return parseLocale(useLocale()) ?? 'de';
}

/** BCP-47 für Datums- und Zahlenformate (de-CH, fr-CH …), auch auf der Landing mit Routing-Sprachen */
export function useIntlLocale(): string {
  return INTL_LOCALES[useAppLocale()];
}

function cookieDomain(hostname: string): string | null {
  // Lokal (localhost, demo.localhost, IP) nur für den eigenen Host: Browser lehnen «.localhost» teils ab
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || /^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    return null;
  }
  return getRootDomain(hostname);
}

/** Sprach-Cookie für alle Subdomains der Verbandsdomain setzen */
export function writeLocaleCookie(value: Locale | typeof PSEUDO_LOCALE) {
  const domain = cookieDomain(window.location.hostname);
  const parts = [
    `${LOCALE_COOKIE}=${value}`,
    'path=/',
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
    'samesite=lax',
    ...(domain ? [`domain=.${domain}`] : []),
    ...(window.location.protocol === 'https:' ? ['secure'] : []),
  ];
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie muss für next-intl auf dem Server lesbar sein
  document.cookie = parts.join('; ');
}

function readLocaleCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface LocaleSwitcherProps {
  /** Angemeldet: Wahl auch im Profil speichern (PATCH /api/auth/me) */
  onPersist?: (locale: Locale) => Promise<unknown>;
  /** Liste öffnet nach oben (z. B. im Footer) */
  placement?: 'bottom' | 'top';
  className?: string;
}

export function LocaleSwitcher({ onPersist, placement, className }: LocaleSwitcherProps) {
  const t = useTranslations('common.language');
  const current = useAppLocale();
  const { enabled, pseudo, pseudoAvailable } = useLocaleSettings();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (enabled.length < 2 && !pseudoAvailable) return null;

  const value = pseudo ? PSEUDO_LOCALE : current;
  const change = async (next: string) => {
    const locale = next === PSEUDO_LOCALE ? null : parseLocale(next);
    writeLocaleCookie(locale ?? PSEUDO_LOCALE);
    if (locale && onPersist) {
      try {
        await onPersist(locale);
      } catch {
        // Profil nicht erreichbar: Cookie reicht für dieses Gerät
      }
    }
    startTransition(() => router.refresh());
  };

  const options: LocaleMenuOption[] = [
    ...enabled.map((locale) => ({
      value: locale,
      label: LOCALE_LABELS[locale],
      lang: locale,
      code: locale.toUpperCase(),
    })),
    ...(pseudoAvailable ? [{ value: PSEUDO_LOCALE, label: 'Pseudo (Dev)', code: '··' }] : []),
  ];

  return (
    <LocaleMenu
      value={value}
      options={options}
      onChange={(next) => void change(next)}
      disabled={pending}
      ariaLabel={t('switch')}
      placement={placement}
      className={cn(pending && 'opacity-60', className)}
    />
  );
}

/**
 * Neues Gerät, angemeldet: Hat die Person im Profil eine Sprache gewählt, aber hier noch kein Sprach-Cookie,
 * gilt die Profilsprache (Cookie setzen und neu rendern). Ein vorhandenes Cookie gewinnt immer.
 */
export function useProfileLocaleSync(profileLocale: string | null | undefined) {
  const current = useAppLocale();
  const { enabled } = useLocaleSettings();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    const locale = parseLocale(profileLocale);
    if (!locale || !enabled.includes(locale) || readLocaleCookie()) return;
    done.current = true;
    writeLocaleCookie(locale);
    if (locale !== current) router.refresh();
  }, [profileLocale, enabled, current, router]);
}
