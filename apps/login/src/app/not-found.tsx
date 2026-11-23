'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { NotFoundView, useOrganization } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

export default function NotFound() {
  const t = useTranslations('login.error');
  const orgDomain = useOrganization().domain;

  return (
    <NotFoundView
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
