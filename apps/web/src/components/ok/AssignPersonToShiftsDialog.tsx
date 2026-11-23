'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Search, UserCheck, UserPlus, X } from 'lucide-react';
import type { ShiftCollisionCheckResult, ShiftDto } from '@schichtplan/shared';
import { Badge, Button, Callout, Chip, Dialog, Input, Select, cn, useToast } from '@schichtplan/ui';
import { shiftTasks } from '@/components/event/shift-utils';
import { api, errorMessage } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtShortWeekday, fmtTimeRange, groupByBusinessDay, shiftName } from '@/lib/format';
import { formatMinutes } from '@/lib/helperStats';

/** Person, die eingeteilt wird (mit Konto oder als Gast ohne Konto) */
export interface AssignPerson {
  userId: string | null;
  name: string;
  isGuest: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  age: number | null;
}

type AssignResult = { shiftId: string; label: string; error?: string };

const minutesOf = (s: { startTime: string; endTime: string }) =>
  Math.max(0, Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000));

const tasksOf = (s: ShiftDto) => shiftTasks(s).filter((t) => t.id !== 'default');

/** Person in eine oder mehrere Schichten einteilen (Mehrfachauswahl) */
export function AssignPersonToShiftsDialog({
  person,
  shifts,
  dayCutoffTime,
  minShifts,
  onClose,
  onChanged,
}: {
  person: AssignPerson | null;
  shifts: ShiftDto[];
  dayCutoffTime?: string | null;
  minShifts: number | null;
  onClose: () => void;
  /** Nach dem Einteilen Daten neu laden; `done` = alles geklappt, Dialog schliessen */
  onChanged: (done: boolean) => Promise<void>;
}) {
  const t = useTranslations('web.ok.helpers.assignDialog');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskByShift, setTaskByShift] = useState<Record<string, string>>({});
  const [collisions, setCollisions] = useState<Record<string, ShiftCollisionCheckResult>>({});
  const [confirmCollision, setConfirmCollision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<AssignResult[]>([]);

  useEffect(() => {
    if (!person) return;
    setSearch('');
    setOnlyOpen(true);
    setSelectedIds([]);
    setTaskByShift({});
    setCollisions({});
    setConfirmCollision(false);
    setError(null);
    setFailures([]);
  }, [person]);

  // Aus den aktuellen Schichtdaten (nicht aus einer Momentaufnahme), damit es nach dem Neuladen stimmt
  const isPersonIn = useCallback(
    (s: ShiftDto) =>
      Boolean(
        person &&
          (s.signups ?? []).some((su) =>
            person.userId ? su.userId === person.userId : !su.userId && su.displayName === person.name
          )
      ),
    [person]
  );
  const currentCount = useMemo(() => shifts.filter(isPersonIn).length, [shifts, isPersonIn]);

  const selectedShifts = useMemo(
    () =>
      selectedIds
        .map((id) => shifts.find((s) => s.id === id))
        .filter((s): s is ShiftDto => Boolean(s))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [selectedIds, shifts]
  );

  const toggleShift = (s: ShiftDto) => {
    setError(null);
    setConfirmCollision(false);
    if (selectedIds.includes(s.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== s.id));
      return;
    }
    setSelectedIds((prev) => [...prev, s.id]);
    const tasks = tasksOf(s);
    const openTask = tasks.find((t) => t.filled < t.requiredSlots) ?? tasks[0];
    if (openTask) setTaskByShift((prev) => ({ ...prev, [s.id]: openTask.id }));
  };

  // Zeitkollision mit bestehenden Schichten der Person für jede neu gewählte Schicht prüfen
  useEffect(() => {
    if (!person) return;
    const missing = selectedIds.filter((id) => !(id in collisions));
    if (missing.length === 0) return;
    let active = true;
    const query = person.userId
      ? `userId=${encodeURIComponent(person.userId)}`
      : `guestName=${encodeURIComponent(person.name)}`;
    Promise.all(
      missing.map((id) =>
        api<ShiftCollisionCheckResult>(`/api/shifts/${id}/check-collision?${query}`)
          .then((res) => [id, res] as const)
          .catch(() => [id, { hasCollision: false, conflicts: [] } as ShiftCollisionCheckResult] as const)
      )
    ).then((list) => {
      if (active) setCollisions((prev) => ({ ...prev, ...Object.fromEntries(list) }));
    });
    return () => {
      active = false;
    };
  }, [person, selectedIds, collisions]);

  // Überschneidungen innerhalb der Auswahl selbst
  const internalOverlaps = useMemo(() => {
    const pairs: string[] = [];
    for (let i = 0; i < selectedShifts.length; i++) {
      for (let j = i + 1; j < selectedShifts.length; j++) {
        const a = selectedShifts[i];
        const b = selectedShifts[j];
        if (Date.parse(a.startTime) < Date.parse(b.endTime) && Date.parse(b.startTime) < Date.parse(a.endTime)) {
          pairs.push(`«${shiftName(a)}» und «${shiftName(b)}»`);
        }
      }
    }
    return pairs;
  }, [selectedShifts]);
  const collisionMessages = selectedShifts
    .map((s) => collisions[s.id])
    .filter((c): c is ShiftCollisionCheckResult => Boolean(c?.hasCollision))
    .map((c) => c.message ?? t('collisionTitle'));
  const needsConfirm = collisionMessages.length > 0 || internalOverlaps.length > 0;
  const selectedMinutes = selectedShifts.reduce((sum, s) => sum + minutesOf(s), 0);
  const afterCount = currentCount + selectedShifts.length;

  const days = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupByBusinessDay(shifts, dayCutoffTime)
      .map((d) => ({
        ...d,
        items: d.items.filter((s) => {
          // Gewählte Schichten bleiben sichtbar, auch wenn sie den Filter nicht mehr erfüllen
          if (selectedIds.includes(s.id)) return true;
          if (onlyOpen && (s.signups?.length ?? 0) >= s.requiredSlots) return false;
          if (
            q &&
            !s.title?.toLowerCase().includes(q) &&
            !(s.category?.toLowerCase().includes(q) ?? false) &&
            !s.tasks?.some((t) => t.title.toLowerCase().includes(q))
          )
            return false;
          return true;
        }),
      }))
      .filter((d) => d.items.length > 0);
  }, [shifts, dayCutoffTime, onlyOpen, search, selectedIds]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!person || selectedShifts.length === 0) return;
    if (needsConfirm && !confirmCollision) {
      setError(t('collisionDesc'));
      return;
    }
    setSaving(true);
    setError(null);
    setFailures([]);
    const results: AssignResult[] = [];
    // Nacheinander, damit die Kollisionsprüfung im Backend die vorherigen Einteilungen sieht
    for (const s of selectedShifts) {
      const task = tasksOf(s).find((t) => t.id === taskByShift[s.id]) ?? null;
      const label = `${shiftName(s)}${task ? ` (${task.title})` : ''}`;
      try {
        await api(`/api/shifts/${s.id}/signup`, {
          method: 'POST',
          json: {
            taskId: task?.id || undefined,
            userId: person.userId ?? undefined,
            guestName: person.isGuest ? person.name : undefined,
            guestEmail: person.isGuest && person.guestEmail ? person.guestEmail : undefined,
            guestPhone: person.isGuest && person.guestPhone ? person.guestPhone : undefined,
            confirmCollision: confirmCollision ? true : undefined,
          },
        });
        results.push({ shiftId: s.id, label });
      } catch (err) {
        results.push({ shiftId: s.id, label, error: errorMessage(err) });
      }
    }
    setSaving(false);
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    if (ok.length > 0) {
      toast({
        title: t('successToast', { name: person.name, count: ok.length }),
        description: ok.map((r) => r.label).join(', '),
      });
    }
    if (failed.length === 0) {
      await onChanged(true);
      return;
    }
    // Teilweise fehlgeschlagen: Dialog bleibt offen, nur die fehlgeschlagenen bleiben ausgewählt
    setFailures(failed);
    setSelectedIds(failed.map((f) => f.shiftId));
    setCollisions({});
    setConfirmCollision(false);
    if (ok.length > 0) await onChanged(false);
  };

  return (
    <Dialog
      open={Boolean(person)}
      onClose={onClose}
      icon={<UserPlus />}
      title={person ? t('title', { name: person.name }) : ''}
      description={
        person
          ? `${currentCount}${minShifts && !person.isGuest ? `/${minShifts}` : ''} Schicht${currentCount === 1 ? '' : 'en'} bisher${
              person.age !== null ? ` · ${person.age} Jahre` : ''
            } · du kannst mehrere Schichten auswählen`
          : ''
      }
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}
        {failures.length > 0 && (
          <Callout tone="danger">
            <p className="font-semibold">{t('failToast')}:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {failures.map((f) => (
                <li key={f.shiftId}>
                  {f.label}: {f.error}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
            {t('onlyOpen')}
          </Chip>
        </div>

        <div className="max-h-72 space-y-4 overflow-y-auto rounded-field border border-line bg-surface-2/40 p-3">
          {days.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-muted">{t('noMatchingShifts')}</p>
          ) : (
            days.map((d) => {
              const iso = dayKeyToIso(d.key);
              return (
                <div key={d.key} className="space-y-1.5">
                  <p className="px-1 text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                    {fmtShortWeekday(iso)} {fmtDayMonth(iso)}
                  </p>
                  {d.items.map((s) => {
                    const filled = s.signups?.length ?? 0;
                    const isFull = filled >= s.requiredSlots;
                    const alreadyIn = isPersonIn(s);
                    const isSelected = selectedIds.includes(s.id);
                    const disabled = !isSelected && (isFull || alreadyIn);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleShift(s)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-field border px-3 py-2 text-left text-sm transition',
                          isSelected ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-line-strong',
                          disabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            isSelected ? 'border-accent bg-accent text-canvas' : 'border-line-strong bg-surface'
                          )}
                          aria-hidden
                        >
                          {isSelected && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-fg">{s.title}</span>
                          <span className="block font-mono text-2xs text-fg-muted">
                            {fmtTimeRange(s.startTime, s.endTime)}
                            {s.tasks && s.tasks.length > 0 ? ` · ${s.tasks.map((t) => t.title).join(', ')}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0">
                          {alreadyIn ? (
                            <Badge size="sm" tone="neutral">
                              {t('alreadyIn')}
                            </Badge>
                          ) : (
                            <Badge size="sm" tone={isFull ? 'neutral' : 'success'}>
                              {filled}/{s.requiredSlots}
                            </Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {selectedShifts.length > 0 && (
          <div className="space-y-2">
            <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">
              Ausgewählt: {selectedShifts.length} Schicht{selectedShifts.length === 1 ? '' : 'en'} ·{' '}
              {formatMinutes(selectedMinutes)}
              {minShifts && person && !person.isGuest && (
                <span
                  className={cn(
                    'ml-2 font-normal normal-case tracking-normal',
                    afterCount >= minShifts ? 'text-success-ink' : 'text-fg-muted'
                  )}
                >
                  danach {afterCount}/{minShifts}
                  {afterCount >= minShifts ? ', Soll erfüllt' : ''}
                </span>
              )}
            </p>
            <ul className="space-y-1.5">
              {selectedShifts.map((s) => {
                const tasks = tasksOf(s);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-2 rounded-field border border-line bg-surface px-3 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <strong className="text-fg">{s.title || 'Schicht'}</strong>
                      <span className="text-fg-muted">
                        {' '}
                        · {fmtShortWeekday(s.startTime)} {fmtTimeRange(s.startTime, s.endTime)}
                      </span>
                    </span>
                    {tasks.length > 1 && (
                      <Select
                        className="h-8 w-auto text-xs"
                        value={taskByShift[s.id] ?? ''}
                        onChange={(e) => setTaskByShift((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        aria-label={`Arbeit für ${shiftName(s)}`}
                      >
                        {tasks.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.filled >= t.requiredSlots}>
                            {t.title} ({t.filled}/{t.requiredSlots}
                            {t.minAge ? `, ab ${t.minAge} J.` : ''})
                          </option>
                        ))}
                      </Select>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleShift(s)}
                      className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                      aria-label={`${shiftName(s)} abwählen`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {needsConfirm && (
          <div className="rounded-field border border-warning/40 bg-warning/10 p-3.5 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" />
              <div className="space-y-2">
                {collisionMessages.map((m) => (
                  <p key={m} className="font-semibold text-warning-ink">
                    {m}
                  </p>
                ))}
                {internalOverlaps.map((p) => (
                  <p key={p} className="font-semibold text-warning-ink">
                    Die gewählten Schichten {p} überschneiden sich.
                  </p>
                ))}
                <label className="flex cursor-pointer items-center gap-2 pt-1 font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={confirmCollision}
                    onChange={(e) => setConfirmCollision(e.target.checked)}
                    className="size-4 accent-warning"
                  />
                  {t('confirmCollision')}
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={selectedShifts.length === 0}>
            <UserCheck className="size-4" />
            {selectedShifts.length > 1 ? t('submit', { count: selectedShifts.length }) : t('submitSingle')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

