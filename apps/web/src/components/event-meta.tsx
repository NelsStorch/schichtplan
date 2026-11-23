'use client';

import { Building2, Globe2, Network, ShieldCheck, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEventText } from '@/lib/eventText';
import {
  EVENT_ACCESS_TYPES,
  getEventAccessTypeConfig,
  type EventAccessType,
  type OrganizationConfig,
} from '@schichtplan/shared';
import { Badge, type BadgeTone, } from '@schichtplan/ui';

/** Icon pro Zugangs-Typ. Neuer Typ in EVENT_ACCESS_TYPES -> hier ein Icon ergänzen. */
const ACCESS_TYPE_ICONS: Record<EventAccessType, LucideIcon> = {
  PUBLIC: Globe2,
  CEVIDB_ALL: ShieldCheck,
  DEPARTMENT: Building2,
  DEPARTMENT_CEVIDB: Building2,
  WHITELIST: Network,
  WHITELIST_CEVIDB: Network,
};

export const ACCESS_TYPE_INFO = (Object.keys(EVENT_ACCESS_TYPES) as EventAccessType[]).map((key) => ({
  key,
  ...EVENT_ACCESS_TYPES[key],
  icon: ACCESS_TYPE_ICONS[key] ?? Users,
}));

export function getAccessTypeInfo(org?: OrganizationConfig | null) {
  return (Object.keys(EVENT_ACCESS_TYPES) as EventAccessType[])
    .filter((key) => org?.slug !== 'verein' || !EVENT_ACCESS_TYPES[key].ceviDb)
    .map((key) => ({
      key,
      ...getEventAccessTypeConfig(key, org),
      icon: ACCESS_TYPE_ICONS[key] ?? Users,
    }));
}

export function accessTypeIcon(type: EventAccessType): LucideIcon {
  return ACCESS_TYPE_ICONS[type] ?? Users;
}

export function AccessTypeBadge({
  type,
  leadersOnly,
  tone = 'neutral',
}: {
  type: EventAccessType;
  leadersOnly?: boolean;
  tone?: BadgeTone;
}) {
  const t = useTranslations('web.eventMeta');
  const info = useEventText().accessType(type);
  const Icon = accessTypeIcon(type);
  return (
    <Badge tone={tone}>
      <Icon /> {info.short}
      {leadersOnly && (
        <>
          <span aria-hidden>·</span>
          <UsersRound /> {t('leaders')}
        </>
      )}
    </Badge>
  );
}

/** Bildvorlagen für Anlässe; Bezeichnungen im Katalog `web.eventForm.banners.<id>` */
export const BANNER_PRESETS = [
  { id: 'chilbi', url: '/images/banners/chilbi.svg' },
  { id: 'sola', url: '/images/banners/sola.svg' },
  { id: 'lagerfeuer', url: '/images/banners/lagerfeuer.svg' },
  { id: 'grill', url: '/images/banners/grill.svg' },
  { id: 'huette', url: '/images/banners/huette.svg' },
  { id: 'weihnachten', url: '/images/banners/weihnachten.svg' },
] as const;
