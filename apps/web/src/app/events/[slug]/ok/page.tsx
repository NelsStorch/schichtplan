'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ImageDown,
  Info,
  Lock,
  Mail,
  Plus,
  Unlock,
  Repeat,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { EventRosterResponseDto, ShiftSignupLogDto } from '@schichtplan/shared';
import { ATTENDANCE_MODES, accessTypeConfig } from '@schichtplan/shared';
import { Badge, Card, ProgressRing, buttonClasses, cn, useToast } from '@schichtplan/ui';
import { AccessTypeBadge } from '@/components/event-meta';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { ageWarnings } from '@/components/ok/shiftChecks';
import { api } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { dayKeyToIso, fmtDayMonth, fmtFullDate, fmtTime, fmtWeekday, groupByBusinessDay, shiftName } from '@/lib/format';

type TodoTone = 'warning' | 'info' | 'success';

interface Todo {
  tone: TodoTone;
  title: string;
  text?: string;
  href?: string;
  action?: string;
}

type RelTimeKey = 'relTimeJustNow' | 'relTimeMinutes' | 'relTimeHours' | 'relTimeYesterday' | 'relTimeDays';

function relTime(iso: string, t: (key: RelTimeKey, values?: Record<string, string | number>) => string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return t('relTimeJustNow');
  if (min < 60) return t('relTimeMinutes', { count: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('relTimeHours', { count: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('relTimeYesterday') : t('relTimeDays', { count: d });
}

export default function OkOverviewPage() {
  const t = useTranslations('web.ok.overview');
  const { event, base, stats, permissions } = useOkEvent();
  const toast = useToast();
  const { department } = usePortal();
  // Story-Bild: gleiche Sichtbarkeit wie die Link-Vorschau (nicht für interne Anlässe von Abteilungen «nur für Mitglieder»)
  const storyAvailable = !(department?.membersOnly && accessTypeConfig(event.accessType).scope !== 'ANY');
  const [roster, setRoster] = useState<EventRosterResponseDto | null>(null);
  const [logs, setLogs] = useState<ShiftSignupLogDto[] | null>(null);

  useEffect(() => {
    api<ShiftSignupLogDto[]>(`/api/events/${event.slug}/logs`)
      .then(setLogs)
      .catch(() => setLogs([]));
    if (event.minShiftsPerPerson) {
      api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`)
        .then(setRoster)
        .catch(() => setRoster(null));
    }
  }, [event.slug, event.minShiftsPerPerson]);

  const days = useMemo(() => groupByBusinessDay(event.shifts, event.dayCutoffTime), [event]);
  const warnings = useMemo(() => ageWarnings(event), [event]);

  const underTarget = useMemo(() => {
    if (!roster?.minShiftsPerPerson) return null;
    const min = roster.minShiftsPerPerson;
    return roster.items.filter((i) => !i.isDeregistered && i.shiftCount < min).length;
  }, [roster]);

  const now = Date.now();
  const opensLater = event.signupOpensAt && new Date(event.signupOpensAt).getTime() > now;
  const isPast = new Date(event.endDate).getTime() < now;
  const daysUntilStart = Math.ceil((new Date(event.startDate).getTime() - now) / 86400000);

  const todos = useMemo<Todo[]>(() => {
    const list: Todo[] = [];
    if (event.shifts.length === 0) {
      list.push({
        tone: 'warning',
        title: t('todos.noShiftsTitle'),
        text: t('todos.noShiftsText'),
        href: `${base}/schichten?neu=1`,
        action: t('todos.noShiftsAction'),
      });
    }
    if (warnings.length > 0) {
      list.push({
        tone: 'warning',
        title: t('todos.youthTitle', { count: warnings.length }),
        text: warnings
          .slice(0, 3)
          .map((w) => `${shiftName(w.shift)} (${w.task.title}, ab ${w.task.minAge})`)
          .join(' · '),
        href: `${base}/schichten?warnung=1`,
        action: t('todos.youthAction'),
      });
    }
    if (event.responsibleMode === 'BY_DAY') {
      const missing = days.filter((d) => !event.dayResponsibles?.[d.key]?.length);
      if (missing.length > 0) {
        list.push({
          tone: 'warning',
          title: t('todos.dayRespTitle', { count: missing.length }),
          text: missing.map((d) => `${fmtWeekday(dayKeyToIso(d.key))} ${fmtDayMonth(dayKeyToIso(d.key))}`).join(', '),
          href: `${base}/schichten`,
          action: t('todos.dayRespAction'),
        });
      }
    }
    if (stats.freeSlots > 0 && !isPast) {
      list.push({
        tone: daysUntilStart <= 7 ? 'warning' : 'info',
        title: t('todos.slotsFreeTitle', { slots: stats.freeSlots, shifts: stats.openShiftCount }),
        text:
          daysUntilStart <= 7 && daysUntilStart >= 0
            ? t('todos.slotsFreeUrgent', { days: daysUntilStart })
            : t('todos.slotsFreeRegular'),
        href: `${base}/schichten?offen=1`,
        action: t('todos.slotsFreeAction'),
      });
    }
    const replacementWanted = event.shifts.filter(
      (sh) => new Date(sh.startTime).getTime() > Date.now() && (sh.signups ?? []).some((su) => su.replacementWantedAt)
    );
    if (replacementWanted.length > 0) {
      const count = replacementWanted.reduce(
        (sum, sh) => sum + (sh.signups ?? []).filter((su) => su.replacementWantedAt).length,
        0
      );
      list.push({
        tone: 'warning',
        title: t('todos.replacementTitle', { count }),
        text: replacementWanted
          .slice(0, 3)
          .map((sh) => `${shiftName(sh)} (${fmtWeekday(sh.startTime)} ${fmtTime(sh.startTime)})`)
          .join(' · '),
        href: `/events/${event.slug}`,
        action: t('todos.replacementAction'),
      });
    }
    if (underTarget) {
      list.push({
        tone: 'info',
        title: t('todos.underTargetTitle', { count: underTarget }),
        text: t('todos.underTargetText', { min: event.minShiftsPerPerson ?? 1 }),
        href: `${base}/helfende?status=offen`,
        action: t('todos.underTargetAction'),
      });
    }
    if (!event.allowPublicSignup) {
      list.push({
        tone: 'info',
        title: t('todos.signupClosedTitle'),
        text: t('todos.signupClosedText'),
        href: permissions.canEditSettings ? `${base}/einstellungen#eintragen` : undefined,
        action: t('todos.signupClosedAction'),
      });
    }
    if (event.attendanceMode && event.attendanceMode !== 'OFF' && daysUntilStart <= 3 && !isPast) {
      list.push({
        tone: 'info',
        title: t('todos.attendancePrepTitle'),
        text:
          event.attendanceMode === 'OK_AND_QR'
            ? t('todos.attendancePrepQrText')
            : t('todos.attendancePrepListText'),
        href: `${base}/anwesenheit`,
        action: t('todos.attendancePrepAction'),
      });
    }
    if (isPast) {
      list.push({
        tone: 'info',
        title: t('todos.eventPastTitle'),
        text: t('todos.eventPastText'),
        href: `${base}/schichten/vorlagen`,
        action: t('todos.eventPastAction'),
      });
    }
    if (list.length === 0) {
      list.push({
        tone: 'success',
        title: t('todos.allDoneTitle'),
        text: stats.freeSlots === 0 ? t('todos.allDoneFull') : t('todos.allDoneIdle'),
      });
    }
    return list;
  }, [event, base, days, warnings, stats, underTarget, isPast, daysUntilStart, permissions.canEditSettings, t]);

  const copyLink = async () => {
    const url = `${window.location.origin}/events/${event.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopied'), description: url });
    } catch {
      toast({ title: t('copyFailed'), description: url, tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <OkPageHeader
        title={t('title')}
        description={t('desc')}
        help="/ok/ok-bereich/"
        actions={
          <>
            {permissions.can.SHIFTS && (
              <Link href={`${base}/schichten?neu=1`} className={buttonClasses({ size: 'sm' })}>
                <Plus className="size-4" /> {t('newShift')}
              </Link>
            )}
            {permissions.can.MESSAGES && (
              <Link href={`${base}/nachrichten`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
                <Mail className="size-4" /> {t('message')}
              </Link>
            )}
            <button type="button" onClick={copyLink} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              <Copy className="size-4" /> {t('copyLink')}
            </button>
            {storyAvailable && (
              <a
                href={`/events/${encodeURIComponent(event.slug)}/story?download=1`}
                download
                title={t('storyImageTitle')}
                className={buttonClasses({ size: 'sm', variant: 'secondary' })}
              >
                <ImageDown className="size-4" /> {t('storyImage')}
              </a>
            )}
          </>
        }
      />

      {/* Status des Anlasses */}
      <div className="flex flex-wrap items-center gap-2">
        <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} />
        {opensLater ? (
          <Badge tone="warning">
            <CalendarClock className="size-3" /> {t('signupOpensAt', {
              date: fmtFullDate(event.signupOpensAt!),
              time: fmtTime(event.signupOpensAt!),
            })}
          </Badge>
        ) : event.allowPublicSignup ? (
          <Badge tone="success">
            <Unlock className="size-3" /> {t('signupOpen')}
          </Badge>
        ) : (
          <Badge tone="warning">
            <Lock className="size-3" /> {t('signupClosed')}
          </Badge>
        )}
        {event.attendanceMode && event.attendanceMode !== 'OFF' && (
          <Badge tone="neutral">
            <ClipboardCheck className="size-3" /> {ATTENDANCE_MODES[event.attendanceMode]}
          </Badge>
        )}
        {event.minShiftsPerPerson ? (
          <Badge tone="neutral">{t('targetShiftsPerPerson', { count: event.minShiftsPerPerson })}</Badge>
        ) : null}
      </div>

      {/* Kennzahlen */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-4 p-4 sm:col-span-2 xl:col-span-1">
          <ProgressRing
            value={stats.filledSlots}
            max={stats.totalSlots}
            size={76}
            stroke={8}
            label={`${stats.percentFilled}%`}
            tone={stats.totalSlots > 0 && stats.freeSlots === 0 ? 'success' : 'accent'}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{t('occupancy')}</p>
            <p className="font-display text-xl font-bold text-fg">
              {stats.filledSlots} <span className="text-sm font-normal text-fg-muted">{t('slotsFraction', { count: stats.totalSlots })}</span>
            </p>
          </div>
        </Card>
        <Stat label={t('freeSlots')} value={stats.freeSlots} tone={stats.freeSlots > 0 ? 'warning' : 'success'} />
        <Stat label={t('helpers')} value={stats.helperCount} hint={t('helpersHint')} />
        <Stat
          label={t('shifts')}
          value={event.shifts.length}
          hint={t('shiftsHint', { count: stats.openShiftCount })}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* To-dos */}
        <section aria-labelledby="todo-title" className="space-y-3">
          <h3 id="todo-title" className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
            {t('todoSection')}
          </h3>
          {todos.map((todo) => (
            <TodoCard key={todo.title} todo={todo} />
          ))}
        </section>

        <div className="space-y-6">
          {/* Belegung pro Tag */}
          {days.length > 0 && (
            <section aria-labelledby="days-title">
              <h3 id="days-title" className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-subtle">
                {t('daysSection')}
              </h3>
              <Card className="divide-y divide-line">
                {days.map((d) => {
                  const total = d.items.reduce((sum, s) => sum + s.requiredSlots, 0);
                  const filled = d.items.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0);
                  const pct = total ? Math.round((filled / total) * 100) : 0;
                  const iso = dayKeyToIso(d.key);
                  return (
                    <Link
                      key={d.key}
                      href={`${base}/schichten?tag=${d.key}`}
                      className="block px-4 py-3 transition hover:bg-surface-2/60"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold text-fg">
                          {fmtWeekday(iso)} <span className="font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                        </span>
                        <span className="tabular text-xs text-fg-muted">
                          {filled}/{total} · {t('shiftsCount', { count: d.items.length })}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/10">
                        <div
                          className={cn('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-accent')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </Card>
            </section>
          )}

          {/* Letzte Aktivitäten */}
          <section aria-labelledby="activity-title">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 id="activity-title" className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
                {t('activitySection')}
              </h3>
              <Link href={`${base}/protokoll`} className="text-xs font-semibold text-accent-ink hover:underline">
                {t('fullLog')}
              </Link>
            </div>
            <Card className="divide-y divide-line">
              {logs === null ? (
                <p className="px-4 py-3 text-sm text-fg-muted">{t('loading')}</p>
              ) : logs.length === 0 ? (
                <p className="px-4 py-3 text-sm text-fg-muted">{t('noLogs')}</p>
              ) : (
                logs.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    {l.action === 'SIGNUP' ? (
                      <UserPlus className="mt-0.5 size-4 shrink-0 text-success-ink" />
                    ) : l.action === 'SIGNOFF' ? (
                      <UserMinus className="mt-0.5 size-4 shrink-0 text-danger-ink" />
                    ) : l.action === 'REPLACE' ? (
                      <Repeat className="mt-0.5 size-4 shrink-0 text-warning-ink" />
                    ) : (
                      <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-fg">
                        <span className="font-semibold">{l.helperName}</span>{' '}
                        <span className="text-fg-muted">
                          {l.action === 'SIGNUP'
                            ? t('actionSignup')
                            : l.action === 'SIGNOFF'
                              ? t('actionSignoff')
                              : l.action === 'REPLACE'
                                ? t('actionReplace')
                                : t('actionAttendance')}
                        </span>{' '}
                        {l.shiftTitle}
                      </p>
                      <p className="text-2xs text-fg-subtle">
                        {relTime(l.createdAt, t)}
                        {l.performedByName
                          ? l.action === 'REPLACE'
                            ? t('fromPerson', { name: l.performedByName })
                            : t('byPerson', { name: l.performedByName })
                          : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'warning' | 'success';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-extrabold tabular',
          tone === 'warning' ? 'text-warning-ink' : tone === 'success' ? 'text-success-ink' : 'text-fg'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-2xs text-fg-muted">{hint}</p>}
    </Card>
  );
}

const TODO_ICON: Record<TodoTone, ReactNode> = {
  warning: <AlertTriangle className="size-5 text-warning-ink" />,
  info: <Info className="size-5 text-accent-ink" />,
  success: <CheckCircle2 className="size-5 text-success-ink" />,
};

function TodoCard({ todo }: { todo: Todo }) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0">{TODO_ICON[todo.tone]}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{todo.title}</span>
        {todo.text && <span className="mt-0.5 block text-xs text-fg-muted">{todo.text}</span>}
      </span>
      {todo.href && (
        <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-accent-ink sm:inline-flex">
          {todo.action} <ArrowRight className="size-3.5" />
        </span>
      )}
    </>
  );
  const className = cn(
    'flex items-start gap-3 rounded-card border p-4 text-sm transition',
    todo.tone === 'warning' && 'border-warning/40 bg-warning/8',
    todo.tone === 'info' && 'border-line bg-surface',
    todo.tone === 'success' && 'border-success/30 bg-success/8',
    todo.href && 'hover:border-line-strong'
  );
  return todo.href ? (
    <Link href={todo.href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

