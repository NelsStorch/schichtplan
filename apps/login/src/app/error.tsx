'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ErrorView, useOrganization } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('login.error');
  useEffect(() => {
    console.error('Unhandled login error:', error);
  }, [error]);

  const orgDomain = useOrganization().domain;

  return (
    <ErrorView
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel={t('backToLogin')}
      secondaryActions={[
        {
          label: `Hauptportal (${orgDomain})`,
          href: getLandingUrl(),
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
