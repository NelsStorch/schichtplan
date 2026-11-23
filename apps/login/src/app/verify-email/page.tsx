'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  Button,
  Callout,
  Field,
  Input,
} from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared/redirect';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';
import { AuthShell } from '@/components/AuthShell';

function VerifyEmailContent() {
  const t = useTranslations('login.verifyEmail');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');
  const returnTo = cleanReturnTo(searchParams.get('return_to'));
  const inviteToken = searchParams.get('invite')?.trim() || '';

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam === 'missing_token' ? t('missingToken') : null
  );

  // Formular zum erneuten Anfordern eines Links im Fehlerfall
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const [landingHref, setLandingHref] = useState('/');
  useEffect(() => setLandingHref(getLandingUrl()), []);

  const verifyRef = useRef<{ token: string; result: Promise<{ ok: boolean; data: { message?: string; error?: string } }> } | null>(
    null
  );

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Der Token gilt nur einmal: Läuft der Effekt zweimal (React StrictMode lokal), denselben Aufruf
    // weiterverwenden statt ein zweites Mal abzuschicken (der zweite Aufruf meldete sonst «ungültig»).
    if (verifyRef.current?.token !== token) {
      verifyRef.current = {
        token,
        result: fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }).then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) })),
      };
    }
    const pending = verifyRef.current.result;

    async function verify() {
      try {
        const { ok, data } = await pending;

        if (!isMounted) return;

        if (ok) {
          setSuccess(data.message || t('successDefault'));
        } else {
          setError(data.error || t('invalidLink'));
        }
      } catch {
        if (isMounted) {
          setError(t('serverFailed'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token, t]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setResending(true);
    setResendMessage(null);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resendEmail.trim(),
          returnTo: returnTo ?? undefined,
          inviteToken: inviteToken || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || t('resendFailed'));
      }

      setResendMessage({
        tone: 'success',
        text: data.message || t('resendSuccess'),
      });
    } catch (err) {
      setResendMessage({
        tone: 'danger',
        text: err instanceof Error ? err.message : t('resendFailed'),
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell returnTo={returnTo} landingHref={landingHref} showBackLink={true}>
      <div className="animate-fade-up">
        {loading && (
          <div className="text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-accent-ink" />
            <h1 className="mt-4 font-display text-[1.5rem] font-semibold tracking-tight text-fg">
              {t('verifyingTitle')}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">{t('verifyingSubtitle')}</p>
          </div>
        )}

        {!loading && success && (
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              {t('successTitle')}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{success}</p>
            <Button size="lg" className="mt-8 w-full" onClick={() => (window.location.href = withReturnTo('/', returnTo, inviteToken))}>
              {t('goToLogin')}
            </Button>
          </div>
        )}

        {!loading && error && (
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              {t('failedTitle')}
            </h1>
            <div className="mt-3">
              <Callout tone="danger">{error}</Callout>
            </div>

            <div className="mt-8 rounded-card border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-fg">{t('resendSectionTitle')}</h2>
              <p className="mt-1 text-xs text-fg-muted">
                {t('resendSectionSubtitle')}
              </p>

              {resendMessage && (
                <div className="mt-3">
                  <Callout tone={resendMessage.tone}>{resendMessage.text}</Callout>
                </div>
              )}

              <form onSubmit={handleResend} className="mt-4 space-y-3">
                <Field label={t('email')} required>
                  <Input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    autoComplete="email"
                    required
                  />
                </Field>
                <Button type="submit" loading={resending} className="w-full">
                  {resending ? t('resending') : t('resendButton')}
                </Button>
              </form>
            </div>

            <div className="mt-6 text-center">
              <Link
                href={withReturnTo('/', returnTo, inviteToken)}
                className="text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
              >
                {t('backToLogin')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-accent-ink" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
