import { ShieldCheck, UserCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getOrganization, type OrganizationConfig } from '@schichtplan/shared';
import { landingVocab } from '@/lib/landingVocab';

export function HitobitoIsometricGraphic({
  className = '',
  org,
}: {
  className?: string;
  org?: OrganizationConfig;
}) {
  const locale = useLocale();
  const t = useTranslations('landing.graphics');
  const vocab = landingVocab(org ?? getOrganization(null, locale), locale);
  const authProvider = vocab.auth;

  return (
    <div className={`relative flex flex-col gap-3 select-none w-full max-w-md mx-auto py-2 ${className}`}>
      {/* Option 1: Verbands-/Hitobito Login */}
      <div className="rounded-xl border border-line bg-surface/90 p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-3 transition-all hover:border-line-strong">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0 text-accent font-bold">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-fg">{authProvider}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-success-ink">
                {t('forLeaders')}
              </span>
            </div>
            <p className="text-2xs text-fg-subtle truncate mt-0.5">
              {t('leadersText', vocab)}
            </p>
          </div>
        </div>
        <div className="shrink-0 hidden xs:block sm:block">
          <span className="text-[11px] font-mono text-fg-subtle bg-surface-2 px-2 py-1 rounded-md border border-line">
            {t('oneClick')}
          </span>
        </div>
      </div>

      {/* Option 2: Schnellanmeldung ohne Passwort */}
      <div className="rounded-xl border border-line bg-surface/90 p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-3 transition-all hover:border-line-strong">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-500 font-bold">
            <UserCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-fg">{t('nicknameBirth', vocab)}</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                {t('forHelpers')}
              </span>
            </div>
            <p className="text-2xs text-fg-subtle truncate mt-0.5">
              {t('helpersText')}
            </p>
          </div>
        </div>
        <div className="shrink-0 hidden xs:block sm:block">
          <span className="text-[11px] font-mono text-success-ink font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
            {t('noAccount')}
          </span>
        </div>
      </div>
    </div>
  );
}

export const CeviDbIsometricGraphic = HitobitoIsometricGraphic;
export const AuthIsometricGraphic = HitobitoIsometricGraphic;

