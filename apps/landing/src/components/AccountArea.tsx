'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import { getDepartmentCreationUrl, getDepartmentUrl, getLandingUrl, type UserDto } from '@schichtplan/shared';
import { Avatar, buttonClasses, useOrganization } from '@schichtplan/ui';
import { useAppLocale } from '@schichtplan/ui/i18n';
import { useTranslations } from 'next-intl';
import { landingVocab } from '@/lib/landingVocab';
import { Link } from '@/i18n/navigation';

/**
 * Die Landingpage wird auf dem Server gerendert. Nur die Teile, die von der angemeldeten Person abhängen
 * (Cookie gilt für alle Subdomains), laufen im Browser: so bleibt das JavaScript für die Startseite klein.
 */
const MeContext = createContext<UserDto | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** Kopfzeile: Name statt «Anmelden», sobald jemand angemeldet ist */
export function HeaderAccount() {
  const me = useContext(MeContext);
  const t = useTranslations('landing.account');

  if (!me) {
    return (
      <Link
        href="/login"
        className={buttonClasses({
          variant: 'primary',
          size: 'sm',
          className: 'gap-1.5 text-xs font-semibold px-3 sm:px-4',
        })}
      >
        <LogIn className="size-3.5" />
        <span>{t('login')}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {me.homeDepartment && (
        <a
          href={getDepartmentUrl(me.homeDepartment.slug, '/', me.homeDepartment.organization)}
          className={buttonClasses({
            variant: 'secondary',
            size: 'sm',
            className: 'hidden sm:inline-flex text-xs font-semibold gap-1.5 px-3',
          })}
        >
          <span>{me.homeDepartment.name}</span>
          <ArrowRight className="size-3 text-fg-subtle" />
        </a>
      )}
      <Link
        href="/profil"
        className="flex items-center gap-1.5 sm:gap-2 rounded-full py-1 pl-1 pr-2.5 sm:pr-3 text-xs font-semibold text-fg transition hover:bg-surface-2"
        aria-label={t('profileLabel')}
      >
        <Avatar name={me.ceviName || me.firstName} size="sm" highlight className="size-7 text-[10px]" />
        <span className="max-w-20 sm:max-w-28 truncate">{me.ceviName || me.firstName}</span>
      </Link>
    </div>
  );
}

/** Hauptknopf: zur eigenen Abteilung, zu den eigenen Schichten oder zum Login */
export function PrimaryCta({ loginLabel, className }: { loginLabel: string; className: string }) {
  const me = useContext(MeContext);
  const t = useTranslations('landing.account');
  const vocab = landingVocab(useOrganization(), useAppLocale());
  const classes = buttonClasses({ variant: 'primary', size: 'md', className });

  if (me?.homeDepartment) {
    return (
      <a href={getDepartmentUrl(me.homeDepartment.slug, '/', me.homeDepartment.organization)} className={classes}>
        <span>{t('toUnit', { ...vocab, name: me.homeDepartment.name })}</span>
        <ArrowRight className="size-4" />
      </a>
    );
  }

  if (me) {
    return (
      <Link href="/profil" className={classes}>
        <span>{t('toShifts', { name: me.ceviName || me.firstName })}</span>
        <ArrowRight className="size-4" />
      </Link>
    );
  }

  return (
    <Link href="/login" className={classes}>
      <LogIn className="size-4" />
      <span>{loginLabel}</span>
    </Link>
  );
}

/** Abteilung/Schar anlegen passiert im Login-Portal (nur Leitung mit Verband-Login) */
export function CreateDepartmentButton({ className, href }: { className?: string; href?: string }) {
  const t = useTranslations('landing.account');
  const vocab = landingVocab(useOrganization(), useAppLocale());
  const [targetHref, setTargetHref] = useState(href || '/abteilung-erstellen');

  useEffect(() => {
    if (!href) {
      setTargetHref(getDepartmentCreationUrl(getLandingUrl()));
    }
  }, [href]);

  return (
    <a
      href={href || targetHref}
      className={
        className ??
        'font-semibold text-accent-ink hover:underline inline-flex items-center gap-1'
      }
    >
      <span>{t('createUnit', vocab)}</span>
      <ArrowRight className="size-3" />
    </a>
  );
}
