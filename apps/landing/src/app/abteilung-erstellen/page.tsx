'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getDepartmentCreationUrl } from '@schichtplan/shared';

function RedirectContent() {
  const searchParams = useSearchParams();
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
        <span>Weiterleitung zur Einrichtung deiner Abteilung...</span>
      </div>
      <p className="text-xs text-slate-500">
        Falls die Weiterleitung nicht automatisch startet:{' '}
        <a href={targetUrl} className="text-rose-400 hover:underline">
          Hier klicken
        </a>
      </p>
    </div>
  );
}

export default function CreateDepartmentRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          Laden...
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
