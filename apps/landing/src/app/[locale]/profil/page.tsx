'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { ArrowLeft } from 'lucide-react';
import { getLoginUrl, getRootDomain, type UserDto } from '@schichtplan/shared';
import { Callout, ProfileView, ThemeToggle, useOrganization } from '@schichtplan/ui';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * `?von=` aus dem Konto-Dialog einer Abteilungs-App: nur Adressen derselben Verbands-Domain zulassen,
 * damit die Seite nicht als Weiterleitung auf fremde Seiten missbraucht werden kann.
 */
function readReturnTarget(): { href: string; label: string } | null {
  const params = new URLSearchParams(window.location.search);
  const von = params.get('von');
  if (!von) return null;
  try {
    const url = new URL(von);
    const root = getRootDomain(window.location.hostname);
    const sameDomain = url.hostname === root || url.hostname.endsWith(`.${root}`);
    const protocolOk = url.protocol === 'https:' || (root === 'localhost' && url.protocol === 'http:');
    if (!sameDomain || !protocolOk || url.username || url.password) return null;
    const name = params.get('name')?.trim().slice(0, 80);
    return { href: url.toString(), label: name || url.hostname };
  } catch {
    return null;
  }
}

/** Profilseite auf der Startseite (cevi-schichtplan.ch/profil), gleicher Inhalt wie in den Abteilungs-Apps */
export default function ProfilePage() {
  const org = useOrganization();
  const [user, setUser] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<{ href: string; label: string } | null>(null);

  useEffect(() => {
    setReturnTarget(readReturnTarget());
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = getLoginUrl(window.location.href);
        return;
      }
      if (!res.ok) throw new Error();
      setUser((await res.json()) as UserDto);
    })().catch(() => setError('Profil konnte nicht geladen werden.'));
  }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas text-fg">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-campfire opacity-80" />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        {returnTarget ? (
          <a
            href={returnTarget.href}
            className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4 shrink-0" /> <span className="truncate">Zurück zu {returnTarget.label}</span>
          </a>
        ) : (
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg">
            <ArrowLeft className="size-4" /> <BrandLogo logoUrl={org.logoUrl} alt={org.name} className="size-7" /> {org.name}
          </Link>
        )}
        <ThemeToggle />
      </header>

      <main id="inhalt" className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        {user ? (
          <ProfileView user={user} onUserChange={setUser} />
        ) : error ? (
          <Callout tone="danger">{error}</Callout>
        ) : (
          <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-busy />
        )}
      </main>
    </div>
  );
}
