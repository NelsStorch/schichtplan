'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Button,
  Callout,
  BrandLogo,
  Field,
  Input,
  buttonClasses,
  cn,
  useOrganization,
} from '@schichtplan/ui';
import { VERBAND_ORGANIZATIONS, getLandingUrl, organizationSiteUrl, privacyUrl } from '@schichtplan/shared/redirect';
import {
  type CeviNameLoginErrorCode,
  type DepartmentDirectoryItemDto,
  type StufeRole,
  type UserDto,
  type OrganizationConfig,
  getOrganizationByDbType,
} from '@schichtplan/shared';
import { afterLogin, cleanReturnTo, departmentSlugFromReturnTo, withReturnTo } from '@/lib/destination';
import { AuthShell } from '@/components/AuthShell';
import { PasswordInput } from '@/components/PasswordInput';
import { BirthDateInput } from '@/components/BirthDateInput';

type View = 'start' | 'ceviname' | 'ceviname_new' | 'password' | 'verify_sent';

/** 2010-03-14 → 14.03.2010 */
const fmtBirthDate = (iso: string) => iso.split('-').reverse().join('.');

function getPasswordStrength(
  pwd: string,
  tPwd: (key: 'strength1' | 'strength2' | 'strength3' | 'strength4') => string
): {
  score: number; // 0..4
  label: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
} {
  if (!pwd) return { score: 0, label: '', tone: 'danger' };
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) s++;
  if (/[^a-zA-Z0-9]/.test(pwd)) s++;

  switch (s) {
    case 0:
    case 1:
      return { score: 1, label: tPwd('strength1'), tone: 'danger' };
    case 2:
      return { score: 2, label: tPwd('strength2'), tone: 'warning' };
    case 3:
      return { score: 3, label: tPwd('strength3'), tone: 'info' };
    case 4:
      return { score: 4, label: tPwd('strength4'), tone: 'success' };
    default:
      return { score: 1, label: tPwd('strength1'), tone: 'danger' };
  }
}

// Dynamische Fehlermeldungen für Hitobito & Verbands-Logins
function getLoginErrorMessage(
  code: string,
  org: OrganizationConfig,
  tStart: ReturnType<typeof useTranslations<'login.start'>>,
  other?: string | null
): string | null {
  switch (code) {
    case 'cevidb_unavailable':
    case 'hitobito_unavailable':
      return tStart('hitobitoUnavailable', { authProviderShort: org.authProviderShort });
    case 'cevidb_denied':
    case 'hitobito_denied':
      return tStart('hitobitoDenied', { authProviderShort: org.authProviderShort });
    case 'cevidb_failed':
    case 'hitobito_failed':
      return tStart('hitobitoFailed', { authProviderShort: org.authProviderShort });
    case 'cevidb_email_taken':
    case 'hitobito_email_taken':
      return tStart('hitobitoEmailTaken', { authProviderShort: org.authProviderShort });
    case 'cevidb_email_other_provider': {
      // Ein Konto hängt an genau einer Verbands-DB. Der Login dort hilft hier nichts (Sitzung gilt pro Domain),
      // also: hier mit E-Mail und Passwort anmelden oder in der eigenen DB eine andere E-Mail eintragen.
      const otherOrg = other ? getOrganizationByDbType(other) : null;
      const otherDb = otherOrg && otherOrg.dbType !== org.dbType ? otherOrg.authProviderShort : 'einer anderen Verbands-DB';
      return tStart('hitobitoEmailOtherProvider', {
        authProviderShort: org.authProviderShort,
        otherDb,
      });
    }
    default:
      return null;
  }
}

/** Hostname des Ziels (z. B. illnau.cevi-schichtplan.ch), damit sichtbar ist, wohin es nach dem Login geht. */
function destinationHost(returnTo: string | null): string | null {
  if (!returnTo) return null;
  try {
    return new URL(returnTo).host || null;
  } catch {
    return null;
  }
}

