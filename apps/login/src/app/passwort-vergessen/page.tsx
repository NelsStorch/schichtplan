'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { KeyRound, Mail } from 'lucide-react';
import { Button, Callout, Field, Input, useOrganization } from '@schichtplan/ui';
import { AuthShell } from '@/components/AuthShell';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';

/** «Passwort vergessen»: E-Mail eingeben, der Link kommt per Mail (gleiche Antwort, ob es das Konto gibt oder nicht). */
function ForgotPassword() {
  const t = useTranslations('login.forgotPassword');
  const searchParams = useSearchParams();
  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();
  const inviteToken = searchParams.get('invite')?.trim() || '';
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReturnTo(cleanReturnTo(searchParams.get('return_to')));
    setEmail(searchParams.get('email') ?? '');
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('failed'));
      setSent(data.message || t('defaultSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
            <Mail className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            {t('checkInboxTitle')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{sent}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">{t('valid2Hours')}</p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-8 w-full"
            onClick={() => (window.location.href = withReturnTo('/', returnTo, inviteToken))}
          >
            {t('goToLogin')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
            <KeyRound className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            {t('title')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            {org.slug === 'verein' ? t('instructionsVerein') : t('instructionsOrg', { orgName: org.name })}
          </p>

          <div className="mt-8 space-y-5">
            {error && <Callout tone="danger">{error}</Callout>}
            <Field label={t('email')} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={sending} disabled={!email.trim()}>
              {t('sendLink')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => (window.location.href = withReturnTo('/', returnTo, inviteToken))}
            >
              {t('backToLogin')}
            </Button>
            <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
              {org.slug !== 'verein'
                ? t('noPasswordNeededOrg', {
                    authProviderShort: org.authProviderShort,
                    nicknameTerm: org.nicknameTerm,
                  })
                : t('noPasswordNeededVerein', { nicknameTerm: org.nicknameTerm })}
            </p>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <ForgotPassword />
    </Suspense>
  );
}
