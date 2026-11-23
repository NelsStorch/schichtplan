'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { isPlaceholderEmail, type UserDto } from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { Callout, useToast } from './Feedback';
import { Field } from './Field';
import { PasswordInput } from './PasswordInput';
import { useOrganization } from './OrganizationContext';

export interface PasswordSettingsProps {
  user: UserDto;
  onUserChange?: (user: UserDto) => void;
}

/**
 * Einstellungen für das Kontopasswort:
 * Ermöglicht das Ändern des bisherigen Passworts oder das Festlegen eines
 * Fallback-Passworts für Hitobito/OAuth-Konten (Cevi.DB, MiData, Jubla-DB).
 */
export function PasswordSettings({ user, onUserChange }: PasswordSettingsProps) {
  const org = useOrganization();
  const toast = useToast();
  const t = useTranslations('ui.passwordSettings');
  const tActions = useTranslations('common.actions');

  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setIsOpen(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('mismatch'));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: user.hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t('saveFailed'));
      }

      toast({
        title: user.hasPassword ? t('changed') : t('fallbackSet'),
        description: data.message || t('saved'),
        tone: 'success',
      });

      if (data.user && onUserChange) {
        onUserChange(data.user);
      } else if (onUserChange) {
        onUserChange({ ...user, hasPassword: true });
      }

      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg">
              <KeyRound className="size-4 text-accent-ink" /> {t('title')}
            </h2>
            {user.hasPassword ? (
              <Badge tone="success" size="sm" className="gap-1">
                <ShieldCheck className="size-3" /> {t('active')}
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                {t('noPassword')}
              </Badge>
            )}
          </div>

          <p className="mt-2 text-sm text-fg-muted">
            {user.hasPassword
              ? t('hasPasswordInfo')
              : t('fallbackInfo', { app: org.name, provider: org.authProviderShort || t('providerFallback') })}
          </p>
        </div>

        {!isOpen && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              setIsOpen(true);
            }}
            disabled={!hasRealEmail}
            className="shrink-0"
          >
            {user.hasPassword ? t('change') : t('setFallback')}
          </Button>
        )}
      </div>

      {!hasRealEmail && (
        <div className="mt-3">
          <Callout tone="info">
            {t('emailFirst')}
          </Callout>
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}

          {user.hasPassword && (
            <Field label={t('current')} required>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={user.hasPassword ? t('new') : t('password')} hint={t('minLength')} required>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <Field label={t('repeat')} required>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
              {tActions('cancel')}
            </Button>
            <Button type="submit" loading={saving} disabled={!newPassword || !confirmPassword}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
