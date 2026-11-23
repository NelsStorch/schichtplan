'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarPlus,
  CalendarSync,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  LogIn,
  Mail,
  Phone,
  RefreshCw,
  Repeat,
  Shield,
  Ticket,
  UserMinus,
  Users,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  cancelDeadlineAt,
  cancelDeadlineText,
  formatSwissNumber,
  getDepartmentUrl,
  replacementDeadline,
  type ResponsiblePersonDto,
} from '@schichtplan/shared';
import { Badge, Button, Card, EmptyState, Skeleton, buttonClasses, cn, trackUi, useConfirm, useToast } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { CalendarSubscribeDialog } from '@/components/CalendarSubscribeDialog';
import { ReplacementDialog } from '@/components/event/ReplacementDialog';
import { CateringTokensDialog } from '@/components/CateringTokensDialog';
import { ApiError, api, errorMessage, loginUrl } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtDuration, fmtRelativeDay, fmtTime, fmtTimeRange, fmtWeekday, groupByBusinessDay, hoursBetween, shiftName } from '@/lib/format';
import {
  detectClientDevice,
  downloadIcs,
  googleCalendarSubscribeUrl,
  googleCalendarUrl,
  type CalendarEntry,
  type ClientDevice,
} from '@/lib/ics';
import { usePortal } from '@/lib/portal';
import type { MyShift } from '@/lib/types';

interface CalendarTokenData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
  resetNotice?: boolean;
}

const toCalendar = (s: MyShift): CalendarEntry => {
  const rolePrefix = s.isResponsible ? `[${s.responsibleRole || 'Leitung'}] ` : '';
  const taskSuffix = s.taskTitle && s.taskTitle !== s.title ? ` (${s.taskTitle})` : '';
  const leaders = s.responsibles?.map((r) => r.displayName).join(', ');
  return {
    uid: s.signupId,
    title: `${rolePrefix}${s.title?.trim() || s.taskTitle || shiftName(s)}${s.title?.trim() ? taskSuffix : ''} (${s.eventTitle})`,
    description: [
      s.isResponsible ? `Rolle: ${s.responsibleRole || 'Leitung'}` : null,
      s.taskTitle && s.taskTitle !== s.title ? `Arbeit: ${s.taskTitle}` : null,
      s.category ? `Kategorie: ${s.category}` : null,
      leaders ? `Schicht-/Tagesleitung: ${leaders}` : null,
      s.coHelpers?.length ? `Mit dir eingeteilt: ${s.coHelpers.join(', ')}` : null,
      s.description,
      `Anlass: ${s.eventTitle}`,
      `Abteilung: ${s.departmentName}`,
    ]
      .filter(Boolean)
      .join('\n'),
    location: s.departmentName,
    start: s.startTime,
    end: s.endTime,
  };
};

/** Prüft, ob eine Schicht erweiterte Briefing-Infos (Beschreibung, Leitung, Team, Kontakt) besitzt */
function hasBriefingDetails(s: MyShift): boolean {
  return Boolean(
    s.description?.trim() ||
      (s.responsibles && s.responsibles.length > 0) ||
      (s.coHelpers && s.coHelpers.length > 0) ||
      s.contactUser
  );
}

