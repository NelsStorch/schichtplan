'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  KeyRound,
  LayoutGrid,
  LogOut,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useIntlLocale } from '../i18n/LocaleSwitcher';
import {
  PLACEHOLDER_LAST_NAME,
  STUFE_ROLES,
  formatZurichTimeRange,
  getDepartmentSetupUrl,
  getDepartmentUrl,
  isPlaceholderEmail,
  zurichDateTimeFormat,
  type MyHoursSummaryDto,
  type OrganizationType,
  type UserDto,
} from '@schichtplan/shared';
import { Avatar } from './Display';
import { Badge } from './Badge';
import { Button, buttonClasses } from './Button';
import { Callout, useConfirm, useToast } from './Feedback';
import { Field, Input } from './Field';
import { NotificationSettings } from './NotificationSettings';
import { PasswordSettings } from './PasswordSettings';
import { TwoFactorSettings } from './TwoFactorSettings';
import { useOrganization } from './OrganizationContext';
import { cn } from '../utils/cn';

export const PROFILE_TABS = ['uebersicht', 'angaben', 'benachrichtigungen', 'sicherheit'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** Texte im Katalog ui.profile.tabs; `short` passt auf dem Handy in vier gleich breite Tabs */
const TAB_META: Record<
  ProfileTab,
  {
    label: 'overview' | 'details' | 'notifications' | 'security';
    short: 'overview' | 'details' | 'notificationsShort' | 'securityShort';
    icon: typeof Bell;
  }
> = {
  uebersicht: { label: 'overview', short: 'overview', icon: LayoutGrid },
  angaben: { label: 'details', short: 'details', icon: UserRound },
  benachrichtigungen: { label: 'notifications', short: 'notificationsShort', icon: Bell },
  sicherheit: { label: 'security', short: 'securityShort', icon: KeyRound },
};

/** Ausschnitt aus GET /api/shifts/my (Schichten über alle Abteilungen) */
interface ProfileShift {
  signupId: string;
  title: string | null;
  taskTitle?: string | null;
  startTime: string;
  endTime: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  departmentOrganization?: OrganizationType;
  isResponsible?: boolean;
  responsibleRole?: string | null;
}

interface CalendarTokenData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
}

const DAY_OPTIONS = { weekday: 'short', day: 'numeric', month: 'short' } as const;

const SHIFT_PREVIEW = 3;

function readTabFromUrl(): ProfileTab {
  if (typeof window === 'undefined') return 'uebersicht';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return (PROFILE_TABS as readonly string[]).includes(tab ?? '') ? (tab as ProfileTab) : 'uebersicht';
}

export interface ProfileViewProps {
  user: UserDto;
  onUserChange: (user: UserDto) => void;
  /**
   * Slug der Abteilung, auf deren Subdomain die Seite läuft. Ohne Angabe läuft die Seite auf der
   * Startseite (Landing); dann verlinken wir in die Abteilungs-App der Heimabteilung.
   */
  currentDepartmentSlug?: string;
  /** Abmelden; ohne Angabe meldet die Komponente selbst ab und geht zur Startseite */
  onLogout?: () => void | Promise<void>;
}

/**
 * Profilseite auf der Startseite (cevi-schichtplan.ch/profil) mit allen grösseren Einstellungen. Die
 * Abteilungs-Apps haben nur einen kleinen Konto-Dialog (inkl. Push für ihre Adresse) und leiten /profil
 * hierher weiter. Inhalt in vier Tabs, der aktive Tab steht in `?tab=`.
 */
