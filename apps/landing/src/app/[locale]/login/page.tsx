'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getLoginUrl } from '@schichtplan/shared';

function RedirectContent() {
  const searchParams = useSearchParams();
  const t = useTranslations('landing.redirect');

  useEffect(() => {
    const returnTo = searchParams.get('return_to') || window.location.origin;
    window.location.href = getLoginUrl(returnTo);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
      <div className="animate-pulse flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
        <span>{t('login')}</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
