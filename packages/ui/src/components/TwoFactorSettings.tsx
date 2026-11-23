'use client';

import { useState, type FormEvent } from 'react';
import { Copy, Download, Printer, Share2, ShieldCheck, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { UserDto } from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { Callout, useToast } from './Feedback';
import { Field, Input, Switch } from './Field';
import { PasswordInput } from './PasswordInput';
import { useOrganization } from './OrganizationContext';

export interface TwoFactorSettingsProps {
  user: UserDto;
  onUserChange?: (user: UserDto) => void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; secret: string; qrDataUrl: string; otpauthUrl: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'confirm'; action: 'disable' | 'recovery' | 'provider'; onProviderLogin?: boolean };

async function post<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // Ohne Meldung vom Server setzt der Aufrufer einen übersetzten Text ein
  if (!res.ok) throw new Error(data.error || '');
  return data as T;
}

/**
 * Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP, offener Standard): einrichten, Wiederherstellungs-
 * codes, Einstellung für den Verbands-Login, ausschalten. Für Konten mit Passwort oder Verbands-Login.
 */
export function TwoFactorSettings({ user, onUserChange }: TwoFactorSettingsProps) {
  const org = useOrganization();
  const toast = useToast();
  const t = useTranslations('ui.twoFactor');
  const tActions = useTranslations('common.actions');
  const status = user.twoFactor;
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [onProviderLogin, setOnProviderLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status?.available) return null;

  const provider = org.authProviderShort || t('providerFallback');
  const hasProvider = Boolean(user.hasProviderAuth);

  const reset = () => {
    setMode({ kind: 'idle' });
    setPassword('');
    setCode('');
    setError(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err instanceof Error && err.message) || t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      const data = await post<{ secret: string; qrDataUrl: string; otpauthUrl: string }>('/api/auth/2fa/setup', {
        currentPassword: user.hasPassword ? password : undefined,
      });
      setPassword('');
      setCode('');
      setMode({ kind: 'scan', ...data });
    });

  const enable = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const data = await post<{ recoveryCodes: string[]; user: UserDto }>('/api/auth/2fa/enable', {
        code,
        onProviderLogin: hasProvider ? onProviderLogin : false,
      });
      setCode('');
      setMode({ kind: 'codes', codes: data.recoveryCodes });
      onUserChange?.(data.user);
      toast({ tone: 'success', title: t('enabledToast') });
    });
  };

  const confirmAction = (e: FormEvent) => {
    e.preventDefault();
    if (mode.kind !== 'confirm') return;
    void run(async () => {
      if (mode.action === 'disable') {
        const data = await post<{ user: UserDto }>('/api/auth/2fa/disable', { code });
        onUserChange?.(data.user);
        toast({ tone: 'success', title: t('disabledToast') });
        reset();
      } else if (mode.action === 'recovery') {
        const data = await post<{ recoveryCodes: string[]; user: UserDto }>('/api/auth/2fa/recovery-codes', { code });
        onUserChange?.(data.user);
        setCode('');
        setMode({ kind: 'codes', codes: data.recoveryCodes });
      } else {
        const data = await post<{ user: UserDto }>(
          '/api/auth/2fa/settings',
          { code, onProviderLogin: Boolean(mode.onProviderLogin) },
          'PUT'
        );
        onUserChange?.(data.user);
        toast({ tone: 'success', title: t('settingSaved') });
        reset();
      }
    });
  };

  const codesText = (codes: string[]) =>
    `${t('codesFileTitle', { app: org.name })}\n${user.email ?? ''}\n\n${t('codesOnce')}\n\n${codes.join('\n')}\n`;

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codesText(codes));
      toast({ tone: 'success', title: t('copied') });
    } catch {
      toast({ tone: 'error', title: t('copyFailed'), description: t('copyFailedHint') });
    }
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([codesText(codes)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('codesFileName');
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Teilen-Menü des Geräts (Notizen, Passwort-Manager-App …), vor allem auf dem Handy */
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareCodes = async (codes: string[]) => {
    try {
      await navigator.share({ title: t('codesTitle', { app: org.name }), text: codesText(codes) });
    } catch (err) {
      // Abbrechen im Teilen-Menü ist kein Fehler
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast({ tone: 'error', title: t('shareFailed'), description: t('shareFailedHint') });
    }
  };

  /** Druckansicht nur mit den Codes (eigenes Fenster, keine Daten an Dritte) */
  const printCodes = (codes: string[]) => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) {
      toast({ tone: 'error', title: t('printBlocked'), description: t('printBlockedHint') });
      return;
    }
    const doc = win.document;
    doc.title = t('codesTitle', { app: org.name });
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:system-ui,sans-serif;padding:24px;color:#000}h1{font-size:18px}ul{font-family:ui-monospace,monospace;font-size:16px;columns:2;padding-left:20px}p{font-size:13px}';
    doc.head.appendChild(style);
    const h1 = doc.createElement('h1');
    h1.textContent = t('codesTitle', { app: org.name });
    const info = doc.createElement('p');
    info.textContent = t('codesPrintInfo', { email: user.email ?? '' });
    const list = doc.createElement('ul');
    for (const c of codes) {
      const li = doc.createElement('li');
      li.textContent = c;
      list.appendChild(li);
    }
    doc.body.append(h1, info, list);
    win.focus();
    win.print();
  };

  const codeField = (
    <Field label={t('codeLabel')} hint={t('codeHint')} required>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="123456"
        maxLength={20}
        className="font-mono"
        autoFocus
        required
      />
    </Field>
  );

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg">
              <Smartphone className="size-4 text-accent-ink" /> {t('title')}
            </h2>
            {status.enabled ? (
              <Badge tone="success" size="sm" className="gap-1">
                <ShieldCheck className="size-3" /> {t('active')}
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                {t('off')}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {status.enabled
              ? user.hasPassword
                ? status.onProviderLogin
                  ? t('infoPasswordAndProvider', { provider })
                  : t('infoPassword')
                : status.onProviderLogin
                  ? t('infoProvider', { provider })
                  : t('infoProviderOff', { provider })
              : t('infoSetup')}
          </p>
          {status.enabled && (
            <p className={`mt-1 text-xs ${status.recoveryCodesLeft <= 3 ? 'font-medium text-danger-ink' : 'text-fg-subtle'}`}>
              {t('codesLeft', { left: status.recoveryCodesLeft })}
            </p>
          )}
        </div>

        {mode.kind === 'idle' && !status.enabled && (
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={!status.configured || busy}
            loading={busy}
            onClick={() => (user.hasPassword ? setMode({ kind: 'password' }) : void startSetup())}
          >
            {t('setUp')}
          </Button>
        )}
      </div>

      {!status.configured && !status.enabled && (
        <div className="mt-3">
          <Callout tone="info">{t('notConfigured')}</Callout>
        </div>
      )}

      {error && mode.kind === 'idle' && (
        <div className="mt-3">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {/* Eingeschaltet: Einstellungen */}
      {status.enabled && mode.kind === 'idle' && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          {hasProvider && (
            <Switch
              checked={status.onProviderLogin}
              onChange={(checked) => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'provider', onProviderLogin: checked });
              }}
              label={t('askOnProvider', { provider })}
              description={
                user.hasPassword
                  ? t('askOnProviderHintPassword', { provider })
                  : t('askOnProviderHintNoPassword')
              }
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'recovery' });
              }}
            >
              {t('newCodes')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setCode('');
                setMode({ kind: 'confirm', action: 'disable' });
              }}
            >
              {t('turnOff')}
            </Button>
          </div>
        </div>
      )}

      {/* Einrichten, Schritt 0: Passwort bestätigen */}
      {mode.kind === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void startSetup();
          }}
          className="mt-5 space-y-4 border-t border-line pt-4"
        >
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label={t('currentPassword')} hint={t('currentPasswordHint')} required>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              {tActions('cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!password}>
              {t('next')}
            </Button>
          </div>
        </form>
      )}

      {/* Einrichten, Schritt 1: QR-Code scannen und ersten Code eingeben */}
      {mode.kind === 'scan' && (
        <form onSubmit={enable} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            <li>{t('step3')}</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            {/* Ist ein data:-Bild vom eigenen Server, nicht über einen externen QR-Dienst */}
            <img
              src={mode.qrDataUrl}
              alt={t('qrAlt')}
              width={180}
              height={180}
              className="rounded-field border border-line bg-white p-1"
            />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="text-fg-subtle">{t('keyLabel')}</p>
              <code className="block break-all rounded-field bg-surface-2 px-3 py-2 font-mono text-[13px] text-fg">
                {mode.secret}
              </code>
              <a href={mode.otpauthUrl} className="inline-block text-[13px] font-medium text-accent-ink hover:underline">
                {t('openInApp')}
              </a>
            </div>
          </div>
          <Field label={t('codeLabel')} required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="font-mono tracking-[0.3em]"
              required
            />
          </Field>
          {hasProvider && (
            <Switch
              checked={onProviderLogin}
              onChange={setOnProviderLogin}
              label={t('askOnProvider', { provider })}
              description={
                user.hasPassword
                  ? t('providerHintPassword')
                  : t('providerHintNoPassword')
              }
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              {tActions('cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={code.length !== 6}>
              {t('turnOn')}
            </Button>
          </div>
        </form>
      )}

      {/* Wiederherstellungscodes (nur jetzt sichtbar) */}
      {mode.kind === 'codes' && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <Callout tone="warning">
            {t('codesWarning')}
          </Callout>
          <ul className="grid grid-cols-2 gap-2 rounded-field bg-surface-2 p-3 font-mono text-sm text-fg">
            {mode.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canShare && (
              <Button type="button" size="sm" variant="secondary" onClick={() => void shareCodes(mode.codes)}>
                <Share2 className="size-3.5" aria-hidden /> {t('share')}
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyCodes(mode.codes)}>
              <Copy className="size-3.5" aria-hidden /> {t('copy')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => downloadCodes(mode.codes)}>
              <Download className="size-3.5" aria-hidden /> {t('download')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => printCodes(mode.codes)}>
              <Printer className="size-3.5" aria-hidden /> {t('print')}
            </Button>
            <Button type="button" size="sm" onClick={reset}>
              {t('codesSaved')}
            </Button>
          </div>
        </div>
      )}

      {/* Änderungen bestätigen: aktueller Code nötig */}
      {mode.kind === 'confirm' && (
        <form onSubmit={confirmAction} className="mt-5 space-y-4 border-t border-line pt-4">
          {error && <Callout tone="danger">{error}</Callout>}
          <p className="text-sm text-fg-muted">
            {mode.action === 'disable'
              ? t('confirmDisable')
              : mode.action === 'recovery'
                ? t('confirmRecovery')
                : mode.onProviderLogin
                  ? t('confirmProviderOn', { provider })
                  : t('confirmProviderOff', { provider })}
          </p>
          {codeField}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              {tActions('cancel')}
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!code.trim()}
              variant={mode.action === 'disable' ? 'danger' : undefined}
            >
              {mode.action === 'disable' ? t('turnOff') : t('confirm')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
