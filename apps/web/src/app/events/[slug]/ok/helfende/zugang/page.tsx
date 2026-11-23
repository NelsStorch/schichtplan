'use client';

import { useTranslations } from 'next-intl';
import { EventAccessPanel } from '@/components/EventAccessPanel';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';

export default function AccessPage() {
  const { event } = useOkEvent();
  const t = useTranslations('web.ok.helpers.accessPage');

  return (
    <div>
      <OkPageHeader
        title={t('title')}
        description={t('desc')}
        help="/ok/zugangs-links/"
      />
      <EventAccessPanel event={event} />
    </div>
  );
}

