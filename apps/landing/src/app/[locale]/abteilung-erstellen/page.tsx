'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getDepartmentCreationUrl } from '@schichtplan/shared';
import { useOrganization } from '@schichtplan/ui';
import { useAppLocale } from '@schichtplan/ui/i18n';
import { landingVocab } from '@/lib/landingVocab';

function RedirectContent() {
  const searchParams = useSearchParams();
  const t = useTranslations('landing.redirect');
  const vocab = landingVocab(useOrganization(), useAppLocale());
  const targetUrl =
    typeof window !== 'undefined'
      ? getDepartmentCreationUrl(searchParams.get('return_to') || window.location.origin)
      : '/abteilung-erstellen';

  useEffect(() => {
    const returnTo = searchParams.get('return_to') || window.location.origin;
    window.location.href = getDepartmentCreationUrl(returnTo);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-300 text-sm p-4 text-center">
      <div className="animate-pulse flex items-center gap-2 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
        <span>{t('createUnit', vocab)}</span>
      </div>
      <p className="text-xs text-slate-500">
        {t('fallback')}{' '}
        <a href={targetUrl} className="text-rose-400 hover:underline">
          {t('clickHere')}
        </a>
      </p>
    </div>
  );
}

export default function CreateDepartmentRedirectPage() {
  const t = useTranslations('landing.redirect');
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          {t('loading')}
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
