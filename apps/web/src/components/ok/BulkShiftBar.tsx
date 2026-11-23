'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Hammer, Mail, Tag, Trash2, Users, X } from 'lucide-react';
import type { BulkShiftsInput, BulkShiftsResultDto, ShiftDto } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, cn, useConfirm, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';

type Mode = 'MOVE' | 'SET_SLOTS' | 'SET_CATEGORY' | 'SET_SETUP' | null;

/** Leiste unten am Bildschirm, sobald Schichten ausgewählt sind */
export function BulkShiftBar({
  eventSlug,
  shifts,
  selectedIds,
  onClear,
  onSelectAll,
  onDone,
  onMessage,
}: {
  eventSlug: string;
  /** Alle sichtbaren Schichten (für «alle auswählen» und die Anzahl Eingetragener) */
  shifts: ShiftDto[];
  selectedIds: Set<string>;
  onClear: () => void;
  onSelectAll: () => void;
  onDone: () => Promise<void>;
  onMessage: () => void;
}) {
  const t = useTranslations('web.ok.shifts.bulk');
  const tShifts = useTranslations('web.ok.shifts');
  const toast = useToast();
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [notifyHelpers, setNotifyHelpers] = useState(true);
  const count = selectedIds.size;
  const selected = shifts.filter((s) => selectedIds.has(s.id));
  const signupCount = selected.reduce((sum, s) => sum + (s.signups?.length ?? 0), 0);

  const run = async (action: BulkShiftsInput['action'], success: string) => {
    const res = await api<BulkShiftsResultDto>(`/api/events/${eventSlug}/shifts/bulk`, {
      method: 'POST',
      json: { shiftIds: [...selectedIds], action },
    });
    toast({
      title: success.replace('{n}', String(res.updated)),
      description: res.skipped.length
        ? t('skippedNotice', { items: res.skipped.map((s) => `${s.title?.trim() || tShifts('emptyTitle')} (${s.reason})`).join(', ') })
        : undefined,
      tone: res.skipped.length ? 'error' : undefined,
    });
    await onDone();
  };

  const remove = async () => {
    if (signupCount > 0) {
      setNotifyHelpers(true);
      setShowDeleteDialog(true);
      return;
    }
    const ok = await confirm({
      title: t('confirmDeleteTitle', { count }),
      description: t('confirmDeleteDesc'),
      confirmLabel: t('confirmDeleteBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await run({ type: 'DELETE', notify: false }, t('deletedSuccess', { n: '{n}' }));
      onClear();
    } catch (err) {
      toast({ title: tShifts('deleteFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  if (count === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-20 mt-6">
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line-strong bg-surface/95 p-3 shadow-lift backdrop-blur">
          <span className="mr-1 text-sm font-semibold text-fg">
            {t('selectedCount', { count })}
          </span>
          <Button size="sm" variant="ghost" onClick={count === shifts.length ? onClear : onSelectAll}>
            {count === shifts.length ? t('noneBtn') : t('allBtn', { count: shifts.length })}
          </Button>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <Button size="sm" variant="secondary" onClick={() => setMode('MOVE')}>
            <ArrowLeftRight className="size-3.5" /> {t('moveBtn')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('SET_SLOTS')}>
            <Users className="size-3.5" /> {t('slotsBtn')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('SET_CATEGORY')}>
            <Tag className="size-3.5" /> {t('categoryBtn')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode('SET_SETUP')}>
            <Hammer className="size-3.5" /> {t('setupBtn')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onMessage} disabled={signupCount === 0}>
            <Mail className="size-3.5" /> {t('messageBtn')}
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} className="text-danger-ink hover:bg-danger/10">
            <Trash2 className="size-3.5" /> {t('deleteBtn')}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label={t('clearAria')} className="ml-auto">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={
          mode === 'MOVE'
            ? t('dialogTitleMove')
            : mode === 'SET_SLOTS'
              ? t('dialogTitleSlots')
              : mode === 'SET_CATEGORY'
                ? t('dialogTitleCategory')
                : t('dialogTitleSetup')
        }
        description={t('dialogDesc', { count })}
      >
        {mode && (
          <BulkForm
            mode={mode}
            signupCount={signupCount}
            onCancel={() => setMode(null)}
            onSubmit={async (action, success) => {
              await run(action, success);
              setMode(null);
            }}
          />
        )}
      </Dialog>

      {showDeleteDialog && (
        <Dialog
          open
          onClose={() => setShowDeleteDialog(false)}
          size="sm"
          title={t('confirmDeleteTitle', { count })}
          description={
            <div className="space-y-4 pt-1 text-left">
              <p className="text-sm text-fg-muted">
                {t('deleteWithSignupsDesc', { count: signupCount })}
              </p>
              <label className="flex items-start gap-2.5 rounded-field border border-line bg-surface-2 p-3 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyHelpers}
                  onChange={(e) => setNotifyHelpers(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-line text-accent focus:ring-accent"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-fg block">
                    {tShifts('notifyHelpersCheckbox')}
                  </span>
                  <span className="text-xs text-fg-muted block">
                    {tShifts('notifyHelpersHint')}
                  </span>
                </div>
              </label>
            </div>
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
                {tShifts('cancelBtn')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setShowDeleteDialog(false);
                  try {
                    await run({ type: 'DELETE', notify: notifyHelpers }, t('deletedSuccess', { n: '{n}' }));
                    onClear();
                  } catch (err) {
                    toast({ title: tShifts('deleteFailed'), description: errorMessage(err), tone: 'error' });
                  }
                }}
              >
                {tShifts('deleteShiftBtn')}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

function BulkForm({
  mode,
  signupCount,
  onCancel,
  onSubmit,
}: {
  mode: Exclude<Mode, null>;
  signupCount: number;
  onCancel: () => void;
  onSubmit: (action: BulkShiftsInput['action'], success: string) => Promise<void>;
}) {
  const t = useTranslations('web.ok.shifts.bulk');
  const tShifts = useTranslations('web.ok.shifts');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [slots, setSlots] = useState(2);
  const [category, setCategory] = useState('');
  const [setup, setSetup] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === 'MOVE') {
        const total = hours * 60 + minutes;
        if (days === 0 && total === 0) throw new Error(t('specifyTimeSpanError'));
        await onSubmit({ type: 'MOVE', days: direction * days, minutes: direction * total }, t('movedSuccess', { n: '{n}' }));
      } else if (mode === 'SET_SLOTS') {
        await onSubmit({ type: 'SET_SLOTS', requiredSlots: slots }, t('slotsSuccess', { n: '{n}' }));
      } else if (mode === 'SET_CATEGORY') {
        await onSubmit({ type: 'SET_CATEGORY', category: category.trim() || null }, t('categorySuccess', { n: '{n}' }));
      } else {
        await onSubmit({ type: 'SET_SETUP', isSetupTeardown: setup }, t('setupSuccess', { n: '{n}' }));
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const num = (value: string, max: number) => Math.min(max, Math.max(0, parseInt(value, 10) || 0));

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}

      {mode === 'MOVE' && (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-field border border-line bg-surface-2 p-1">
            {([1, -1] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  'rounded-[0.5rem] py-2 text-sm font-semibold transition',
                  direction === d ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                )}
              >
                {d === 1 ? t('directionLater') : t('directionEarlier')}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('fieldDays')}>
              <Input type="number" min={0} max={365} value={days} onChange={(e) => setDays(num(e.target.value, 365))} />
            </Field>
            <Field label={t('fieldHours')}>
              <Input type="number" min={0} max={23} value={hours} onChange={(e) => setHours(num(e.target.value, 23))} />
            </Field>
            <Field label={t('fieldMinutes')}>
              <Input type="number" min={0} max={59} step={5} value={minutes} onChange={(e) => setMinutes(num(e.target.value, 59))} />
            </Field>
          </div>
          {signupCount > 0 && (
            <Callout tone="warning">
              {t('moveHelpersWarning', { count: signupCount })}
            </Callout>
          )}
        </>
      )}

      {mode === 'SET_SLOTS' && (
        <Field
          label={t('slotsPerShiftLabel')}
          hint={t('slotsPerShiftHint')}
        >
          <Input type="number" min={1} max={500} value={slots} onChange={(e) => setSlots(Math.max(1, num(e.target.value, 500)))} />
        </Field>
      )}

      {mode === 'SET_CATEGORY' && (
        <Field label={t('categoryLabel')} hint={t('categoryHint')}>
          <Input value={category} maxLength={80} placeholder={t('categoryPlaceholder')} onChange={(e) => setCategory(e.target.value)} />
        </Field>
      )}

      {mode === 'SET_SETUP' && (
        <Field label={t('setupTypeLabel')}>
          <Select value={setup ? 'yes' : 'no'} onChange={(e) => setSetup(e.target.value === 'yes')}>
            <option value="yes">{t('setupTypeYes')}</option>
            <option value="no">{t('setupTypeNo')}</option>
          </Select>
        </Field>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tShifts('cancelBtn')}
        </Button>
        <Button type="submit" loading={saving}>
          {t('applyBtn')}
        </Button>
      </div>
    </form>
  );
}
