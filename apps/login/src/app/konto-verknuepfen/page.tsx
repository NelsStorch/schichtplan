'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { Button, Callout, BrandLogo, Field, Input, ThemeToggle, useOrganization } from '@schichtplan/ui';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';

/**
 * Nach dem Cevi.DB-Login: Es gibt schon ein Konto mit Passwort und derselben E-Mail.
 * Mit dem Passwort wird es mit Cevi.DB verknüpft (ein Konto für beides). Ohne Passwort kein Login,
 * weil es zwei Konten mit derselben E-Mail nicht geben darf.
 */
function LinkAccount() {
  const t = useTranslations('login.linkAccount');
  const searchParams = useSearchParams();
  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string | null; name: string; twoFactorRequired?: boolean } | null>(null);
  const [missing, setMissing] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Einladung vom Login-Link: bleibt auch beim Abbrechen erhalten
  const [inviteToken, setInviteToken] = useState('');

  useEffect(() => {
    setReturnTo(cleanReturnTo(searchParams.get('return_to')));
    setInviteToken(searchParams.get('invite')?.trim() || '');
    fetch('/api/auth/cevidb/link', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const loaded = await res.json();
        setInfo(loaded);
        if (loaded.twoFactorRequired) setTwoFactorRequired(true);
      })
      .catch(() => setMissing(true));
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/cevidb/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...(twoFactorRequired || code ? { code } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.twoFactorRequired) setTwoFactorRequired(true);
      if (!res.ok) throw new Error(data.error || t('failed'));
      setDone(true);
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
      setSaving(false);
    }
  };

  const cancel = async () => {
    await fetch('/api/auth/cevidb/link', { method: 'DELETE' }).catch(() => undefined);
    window.location.href = withReturnTo('/', returnTo, inviteToken);
  };

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{org.name}</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16">
        {missing ? (
          <div className="animate-fade-up space-y-5">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              {t('expiredTitle')}
            </h1>
            <p className="text-[15px] leading-relaxed text-fg-muted">
              {t('expiredDescription', { authProviderShort: org.authProviderShort })}
            </p>
            <Button size="lg" className="w-full" onClick={() => (window.location.href = withReturnTo('/', returnTo, inviteToken))}>
              {t('goToLogin')}
            </Button>
          </div>
        ) : !info ? (
          <div className="space-y-3" aria-busy>
            <div className="h-10 w-3/4 animate-pulse rounded-field bg-surface-2" />
            <div className="h-32 animate-pulse rounded-card bg-surface-2" />
          </div>
        ) : (
          <form onSubmit={submit} className="animate-fade-up">
            <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
              <Link2 className="size-6" />
            </span>
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              {t('title')}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              {t('subtitle', { email: info.email ?? '', authProviderShort: org.authProviderShort })}
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              <Field label={t('password')} required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </Field>
              {twoFactorRequired && (
                <Field label={t('twoFactorLabel')} required>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123 456"
                    autoComplete="one-time-code"
                    required
                  />
                </Field>
              )}
              <Button type="submit" size="lg" className="w-full" loading={saving} disabled={!password || (twoFactorRequired && !code.trim()) || done}>
                {t('submit')}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={saving}>
                {t('cancel')}
              </Button>
              <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
                {t.rich('forgotPasswordHint', {
                  authProviderShort: org.authProviderShort,
                  resetLink: (chunks) => (
                    <a
                      href={withReturnTo(
                        `/passwort-vergessen${info.email ? `?email=${encodeURIComponent(info.email)}` : ''}`,
                        returnTo,
                        inviteToken
                      )}
                      className="font-medium text-accent-ink underline-offset-4 hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </div>
          </form>
        )}
      </main>

      <AuthFooter />
    </div>
  );
}

export default function LinkAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <LinkAccount />
    </Suspense>
  );
}
