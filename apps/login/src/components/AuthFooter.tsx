
import { ArrowLeft } from 'lucide-react';
import { helpUrl, imprintUrl, privacyUrl, statusUrl, termsUrl } from '@schichtplan/shared/redirect';
import { useOrganization } from '@schichtplan/ui';
import { LocaleSwitcher } from '@schichtplan/ui/i18n';
import { useTranslations } from 'next-intl';

export interface AuthFooterProps {
  returnTo?: string | null;
  landingHref?: string;
  showBackLink?: boolean;
}

/** Fusszeile der Login-Unterseiten mit Status, Hilfe, Datenschutz und optionalem Zurück-Link */
export function AuthFooter({ returnTo, landingHref = '/', showBackLink = false }: AuthFooterProps = {}) {
  const backTarget = returnTo ?? landingHref;
  const org = useOrganization();
  const appName = org.name;
  const t = useTranslations('common.footer');

  return (
    <footer className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-fg-subtle sm:px-8">
      <span>
        &copy; {new Date().getFullYear()} {appName}
        {org.independentNotice && <> · {org.independentNotice}</>}
      </span>
      <div className="flex flex-wrap items-center gap-5">
        <a href={statusUrl('/', org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          {t('status')}
        </a>
        <a href={helpUrl('/start/anmelden/', org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          {t('loginHelp')}
        </a>
        <a href={privacyUrl(org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          {t('privacy')}
        </a>
        <a href={termsUrl(org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          {t('terms')}
        </a>
        <a href={imprintUrl(org.domain)} className="font-medium text-fg-muted transition hover:text-fg">
          {t('imprint')}
        </a>
        <LocaleSwitcher placement="top" />
        {showBackLink && (
          <a
            href={backTarget}
            className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            {t('backWithoutLogin')}
          </a>
        )}
      </div>
    </footer>
  );
}
