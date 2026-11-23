'use client';

import { useEffect } from 'react';
import { CalendarDays, Clock, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorView, useOrganization } from '@schichtplan/ui';
import { usePortal } from '@/lib/portal';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('web.errorPage');
  const { department } = usePortal();
  const org = useOrganization();

  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <ErrorView
      error={error}
      reset={reset}
      departmentName={department?.name}
      departmentLogoUrl={department?.logoUrl}
      homeHref="/"
      homeLabel={t('homeLabel')}
      secondaryActions={[
        {
          label: t('allEvents'),
          href: '/',
          icon: <CalendarDays className="size-3.5" />,
        },
        {
          label: t('myShifts'),
          href: '/meine-schichten',
          icon: <Clock className="size-3.5" />,
        },
        {
          label: t('mainPortal'),
          href: `https://${org.domain}`,
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