export default function MyShiftsPage() {
  const t = useTranslations('web.myShifts');
  const { user, department, loading: sessionLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();
  const [shifts, setShifts] = useState<MyShift[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<MyShift | null>(null);
  const [cateringFor, setCateringFor] = useState<{ slug: string; title: string } | null>(null);
  const [calData, setCalData] = useState<CalendarTokenData | null>(null);
  const [resettingToken, setResettingToken] = useState(false);
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [clientDevice, setClientDevice] = useState<ClientDevice>('other');

  const isOtherDept = (s: MyShift) => Boolean(department && s.departmentSlug && s.departmentSlug !== department.slug);

  useEffect(() => {
    setClientDevice(detectClientDevice());
  }, []);

  const loadCalToken = useCallback(async () => {
    try {
      const data = await api<CalendarTokenData>('/api/calendar/token');
      setCalData(data);
    } catch {
      // Kalender-Token optional ignorieren falls nicht geladen
    }
  }, []);

  const dismissCalResetNotice = async () => {
    setCalData((prev) => (prev ? { ...prev, resetNotice: false } : prev));
    try {
      await api('/api/calendar/token/ack-notice', { method: 'POST' });
    } catch {
      // ignorieren
    }
  };

  const handleResetToken = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: t('offlineErrorTitle'),
        description: t('offlineResetDescription'),
        tone: 'error',
      });
      return;
    }
    const ok = await confirm({
      title: t('confirmResetTitle'),
      description: t('confirmResetDescription'),
      confirmLabel: t('confirmResetAction'),
      tone: 'danger',
    });
    if (!ok) return;
    setResettingToken(true);
    try {
      const data = await api<CalendarTokenData>('/api/calendar/token/reset', { method: 'POST' });
      setCalData(data);
      toast({
        title: t('resetSuccessTitle'),
        description: t('resetSuccessDescription'),
      });
    } catch (err) {
      toast({ title: t('resetErrorTitle'), description: errorMessage(err), tone: 'error' });
    } finally {
      setResettingToken(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setShifts(await api<MyShift[]>('/api/shifts/my'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsLogin(true);
      else toast({ title: t('loadErrorTitle'), description: errorMessage(err), tone: 'error' });
      setShifts([]);
    }
  }, [t, toast]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setNeedsLogin(true);
      return;
    }
    load();
    loadCalToken();
  }, [sessionLoading, user, load, loadCalToken]);

  // Wie oft die Seite offline (aus dem Zwischenspeicher) genutzt wird. Die Meldung wartet, bis wieder Netz da ist.
  useEffect(() => {
    trackUi('UI_MY_SHIFTS', navigator.onLine ? 'online' : 'offline');
  }, []);

  const cancel = async (shift: MyShift) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: t('offlineErrorTitle'),
        description: t('offlineCancelDescription'),
        tone: 'error',
      });
      return;
    }
    // Austrag-Sperre prüfen falls vorhanden
    if (
      !user?.isGlobalAdmin &&
      shift.eventStartDate &&
      shift.cancelDeadlineDays !== null &&
      shift.cancelDeadlineDays !== undefined
    ) {
      const deadline = cancelDeadlineAt(shift.eventStartDate, shift.cancelDeadlineDays);
      if (new Date() >= deadline) {
        const daysText = cancelDeadlineText(deadline, shift.cancelDeadlineDays);
        await confirm({
          title: t('cancelBlockedTitle'),
          description: t('cancelBlockedDescription', { title: shift.eventTitle, daysText }),
          confirmLabel: t('understoodAction'),
          tone: 'default',
        });
        return;
      }
    }
    const ok = await confirm({
      title: t('confirmCancelTitle'),
      description: t('confirmCancelDescription', {
        shiftName: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime),
      }),
      confirmLabel: t('cancelAction'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(shift.signupId);
    try {
      await api(`/api/shifts/${shift.shiftId}/signup`, { method: 'DELETE' });
      toast({
        title: t('cancelSuccessTitle'),
        description: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime),
      });
      await load();
    } catch (err) {
      toast({ title: t('cancelErrorTitle'), description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const offerReplacement = async (note: string) => {
    if (!replacementFor) return;
    setBusy(replacementFor.signupId);
    try {
      await api(`/api/signups/${replacementFor.signupId}/replacement`, { method: 'PUT', json: { note: note || null } });
      toast({
        title: t('replacementOfferedTitle'),
        description: t('replacementOfferedDescription'),
      });
      setReplacementFor(null);
      await load();
    } catch (err) {
      toast({ title: t('replacementErrorTitle'), description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const withdrawReplacement = async (shift: MyShift) => {
    setBusy(shift.signupId);
    try {
      await api(`/api/signups/${shift.signupId}/replacement`, { method: 'DELETE' });
      toast({
        title: t('replacementWithdrawnTitle'),
        description: t('replacementWithdrawnDescription'),
      });
      await load();
    } catch (err) {
      toast({ title: t('replacementErrorTitle'), description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (needsLogin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16">
          <EmptyState
            icon={<Ticket />}
            title={t('loginRequiredTitle')}
            description={t('loginRequiredDescription')}
            action={
              <a href={loginUrl()} className={buttonClasses()}>
                <LogIn /> {t('loginAction')}
              </a>
            }
          />
        </div>
      </AppShell>
    );
  }

  const now = Date.now();
  const upcoming = (shifts ?? []).filter((s) => new Date(s.endTime).getTime() >= now);
  const past = (shifts ?? []).filter((s) => new Date(s.endTime).getTime() < now);
  const next = [...upcoming].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))[0];
  const hours = (shifts ?? []).reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime), 0);

  const isApple = clientDevice === 'ios' || clientDevice === 'mac';

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-14">
        <header className="animate-fade-up">
          <h1 className="font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg sm:text-6xl">
            {t('title')}
          </h1>
          {shifts === null ? (
            <Skeleton className="mt-6 h-16 w-72" />
          ) : (
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <dl className="flex gap-8">
                <div>
                  <dt className="text-sm text-fg-subtle">{t('shiftsCount')}</dt>
                  <dd className="tabular font-display text-4xl font-extrabold tracking-tight text-fg">{shifts.length}</dd>
                </div>
                <div>
                  <dt className="text-sm text-fg-subtle">{t('hoursCount')}</dt>
                  <dd className="tabular font-display text-4xl font-extrabold tracking-tight text-fg">
                    {formatSwissNumber(hours, { maximumFractionDigits: 1 })}
                  </dd>
                </div>
              </dl>
              {calData && (
                <Button variant="secondary" size="sm" onClick={() => setCalDialogOpen(true)}>
                  <CalendarSync className="size-4" /> {t('calendarSubscribeAction')}
                </Button>
              )}
            </div>
          )}
        </header>

        {calData?.resetNotice && (
          <div className="mt-6 rounded-card border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-fg">
            <p className="font-semibold text-fg">{t('resetNoticeTitle')}</p>
            <p className="mt-1 text-fg-muted">
              {t.rich('resetNoticeDescription', {
                bold: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => setCalDialogOpen(true)}>
                <CalendarSync className="size-4" /> {t('resetNoticeSetupAction')}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissCalResetNotice}>
                {t('resetNoticeDismissAction')}
              </Button>
            </div>
          </div>
        )}

        {shifts === null ? (
          <div className="mt-10 grid gap-3">
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<Ticket />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Link href="/" className={buttonClasses()}>
                {t('findShiftsAction')} <ArrowRight />
              </Link>
            }
          />
        ) : (
          <>
            {/* 1. Ganz oben: Als Nächstes (Hero-Karte inkl. Einsatz-Briefing) */}
            {next && (
              <Card variant="raised" className="relative mt-10 animate-fade-up overflow-hidden p-6 [animation-delay:80ms] sm:p-8">
                <div aria-hidden className="absolute -right-20 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-fg-muted">{t('nextHeader')}</p>
                      {next.isResponsible && (
                        <Badge tone="accent">
                          <Shield className="size-3" /> {next.responsibleRole || t('roleLeader')}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.03em] text-accent-ink sm:text-6xl">
                      {fmtRelativeDay(next.startTime)}
                    </p>
                    <p className="mt-4 text-xl font-bold text-fg">
                      {next.title}
                      {next.taskTitle && next.taskTitle !== next.title && (
                        <span className="ml-2 text-base font-normal text-fg-muted">({next.taskTitle})</span>
                      )}
                    </p>
                    {isOtherDept(next) ? (
                      <a
                        href={getDepartmentUrl(next.departmentSlug, `/events/${next.eventSlug}`, next.departmentOrganization)}
                        className="block w-fit text-sm font-medium text-fg-muted hover:text-fg"
                      >
                        {next.eventTitle} <span className="text-xs text-fg-subtle">({next.departmentName})</span>
                      </a>
                    ) : (
                      <Link href={`/events/${next.eventSlug}`} className="block w-fit text-sm font-medium text-fg-muted hover:text-fg">
                        {next.eventTitle}
                      </Link>
                    )}
                    <p className="tabular mt-3 inline-flex items-center gap-2 font-mono text-[13px] text-fg-muted">
                      <Clock className="size-4" />
                      {fmtWeekday(next.startTime)}, {fmtDayMonth(next.startTime)} · {fmtTimeRange(next.startTime, next.endTime)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {next.cateringTokensEnabled && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setCateringFor({ slug: next.eventSlug, title: next.eventTitle })}
                      >
                        <UtensilsCrossed className="size-4" /> {t('cateringTokensAction')}
                      </Button>
                    )}
                    <a
                      href={googleCalendarUrl(toCalendar(next))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: 'secondary' })}
                      title={t('googleCalendarTitle')}
                    >
                      <CalendarPlus className="size-4" /> {t('googleCalendarAction')}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs(`schicht-${next.shiftId.slice(0, 8)}.ics`, [toCalendar(next)])}
                      title={t('icsDownloadTitle')}
                    >
                      <Download className="size-4" /> {t('icsDownloadAction')}
                    </Button>
                  </div>
                </div>

                {/* Kompaktes Einsatz-Briefing direkt in der Hero-Karte */}
                {hasBriefingDetails(next) && (
                  <div className="relative mt-6 border-t border-line/70 pt-5">
                    <ShiftBriefingPanel shift={next} />
                  </div>
                )}
              </Card>
            )}

            {/* 2. Anstehende Schichten */}
            {upcoming.length > 0 && (
              <section className="mt-12">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-fg">{t('upcomingHeader')}</h2>
                  {upcoming.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs('meine-schichten.ics', upcoming.map(toCalendar))}
                      title={t('exportAllIcsTitle')}
                    >
                      <Download className="size-4" /> {t('exportAllIcsAction')}
                    </Button>
                  )}
                </div>
                <Timeline
                  shifts={upcoming}
                  busy={busy}
                  onCancel={cancel}
                  onOfferReplacement={setReplacementFor}
                  onWithdrawReplacement={withdrawReplacement}
                  onOpenCatering={(slug, title) => setCateringFor({ slug, title })}
                />
              </section>
            )}

            {/* 3. Live-Kalender-Abo Box (sauber gestapelt, volle Textbreite, kein Überlappen) */}
            {calData && (
              <Card className="mt-12 border border-line bg-surface p-5 sm:p-6 animate-fade-up">
                <div className="flex flex-wrap items-center gap-2.5">
                  <CalendarSync className="size-5 text-accent-ink shrink-0" />
                  <h2 className="font-display text-lg font-bold text-fg">{t('liveCalendarTitle')}</h2>
                  <Badge tone="accent">{t('liveCalendarSyncBadge')}</Badge>
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
                  {t('liveCalendarDescription')}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {isApple ? (
                    <>
                      <a
                        href={calData.webcalUrl}
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                        title={t('subscribeAppleTitle')}
                      >
                        <CalendarSync className="size-4" /> {t('subscribeAppleAction')}
                      </a>
                      <a
                        href={googleCalendarSubscribeUrl(calData.webcalUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        title={t('subscribeGoogleTitle')}
                      >
                        <CalendarPlus className="size-4" /> {t('googleCalendarAction')}
                      </a>
                    </>
                  ) : (
                    <>
                      <a
                        href={googleCalendarSubscribeUrl(calData.webcalUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                        title={t('subscribeGoogleTitle')}
                      >
                        <CalendarPlus className="size-4" /> {t('subscribeGoogleAction')}
                      </a>
                      <a
                        href={calData.webcalUrl}
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        title={t('subscribeAppleTitle')}
                      >
                        <CalendarSync className="size-4" /> {t('appleCalendarTitle')}
                      </a>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCalDialogOpen(true)}
                  >
                    <HelpCircle className="size-4" /> {t('otherCalendarsAction')}
                  </Button>
                </div>
              </Card>
            )}

            {/* 4. Erledigte Schichten */}
            {past.length > 0 && (
              <section className="mt-14">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-fg-subtle">{t('pastHeader')}</h2>
                <Timeline shifts={past} muted onOpenCatering={(slug, title) => setCateringFor({ slug, title })} />
              </section>
            )}
          </>
        )}
      </div>

      {/* Pop-up Dialog: Wo hast du deinen Kalender? */}
      {calData && (
        <CalendarSubscribeDialog
          open={calDialogOpen}
          onClose={() => setCalDialogOpen(false)}
          calData={calData}
          shifts={(shifts ?? []).map(toCalendar)}
          clientDevice={clientDevice}
          onResetToken={handleResetToken}
          resettingToken={resettingToken}
        />
      )}

      <ReplacementDialog
        open={Boolean(replacementFor)}
        shiftLabel={replacementFor ? `${replacementFor.title}, ${replacementFor.eventTitle}` : undefined}
        busy={Boolean(replacementFor && busy === replacementFor.signupId)}
        onClose={() => setReplacementFor(null)}
        onSubmit={offerReplacement}
      />

      <CateringTokensDialog
        open={Boolean(cateringFor)}
        onClose={() => setCateringFor(null)}
        eventSlug={cateringFor?.slug ?? ''}
        eventTitle={cateringFor?.title ?? ''}
      />
    </AppShell>
  );
}

/** Kontakt-Pill für Schichtleitung, Tagesleitung oder Anlass-Kontakt (mit Direkt-Anruf / Mail) */
function ContactPill({ person, roleLabel }: { person: ResponsiblePersonDto; roleLabel?: string }) {
  const t = useTranslations('web.myShifts');
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
      <Shield className="size-3 text-accent-ink shrink-0" />
      {roleLabel && <span className="text-fg-subtle">{roleLabel}:</span>}
      <span className="font-semibold text-fg">{person.displayName}</span>
      {person.phone && (
        <a
          href={`tel:${person.phone.replace(/\s+/g, '')}`}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 font-mono text-2xs font-semibold text-accent-ink transition hover:bg-accent/20"
          title={t('callPersonTitle', { name: person.displayName, phone: person.phone })}
        >
          <Phone className="size-2.5" /> {person.phone}
        </a>
      )}
      {person.email && (
        <a
          href={`mailto:${person.email}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-fg-muted transition hover:text-fg"
          title={t('mailPersonTitle', { name: person.displayName, email: person.email })}
        >
          <Mail className="size-2.5" /> {t('mailShort')}
        </a>
      )}
    </span>
  );
}

/** Kompaktes Einsatz-Briefing (Beschreibung, Leitung mit Kontakt, eingeteiltes Team) – auch offline abrufbar */
function ShiftBriefingPanel({ shift }: { shift: MyShift }) {
  const t = useTranslations('web.myShifts');
  const responsibles = shift.responsibles ?? [];
  const respIds = new Set(responsibles.map((r) => r.id));
  const extraContact = shift.contactUser && !respIds.has(shift.contactUser.id) ? shift.contactUser : null;
  const coHelpers = shift.coHelpers ?? [];

  return (
    <div className="space-y-3 text-xs">
      {shift.description?.trim() && (
        <div className="flex items-start gap-2.5 rounded-field border border-line/70 bg-surface-2/70 p-3 text-sm text-fg">
          <FileText className="mt-0.5 size-4 shrink-0 text-accent-ink" />
          <p className="whitespace-pre-line leading-relaxed">{shift.description.trim()}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {responsibles.map((person) => (
          <ContactPill key={person.id} person={person} roleLabel={t('leaderRole')} />
        ))}
        {extraContact && <ContactPill person={extraContact} roleLabel={t('okContactRole')} />}
        {(coHelpers.length > 0 || shift.requiredSlots !== undefined) && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted">
            <Users className="size-3 shrink-0 text-fg-subtle" />
            {coHelpers.length > 0 ? (
              <span>
                {t.rich('teamWithYou', {
                  helpers: coHelpers.join(', '),
                  bold: (chunks) => <strong className="font-semibold text-fg">{chunks}</strong>,
                })}
              </span>
            ) : (
              <span>{t('teamNoneYet')}</span>
            )}
            {shift.requiredSlots !== undefined && shift.filledSlots !== undefined && (
              <span className="tabular text-fg-subtle">
                ({shift.filledSlots}/{shift.requiredSlots})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Berechnet die Pause oder den Übergang zwischen zwei aufeinanderfolgenden Schichten am selben Tag */
function BreakIndicator({ prev, next }: { prev: MyShift; next: MyShift }) {
  const t = useTranslations('web.myShifts');
  const prevEnd = new Date(prev.endTime).getTime();
  const nextStart = new Date(next.startTime).getTime();
  const diffMin = Math.round((nextStart - prevEnd) / 60000);

  if (diffMin === 0) {
    return (
      <div className="my-2 flex items-center gap-2 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-ink">
          <Zap className="size-3.5" /> {t('directConnection', { time: fmtTime(next.startTime) })}
        </span>
      </div>
    );
  }

  if (diffMin < 0) {
    return (
      <div className="my-2 flex items-center gap-2 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-ink">
          <RefreshCw className="size-3.5" /> {t('overlapConnection', {
            minutes: Math.abs(diffMin),
            from: fmtTime(next.startTime),
            to: fmtTime(prev.endTime),
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 flex items-center gap-2 py-1">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">
        <Coffee className="size-3.5 text-fg-subtle" /> {t('breakDuration', {
          duration: fmtDuration(prev.endTime, next.startTime),
          from: fmtTime(prev.endTime),
          to: fmtTime(next.startTime),
        })}
      </span>
    </div>
  );
}

/** Vertikale Zeitachse, gruppiert nach Geschäftstag (inkl. Pausen-Anzeige & Einsatz-Briefing). */
function Timeline({
  shifts,
  muted,
  busy,
  onCancel,
  onOfferReplacement,
  onWithdrawReplacement,
  onOpenCatering,
}: {
  shifts: MyShift[];
  muted?: boolean;
  busy?: string | null;
  onCancel?: (shift: MyShift) => void;
  onOfferReplacement?: (shift: MyShift) => void;
  onWithdrawReplacement?: (shift: MyShift) => void;
  onOpenCatering?: (slug: string, title: string) => void;
}) {
  const t = useTranslations('web.myShifts');
  const { department } = usePortal();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const isOtherDept = (s: MyShift) => Boolean(department && s.departmentSlug && s.departmentSlug !== department.slug);

  const toggleBriefing = (id: string) => {
    if (!expandedIds[id]) trackUi('UI_BRIEFING');
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ol className="space-y-8">
      {groupByBusinessDay(shifts).map((group) => {
        const iso = dayKeyToIso(group.key);
        const isMultiShiftDay = group.items.length > 1;
        return (
          <li key={group.key}>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <p className="flex items-baseline gap-2">
                <span className={cn('font-display text-lg font-bold', muted ? 'text-fg-muted' : 'text-fg')}>
                  {fmtWeekday(iso)}
                </span>
                <span className="text-sm text-fg-subtle">{fmtDayMonth(iso)}</span>
              </p>
              {isMultiShiftDay && (
                <Badge size="sm" tone={muted ? 'neutral' : 'accent'}>
                  {t('multiShiftDayBadge', { count: group.items.length })}
                </Badge>
              )}
            </div>
            <ul className="relative space-y-3 border-l-2 border-dashed border-line-strong pl-5 sm:pl-6">
              {group.items.map((s, i) => {
                const prevShift = i > 0 ? group.items[i - 1] : null;
                const hasBriefing = hasBriefingDetails(s);
                const isExpanded = Boolean(expandedIds[s.signupId]);
                const leaders = s.responsibles?.map((r) => r.displayName).join(', ');
                const hasContactOrDesc = Boolean(
                  s.description?.trim() ||
                    s.responsibles?.some((r) => r.phone || r.email) ||
                    s.contactUser?.phone ||
                    s.contactUser?.email
                );

                return (
                  <li
                    key={s.signupId}
                    style={{ '--i': i } as React.CSSProperties}
                    className={cn('relative animate-fade-up stagger', muted && 'opacity-70')}
                  >
                    {/* Pausen- oder Anschluss-Anzeige zwischen zwei Schichten am selben Tag */}
                    {prevShift && <BreakIndicator prev={prevShift} next={s} />}

                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-[calc(1.25rem+7px)] size-3 rounded-full ring-4 ring-canvas sm:-left-[calc(1.5rem+7px)]',
                        prevShift ? 'top-14' : 'top-6',
                        muted ? 'bg-line-strong' : 'bg-accent'
                      )}
                    />
                    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        <div className="tabular shrink-0 font-mono sm:w-28">
                          <p className="text-xl font-semibold text-fg">{fmtTime(s.startTime)}</p>
                          <p className="text-xs text-fg-subtle">{t('untilTime', { time: fmtTime(s.endTime) })}</p>
                          <p className="text-xs text-fg-subtle">{fmtDuration(s.startTime, s.endTime)}</p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {s.category && <Badge>{s.category}</Badge>}
                            {s.isResponsible && (
                              <Badge tone="accent">
                                <Shield className="size-3" /> {s.responsibleRole || t('roleLeader')}
                              </Badge>
                            )}
                            {s.taskTitle && s.taskTitle !== s.title && (
                              <Badge tone="neutral">{s.taskTitle}</Badge>
                            )}
                            {s.replacementWantedAt && (
                              <Badge tone="warning">
                                <Repeat className="size-3" /> {t('replacementWantedBadge')}
                              </Badge>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-base sm:text-lg text-fg">
                              {s.title?.trim() || s.taskTitle || t('defaultShiftTitle')}
                            </p>
                            {isOtherDept(s) ? (
                              <a
                                href={getDepartmentUrl(s.departmentSlug, `/events/${s.eventSlug}`, s.departmentOrganization)}
                                className="text-sm font-medium text-fg-muted hover:text-fg transition-colors"
                              >
                                {s.eventTitle} <span className="text-xs text-fg-subtle">({s.departmentName})</span>
                              </a>
                            ) : (
                              <Link href={`/events/${s.eventSlug}`} className="text-sm font-medium text-fg-muted hover:text-fg transition-colors">
                                {s.eventTitle}
                              </Link>
                            )}
                          </div>

                          {/* Kompakte Kurz-Zusammenfassung (Leitung & Team) direkt sichtbar */}
                          {hasBriefing && !isExpanded && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted pt-1">
                              {leaders && (
                                <span className="inline-flex items-center gap-1">
                                  <Shield className="size-3 text-accent-ink" /> {t('responsibleLeader')}{' '}
                                  <strong className="font-medium text-fg">{leaders}</strong>
                                </span>
                              )}
                              {s.coHelpers && s.coHelpers.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3 text-fg-subtle" /> {t('withHelpers')}{' '}
                                  <strong className="font-medium text-fg">{s.coHelpers.join(', ')}</strong>
                                </span>
                              )}
                              {hasContactOrDesc && (
                                <button
                                  type="button"
                                  onClick={() => toggleBriefing(s.signupId)}
                                  className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                                >
                                  {t('briefingAndContact')} <ChevronDown className="size-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {s.replacementWantedAt && (
                        <p className="mt-3 rounded-field border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink">
                          {t('replacementNotice', { note: s.replacementNote ? ` («${s.replacementNote}»)` : '' })}
                        </p>
                      )}

                      {/* Untere Aktionsleiste */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-line/70 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {s.cateringTokensEnabled && onOpenCatering && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onOpenCatering(s.eventSlug, s.eventTitle)}
                              title={t('cateringTokensAction')}
                              className="border-accent/40 text-accent-ink hover:bg-accent/10 font-semibold"
                            >
                              <UtensilsCrossed className="size-4" /> {t('cateringTokensAction')}
                            </Button>
                          )}
                          {hasContactOrDesc && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleBriefing(s.signupId)}
                              title={t('briefingToggleTitle')}
                            >
                              <FileText className="size-4" />
                              <span className="hidden sm:inline">{t('briefingLabel')}</span>
                              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={googleCalendarUrl(toCalendar(s))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonClasses({ variant: 'ghost', size: 'icon-sm' })}
                            title={t('googleCalendarTitle')}
                          >
                            <CalendarPlus className="size-4" />
                          </a>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => downloadIcs(`schicht-${s.shiftId.slice(0, 8)}.ics`, [toCalendar(s)])}
                            title={t('icsDownloadTitle')}
                          >
                            <Download className="size-4" />
                          </Button>
                          {s.isSignup !== false && s.replacementWantedAt && onWithdrawReplacement ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy === s.signupId}
                              onClick={() => onWithdrawReplacement(s)}
                              title={t('endReplacementSearchTitle')}
                            >
                              {t('endReplacementSearchAction')}
                            </Button>
                          ) : s.isSignup !== false &&
                            onOfferReplacement &&
                            s.allowReplacement &&
                            Date.now() < replacementDeadline(s.startTime, s.replacementCutoffHours ?? 0).getTime() ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onOfferReplacement(s)}
                              title={t('seekReplacementTitle')}
                            >
                              <Repeat /> {t('seekReplacementAction')}
                            </Button>
                          ) : null}
                          {s.isSignup !== false && onCancel ? (
                            <Button
                              variant="danger"
                              size="sm"
                              loading={busy === s.signupId}
                              onClick={() => onCancel(s)}
                            >
                              <UserMinus /> {t('cancelAction')}
                            </Button>
                          ) : isOtherDept(s) ? (
                            <a
                              href={getDepartmentUrl(s.departmentSlug, `/events/${s.eventSlug}`, s.departmentOrganization)}
                              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                            >
                              {t('openEventAction')} <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <Link
                              href={`/events/${s.eventSlug}`}
                              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                            >
                              {t('openEventAction')} <ExternalLink className="size-3" />
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Aufgeklapptes Einsatz-Briefing */}
                      {isExpanded && hasBriefing && (
                        <div className="mt-3.5 border-t border-line/70 pt-3.5">
                          <ShiftBriefingPanel shift={s} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
