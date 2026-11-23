'use client';

import { LifeBuoy, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { helpUrl, loginBaseUrl } from '@schichtplan/shared';
import { useAppLocale } from '@schichtplan/ui/i18n';
import { NotFoundView, useOrganization } from '@schichtplan/ui';

export default function NotFound() {
  const org = useOrganization();
  const locale = useAppLocale();
  const t = useTranslations('landing.errors');
  return (
    <NotFoundView
      homeHref="/"
      homeLabel={t('home')}
      secondaryActions={[
        {
          label: t('helpCenter'),
          href: helpUrl('/', org.domain, locale),
          external: true,
          icon: <LifeBuoy className="size-3.5" />,
        },
        {
          label: t('centralLogin'),
          href: loginBaseUrl(org.domain),
          external: true,
          icon: <LogIn className="size-3.5" />,
        },
      ]}
    />
  );
}