function LoginContent() {
  const tGeneral = useTranslations('login.general');
  const tShell = useTranslations('login.authShell');
  const tStart = useTranslations('login.start');
  const tNick = useTranslations('login.nickname');
  const tPwd = useTranslations('login.password');
  const tVerify = useTranslations('login.verifySent');

  const stufeOptions = useMemo<{ value: StufeRole | null; label: string }[]>(
    () => [
      { value: null, label: tNick('roleNone') },
      { value: 'TEILNEHMER', label: tNick('roleParticipant') },
      { value: 'LEITUNG', label: tNick('roleLeader') },
    ],
    [tNick]
  );
  const searchParams = useSearchParams();
  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  // Erst im Browser auswerten (braucht window.location): sonst rendert der Server ohne Ziel und
  // der Browser mit Ziel, und React meldet einen Hydration-Fehler
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => setReturnTo(cleanReturnTo(searchParams.get('return_to'))), [searchParams]);
  const inviteToken = searchParams.get('invite')?.trim() || '';
  const destination = destinationHost(returnTo);
  const [landingHref, setLandingHref] = useState('/');
  useEffect(() => setLandingHref(getLandingUrl()), []);
  // Neutrale Vereins-Domain ohne Ziel-Verein: Verweis auf die Verbands-Logins (Cevi.DB, MiData, Jubla-DB).
  // Erst im Browser berechnen (Host und return_to), damit Server und Browser gleich rendern.
  const [verbandLogins, setVerbandLogins] = useState<{ org: OrganizationConfig; href: string }[]>([]);
  useEffect(() => {
    if (org.slug !== 'verein' || departmentSlugFromReturnTo(returnTo)) {
      setVerbandLogins([]);
      return;
    }
    setVerbandLogins(VERBAND_ORGANIZATIONS.map((v) => ({ org: v, href: organizationSiteUrl(v, { subdomain: 'login' }) })));
  }, [org.slug, returnTo]);

  // Bestehende Sitzung (One-Click Weiterleitung)
  const [existingUser, setExistingUser] = useState<UserDto | null>(null);
  const [switchAccount, setSwitchAccount] = useState(false);

  useEffect(() => {
    if (searchParams.get('error')) return;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((me: UserDto | null) => {
        if (me?.id) setExistingUser(me);
      })
      .catch(() => {});
  }, [searchParams]);

  const [view, setView] = useState<View>('start');
  const [redirecting, setRedirecting] = useState(false);

  // Cevi-Name: nur, wenn die Person von einer Abteilung kommt (Login gilt nur für diese Abteilung)
  const [department, setDepartment] = useState<DepartmentDirectoryItemDto | null>(null);
  const [quickCeviName, setQuickCeviName] = useState('');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickStufen, setQuickStufen] = useState<Record<string, StufeRole>>({});
  // Hinweis mit passendem Knopf, wenn das Konto einen anderen Login braucht
  const [errorAction, setErrorAction] = useState<'cevidb' | 'password' | null>(null);

  useEffect(() => {
    const slug = departmentSlugFromReturnTo(returnTo);
    if (!slug) return;
    fetch('/api/departments/directory')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: DepartmentDirectoryItemDto[]) => setDepartment(list.find((d) => d.slug === slug) ?? null))
      .catch(() => setDepartment(null));
  }, [returnTo]);

  // E-Mail & Passwort
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regCeviName, setRegCeviName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitobitoDown, setHitobitoDown] = useState(false);

  useEffect(() => {
    const errCode = searchParams.get('error');
    if (errCode) {
      setError(getLoginErrorMessage(errCode, org, tStart, searchParams.get('other')) ?? tGeneral('errorOccurred'));
      // Konto eines anderen Verbands: direkt den Passwort-Login anbieten
      if (errCode === 'cevidb_email_other_provider') setErrorAction('password');
      setHitobitoDown(
        errCode === 'cevidb_failed' ||
        errCode === 'hitobito_failed' ||
        errCode === 'cevidb_unavailable' ||
        errCode === 'hitobito_unavailable'
      );
    }
  }, [searchParams, org, tStart, tGeneral]);
  const [success, setSuccess] = useState<string | null>(null);

  // Fokus-Management für Barrierefreiheit bei Fehlern
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  // E-Mail-Verifikation
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // Passwort-Stärke
  const pwdStrength = useMemo(() => getPasswordStrength(password, (k) => tPwd(k)), [password, tPwd]);

  // Fehlercode aus der Adresse entfernen, damit er nach einem Neuladen nicht erneut erscheint
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error');
      window.history.replaceState(null, '', url);
    }
  }, []);

  // Zurück-Navigation aus Cevi.DB stellt die Seite aus dem bfcache wieder her: Ladezustand zurücksetzen
  useEffect(() => {
    const reset = () => setRedirecting(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const goTo = (next: View) => {
    setView(next);
    setError(null);
    setErrorAction(null);
    setSuccess(null);
    setResendNotice(null);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignorieren
    }
    setExistingUser(null);
    setSwitchAccount(true);
  };

  const handleResend = async (targetEmail: string) => {
    if (!targetEmail.trim()) return;
    setResending(true);
    setResendNotice(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim(),
          returnTo: returnTo ?? undefined,
          inviteToken: inviteToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tGeneral('actionFailed'));
      setResendNotice({ tone: 'success', text: data.message || tVerify('resendSuccess') });
    } catch (err) {
      setResendNotice({ tone: 'danger', text: err instanceof Error ? err.message : tGeneral('actionFailed') });
    } finally {
      setResending(false);
    }
  };

  /** Cevi-Name-Login und -Registrierung: Antwort auswerten, bei Erfolg weiterleiten */
  const handleCeviNameResponse = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccess(tPwd('helloRedirecting', { name: data.user.nickname || data.user.ceviName || data.user.firstName }));
      setTimeout(() => {
        window.location.href = afterLogin(data.user, returnTo, org.dbType, inviteToken);
      }, 700);
      return;
    }
    const code = data.code as CeviNameLoginErrorCode | undefined;
    if (code === 'NOT_FOUND') {
      setView('ceviname_new');
      return;
    }
    if (code === 'EXISTS') setView('ceviname');
    setErrorAction(code === 'USE_CEVIDB' ? 'cevidb' : code === 'USE_PASSWORD' ? 'password' : null);
    setError(data.error || tGeneral('actionFailed'));
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) return;
    setError(null);
    setErrorAction(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/ceviname-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentSlug: department.slug,
          ceviName: quickCeviName.trim(),
          birthDate: quickBirthDate,
          returnTo: returnTo ?? undefined,
        }),
      });
      await handleCeviNameResponse(res);
    } catch {
      setError(tGeneral('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) return;
    setError(null);
    setErrorAction(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/ceviname-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentSlug: department.slug,
          ceviName: quickCeviName.trim(),
          birthDate: quickBirthDate,
          firstName: quickFirstName.trim() || undefined,
          lastName: quickLastName.trim() || undefined,
          stufen: Object.entries(quickStufen).map(([stufeId, role]) => ({ stufeId, role })),
          returnTo: returnTo ?? undefined,
          inviteToken: inviteToken || undefined,
        }),
      });
      await handleCeviNameResponse(res);
    } catch {
      setError(tGeneral('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register-helper';
      const payload =
        authMode === 'login'
          ? { email, password }
          : {
              email,
              password,
              firstName: regFirstName,
              lastName: regLastName.trim() || undefined,
              ceviName: regCeviName.trim() || undefined,
              returnTo: returnTo ?? undefined,
              inviteToken: inviteToken || undefined,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresVerification) {
          setUnverifiedEmail(email);
        }
        throw new Error(
          data.error ||
            (authMode === 'login'
              ? tPwd('loginFailed')
              : tPwd('registerFailed'))
        );
      }

      if (data.requiresVerification) {
        setView('verify_sent');
        return;
      }

      // Zwei-Faktor eingeschaltet: Code aus der Authenticator-App auf eigener Seite abfragen
      if (data.twoFactorRequired) {
        window.location.href = withReturnTo('/zwei-faktor', returnTo, inviteToken);
        return;
      }

      setSuccess(
        authMode === 'login'
          ? tPwd('successLogin')
          : tPwd('successRegister')
      );
      setTimeout(() => {
        window.location.href = afterLogin(data.user, returnTo, org.dbType, inviteToken);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : tGeneral('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const cevidbAuthParams = new URLSearchParams();
  if (returnTo) cevidbAuthParams.set('returnTo', returnTo);
  if (org.slug) cevidbAuthParams.set('org', org.slug);
  // Einladung durch den Umweg über die Verbands-DB mitnehmen (wird danach auf /abteilung eingelöst)
  if (inviteToken) cevidbAuthParams.set('invite', inviteToken);
  const cevidbAuthUrl = `/api/auth/cevidb/login${cevidbAuthParams.toString() ? `?${cevidbAuthParams.toString()}` : ''}`;

  const feedback = (
    <>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="space-y-2 animate-fade-in outline-none"
        >
          <Callout tone="danger">
            {error}
          </Callout>
          {hitobitoDown && org.slug !== 'verein' && (
            <div className="rounded-xl border border-line bg-surface p-4 text-xs space-y-3">
              <div>
                <span className="font-semibold text-fg block text-sm">
                  {tStart('hitobitoDownTitle', { authProviderShort: org.authProviderShort })}
                </span>
                <p className="mt-1 text-fg-muted leading-relaxed">
                  {tStart('hitobitoDownText')}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => {
                    setAuthMode('login');
                    goTo('password');
                  }}
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="size-3.5" />
                    <span>{tStart('loginWithEmailAction')}</span>
                  </span>
                  <ChevronRight className="size-3.5" />
                </Button>

                <a
                  href={withReturnTo('/passwort-vergessen', returnTo, inviteToken)}
                  className={buttonClasses({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'w-full justify-start text-accent-ink hover:underline',
                  })}
                >
                  {tStart('emergencyPassword')}
                </a>
              </div>
            </div>
          )}
          {errorAction === 'cevidb' && org.slug !== 'verein' && (
            <a href={cevidbAuthUrl} className={buttonClasses({ className: 'w-full justify-between' })}>
              {tStart('loginWithProvider', { authProviderShort: org.authProviderShort })} <ArrowUpRight className="size-4" />
            </a>
          )}
          {errorAction === 'password' && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setAuthMode('login');
                goTo('password');
              }}
            >
              <KeyRound className="size-4" /> {tStart('loginWithEmailAction')}
            </Button>
          )}
          {unverifiedEmail && (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs flex flex-col gap-2">
              <span className="text-fg-muted">{tStart('resendMissing')}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={resending}
                disabled={resending}
                onClick={() => handleResend(unverifiedEmail)}
              >
                {tStart('resendAction')}
              </Button>
            </div>
          )}
        </div>
      )}
      {resendNotice && (
        <Callout tone={resendNotice.tone} className="animate-fade-in">
          {resendNotice.text}
        </Callout>
      )}
      {success && (
        <Callout tone="success" className="animate-fade-in">
          {success}
        </Callout>
      )}
    </>
  );

  return (
    <AuthShell returnTo={returnTo} landingHref={landingHref} showBackLink={true}>
      {/* Elegante Card mit Glassmorphism-Effekt */}
      <div className="rounded-card border border-line bg-surface/85 p-6 shadow-soft backdrop-blur-md transition-all duration-300 sm:p-7 animate-scale-in">
        {/* Welcome-Card mit Abteilungs-Identität */}
        {department && view === 'start' && (
          <div className="mb-6 flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2/70 p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-line/60 bg-surface">
              {department.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={department.logoUrl} alt={department.name} className="size-full object-cover" />
              ) : (
                <BrandLogo className="size-5" alt="" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{department.name}</span>
              <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-accent-ink">
                <span className="size-1.5 rounded-full bg-accent" />
                {tStart('unitPortal', { unitTerm: org.unitTerm })}
              </span>
            </div>
          </div>
        )}

        {/* Bereits angemeldete Sitzung erkennen & One-Click Weiterleitung anbieten */}
        {existingUser && !switchAccount ? (
          <div key="already_logged_in">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-fg text-balance">
              {tStart('alreadyLoggedIn')}
            </h1>
            <p className="mt-2.5 text-[14px] leading-relaxed text-fg-muted">
              {tStart('loggedInAs', {
                name: `${existingUser.nickname || existingUser.ceviName || existingUser.firstName}${existingUser.lastName ? ` ${existingUser.lastName}` : ''}`,
                email: existingUser.email ? ` (${existingUser.email})` : '',
              })}
            </p>

            {destination && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3 text-xs text-fg-subtle">
                {tStart('destinationLabel', { destination })}
              </div>
            )}

            <div className="mt-6 space-y-3">
              <a
                href={afterLogin(existingUser, returnTo, org.dbType, inviteToken)}
                className={buttonClasses({
                  size: 'lg',
                  className: 'w-full justify-between shadow-soft',
                })}
              >
                {/* Kurz halten: Die volle Adresse steht schon im «Ziel»-Feld darüber.
                    Lange Namen werden abgeschnitten statt über den Knopf hinauszulaufen. */}
                <span className="min-w-0 truncate">
                  {department ? tStart('continueTo', { name: department.name }) : destination ? tGeneral('continue') : tStart('continueToOverview')}
                </span>
                <ArrowUpRight className="size-4 shrink-0" />
              </a>

              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setSwitchAccount(true)}
              >
                <UserRound className="size-4" /> {tStart('switchAccount')}
              </Button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-1.5 pt-2 text-xs text-fg-subtle transition hover:text-danger"
              >
                <LogOut className="size-3.5" />
                {tStart('logout')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {view === 'start' && (
              <div key="start">
                <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
                  {tStart('title')}
                </h1>
                {destination ? (
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                    {tStart('subtitleDestination', { destination })}
                  </p>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                    {tStart('subtitleGeneral', { unitTermPlural: org.unitTermPlural })}
                  </p>
                )}

                <div className="mt-7 space-y-3">
                  {feedback}

                  {org.slug !== 'verein' ? (
                    <div>
                      <span className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-ink">
                        <ShieldCheck className="size-3.5" />
                        {tStart('recommendedLeader')}
                      </span>
                      <a
                        href={cevidbAuthUrl}
                        onClick={() => setRedirecting(true)}
                        aria-busy={redirecting || undefined}
                        className={buttonClasses({
                          size: 'lg',
                          className: cn(
                            'w-full justify-between shadow-soft transition-all duration-200',
                            redirecting && 'pointer-events-none opacity-80'
                          ),
                        })}
                      >
                        <span className="flex items-center gap-2.5">
                          <ShieldCheck className="size-4.5 opacity-90 text-white" />
                          <span>{redirecting ? tStart('redirectingToProvider', { authProviderShort: org.authProviderShort }) : tStart('loginWithProvider', { authProviderShort: org.authProviderShort })}</span>
                        </span>
                        {redirecting ? (
                          <span
                            aria-hidden
                            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                          />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </a>
                      <div className="mt-1.5 flex items-center justify-between px-1 text-[12px] text-fg-subtle">
                        <span>{tStart('loginViaProvider', { authProviderShort: org.authProviderShort })}</span>
                        <span className="font-mono text-[11px] text-fg-muted">
                          {org.slug === 'pfadi' ? 'db.scout.ch' : org.slug === 'jubla' ? 'db.jubla.ch' : 'db.cevi.ch'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => goTo('password')}
                        className="w-full justify-between shadow-soft"
                      >
                        <span className="flex items-center gap-2.5">
                          <KeyRound className="size-4.5" />
                          <span>{tStart('loginWithEmailAction')}</span>
                        </span>
                        <ChevronRight className="size-4" />
                      </Button>
                      <div className="mt-1.5 flex items-center justify-between px-1 text-[12px] text-fg-subtle">
                        <span>{tStart('accountHelperOk')}</span>
                        <span>{tStart('passwordProtected')}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="my-6 flex items-center gap-4 text-xs text-fg-subtle">
                  <span className="h-px flex-1 bg-line" />
                  <span>{tStart('moreOptions')}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/70">
                  {/* E-Mail & Passwort / Registrierung */}
                  {org.slug !== 'verein' ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => goTo('password')}
                        className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                          <KeyRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-fg">{tStart('loginWithEmail')}</span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              {tStart('recommendedHelper')}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            {tStart('loginWithEmailSubtitle')}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ) : (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          goTo('password');
                        }}
                        className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                          <KeyRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-fg">{tStart('newVereinAccount')}</span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              {tStart('free')}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            {tStart('chooseEmailPassword')}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  )}

                  {/* Spitzname / Cevi-Name: Fallback für Personen ohne E-Mail (nur wenn von der Abteilung freigeschaltet) */}
                  {department && department.allowPasswordless === true && (
                    <li>
                      <button
                        type="button"
                        onClick={() => goTo('ceviname')}
                        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent opacity-85 hover:opacity-100"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted transition-colors group-hover:bg-surface-3 group-hover:text-fg">
                          <UserRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-fg">{tStart('loginWithNickname', { nicknameTerm: org.nicknameTerm })}</span>
                            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
                              {tStart('withoutPasswordLimited')}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            {tStart('quickAccessWithoutEmail', { name: department.name })}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  )}
                </ul>

                {verbandLogins.length > 0 && (
                  <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-fg-subtle">
                    <span>{tStart('leadAtOtherOrgs')}</span>
                    {verbandLogins.map((v) => (
                      <a
                        key={v.org.slug}
                        href={v.href}
                        title={tStart('loginWithProvider', { authProviderShort: v.org.authProviderShort })}
                        className="rounded-full border border-line px-2 py-0.5 font-medium text-fg-muted transition hover:border-fg-subtle/40 hover:text-fg"
                      >
                        {v.org.orgName}
                      </a>
                    ))}
                  </p>
                )}
              </div>
            )}

            {view !== 'start' && (
              <button
                type="button"
                onClick={() => goTo('start')}
                className="-ml-2 mb-5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <ArrowLeft className="size-3.5" />
                {tStart('allLoginOptions')}
              </button>
            )}

            {view === 'ceviname' && department && (
              <form key="ceviname" onSubmit={handleQuickSubmit}>
                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  {tNick('title', { nicknameTerm: org.nicknameTerm })}
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                  {tNick('subtitle', { name: department.name })}
                </p>

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  <Field label={tNick('nameOrFirstName', { nicknameTerm: org.nicknameTerm })} required>
                    <Input
                      type="text"
                      value={quickCeviName}
                      onChange={(e) => setQuickCeviName(e.target.value)}
                      autoComplete="nickname"
                      autoFocus
                      required
                      minLength={2}
                      maxLength={60}
                    />
                  </Field>

                  <Field
                    label={tNick('birthDate')}
                    required
                    hint={tNick('birthDateHint')}
                  >
                    <BirthDateInput
                      value={quickBirthDate}
                      onChange={setQuickBirthDate}
                      required
                    />
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={quickCeviName.trim().length < 2 || !quickBirthDate || !!success}
                    className="w-full shadow-soft"
                  >
                    {loading ? tNick('checking') : tNick('continue')}
                  </Button>
                </div>
              </form>
            )}

            {view === 'ceviname_new' && department && (
              <form key="ceviname_new" onSubmit={handleQuickRegister}>
                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
                  {tNick('newTitle', { name: department.name })}
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                  {tNick.rich('notFound', {
                    name: quickCeviName.trim(),
                    birthDate: fmtBirthDate(quickBirthDate),
                    retryLink: (chunks) => (
                      <button
                        type="button"
                        onClick={() => goTo('ceviname')}
                        className="font-medium text-accent-ink underline-offset-4 hover:underline"
                      >
                        {chunks}
                      </button>
                    ),
                  })}
                </p>

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  {department.joinMode === 'INVITE_ONLY' && !inviteToken && (
                    <Callout tone="danger" title={tNick('inviteRequiredTitle')}>
                      <p className="mt-1 text-[13px] leading-relaxed text-fg">
                        {tNick('inviteRequiredText', { name: department.name })}
                      </p>
                    </Callout>
                  )}

                  <Callout tone="warning" title={tNick('securityWarningTitle')}>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg">
                      {tNick('securityWarningText', { nicknameTerm: org.nicknameTerm })}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                      {tNick.rich('securityWarningRecommendation', {
                        registerLink: (chunks) => (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('register');
                              goTo('password');
                            }}
                            className="font-medium text-accent-ink underline-offset-4 hover:underline"
                          >
                            {chunks}
                          </button>
                        ),
                      })}
                    </p>
                  </Callout>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={tNick('firstName')}>
                      <Input
                        type="text"
                        value={quickFirstName}
                        onChange={(e) => setQuickFirstName(e.target.value)}
                        autoComplete="given-name"
                        maxLength={80}
                      />
                    </Field>
                    <Field label={tNick('lastName')} hint={tNick('optional')}>
                      <Input
                        type="text"
                        value={quickLastName}
                        onChange={(e) => setQuickLastName(e.target.value)}
                        autoComplete="family-name"
                        maxLength={80}
                      />
                    </Field>
                  </div>

                  {department.stufen.length > 0 && (
                    <section aria-labelledby="stufen-titel">
                      <h2 id="stufen-titel" className="text-sm font-semibold text-fg">
                        {tNick('stufenTitle')}
                      </h2>
                      <p className="mt-0.5 text-xs text-fg-subtle">{tNick('stufenSubtitle')}</p>
                      <ul className="mt-2.5 divide-y divide-line rounded-card border border-line bg-surface/70">
                        {department.stufen.map((stufe) => {
                          const role = quickStufen[stufe.id] ?? null;
                          return (
                            <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                              <span className="text-sm font-semibold text-fg">{stufe.name}</span>
                              <div
                                role="radiogroup"
                                aria-label={tNick('roleIn', { name: stufe.name })}
                                className="flex rounded-full bg-surface-2 p-0.5"
                              >
                                {stufeOptions.map((option) => (
                                  /* biome-ignore lint/a11y/useSemanticElements: Segmented Control mit ARIA-Radio-Pattern */
                                  <button
                                    key={option.label}
                                    type="button"
                                    role="radio"
                                    aria-checked={role === option.value}
                                    onClick={() =>
                                      setQuickStufen((prev) => {
                                        const next = { ...prev };
                                        if (option.value) next[stufe.id] = option.value;
                                        else delete next[stufe.id];
                                        return next;
                                      })
                                    }
                                    className={cn(
                                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                                      role === option.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                                    )}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={!!success}
                    className="w-full shadow-soft"
                  >
                    {loading ? tNick('creating') : tNick('createAndContinue')}
                  </Button>
                  <p className="px-1 text-[12px] leading-relaxed text-fg-subtle">
                    {tNick('nextTimeNotice', {
                      nicknameTerm: org.nicknameTerm,
                      options:
                        org.slug === 'verein'
                          ? 'E-Mail und Passwort'
                          : `${org.authProviderShort} oder mit E-Mail und Passwort`,
                    })}
                  </p>
                </div>
              </form>
            )}

            {view === 'password' && (
              <form key="password" onSubmit={handlePasswordSubmit}>
                {/* Segmented Control / Pill-Tabs für schnelles Umschalten */}
                <div className="mb-6 flex rounded-full border border-line/70 bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setError(null);
                    }}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-xs font-semibold transition-all duration-200',
                      authMode === 'login' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {tPwd('tabLogin')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setError(null);
                    }}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-xs font-semibold transition-all duration-200',
                      authMode === 'register' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {tPwd('tabRegister')}
                  </button>
                </div>

                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  {authMode === 'login' ? tPwd('loginTitle') : tPwd('registerTitle')}
                </h1>
                <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">
                  {authMode === 'login'
                    ? tPwd('loginSubtitle')
                    : tPwd('registerSubtitle', { unitTermPlural: org.unitTermPlural })}
                </p>

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  {authMode === 'register' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={tPwd('firstName')} required>
                          <Input
                            type="text"
                            value={regFirstName}
                            onChange={(e) => setRegFirstName(e.target.value)}
                            autoComplete="given-name"
                            minLength={2}
                            required
                          />
                        </Field>
                        <Field label={tPwd('lastName')} hint={tNick('optional')}>
                          <Input
                            type="text"
                            value={regLastName}
                            onChange={(e) => setRegLastName(e.target.value)}
                            autoComplete="family-name"
                          />
                        </Field>
                      </div>

                      <Field
                        label={tPwd('nickname', { nicknameTerm: org.nicknameTerm })}
                        hint={tPwd('nicknameHint', { nicknameTerm: org.nicknameTerm })}
                      >
                        <Input
                          type="text"
                          value={regCeviName}
                          onChange={(e) => setRegCeviName(e.target.value)}
                          autoComplete="nickname"
                        />
                      </Field>
                    </>
                  )}

                  <Field label={tPwd('email')} required>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus={authMode === 'login'}
                      required
                    />
                  </Field>

                  <div>
                    <Field
                      label={tPwd('password')}
                      required
                      hint={authMode === 'register' ? tPwd('min8Chars') : undefined}
                    >
                      <PasswordInput
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                        minLength={authMode === 'register' ? 8 : undefined}
                        required
                      />
                    </Field>

                    {/* Passwort-Stärke-Balken bei Registrierung */}
                    {authMode === 'register' && password.length > 0 && (
                      <div className="mt-2.5 space-y-1.5" aria-live="polite">
                        <div className="grid grid-cols-4 gap-1.5 h-1.5">
                          {[1, 2, 3, 4].map((step) => {
                            const active = pwdStrength.score >= step;
                            const color =
                              pwdStrength.tone === 'danger'
                                ? 'bg-danger'
                                : pwdStrength.tone === 'warning'
                                ? 'bg-amber-500'
                                : pwdStrength.tone === 'info'
                                ? 'bg-sky-500'
                                : 'bg-emerald-500';
                            return (
                              <div
                                key={step}
                                className={cn(
                                  'rounded-full transition-all duration-300',
                                  active ? color : 'bg-surface-3'
                                )}
                              />
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between text-2xs text-fg-subtle">
                          <span>{tPwd('strength')}</span>
                          <span
                            className={cn(
                              'font-medium transition-colors',
                              pwdStrength.tone === 'danger'
                                ? 'text-danger-ink'
                                : pwdStrength.tone === 'warning'
                                ? 'text-amber-600 dark:text-amber-400'
                                : pwdStrength.tone === 'info'
                                ? 'text-sky-600 dark:text-sky-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            )}
                          >
                            {pwdStrength.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {authMode === 'login' && (
                    <p className="-mt-1.5 text-right text-xs">
                      <a
                        href={withReturnTo(
                          `/passwort-vergessen${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`,
                          returnTo
                        )}
                        className="font-medium text-accent-ink underline-offset-4 hover:underline"
                      >
                        {tPwd('forgotPassword')}
                      </a>
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={!!success}
                    className="w-full shadow-soft"
                  >
                    {loading
                      ? authMode === 'login'
                        ? tPwd('loggingIn')
                        : tPwd('creating')
                      : authMode === 'login'
                      ? tPwd('submitLogin')
                      : tPwd('submitRegister')}
                  </Button>

                  {authMode === 'login' && (
                    <Callout
                      tone="info"
                      title={
                        org.slug === 'verein'
                          ? tPwd('existingAccountCalloutTitleVerein')
                          : tPwd('existingAccountCalloutTitleOrg', { authProviderShort: org.authProviderShort })
                      }
                    >
                      <p>
                        {tPwd.rich(
                          org.slug === 'verein'
                            ? 'existingAccountCalloutTextVerein'
                            : 'existingAccountCalloutTextOrg',
                          {
                            authProviderShort: org.authProviderShort,
                            resetLink: (chunks) => (
                              <a
                                href={withReturnTo(
                                  `/passwort-vergessen${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`,
                                  returnTo
                                )}
                                className="font-medium text-accent-ink underline-offset-4 hover:underline"
                              >
                                {chunks}
                              </a>
                            ),
                          }
                        )}
                      </p>
                    </Callout>
                  )}
                </div>
              </form>
            )}

            {view === 'verify_sent' && (
              <div key="verify_sent">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Mail className="size-6" />
                </div>
                <h1 className="mt-4 font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  {tVerify('title')}
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                  {tVerify.rich('sentTo', {
                    email,
                    bold: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
                  })}
                </p>
                <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-fg-subtle">
                  {tVerify('instructions')}
                </div>

                {resendNotice && (
                  <div className="mt-4">
                    <Callout tone={resendNotice.tone}>{resendNotice.text}</Callout>
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    loading={resending}
                    disabled={resending}
                    onClick={() => handleResend(email)}
                    className="w-full"
                  >
                    {tVerify('resend')}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    onClick={() => {
                      setView('password');
                      setAuthMode('login');
                      setError(null);
                      setResendNotice(null);
                    }}
                    className="w-full"
                  >
                    {tVerify('backToLogin')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Kurzer Datenschutzhinweis: muss mit der Datenschutzerklärung übereinstimmen (Dienstleister in Abschnitt 7) */}
      <p className="mt-5 text-center text-xs leading-relaxed text-fg-subtle px-2">
        {tShell.rich('privacyNotice', {
          privacyLink: (chunks) => (
            <a href={privacyUrl(org.domain)} className="underline underline-offset-2 hover:text-fg">
              {chunks}
            </a>
          ),
        })}
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <LoginContent />
    </Suspense>
  );
}
