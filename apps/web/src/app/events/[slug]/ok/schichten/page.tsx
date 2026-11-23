'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarDays, CheckSquare, Filter, LayoutList, Plus, Rows3, Search, Sparkles } from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import { Badge, Button, Chip, Dialog, EmptyState, Input, Select, cn, trackUi, useConfirm, useToast } from '@schichtplan/ui';
import { BulkShiftBar } from '@/components/ok/BulkShiftBar';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { ShiftCard } from '@/components/ok/ShiftCard';
import { ageWarnings } from '@/components/ok/shiftChecks';
import { ShiftSeriesDialog } from '@/components/ok/ShiftSeriesDialog';
import { ShiftTimeline } from '@/components/ok/ShiftTimeline';
import { AssignHelperDialog, DayResponsiblesDialog, DuplicateShiftDialog, ShiftFormDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtShortWeekday, fmtTimeRange, fmtWeekday, groupByBusinessDay } from '@/lib/format';

type View = 'list' | 'plan';
const VIEW_KEY = 'ok-shift-view';

function ShiftsPage() {
  const t = useTranslations('web.ok.shifts');
  const { event, base, reload, setMessageDraft } = useOkEvent();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [view, setView] = useState<View>('list');
  const [day, setDay] = useState<string>(params.get('tag') ?? 'ALL');
  const [taskFilter, setTaskFilter] = useState(params.get('arbeit') ?? 'ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [setupFilter, setSetupFilter] = useState<'ALL' | 'EVENT' | 'SETUP'>('ALL');
  const [search, setSearch] = useState(params.get('suche') ?? '');
  const [onlyOpen, setOnlyOpen] = useState(params.get('offen') === '1');
  const [onlyWarning, setOnlyWarning] = useState(params.get('warnung') === '1');

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showShiftForm, setShowShiftForm] = useState(params.get('neu') === '1');
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [duplicatingShift, setDuplicatingShift] = useState<ShiftDto | null>(null);
  const [assigning, setAssigning] = useState<{ shift: ShiftDto; task: ShiftTaskDto } | null>(null);
  const [dayTarget, setDayTarget] = useState<{ dayDate: string; dayLabel: string } | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<ShiftDto | null>(null);
  const [notifyHelpers, setNotifyHelpers] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'plan') setView(saved);
    } catch {
      // ohne Speicher bleibt die Liste
    }
  }, []);

  const changeView = (v: View) => {
    setView(v);
    trackUi('UI_PLAN_VIEW', v === 'plan' ? 'OK_PLAN' : 'OK_LIST');
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // egal
    }
  };

  // ?neu=1 nach dem Öffnen entfernen, damit ein Neuladen den Dialog nicht wieder öffnet
  useEffect(() => {
    if (params.get('neu') === '1') router.replace(`${base}/schichten`, { scroll: false });
  }, [params, router, base]);

  const days = useMemo(() => groupByBusinessDay(event.shifts, event.dayCutoffTime), [event]);
  const taskTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const s of event.shifts) for (const t of s.tasks ?? []) if (t.title.trim()) titles.add(t.title.trim());
    return [...titles].sort((a, b) => a.localeCompare(b, 'de'));
  }, [event]);
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of event.shifts) if (s.category?.trim()) cats.add(s.category.trim());
    return [...cats].sort((a, b) => a.localeCompare(b, 'de'));
  }, [event]);
  const warningShiftIds = useMemo(() => new Set(ageWarnings(event).map((w) => w.shift.id)), [event]);
  const hasSetup = event.shifts.some((s) => s.isSetupTeardown);

  const q = search.trim().toLowerCase();
  const filteredDays = days
    .filter((d) => day === 'ALL' || d.key === day)
    .map((d) => ({
      ...d,
      items: d.items.filter((s) => {
        if (setupFilter === 'SETUP' && !s.isSetupTeardown) return false;
        if (setupFilter === 'EVENT' && s.isSetupTeardown) return false;
        if (taskFilter !== 'ALL' && !s.tasks?.some((t) => t.title.trim() === taskFilter)) return false;
        if (categoryFilter !== 'ALL' && (s.category?.trim() ?? '') !== categoryFilter) return false;
        if (onlyOpen && (s.signups?.length ?? 0) >= s.requiredSlots) return false;
        if (onlyWarning && !warningShiftIds.has(s.id)) return false;
        if (
          q &&
          !(s.title?.toLowerCase().includes(q)) &&
          !(s.category?.toLowerCase().includes(q) ?? false) &&
          !s.tasks?.some((t) => t.title.toLowerCase().includes(q)) &&
          !s.signups?.some((su) => su.displayName.toLowerCase().includes(q))
        )
          return false;
        return true;
      }),
    }))
    .filter((d) => d.items.length > 0);
  const visibleShifts = filteredDays.flatMap((d) => d.items);
  const filtersActive =
    day !== 'ALL' ||
    taskFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    setupFilter !== 'ALL' ||
    Boolean(q) ||
    onlyOpen ||
    onlyWarning;

  const resetFilters = () => {
    setDay('ALL');
    setTaskFilter('ALL');
    setCategoryFilter('ALL');
    setSetupFilter('ALL');
    setSearch('');
    setOnlyOpen(false);
    setOnlyWarning(false);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const openNew = () => {
    setEditingShift(null);
    setShowShiftForm(true);
  };

  const deleteShift = (shift: ShiftDto) => {
    setNotifyHelpers(true);
    setShiftToDelete(shift);
  };


  const removeSignup = async (shift: ShiftDto, signupId: string, name: string) => {
    const ok = await confirm({
      title: t('confirmSignoffTitle', { name }),
      description: t('confirmSignoffDesc', { title: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime) }),
      confirmLabel: t('confirmSignoffBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${shift.id}/signup?signupId=${signupId}`, { method: 'DELETE' });
      toast({ title: t('signoffSuccess', { name }) });
      await reload();
    } catch (err) {
      toast({ title: t('signoffFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div>
      <OkPageHeader
        title={t('title')}
        description={t('desc')}
        help="/ok/schichten-planen/"
        actions={
          <>
            <Button size="sm" variant={selecting ? 'primary' : 'secondary'} onClick={selecting ? stopSelecting : () => setSelecting(true)}>
              <CheckSquare className="size-4" /> {selecting ? t('doneBtn') : t('selectBtn')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSeriesForm(true)}>
              <Sparkles className="size-4" /> {t('createSeriesBtn')}
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" /> {t('newShiftBtn')}
            </Button>
          </>
        }
      />

      {/* Ansicht und Filter */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="inline-flex rounded-full border border-line bg-surface p-1 m-0" aria-label={t('viewAria')}>
            {(
              [
                ['list', t('viewList'), LayoutList],
                ['plan', t('viewPlan'), Rows3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => changeView(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                  view === key ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg'
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </fieldset>
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('searchAria')}
            />
          </div>
          {taskTitles.length > 1 && (
            <Select
              className="h-10 w-auto text-sm"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              aria-label={t('filterTaskAria')}
            >
              <option value="ALL">{t('allTasks')}</option>
              {taskTitles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          )}
          {categories.length > 0 && (
            <Select
              className="h-10 w-auto text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label={t('filterCategoryAria')}
            >
              <option value="ALL">{t('allCategories')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {days.length > 1 && (
            <>
              <Chip selected={day === 'ALL'} onClick={() => setDay('ALL')}>
                {t('allDays')}
              </Chip>
              {days.map((d) => (
                <Chip key={d.key} selected={day === d.key} onClick={() => setDay(d.key)}>
                  {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key))}
                </Chip>
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
            {t('onlyOpen')}
          </Chip>
          {(warningShiftIds.size > 0 || onlyWarning) && (
            <Chip selected={onlyWarning} count={warningShiftIds.size} onClick={() => setOnlyWarning((v) => !v)}>
              <AlertTriangle className="size-3.5 text-warning-ink" /> {t('youthWarning')}
            </Chip>
          )}
          {hasSetup && (
            <Chip
              selected={setupFilter === 'SETUP'}
              onClick={() => setSetupFilter(setupFilter === 'SETUP' ? 'ALL' : 'SETUP')}
            >
              {t('onlySetup')}
            </Chip>
          )}
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              {t('resetFilters')}
            </Button>
          )}
        </div>
      </div>

      {event.shifts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> {t('firstShiftBtn')}
            </Button>
          }
        />
      ) : filteredDays.length === 0 ? (
        <EmptyState
          icon={<Filter />}
          title={t('noMatchesTitle')}
          description={t('noMatchesDesc')}
          action={
            <Button variant="secondary" onClick={resetFilters}>
              {t('resetFilters')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {filteredDays.map((group) => {
            const iso = dayKeyToIso(group.key);
            const dayLabel = `${fmtWeekday(iso)} ${fmtDayMonth(iso)}`;
            const responsibles = event.dayResponsibles?.[group.key] ?? [];
            const groupSelected = group.items.every((s) => selectedIds.has(s.id));
            return (
              <section key={group.key} className="space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-display text-xl font-extrabold text-fg">
                      {fmtWeekday(iso)} <span className="text-base font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                    </h3>
                    <span className="text-xs font-semibold text-fg-muted">
                      {t('shiftsCount', { count: group.items.length })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.responsibleMode === 'BY_DAY' && (
                      <>
                        {responsibles.length ? (
                          <Badge tone="neutral" size="sm">
                            {t('dayLeadBadge', { names: responsibles.map((r) => r.displayName).join(', ') })}
                          </Badge>
                        ) : (
                          <Badge tone="warning" size="sm">
                            {t('noDayLeadBadge')}
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDayTarget({ dayDate: group.key, dayLabel })}>
                          {t('changeDayLead')}
                        </Button>
                      </>
                    )}
                    {selecting && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const s of group.items) {
                              if (groupSelected) next.delete(s.id);
                              else next.add(s.id);
                            }
                            return next;
                          })
                        }
                      >
                        {groupSelected ? t('unselectDay') : t('selectAllDay')}
                      </Button>
                    )}
                  </div>
                </header>

                {view === 'plan' ? (
                  <ShiftTimeline
                    shifts={group.items}
                    selecting={selecting}
                    selectedIds={selectedIds}
                    onSelect={toggle}
                    onOpen={(shift) => {
                      setEditingShift(shift);
                      setShowShiftForm(true);
                    }}
                  />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.items.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        selecting={selecting}
                        selected={selectedIds.has(shift.id)}
                        onToggleSelect={() => toggle(shift.id)}
                        onEdit={() => {
                          setEditingShift(shift);
                          setShowShiftForm(true);
                        }}
                        onDuplicate={() => setDuplicatingShift(shift)}
                        onDelete={() => deleteShift(shift)}
                        onAssign={(task) => setAssigning({ shift, task })}
                        onRemoveSignup={(signupId, name) => removeSignup(shift, signupId, name)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selecting && (
        <BulkShiftBar
          eventSlug={event.slug}
          shifts={visibleShifts}
          selectedIds={selectedIds}
          onClear={() => setSelectedIds(new Set())}
          onSelectAll={() => setSelectedIds(new Set(visibleShifts.map((s) => s.id)))}
          onDone={reload}
          onMessage={() => {
            const ids = [...selectedIds];
            setMessageDraft({
              target: 'SHIFTS',
              shiftIds: ids,
              label: t('messageDraftLabel', { count: ids.length }),
            });
            router.push(`${base}/nachrichten`);
          }}
        />
      )}
      {selecting && selectedIds.size === 0 && (
        <p className="sticky bottom-4 z-20 mt-6 rounded-card border border-line bg-surface/95 p-3 text-sm text-fg-muted shadow-lift backdrop-blur">
          {t('selectPrompt')}
        </p>
      )}

      <ShiftFormDialog
        open={showShiftForm}
        event={event}
        shift={editingShift}
        onClose={() => {
          setShowShiftForm(false);
          setEditingShift(null);
        }}
        onSaved={async () => {
          setShowShiftForm(false);
          setEditingShift(null);
          await reload();
        }}
      />
      <AssignHelperDialog
        open={assigning !== null}
        eventSlug={event.slug}
        shift={assigning?.shift ?? null}
        task={assigning?.task ?? null}
        onClose={() => setAssigning(null)}
        onAssigned={async () => {
          setAssigning(null);
          await reload();
        }}
      />
      <DuplicateShiftDialog
        open={duplicatingShift !== null}
        shift={duplicatingShift}
        onClose={() => setDuplicatingShift(null)}
        onDuplicated={async () => {
          setDuplicatingShift(null);
          await reload();
        }}
      />
      <DayResponsiblesDialog
        open={Boolean(dayTarget)}
        event={event}
        dayDate={dayTarget?.dayDate ?? ''}
        dayLabel={dayTarget?.dayLabel ?? ''}
        onClose={() => setDayTarget(null)}
        onSaved={async () => {
          setDayTarget(null);
          await reload();
        }}
      />
      <ShiftSeriesDialog
        open={showSeriesForm}
        event={event}
        onClose={() => setShowSeriesForm(false)}
        onCreated={async () => {
          setShowSeriesForm(false);
          await reload();
        }}
      />
      {shiftToDelete && (
        <Dialog
          open
          onClose={() => setShiftToDelete(null)}
          size="sm"
          title={t('deleteDialogTitle', { title: shiftToDelete.title?.trim() || fmtTimeRange(shiftToDelete.startTime, shiftToDelete.endTime) })}
          description={
            <div className="space-y-4 pt-1 text-left">
              <p className="text-sm text-fg-muted">
                {shiftToDelete.signups?.length
                  ? t('deleteSignupsWarning', { count: shiftToDelete.signups.length })
                  : t('deleteIrreversible')}
              </p>
              {(shiftToDelete.signups?.length ?? 0) > 0 && (
                <label className="flex items-start gap-2.5 rounded-field border border-line bg-surface-2 p-3 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyHelpers}
                    onChange={(e) => setNotifyHelpers(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-line text-accent focus:ring-accent"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-fg block">
                      {t('notifyHelpersCheckbox')}
                    </span>
                    <span className="text-xs text-fg-muted block">
                      {t('notifyHelpersHint')}
                    </span>
                  </div>
                </label>
              )}
            </div>
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setShiftToDelete(null)}>
                {t('cancelBtn')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const s = shiftToDelete;
                  setShiftToDelete(null);
                  try {
                    await api(`/api/shifts/${s.id}?notify=${notifyHelpers}`, { method: 'DELETE' });
                    toast({
                      title: t('shiftDeleted'),
                      description: s.title?.trim() || fmtTimeRange(s.startTime, s.endTime),
                    });
                    await reload();
                  } catch (err) {
                    toast({ title: t('deleteFailed'), description: errorMessage(err), tone: 'error' });
                  }
                }}
              >
                {t('deleteShiftBtn')}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ShiftsPage />
    </Suspense>
  );
}
