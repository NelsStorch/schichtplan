'use client';

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
  if (!isOtherProviderAccount(user, org)) return null;
  const otherDb = getOrganizationByDbType(user!.provider).authProviderShort;
  return (
    <Callout tone="info" title={`Dein Konto ist mit ${otherDb} verbunden`}>
      <p className="mt-1 text-[13px] leading-relaxed text-fg">
        Hier zählen deine Rollen aus {org.authProviderShort} deshalb nicht: Einer {org.unitTerm} trittst du über ihren
        Link oder eine Einladung bei, und einen Schichtplan anlegen kann nur, wer mit {org.authProviderShort} angemeldet
        ist. Ein Konto kann nur mit einer Verbands-DB verbunden sein. Steht in {org.authProviderShort} eine andere
        E-Mail-Adresse, bekommst du mit «Mit {org.authProviderShort} anmelden» hier ein eigenes Konto mit deinen Rollen.
      </p>
    </Callout>
  );
}