export function ProfileView({ user, onUserChange, currentDepartmentSlug, onLogout }: ProfileViewProps) {
  const org = useOrganization();
  const tr = useTranslations('ui.profile');
  const [tab, setTab] = useState<ProfileTab>('uebersicht');

  useEffect(() => {
    setTab(readTabFromUrl());
    const onPop = () => setTab(readTabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const selectTab = (next: ProfileTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'uebersicht') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  const logout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  const name = user.nickname || user.ceviName || user.firstName;
  const fullName = [user.firstName, user.lastName === PLACEHOLDER_LAST_NAME ? '' : user.lastName].join(' ').trim();
  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));

  const home = user.homeDepartment;
  const onHomeDepartment = Boolean(home && currentDepartmentSlug && home.slug === currentDepartmentSlug);
  /**
   * Abteilungs-App, in der Push auch auf dem iPhone geht (installierbar). `?konto=push` öffnet dort den
   * Konto-Dialog mit dem Push-Schalter für diese Adresse.
   */
  const appUrl =
    !currentDepartmentSlug && home ? getDepartmentUrl(home.slug, '/?konto=push', home.organization) : undefined;

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <Avatar name={name} size="lg" highlight />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">{name}</h1>
          <p className="truncate text-sm text-fg-muted">
            {[fullName !== name ? fullName : '', home?.name ?? ''].filter(Boolean).join(' · ')}
          </p>
          {user.hasCeviDb && (
            <Badge size="sm" className="mt-2">
              <Database className="size-3" /> {org.authProviderShort || tr('providerFallback')}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label={tr('logout')} className="shrink-0">
          <LogOut /> <span className="hidden sm:inline">{tr('logout')}</span>
        </Button>
      </section>

      <div
        aria-label={tr('tablistLabel')}
        role="tablist"
        className="grid grid-cols-4 gap-1 rounded-card border border-line bg-surface p-1 sm:flex sm:rounded-full"
      >
        {PROFILE_TABS.map((key) => {
          const { label, short, icon: Icon } = TAB_META[key];
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`profil-tab-${key}`}
              aria-selected={active}
              aria-controls={`profil-panel-${key}`}
              onClick={() => selectTab(key)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-field px-1 py-2 text-[11px] font-semibold transition',
                'sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:text-sm',
                active ? 'bg-accent/15 text-accent-ink' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="max-w-full truncate sm:hidden">{tr(`tabs.${short}`)}</span>
              <span className="hidden sm:inline">{tr(`tabs.${label}`)}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`profil-panel-${tab}`} aria-labelledby={`profil-tab-${tab}`} className="space-y-5">
        {tab === 'uebersicht' && (
          <OverviewTab
            user={user}
            currentDepartmentSlug={currentDepartmentSlug}
            onHomeDepartment={onHomeDepartment}
            hasRealEmail={hasRealEmail}
            onSelectTab={selectTab}
          />
        )}
        {tab === 'angaben' && <DetailsTab user={user} onUserChange={onUserChange} />}
        {tab === 'benachrichtigungen' && (
          <NotificationSettings user={user} onUserChange={onUserChange} appUrl={appUrl} />
        )}
        {tab === 'sicherheit' && <SecurityTab user={user} onUserChange={onUserChange} />}
      </div>
    </div>
  );
}

function ProfileCard({
  title,
  icon: Icon,
  action,
  description,
  children,
  className,
}: {
  title: ReactNode;
  icon?: typeof Bell;
  action?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg">
            {Icon && <Icon className="size-4 text-accent-ink" aria-hidden />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/* ---------------------------------- Übersicht ---------------------------------- */

function OverviewTab({
  user,
  currentDepartmentSlug,
  onHomeDepartment,
  hasRealEmail,
  onSelectTab,
}: {
  user: UserDto;
  currentDepartmentSlug?: string;
  onHomeDepartment: boolean;
  hasRealEmail: boolean;
  onSelectTab: (tab: ProfileTab) => void;
}) {
  const org = useOrganization();
  const toast = useToast();
  const tr = useTranslations('ui.profile');
  const intlLocale = useIntlLocale();
  const [shifts, setShifts] = useState<ProfileShift[] | null>(null);
  const [hours, setHours] = useState<MyHoursSummaryDto | null>(null);
  const [calData, setCalData] = useState<CalendarTokenData | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void user.id;
    let cancelled = false;
    fetch('/api/shifts/my', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProfileShift[]) => !cancelled && setShifts(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setShifts([]));
    fetch('/api/shifts/my/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && data && setHours(data as MyHoursSummaryDto))
      .catch(() => {});
    fetch('/api/calendar/token', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && data && setCalData(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const home = user.homeDepartment;
  const upcoming = (shifts ?? [])
    .filter((s) => new Date(s.endTime).getTime() > Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const allShiftsHref = currentDepartmentSlug
    ? '/meine-schichten'
    : home
      ? getDepartmentUrl(home.slug, '/meine-schichten', home.organization)
      : undefined;
  const setupHref = getDepartmentSetupUrl(typeof window === 'undefined' ? undefined : window.location.href);

  const copyCalendarUrl = async () => {
    if (!calData?.httpsUrl) return;
    try {
      await navigator.clipboard.writeText(calData.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: tr('calendarCopied'), description: tr('calendarCopiedHint') });
    } catch {
      toast({ title: tr('copyFailed'), description: tr('copyFailedHint'), tone: 'error' });
    }
  };

  /** Offene Punkte, die das Profil vervollständigen */
  const todos: { key: string; text: string; tab?: ProfileTab; href?: string }[] = [];
  if (user.needsDepartmentSetup) {
    todos.push({ key: 'dept', text: tr('todoUnit', { unit: org.unitTerm }), href: setupHref });
  }
  if (!hasRealEmail) {
    todos.push({ key: 'email', text: tr('todoEmail'), tab: 'angaben' });
  } else if (!user.emailVerified) {
    todos.push({ key: 'verify', text: tr('todoVerify'), tab: 'angaben' });
  }
  if ((user.pushSubscriptionCount ?? 0) === 0) {
    todos.push({ key: 'push', text: tr('todoPush'), tab: 'benachrichtigungen' });
  }

  return (
    <>
      <ProfileCard
        title={tr('nextShifts')}
        icon={CalendarDays}
        action={
          calData && (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen((v) => !v)}
            >
              <CalendarPlus /> {tr('subscribeCalendar')}
            </Button>
          )
        }
      >
        {calData && calendarOpen && (
          <div className="mb-4 space-y-2 rounded-field border border-line bg-surface-1 p-3">
            <p className="text-xs text-fg-muted">
              {tr('calendarInfo')}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calData.webcalUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <CalendarPlus /> {tr('googleCalendar')}
              </a>
              <a href={calData.webcalUrl} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                <CalendarSync /> Apple / Outlook
              </a>
              <Button variant="ghost" size="sm" onClick={() => void copyCalendarUrl()}>
                {copied ? <Check className="text-success-ink" /> : <Copy />} {tr('copyLink')}
              </Button>
            </div>
          </div>
        )}

        {shifts === null ? (
          <div className="h-16 animate-pulse rounded-field bg-surface-2" aria-busy />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-fg-muted">{tr('noUpcoming')}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {upcoming.slice(0, SHIFT_PREVIEW).map((s) => {
              const title = s.title || s.taskTitle || s.eventTitle;
              return (
                <li key={s.signupId}>
                  <a
                    href={getDepartmentUrl(s.departmentSlug, `/events/${s.eventSlug}`, s.departmentOrganization)}
                    className="flex items-center justify-between gap-3 py-2.5 transition hover:text-accent-ink"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {title}
                          {s.taskTitle && s.taskTitle !== title ? ` · ${s.taskTitle}` : ''}
                        </span>
                        {s.isResponsible && (
                          <Badge tone="accent" size="sm" className="shrink-0">
                            {s.responsibleRole || tr('lead')}
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {zurichDateTimeFormat(DAY_OPTIONS, intlLocale).format(new Date(s.startTime))},{' '}
                        {formatZurichTimeRange(s.startTime, s.endTime, intlLocale)} ·{' '}
                        {s.eventTitle}
                        {s.departmentSlug !== currentDepartmentSlug ? ` · ${s.departmentName}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {allShiftsHref && shifts !== null && (
          <a
            href={allShiftsHref}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline"
          >
            {upcoming.length > SHIFT_PREVIEW ? tr('allShifts', { count: upcoming.length }) : tr('myShifts')}
            <ChevronRight className="size-4" />
          </a>
        )}
      </ProfileCard>

      {hours && hours.shiftCount > 0 && (
        <ProfileCard title={tr('hoursTitle')} icon={Clock} description={tr('hoursDescription')}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { value: tr('hours', { hours: hours.totalHours }), label: tr('hoursTotal') },
              { value: tr('hours', { hours: hours.completedHours }), label: tr('hoursDone') },
              { value: tr('hours', { hours: hours.upcomingHours }), label: tr('hoursPlanned') },
            ].map((item) => (
              <div key={item.label} className="rounded-field bg-surface-2 px-2 py-3">
                <div className="font-mono text-lg font-bold text-fg">{item.value}</div>
                <div className="mt-0.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{item.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-subtle">
            {tr('hoursSummary', { shifts: hours.shiftCount, events: hours.eventCount })}
          </p>
        </ProfileCard>
      )}

      <ProfileCard
        title={tr('unitAndGroups', { unit: org.unitTerm })}
        icon={Building2}
        action={
          <div className="flex flex-wrap gap-2">
            {home && !onHomeDepartment && (
              <a
                href={getDepartmentUrl(home.slug, '/', home.organization)}
                className={buttonClasses({ size: 'sm', variant: 'secondary' })}
              >
                {tr('toShiftPlan')} <ArrowUpRight />
              </a>
            )}
            <a href={setupHref} className={buttonClasses({ size: 'sm', variant: 'ghost' })}>
              {tr('change')}
            </a>
          </div>
        }
      >
        <p className="text-base font-semibold">
          {home?.name ?? (user.needsDepartmentSetup ? tr('notSet') : tr('noUnit', { org: org.slug, unit: org.unitTerm }))}
        </p>
        {user.stufen && user.stufen.length > 0 && (
          <p className="mt-0.5 text-sm text-fg-muted">
            {user.stufen.map((s) => `${s.name} (${STUFE_ROLES[s.role]})`).join(', ')}
          </p>
        )}
        {user.homeDepartmentFromCeviDb && (
          <p className="mt-1 text-xs text-fg-subtle">
            {tr('fromProvider', { provider: org.authProviderShort || tr('providerDbFallback') })}
          </p>
        )}
      </ProfileCard>

      {todos.length > 0 && (
        <ProfileCard title={tr('openItems')} className="border-dashed">
          <ul className="-my-1 divide-y divide-line">
            {todos.map((t) => {
              const inner = (
                <>
                  <span>{t.text}</span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                </>
              );
              const cls =
                'flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm font-medium transition hover:text-accent-ink';
              return (
                <li key={t.key}>
                  {t.href ? (
                    <a href={t.href} className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <button type="button" className={cls} onClick={() => t.tab && onSelectTab(t.tab)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </ProfileCard>
      )}
    </>
  );
}

/* ---------------------------------- Angaben ---------------------------------- */

function DetailsTab({ user, onUserChange }: { user: UserDto; onUserChange: (user: UserDto) => void }) {
  const org = useOrganization();
  const tr = useTranslations('ui.profile');
  const provider = org.authProviderShort || tr('providerDbFallback');
  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));
  // Wie canChangeOwnEmail im Backend: ohne echte Adresse, oder selbst eingetragen und noch unbestätigt
  const emailEditable = !hasRealEmail || Boolean(!user.emailVerified && !user.hasPassword && !user.hasCeviDb);
  // Geburtsdatum aus Cevi.DB zählt für Altersgrenzen: nur dort änderbar
  const birthDateFromCeviDb = Boolean(user.hasCeviDb && user.birthDate);

  const [form, setForm] = useState(() => ({
    firstName: user.firstName ?? '',
    lastName: user.lastName === PLACEHOLDER_LAST_NAME ? '' : (user.lastName ?? ''),
    phone: user.phone ?? '',
    // Unbestätigte, selbst eingetragene Adresse vorausfüllen, damit sich ein Tippfehler korrigieren lässt
    email: hasRealEmail && emailEditable ? (user.email ?? '') : '',
    birthDate: user.birthDate ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const resendVerification = async () => {
    if (!user.email) return;
    setResending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('sendFailed'));
      setMessage({ tone: 'success', text: data.message || tr('linkSent') });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : tr('sendFailed') });
    } finally {
      setResending(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: Record<string, string> = {};
    if (form.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.birthDate && !birthDateFromCeviDb) payload.birthDate = form.birthDate;
    if (emailEditable && form.email.trim() && form.email.trim().toLowerCase() !== user.email) {
      payload.email = form.email.trim();
    }
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('saveFailed'));
      onUserChange(data as UserDto);
      setMessage({ tone: 'success', text: tr('detailsSaved') });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : tr('saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileCard
      title={tr('detailsTitle')}
      icon={UserRound}
      description={
        user.hasCeviDb
          ? tr('detailsHintProvider', { provider })
          : tr('detailsHint')
      }
    >
      <form onSubmit={save} className="space-y-5">
        {message && <Callout tone={message.tone}>{message.text}</Callout>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('firstName')}>
            <Input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              autoComplete="given-name"
            />
          </Field>
          <Field label={tr('lastName')}>
            <Input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              autoComplete="family-name"
            />
          </Field>
          <Field label={tr('phone')}>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              autoComplete="tel"
              placeholder="+41 79 000 00 00"
            />
          </Field>
          <Field label={tr('birthDate')} hint={birthDateFromCeviDb ? tr('birthDateFromProvider', { provider }) : undefined}>
            <Input
              type="date"
              value={form.birthDate}
              disabled={birthDateFromCeviDb}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              autoComplete="bday"
            />
          </Field>
          {!emailEditable ? (
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-fg-subtle">{tr('email')}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-fg">{user.email}</span>
                {user.emailVerified ? (
                  <Badge tone="success" size="sm">
                    <Check className="size-3" /> {tr('confirmed')}
                  </Badge>
                ) : (
                  <>
                    <Badge tone="warning" size="sm">
                      {tr('notConfirmed')}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => void resendVerification()}
                      disabled={resending}
                      className="text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                    >
                      {resending ? tr('sending') : tr('requestLink')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Field
                label={tr('email')}
                hint={hasRealEmail ? tr('emailUnconfirmedHint') : undefined}
              >
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </Field>
              {hasRealEmail && (
                <button
                  type="button"
                  onClick={() => void resendVerification()}
                  disabled={resending}
                  className="mt-1.5 text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                >
                  {resending ? tr('sending') : tr('requestLinkTo', { email: user.email ?? '' })}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            {tr('addressNotStored')}
          </p>
          <Button type="submit" loading={saving} className="shrink-0">
            {tr('save')}
          </Button>
        </div>
      </form>
    </ProfileCard>
  );
}

/* ---------------------------------- Sicherheit ---------------------------------- */

function SecurityTab({ user, onUserChange }: { user: UserDto; onUserChange: (user: UserDto) => void }) {
  const org = useOrganization();
  const confirm = useConfirm();
  const toast = useToast();
  const tr = useTranslations('ui.profile');
  const tActions = useTranslations('common.actions');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Download im Hintergrund, damit Fehler (z. B. zu viele Downloads) als Meldung statt als rohe Seite erscheinen */
  const downloadData = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/auth/me/export', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || tr('downloadFailedFallback'));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tr('exportFileName');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: tr('downloaded'), tone: 'success' });
    } catch (err) {
      toast({
        title: tr('downloadFailed'),
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  /** Konten nur mit Cevi-Name/Spitzname können sich nicht selbst löschen: Antrag an die Datenschutz-Kontaktadresse */
  const requestDeletion = async () => {
    const confirmed = await confirm({
      title: tr('requestDeletionTitle'),
      description: tr('requestDeletionText'),
      confirmLabel: tr('requestDeletion'),
      cancelLabel: tActions('cancel'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/auth/me/deletion-request', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('requestFailedFallback'));
      toast({ title: tr('requestSent'), description: data.message, tone: 'success' });
    } catch (err) {
      toast({
        title: tr('requestNotSent'),
        description: err instanceof Error ? err.message : tr('requestFailedFallback'),
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  const deleteAccount = async () => {
    const confirmed = await confirm({
      title: tr('deleteTitle'),
      description: tr('deleteText'),
      confirmLabel: tr('deleteConfirm'),
      cancelLabel: tActions('cancel'),
      tone: 'danger',
      countdownSeconds: 7,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr('deleteFailedFallback'));
      toast({ title: tr('deleted'), tone: 'success' });
      window.location.href = '/';
    } catch (err) {
      toast({
        title: tr('deleteFailed'),
        description: err instanceof Error ? err.message : tr('deleteFailedFallback'),
        tone: 'error',
      });
      setDeleting(false);
    }
  };

  return (
    <>
      <PasswordSettings user={user} onUserChange={onUserChange} />
      <TwoFactorSettings user={user} onUserChange={onUserChange} />
      <ProfileCard
        title={tr('dataTitle')}
        icon={Database}
        description={tr('dataDescription')}
        action={
          <Button variant="secondary" size="sm" loading={exporting} onClick={() => void downloadData()}>
            <Download /> {tr('downloadData')}
          </Button>
        }
      />
      {user.canSelfDelete ? (
        <section className="rounded-card border border-danger/30 bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-danger-ink">{tr('deleteAccount')}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {tr('deleteAccountText', { app: org.name })}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => void deleteAccount()} disabled={deleting} className="shrink-0">
              <Trash2 aria-hidden />
              {deleting ? tr('deleting') : tr('deleteAccount')}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-danger/30 bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-danger-ink">{tr('deleteAccount')}</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {tr('requestDeletionInfo')}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => void requestDeletion()} disabled={deleting} className="shrink-0">
              <Trash2 aria-hidden />
              {tr('requestDeletion')}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
