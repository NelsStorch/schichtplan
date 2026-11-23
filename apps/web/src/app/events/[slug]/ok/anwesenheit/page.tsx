'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EventAttendancePanel } from '@/components/EventAttendancePanel';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';

export default function AttendancePage() {
  const { event, base, reload, permissions } = useOkEvent();
  const router = useRouter();
  const t = useTranslations('web.ok.attendance');

  return (
    <div>
      <OkPageHeader
        title={t('title')}
        description={t('desc')}
        help="/ok/anwesenheit/"
      />
      <EventAttendancePanel
        event={event}
        canEditSettings={permissions.canEditSettings}
        onOpenSettings={() => router.push(`${base}/einstellungen#anwesenheit`)}
        onChanged={reload}
      />
    </div>
  );
}

