'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Button, Callout, Field } from '@schichtplan/ui';
import { AuthShell } from '@/components/AuthShell';
import { PasswordInput } from '@/components/PasswordInput';

/** Link aus der E-Mail «Passwort zurücksetzen»: neues Passwort zweimal eingeben. */
function ResetPassword() {
  const t = useTranslations('login.resetPassword');
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = searchParams.get('token');
    setToken(value);
    setInvalidLink(!value);
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError(t('mismatch'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INVALID_TOKEN') setInvalidLink(true);
        throw new Error(data.error || t('failed'));
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            {t('changedTitle')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            {t('changedDescription')}
          </p>
          <Button size="lg" className="mt-8 w-full" onClick={() => (window.location.href = '/')}>
            {t('backToLogin')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (invalidLink) {
    return (
      <AuthShell>
        <div className="animate-fade-up space-y-5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            {t('linkExpiredTitle')}
          </h1>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            {t('linkExpiredDescription')}
          </p>
          <Button size="lg" className="w-full" onClick={() => (window.location.href = '/passwort-vergessen')}>
            {t('requestNewLink')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="animate-fade-up">
        <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
          <KeyRound className="size-6" />
        </span>
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
          {t('title')}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
          {t('description')}
        </p>

        <div className="mt-8 space-y-5">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label={t('newPassword')} required hint={t('min8Chars')}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              autoFocus
              required
            />
          </Field>
          <Field label={t('repeat')} required>
            <PasswordInput
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving} disabled={!password || !repeat}>
            {saving ? t('saving') : t('save')}
          </Button>
          <p className="text-center text-sm">
            <Link href="/" className="font-medium text-accent-ink underline-offset-4 hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <ResetPassword />
    </Suspense>
  );
}
