'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowDownUp, Ban, Clock, Filter, Search, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ageAt } from '@schichtplan/shared';
import type {
  EventRosterItemDto,
  EventRosterResponseDto,
  ShiftCollisionCheckResult,
  ShiftDto,
  ShiftTaskDto,
} from '@schichtplan/shared';
import { Avatar, Badge, Button, Callout, Chip, Dialog, Field, Input, Select, Skeleton, cn, useOrganization, useToast } from '@schichtplan/ui';
import { api, errorMessage, ApiError } from '@/lib/api';
import { fmtShortWeekday, fmtTime, fmtWeekday, fmtTimeRange, shiftName } from '@/lib/format';
import { shiftTasks } from '@/components/event/shift-utils';

/* ---------------------------------------------------- Helfer durch OK einteilen */

type SortKey = 'fewest' | 'most' | 'name' | 'age';

interface Candidate extends EventRosterItemDto {
  /** Alter am Schichtbeginn (zählt für die Altersgrenze) */
  ageAtShift: number | null;
  inThisShift: boolean;
  /** Zur gleichen Zeit schon in einer anderen Schicht des Anlasses */
  conflicts: EventRosterItemDto['shifts'];
  tooYoung: boolean;
}

export function AssignHelperDialog({
  open,
  eventSlug,
  shift,
  task,
  onClose,
  onAssigned,
}: {
  open: boolean;
  eventSlug: string;
  shift: ShiftDto | null;
  task: ShiftTaskDto | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations('web.assignHelper');
  return (
    <Dialog
      open={open && shift !== null}
      onClose={onClose}
      icon={<UserCheck />}
      title={t('title')}
      description={shift ? `${shift.title?.trim() ? `${shift.title} · ` : ''}${fmtWeekday(shift.startTime)}, ${fmtTimeRange(shift.startTime, shift.endTime)}` : ''}
      size="lg"
    >
      {shift && (
        <AssignHelperForm eventSlug={eventSlug} shift={shift} task={task} onCancel={onClose} onAssigned={onAssigned} />
      )}
    </Dialog>
  );
}

function AssignHelperForm({
  eventSlug,
  shift,
  task,
  onCancel,
  onAssigned,
}: {
  eventSlug: string;
  shift: ShiftDto;
  task: ShiftTaskDto | null;
  onCancel: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations('web.assignHelper');
  const toast = useToast();
  const [roster, setRoster] = useState<EventRosterResponseDto | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [mode, setMode] = useState<'member' | 'guest'>('member');

  // Arbeit wählbar, wenn die Schicht mehrere hat. Vorgabe: die angeklickte, sonst die erste mit freien Plätzen.
  const tasks = shiftTasks(shift).filter((t) => t.id !== 'default');
  const [selectedTaskId, setSelectedTaskId] = useState(
    () => task?.id ?? (tasks.find((t) => t.filled < t.requiredSlots) ?? tasks[0])?.id ?? ''
  );
  const chosenTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const org = useOrganization();

  // Filter
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [stufeFilter, setStufeFilter] = useState<Set<string>>(new Set());
  const [onlyOldEnough, setOnlyOldEnough] = useState(true);
  const [showDeregistered, setShowDeregistered] = useState(false);
  const [showWithoutAccess, setShowWithoutAccess] = useState(false);
  const [sort, setSort] = useState<SortKey>('fewest');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [collisionWarning, setCollisionWarning] = useState<ShiftCollisionCheckResult | null>(null);
  const [confirmCollision, setConfirmCollision] = useState(false);

  useEffect(() => {
    let active = true;
    api<EventRosterResponseDto>(`/api/events/${eventSlug}/roster?alle=1`)
      .then((data) => active && setRoster(data))
      .catch((err) => active && setRosterError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [eventSlug]);

  // Altersgrenze, die für jede Person gilt (Schicht oder Arbeit mit «alle»). «Mind. 1» ist nur ein Hinweis.
  const requiredAge = Math.max(
    shift.minAge ?? 0,
    chosenTask?.minAge && chosenTask.ageRequirementType === 'ALL' ? chosenTask.minAge : 0
  ) || null;

  const candidates = useMemo<Candidate[]>(() => {
    const start = new Date(shift.startTime);
    const startMs = start.getTime();
    const endMs = new Date(shift.endTime).getTime();
    return (roster?.items ?? []).map((item) => {
      const ageAtShift = ageAt(item.birthDate, start);
      return {
        ...item,
        ageAtShift,
        inThisShift: item.shifts.some((s) => s.id === shift.id),
        conflicts: item.shifts.filter(
          (s) => s.id !== shift.id && new Date(s.startTime).getTime() < endMs && new Date(s.endTime).getTime() > startMs
        ),
        tooYoung: requiredAge !== null && ageAtShift !== null && ageAtShift < requiredAge,
      };
    });
  }, [roster, shift.id, shift.startTime, shift.endTime, requiredAge]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates) if (c.departmentId && c.departmentName) map.set(c.departmentId, c.departmentName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [candidates]);

  // Stufen der gewählten Abteilung (bei «alle» alle Stufen)
  const stufen = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates) {
      if (deptFilter !== 'ALL' && c.departmentId !== deptFilter) continue;
      for (const s of c.stufen) map.set(s.id, s.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [candidates, deptFilter]);

  const deregisteredCount = candidates.filter((c) => c.isDeregistered).length;
  const withoutAccessCount = candidates.filter((c) => !c.hasAccess).length;
  const tooYoungCount = candidates.filter((c) => c.tooYoung && (showDeregistered || !c.isDeregistered)).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = candidates.filter((c) => {
      if (!showDeregistered && c.isDeregistered) return false;
      if (!showWithoutAccess && !c.hasAccess) return false;
      if (requiredAge !== null && onlyOldEnough && c.tooYoung) return false;
      if (deptFilter !== 'ALL' && c.departmentId !== deptFilter) return false;
      if (stufeFilter.size > 0 && !c.stufen.some((s) => stufeFilter.has(s.id))) return false;
      if (q) {
        const haystack = [c.displayName, c.ceviName, c.firstName, c.lastName, c.departmentName, ...c.stufen.map((s) => s.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const byName = (a: Candidate, b: Candidate) => a.displayName.localeCompare(b.displayName, 'de');
    return list.sort((a, b) => {
      switch (sort) {
        case 'fewest':
          return a.shiftCount - b.shiftCount || byName(a, b);
        case 'most':
          return b.shiftCount - a.shiftCount || byName(a, b);
        case 'age':
          return (b.ageAtShift ?? -1) - (a.ageAtShift ?? -1) || byName(a, b);
        default:
          return byName(a, b);
      }
    });
  }, [candidates, search, deptFilter, stufeFilter, onlyOldEnough, showDeregistered, showWithoutAccess, requiredAge, sort]);

  const selected = candidates.find((c) => c.userId === selectedUserId) ?? null;
  const minShifts = roster?.minShiftsPerPerson ?? null;
  const filtersActive = Boolean(search.trim()) || deptFilter !== 'ALL' || stufeFilter.size > 0;

  const toggleStufe = (id: string) =>
    setStufeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Zeitkollisionen beim Server prüfen (gleich wie beim Eintragen, auch für Gäste)
  useEffect(() => {
    let active = true;
    setConfirmCollision(false);

    if (mode === 'member' && selectedUserId) {
      api<ShiftCollisionCheckResult>(`/api/shifts/${shift.id}/check-collision?userId=${selectedUserId}`)
        .then((res) => active && setCollisionWarning(res.hasCollision ? res : null))
        .catch(() => active && setCollisionWarning(null));
    } else if (mode === 'guest' && guestName.trim().length >= 2) {
      const timer = setTimeout(() => {
        api<ShiftCollisionCheckResult>(
          `/api/shifts/${shift.id}/check-collision?guestName=${encodeURIComponent(guestName.trim())}`
        )
          .then((res) => active && setCollisionWarning(res.hasCollision ? res : null))
          .catch(() => active && setCollisionWarning(null));
      }, 300);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    } else {
      setCollisionWarning(null);
    }

    return () => {
      active = false;
    };
  }, [mode, selectedUserId, guestName, shift.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'member' && !selected) {
      setError(t('errorSelectPerson'));
      return;
    }
    if (collisionWarning?.hasCollision && !confirmCollision) {
      setError(t('errorConfirmCollision'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {
          taskId: chosenTask?.id || undefined,
          userId: mode === 'member' ? selectedUserId : undefined,
          guestName: mode === 'guest' ? guestName.trim() : undefined,
          guestEmail: mode === 'guest' && guestEmail ? guestEmail.trim() : undefined,
          guestPhone: mode === 'guest' && guestPhone ? guestPhone.trim() : undefined,
          confirmCollision: confirmCollision ? true : undefined,
        },
      });

      toast({
        title: t('assignedToastTitle', { name: mode === 'member' ? selected?.displayName || t('fallbackPerson') : guestName }),
        description: `${shift.title?.trim() || chosenTask?.title || fmtTimeRange(shift.startTime, shift.endTime)}${chosenTask && shift.title?.trim() ? ` (${chosenTask.title})` : ''}`,
      });
      onAssigned();
    } catch (err) {
      if (err instanceof ApiError && err.data.code === 'TIME_COLLISION') {
        setCollisionWarning({
          hasCollision: true,
          conflicts: (err.data.conflicts as ShiftCollisionCheckResult['conflicts']) || [],
          message: err.message,
        });
      }
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}

      {tasks.length > 1 && (
        <Field label={t('taskLabel')} required>
          <Select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
            {tasks.map((tItem) => (
              <option key={tItem.id} value={tItem.id}>
                {tItem.title} ({tItem.filled}/{tItem.requiredSlots}
                {tItem.filled >= tItem.requiredSlots ? t('taskFull') : ''}
                {tItem.minAge ? t('taskMinAge', { age: tItem.minAge }) : ''})
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-field border border-line bg-surface-2 p-1">
        {(['member', 'guest'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-[0.5rem] py-1.5 text-xs font-semibold transition',
              mode === m ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
            )}
          >
            {m === 'member' ? t('modeMember') : t('modeGuest')}
          </button>
        ))}
      </div>

      {mode === 'member' ? (
        <div className="space-y-3">
          {/* Suche & Sortierung */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                className="pl-9"
                placeholder={t('searchPlaceholder', { nicknameTerm: org.nicknameTerm })}
                value={search}
                autoFocus
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative sm:w-56">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-fg-subtle" />
              <Select className="pl-9" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t('sortAria')}>
                <option value="fewest">{t('sortFewest')}</option>
                <option value="most">{t('sortMost')}</option>
                <option value="name">{t('sortName')}</option>
                <option value="age">{t('sortAge')}</option>
              </Select>
            </div>
          </div>

          {/* Abteilung & Stufen */}
          {(departments.length > 1 || stufen.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {departments.length > 1 && (
                <Select
                  className="h-8 w-auto text-xs"
                  value={deptFilter}
                  onChange={(e) => {
                    setDeptFilter(e.target.value);
                    setStufeFilter(new Set());
                  }}
                  aria-label={t('deptFilterAria')}
                >
                  <option value="ALL">{t('allDepts')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
              {stufen.map((s) => (
                <Chip key={s.id} selected={stufeFilter.has(s.id)} onClick={() => toggleStufe(s.id)} className="h-8 px-3 text-xs">
                  {s.name}
                </Chip>
              ))}
            </div>
          )}

          {/* Schalter */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
            {requiredAge !== null && (
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyOldEnough}
                  onChange={(e) => setOnlyOldEnough(e.target.checked)}
                  className="size-4 rounded border-line"
                />
                {t('onlyOldEnough', { age: requiredAge })}{tooYoungCount > 0 && onlyOldEnough ? t('hiddenCount', { count: tooYoungCount }) : ''}
              </label>
            )}
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={showDeregistered}
                onChange={(e) => setShowDeregistered(e.target.checked)}
                className="size-4 rounded border-line"
              />
              {t('showDeregistered', { count: deregisteredCount })}
            </label>
            {withoutAccessCount > 0 && (
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={showWithoutAccess}
                  onChange={(e) => setShowWithoutAccess(e.target.checked)}
                  className="size-4 rounded border-line"
                />
                {t('showWithoutAccess', { count: withoutAccessCount })}
              </label>
            )}
          </div>

          {/* Personenliste */}
          {rosterError ? (
            <Callout tone="danger">{t('rosterError', { error: rosterError })}</Callout>
          ) : !roster ? (
            <div className="space-y-2">
              <Skeleton className="h-14 rounded-field" />
              <Skeleton className="h-14 rounded-field" />
              <Skeleton className="h-14 rounded-field" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-field border border-dashed border-line px-4 py-8 text-center text-sm text-fg-muted">
              <Filter className="size-5 text-fg-subtle" />
              {candidates.length === 0 ? t('emptyNoCandidates') : t('emptyNoMatches')}
              {filtersActive && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setDeptFilter('ALL');
                    setStufeFilter(new Set());
                  }}
                >
                  {t('resetFilters')}
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                {visible.length} {visible.length === 1 ? t('countPersonsSingular') : t('countPersonsPlural')}
                {minShifts !== null && (minShifts === 1 ? t('targetShiftsSingular', { minShifts }) : t('targetShiftsPlural', { minShifts }))}
              </p>
              <div role="radiogroup" aria-label={t('selectPersonAria')} className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
                {visible.map((c) => (
                  <CandidateRow
                    key={c.userId}
                    candidate={c}
                    minShifts={minShifts}
                    showDepartment={departments.length > 1}
                    selected={c.userId === selectedUserId}
                    onSelect={() => setSelectedUserId(c.userId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t('guestNameLabel', { nicknameTerm: org.nicknameTerm })} required>
            <Input value={guestName} autoFocus placeholder={t('guestNamePlaceholder')} onChange={(e) => setGuestName(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('guestEmailLabel')}>
              <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            </Field>
            <Field label={t('guestPhoneLabel')}>
              <Input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-fg-subtle">
            {t('guestNotice')}
          </p>
        </div>
      )}

      {collisionWarning?.hasCollision && (
        <div className="space-y-2.5 rounded-field border border-warning/40 bg-warning/10 p-3.5 text-xs text-warning-ink">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-bold text-warning-ink">{t('collisionWarningTitle')}</p>
              <p className="text-fg-muted">
                {mode === 'member'
                  ? t('collisionDescMember', { name: selected?.displayName || t('thisPerson') })
                  : t('collisionDescGuest', { name: guestName })}
              </p>
              <ul className="space-y-1 pt-1">
                {collisionWarning.conflicts.map((c) => (
                  <li key={c.signupId} className="flex items-center gap-1.5 font-medium">
                    <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                    <span>
                      <strong>{c.shiftTitle}</strong>
                      {c.taskTitle ? ` (${c.taskTitle})` : ''}: {fmtWeekday(c.startTime)}, {fmtTimeRange(c.startTime, c.endTime)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 border-t border-warning/20 pt-2 font-semibold">
            <input
              type="checkbox"
              checked={confirmCollision}
              onChange={(e) => setConfirmCollision(e.target.checked)}
              className="size-4 rounded border-line text-warning focus:ring-warning"
            />
            <span>{t('confirmCollisionCheckbox')}</span>
          </label>
        </div>
      )}

      {chosenTask?.minAge && chosenTask.ageRequirementType !== 'ALL' ? (
        <div className="rounded-field border border-warning/30 bg-warning/10 p-3 text-xs text-warning-ink">
          <strong>{t('hintMinAgeTitle')}</strong> {t('hintMinAge', { taskTitle: chosenTask.title, age: chosenTask.minAge })}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancelBtn')}
        </Button>
        <Button type="submit" loading={saving} disabled={mode === 'member' && !selected}>
          {collisionWarning?.hasCollision && confirmCollision
            ? t('submitAnywayBtn')
            : selected && mode === 'member'
              ? t('submitPersonBtn', { name: selected.ceviName || selected.firstName })
              : t('submitDefaultBtn')}
        </Button>
      </div>
    </form>
  );
}

function CandidateRow({
  candidate: c,
  minShifts,
  showDepartment,
  selected,
  onSelect,
}: {
  candidate: Candidate;
  minShifts: number | null;
  showDepartment: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('web.assignHelper');
  const disabled = c.inThisShift || c.tooYoung;
  const targetMet = minShifts !== null ? c.shiftCount >= minShifts : c.shiftCount > 0;
  const details = [
    showDepartment ? c.departmentName : null,
    c.stufen.map((s) => `${s.name}${s.role === 'LEITUNG' ? t('roleLeitung') : ''}`).join(', ') || null,
    c.ageAtShift !== null ? t('ageYears', { age: c.ageAtShift }) : t('ageUnknown'),
  ].filter(Boolean);

  return (
    // biome-ignore lint/a11y/useSemanticElements: Helfer-Auswahlkachel mit ARIA-Radio-Rolle
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-field border px-3 py-2 text-left transition',
        selected ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-55 hover:border-line',
        c.isDeregistered && !selected && 'bg-surface-2/60'
      )}
    >
        <Avatar name={c.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{c.displayName}</p>
          <p className="truncate text-2xs text-fg-muted">{details.join(' · ')}</p>
          {(c.isDeregistered || !c.hasAccess || c.inThisShift || c.tooYoung || c.conflicts.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.inThisShift && <Badge tone="accent" className="text-2xs">{t('alreadyInShiftBadge')}</Badge>}
              {c.tooYoung && (
                <Badge tone="danger" className="text-2xs">
                  <Ban className="mr-0.5 size-3" /> {t('tooYoungBadge')}
                </Badge>
              )}
              {!c.hasAccess && <Badge tone="outline" className="text-2xs">{t('withoutAccessBadge')}</Badge>}
              {c.isDeregistered && (
                <Badge tone="neutral" className="text-2xs" title={c.deregistrationReason ?? undefined}>
                  {t('deregisteredBadge')}{c.deregistrationReason ? `: ${c.deregistrationReason}` : ''}
                </Badge>
              )}
              {c.conflicts.map((s) => (
                <Badge key={s.id} tone="warning" className="text-2xs">
                  <Clock className="mr-0.5 size-3" /> {t('conflictBadge', { title: shiftName(s), weekday: fmtShortWeekday(s.startTime), time: fmtTime(s.startTime) })}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right" title={c.shifts.map((s) => `${shiftName(s)} ${fmtShortWeekday(s.startTime)} ${fmtTime(s.startTime)}`).join('\n') || undefined}>
          <p
            className={cn(
              'font-display text-base font-bold leading-none',
              c.isDeregistered ? 'text-fg-subtle' : targetMet ? 'text-success-ink' : c.shiftCount > 0 ? 'text-warning-ink' : 'text-fg-muted'
            )}
          >
            {minShifts !== null ? `${c.shiftCount}/${minShifts}` : c.shiftCount}
          </p>
          <p className="mt-0.5 text-2xs text-fg-subtle">{c.shiftCount === 1 ? t('shiftCountSingular') : t('shiftCountPlural')}</p>
        </div>
      </button>
  );
}
