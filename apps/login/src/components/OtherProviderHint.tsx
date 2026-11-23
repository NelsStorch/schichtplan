'use client';

import { useTranslations } from 'next-intl';
import { getOrganizationByDbType, type OrganizationConfig, type UserDto } from '@schichtplan/shared';
import { Callout } from '@schichtplan/ui';

/** Ist das Konto mit der Verbands-DB eines anderen Verbands verbunden als die Domain (z. B. Cevi-Konto auf Jubla)? */
export function isOtherProviderAccount(user: Pick<UserDto, 'provider' | 'providerId'> | null, org: OrganizationConfig) {
  return Boolean(user?.providerId && user.provider && org.slug !== 'verein' && user.provider !== org.dbType);
}

/**
 * Hinweis für Konten eines anderen Verbands (z. B. per Passwort angemeldetes Cevi-Konto auf jubla-schichtplan.ch):
 * Die Rollen aus der Verbands-DB dieser Domain zählen nicht, denn ein Konto hängt an genau einer Verbands-DB.
 */
export function OtherProviderHint({
  user,
  org,
}: {
  user: Pick<UserDto, 'provider' | 'providerId'> | null;
  org: OrganizationConfig;
}) {
  const t = useTranslations('login.otherProviderHint');
  if (!isOtherProviderAccount(user, org)) return null;
  const otherDb = getOrganizationByDbType(user!.provider).authProviderShort;
  return (
    <Callout tone="info" title={t('title', { otherDb })}>
      <p className="mt-1 text-[13px] leading-relaxed text-fg">
        {t('text', {
          otherDb,
          authProviderShort: org.authProviderShort,
          unitTerm: org.unitTerm,
        })}
      </p>
    </Callout>
  );
}
