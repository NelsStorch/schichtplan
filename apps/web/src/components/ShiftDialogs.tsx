'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Crown,
  Minus,
  Plus,
  Shield,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  toZurichInput,
  zurichInputToIso,
  type ShiftDto,
  type TaskDefinitionDto,
  type AgeRequirementType,
} from '@schichtplan/shared';

import {
  Badge,
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  cn,
  useToast,
  useConfirm,
  useOrganization,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTimeRange } from '@/lib/format';
import type { EventDetails, EventOrganizer } from '@/lib/types';

/** ISO -> Wert für <input type="datetime-local"> in Schweizer Zeit */
export const toLocalInput = toZurichInput;

function FormActions({
  onCancel,
  saving,
  label,
  isDirty,
}: {
  onCancel: () => void;
  saving: boolean;
  label: string;
  isDirty?: boolean;
}) {
  const t = useTranslations('web.shiftDialogs.shiftForm');
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs">
        {isDirty ? (
          <span className="flex items-center gap-1.5 font-medium text-accent-ink">
            <span className="size-2 rounded-full bg-accent animate-pulse" />
            {t('unsavedChanges')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} type="button">
          {t('cancelBtn')}
        </Button>
        <Button type="submit" loading={saving}>
          {label}
        </Button>
      </div>
    </div>
  );
}

export interface DeptMemberItem {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  displayName: string;
}

/* ------------------------------------------------------ Schicht anlegen / bearbeiten */

export interface TaskFormItem {
  id?: string;
  taskDefinitionId?: string | null;
  title: string;
  requiredSlots: number;
  minAge: number;
  ageRequirementType: AgeRequirementType;
  description: string;
}

export interface ShiftFormStatus {
  isDirty: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  validationError: string | null;
  hasSavedChanges: boolean;
}

export function ShiftFormDialog({
  open,
  event,
  shift,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  shift?: ShiftDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.shiftForm');
  const confirm = useConfirm();
  const toast = useToast();
  const isEdit = Boolean(shift);

  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const validationRef = useRef<(() => string | null) | null>(null);

  const [status, setStatus] = useState<ShiftFormStatus>({
    isDirty: false,
    autoSaveStatus: 'idle',
    validationError: null,
    hasSavedChanges: false,
  });

  const handleFinish = async () => {
    if (isEdit) {
      if (status.isDirty) {
        const err = validationRef.current?.();
        if (err) {
          toast({ tone: 'error', title: t('pleaseCorrectInput'), description: err });
          return;
        }
        const ok = await saveRef.current?.();
        if (!ok) return;
      }
      if (status.hasSavedChanges || status.autoSaveStatus === 'saved') {
        onSaved();
      } else {
        onClose();
      }
      return;
    }
  };

  const handleClose = async () => {
    if (isEdit) {
      if (status.isDirty) {
        const err = validationRef.current?.();
        if (err) {
          const ok = await confirm({
            title: t('discardInvalidTitle'),
            description: t('discardInvalidDesc', { error: err }),
            confirmLabel: t('discardInvalidConfirm'),
            cancelLabel: t('discardInvalidCancel'),
            tone: 'danger',
          });
          if (!ok) return;
        } else {
          await saveRef.current?.();
        }
      }
      if (status.hasSavedChanges || status.autoSaveStatus === 'saved') {
        onSaved();
      } else {
        onClose();
      }
      return;
    }

    // Neuerstellung:
    if (status.isDirty) {
      const ok = await confirm({
        title: t('discardUnsavedTitle'),
        description: t('discardUnsavedDesc'),
        confirmLabel: t('discardUnsavedConfirm'),
        cancelLabel: t('discardUnsavedCancel'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      icon={isEdit ? <Clock /> : <Plus />}
      title={isEdit ? t('editTitle') : t('newTitle')}
      description={t('forEvent', { eventTitle: event.title })}
      footer={
        <div className="flex w-full sm:!w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs">
            {isEdit ? (
              status.autoSaveStatus === 'saving' ? (
                <span className="flex items-center gap-1.5 font-medium text-fg-muted">
                  <Spinner size="xs" className="text-accent" />
                  {t('savingStatus')}
                </span>
              ) : status.isDirty && status.validationError ? (
                <span className="flex items-center gap-1.5 font-medium text-warning-ink" title={status.validationError}>
                  <AlertCircle className="size-3.5 text-warning" />
                  {status.validationError}
                </span>
              ) : status.isDirty ? (
                <span className="flex items-center gap-1.5 font-medium text-accent-ink">
                  <span className="size-2 rounded-full bg-accent animate-pulse" />
                  {t('savingStatus')}
                </span>
              ) : status.autoSaveStatus === 'saved' || status.hasSavedChanges ? (
                <span className="flex items-center gap-1.5 font-medium text-success-ink">
                  <Check className="size-3.5 text-success" />
                  {t('autoSavedStatus')}
                </span>
              ) : status.autoSaveStatus === 'error' ? (
                <span className="flex items-center gap-1.5 font-medium text-danger-ink">
                  <AlertCircle className="size-3.5 text-danger" />
                  {t('saveErrorStatus')}
                </span>
              ) : (
                <span className="text-fg-subtle">{t('autoSaveHint')}</span>
              )
            ) : status.isDirty ? (
              <span className="flex items-center gap-1.5 font-medium text-accent-ink">
                <span className="size-2 rounded-full bg-accent animate-pulse" />
                {t('unsavedInputsStatus')}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {isEdit ? (
              <Button type="button" onClick={handleFinish} loading={status.autoSaveStatus === 'saving'}>
                {t('finishBtn')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" type="button" onClick={handleClose}>
                  {t('cancelBtn')}
                </Button>
                <Button type="submit" form="shift-form" loading={status.autoSaveStatus === 'saving'}>
                  {t('createShiftBtn')}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <ShiftForm
        event={event}
        shift={shift}
        onCancel={handleClose}
        onSaved={onSaved}
        onStatusChange={setStatus}
        saveRef={saveRef}
        validationRef={validationRef}
        formId="shift-form"
      />
    </Dialog>
  );
}

function ShiftForm({
  event,
  shift,
  onCancel,
  onSaved,
  onStatusChange,
  saveRef,
  validationRef,
  formId,
}: {
  event: EventDetails;
  shift?: ShiftDto | null;
  onCancel: () => void;
  onSaved: () => void;
  onStatusChange?: (status: ShiftFormStatus) => void;
  saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  validationRef?: React.MutableRefObject<(() => string | null) | null>;
  formId?: string;
}) {
  const t = useTranslations('web.shiftDialogs.shiftForm');
  const toast = useToast();
  const isEdit = Boolean(shift);

  const [availableTasks, setAvailableTasks] = useState<TaskDefinitionDto[]>([]);
  const [members, setMembers] = useState<DeptMemberItem[]>([]);
  const [responsibleUserIds, setResponsibleUserIds] = useState<string[]>(
    () => shift?.responsibles?.map((r) => r.id) || []
  );

  useEffect(() => {
    api<TaskDefinitionDto[]>('/api/tasks')
      .then((data) => setAvailableTasks(data))
      .catch(() => {});

    if (event.responsibleMode === 'BY_SHIFT') {
      api<DeptMemberItem[]>('/api/departments/current/members')
        .then((data) => setMembers(data))
        .catch(() => {});
    }
  }, [event.responsibleMode]);

  const [form, setForm] = useState({
    title: shift?.title || '',
    category: shift?.category || '',
    isSetupTeardown: shift?.isSetupTeardown ?? false,
    startTime: shift ? toLocalInput(shift.startTime) : toLocalInput(event.startDate),
    endTime: shift ? toLocalInput(shift.endTime) : '',
    minAge: shift?.minAge || 0,
    description: shift?.description || '',
  });

  const [tasks, setTasks] = useState<TaskFormItem[]>(() => {
    if (shift?.tasks && shift.tasks.length > 0) {
      return shift.tasks.map((taskItem) => ({
        id: taskItem.id,
        taskDefinitionId: taskItem.taskDefinitionId || null,
        title: taskItem.title,
        requiredSlots: taskItem.requiredSlots,
        minAge: taskItem.minAge || 0,
        ageRequirementType: taskItem.ageRequirementType || 'ALL',
        description: taskItem.description || '',
      }));
    }
    return [
      {
        title: shift?.title || t('defaultHelperTitle'),
        requiredSlots: shift?.requiredSlots || 2,
        minAge: shift?.minAge || 0,
        ageRequirementType: 'ALL',
        description: '',
      },
    ];
  });

  // Aktualisiere Task 0 wenn Schichttitel sich ändert und nur 1 Task vorhanden ist
  const handleTitleChange = (newTitle: string) => {
    setForm((prev) => ({ ...prev, title: newTitle }));
    if (!isEdit && tasks.length === 1 && (tasks[0].title === t('defaultHelperTitle') || tasks[0].title === form.title)) {
      setTasks((prev) => [{ ...prev[0], title: newTitle }]);
    }
  };

  const addFromCatalog = (catalogItem: TaskDefinitionDto) => {
    // Falls nur 1 Task vorhanden ist und er noch leer/Standard ist, überschreiben
    if (tasks.length === 1 && (!tasks[0].title.trim() || tasks[0].title === t('defaultHelperTitle'))) {
      setTasks([
        {
          taskDefinitionId: catalogItem.id,
          title: catalogItem.title,
          requiredSlots: 1,
          minAge: catalogItem.minAge || 0,
          ageRequirementType: catalogItem.ageRequirementType || 'ALL',
          description: catalogItem.description || '',
        },
      ]);
      if (!form.title.trim()) {
        setForm((prev) => ({ ...prev, title: catalogItem.title }));
      }
      return;
    }

    // Prüfen ob diese Arbeit schon in der Schicht ist -> dann Slots erhöhen
    const existingIdx = tasks.findIndex(
      (taskItem) => (taskItem.taskDefinitionId && taskItem.taskDefinitionId === catalogItem.id) || taskItem.title.toLowerCase() === catalogItem.title.toLowerCase()
    );
    if (existingIdx >= 0) {
      updateTask(existingIdx, { requiredSlots: tasks[existingIdx].requiredSlots + 1 });
      toast({ title: t('toastSlotsIncreased', { title: catalogItem.title, slots: tasks[existingIdx].requiredSlots + 1 }) });
      return;
    }

    // Ansonsten neue Arbeit hinzufügen
    setTasks((prev) => [
      ...prev,
      {
        taskDefinitionId: catalogItem.id,
        title: catalogItem.title,
        requiredSlots: 1,
        minAge: catalogItem.minAge || 0,
        ageRequirementType: catalogItem.ageRequirementType || 'ALL',
        description: catalogItem.description || '',
      },
    ]);
  };

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        title: '',
        requiredSlots: 1,
        minAge: 0,
        ageRequirementType: 'ALL',
        description: '',
      },
    ]);
  };

  const removeTask = (index: number) => {
    if (tasks.length <= 1) return;
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, patch: Partial<TaskFormItem>) => {
    setTasks((prev) => prev.map((taskItem, i) => (i === index ? { ...taskItem, ...patch } : taskItem)));
  };

  const totalSlots = tasks.reduce((sum, taskItem) => sum + (taskItem.requiredSlots || 1), 0);

  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hasSavedChangesRef = useRef(false);

  const lastSavedSnapshotRef = useRef<string>(
    JSON.stringify({
      form,
      tasks,
      resp: responsibleUserIds,
    })
  );

  const currentSnapshot = JSON.stringify({ form, tasks, resp: responsibleUserIds });
  const isDirty = currentSnapshot !== lastSavedSnapshotRef.current;

  const getValidationError = (): string | null => {
    const hasTitle = form.title.trim().length > 0;
    const hasValidTask = tasks.some((taskItem) => taskItem.title.trim().length >= 2);
    if (!hasTitle && !hasValidTask) {
      return t('valTitleOrTask');
    }
    if (hasTitle && form.title.trim().length < 2) {
      return t('valTitleMinLength');
    }
    if (!form.startTime || !form.endTime) return t('valIncompleteTimes');
    const s = new Date(form.startTime).getTime();
    const e = new Date(form.endTime).getTime();
    if (isNaN(s) || isNaN(e)) return t('valInvalidTime');
    if (e <= s) return t('valEndAfterStart');
    for (const taskItem of tasks) {
      if (taskItem.title.trim().length < 2) return t('valTaskMinLength', { title: taskItem.title || t('valTaskFallback') });
      if ((taskItem.requiredSlots || 0) < 1) return t('valTaskMinSlot', { title: taskItem.title });
    }
    return null;
  };

  const validationError = isDirty ? getValidationError() : null;

  const performSave = async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
    const validationErr = getValidationError();
    if (validationErr) {
      setError(validationErr);
      if (!silent) {
        toast({ tone: 'error', title: validationErr });
      }
      return false;
    }

    setSaving(true);
    setAutoSaveStatus('saving');
    setError(null);

    try {
      const payload = {
        title: form.title.trim(),
        category: form.category || undefined,
        isSetupTeardown: form.isSetupTeardown,
        startTime: zurichInputToIso(form.startTime)!,
        endTime: zurichInputToIso(form.endTime)!,
        requiredSlots: totalSlots,
        minAge: form.minAge || undefined,
        description: form.description.trim() || undefined,
        responsibleUserIds: event.responsibleMode === 'BY_SHIFT' ? responsibleUserIds : undefined,
        tasks: tasks.map((taskItem) => ({
          id: taskItem.id,
          taskDefinitionId: taskItem.taskDefinitionId || undefined,
          title: taskItem.title.trim(),
          requiredSlots: taskItem.requiredSlots || 1,
          minAge: taskItem.minAge || undefined,
          ageRequirementType: taskItem.ageRequirementType,
          description: taskItem.description?.trim() || undefined,
        })),
      };

      if (isEdit && shift) {
        await api(`/api/shifts/${shift.id}`, {
          method: 'PATCH',
          json: payload,
        });
        lastSavedSnapshotRef.current = JSON.stringify({ form, tasks, resp: responsibleUserIds });
        setAutoSaveStatus('saved');
        hasSavedChangesRef.current = true;
        if (!silent) {
          toast({ title: t('toastShiftUpdated'), description: form.title });
        }
      } else {
        await api('/api/shifts', {
          method: 'POST',
          json: {
            ...payload,
            eventId: event.id,
          },
        });
        toast({ title: t('toastShiftCreated'), description: form.title });
        onSaved();
      }

      setSaving(false);
      return true;
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      setAutoSaveStatus('error');
      toast({ tone: 'error', title: t('toastSaveError'), description: msg });
      setSaving(false);
      return false;
    }
  };

  const internalSaveRef = useRef<() => Promise<boolean>>(() => performSave({ silent: true }));
  internalSaveRef.current = () => performSave({ silent: true });
  const internalValidationRef = useRef<() => string | null>(getValidationError);
  internalValidationRef.current = getValidationError;

  // Auto-Save Effect (nur beim Bearbeiten bestehender Schichten)
  useEffect(() => {
    void form;
    void tasks;
    void responsibleUserIds;
    if (!isEdit || !shift) return;
    if (!isDirty || saving) return;

    // Nur speichern, wenn keine Validierungsfehler vorliegen
    const validationErr = internalValidationRef.current();
    if (validationErr) return;

    const timer = setTimeout(async () => {
      await internalSaveRef.current();
    }, 800);

    return () => clearTimeout(timer);
  }, [form, tasks, responsibleUserIds, isDirty, saving, isEdit, shift]);

  useEffect(() => {
    onStatusChange?.({
      isDirty,
      autoSaveStatus: saving ? 'saving' : autoSaveStatus,
      validationError,
      hasSavedChanges: hasSavedChangesRef.current,
    });
  }, [isDirty, saving, autoSaveStatus, validationError, onStatusChange]);

  useEffect(() => {
    if (saveRef) saveRef.current = internalSaveRef.current;
    if (validationRef) validationRef.current = internalValidationRef.current;
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await performSave({ silent: false });
  };

  return (
    <form id={formId} onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label={t('shiftTitleLabel')} hint={t('shiftTitleHint')}>
        <Input
          value={form.title}
          autoFocus
          placeholder={t('shiftTitlePlaceholder')}
          onChange={(e) => handleTitleChange(e.target.value)}
        />
      </Field>

      {/* Eigenschaften der Schicht */}
      <div className="rounded-field border border-line bg-surface-2 p-3.5">
        <label className="flex cursor-pointer items-start gap-3 select-none">
          <input
            type="checkbox"
            checked={form.isSetupTeardown}
            onChange={(e) => setForm({ ...form, isSetupTeardown: e.target.checked })}
            className="mt-0.5 size-4 rounded border-line text-accent focus:ring-accent"
          />
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-fg flex items-center gap-1.5">
              {t('setupTeardownTitle')}
            </span>
            <p className="text-xs text-fg-muted">
              {t('setupTeardownDesc')}
            </p>
          </div>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('beginLabel')} required>
          <Input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </Field>
        <Field label={t('endLabel')} required>
          <Input
            type="datetime-local"
            value={form.endTime}
            min={form.startTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </Field>
      </div>

      {/* Mindestalter für die gesamte Schicht */}
      <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
        <span className="text-[13px] font-semibold text-fg">{t('minAgeShiftTitle')}</span>
        <p className="text-xs text-fg-muted">
          {t('minAgeShiftDesc')}
        </p>
        <div className="mt-2 grid h-10 grid-cols-4 gap-1">
          {[0, 14, 16, 18].map((age) => (
            <button
              key={age}
              type="button"
              onClick={() => setForm({ ...form, minAge: age })}
              className={cn(
                'rounded-[0.5rem] text-xs font-semibold transition',
                form.minAge === age ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
              )}
            >
              {age === 0 ? t('noMinAge') : t('minAgeFrom', { age })}
            </button>
          ))}
        </div>
      </div>

      {/* Arbeiten (Tasks) Konfigurator */}
      <div className="space-y-4 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-fg">{t('tasksSectionTitle')}</h4>
            <p className="text-xs text-fg-muted">
              {t('tasksSectionDesc', { totalSlots })}
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={addTask}>
            <Plus className="size-3.5" /> {t('newTaskBtn')}
          </Button>
        </div>

        {/* Schnell-Auswahl aus dem Vorlagen-Katalog */}
        {availableTasks.length > 0 && (
          <div className="rounded-field border border-line/70 bg-surface-2/60 p-3">
            <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-fg-subtle">
              {t('catalogFastAdd')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableTasks.map((at) => {
                const inShift = tasks.some(
                  (taskItem) => (taskItem.taskDefinitionId && taskItem.taskDefinitionId === at.id) || taskItem.title.toLowerCase() === at.title.toLowerCase()
                );
                return (
                  <button
                    key={at.id}
                    type="button"
                    onClick={() => addFromCatalog(at)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition active:scale-95',
                      inShift
                        ? 'border-accent/40 bg-accent/15 text-accent-ink hover:bg-accent/25'
                        : 'border-line/80 bg-surface text-fg hover:border-accent hover:bg-accent/10 hover:text-accent-ink'
                    )}
                  >
                    <Plus className="size-3 text-accent-ink" />
                    <span>{at.title}</span>
                    {at.minAge && (
                      <span className="rounded bg-warning/20 px-1 py-0.2 text-[10px] font-bold text-warning-ink">
                        {at.minAge}+
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {tasks.map((taskItem, idx) => (
            /* biome-ignore lint/suspicious/noArrayIndexKey: Lokale Formular-Tasks besitzen keinen zwingenden Server-Schlüssel */
            <div key={idx} className="relative rounded-field border border-line bg-surface-2 p-3.5">
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(idx)}
                  className="absolute right-2 top-2 rounded-full p-1 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                  aria-label={t('removeTaskAria')}
                >
                  <Trash2 className="size-4" />
                </button>
              )}

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label={t('taskLabelIndexed', { index: idx + 1 })} required>
                  <Input
                    value={taskItem.title}
                    placeholder={t('taskPlaceholder')}
                    onChange={(e) => updateTask(idx, { title: e.target.value })}
                  />
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-fg">{t('slotsLabel')}</span>
                  <div className="flex h-10 items-center justify-between rounded-field border border-line bg-surface px-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      type="button"
                      aria-label={t('lessSlotsAria')}
                      onClick={() => updateTask(idx, { requiredSlots: Math.max(1, taskItem.requiredSlots - 1) })}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="tabular px-2 text-sm font-bold">{taskItem.requiredSlots}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      type="button"
                      aria-label={t('moreSlotsAria')}
                      onClick={() => updateTask(idx, { requiredSlots: Math.min(20, taskItem.requiredSlots + 1) })}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Altersrichtlinien für diese Arbeit */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-fg">{t('minAgeTaskTitle')}</span>
                  <div className="grid h-9 grid-cols-4 gap-1 rounded-field border border-line bg-surface p-0.5">
                    {[0, 14, 16, 18].map((age) => (
                      <button
                        key={age}
                        type="button"
                        onClick={() => updateTask(idx, { minAge: age })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          taskItem.minAge === age ? 'bg-surface-2 text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                        )}
                      >
                        {age === 0 ? t('noMinAge') : t('minAgeFrom', { age })}
                      </button>
                    ))}
                  </div>
                </div>

                {taskItem.minAge > 0 && (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-fg">{t('ageRequirementTitle')}</span>
                    <div className="grid h-9 grid-cols-2 gap-1 rounded-field border border-line bg-surface p-0.5">
                      <button
                        type="button"
                        onClick={() => updateTask(idx, { ageRequirementType: 'ALL' })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          taskItem.ageRequirementType === 'ALL'
                            ? 'bg-accent/15 text-accent-ink font-bold'
                            : 'text-fg-muted hover:text-fg'
                        )}
                        title={t('ageReqAllTooltip')}
                      >
                        {t('ageReqAll')}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTask(idx, { ageRequirementType: 'AT_LEAST_ONE' })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          taskItem.ageRequirementType === 'AT_LEAST_ONE'
                            ? 'bg-accent/15 text-accent-ink font-bold'
                            : 'text-fg-muted hover:text-fg'
                        )}
                        title={t('ageReqAtLeastOneTooltip')}
                      >
                        {t('ageReqAtLeastOne')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {event.responsibleMode === 'BY_SHIFT' ? (
        <div className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <h4 className="text-sm font-bold text-fg">{t('responsiblesTitle')}</h4>
            <p className="text-xs text-fg-muted">
              {t('responsiblesDesc')}
            </p>
          </div>

          {responsibleUserIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {responsibleUserIds.map((userId) => {
                const member = members.find((m) => m.userId === userId);
                const shiftResp = shift?.responsibles?.find((r) => r.id === userId);
                const name = member?.displayName || shiftResp?.displayName || t('defaultResponsibleName');
                return (
                  <Badge key={userId} tone="neutral" size="md" className="flex items-center gap-1.5 py-1">
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => setResponsibleUserIds((prev) => prev.filter((id) => id !== userId))}
                      className="ml-1 rounded p-0.5 hover:bg-fg/10 text-fg-muted hover:text-fg"
                      title={t('removeTooltip')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val && !responsibleUserIds.includes(val)) {
                  setResponsibleUserIds((prev) => [...prev, val]);
                }
              }}
            >
              <option value="">{t('addResponsiblePlaceholder')}</option>
              {members
                .filter((m) => !responsibleUserIds.includes(m.userId))
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      ) : (
        <Callout tone="info">
          <strong>{t('dayRespCalloutTitle')}</strong> {t('dayRespCalloutDesc')}
        </Callout>
      )}

      <Field label={t('notesLabel')}>
        <Textarea
          rows={2}
          value={form.description}
          placeholder={t('notesPlaceholder')}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>

      {!formId && (
        <FormActions onCancel={onCancel} saving={saving} label={isEdit ? t('saveChangesBtn') : t('createShiftBtn')} isDirty={isDirty} />
      )}
    </form>
  );
}

/* ---------------------------------------------------- Helfer durch OK einteilen */

export { AssignHelperDialog } from './AssignHelperDialog';

/* ---------------------------------------------------- Schicht duplizieren */

export function DuplicateShiftDialog({
  open,
  shift,
  onClose,
  onDuplicated,
}: {
  open: boolean;
  shift: ShiftDto | null;
  onClose: () => void;
  onDuplicated: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.duplicate');
  return (
    <Dialog
      open={open && shift !== null}
      onClose={onClose}
      icon={<Copy />}
      title={t('title')}
      description={shift ? t('description', { shiftTitle: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime) }) : ''}
    >
      {shift && <DuplicateShiftForm shift={shift} onCancel={onClose} onDuplicated={onDuplicated} />}
    </Dialog>
  );
}

function DuplicateShiftForm({
  shift,
  onCancel,
  onDuplicated,
}: {
  shift: ShiftDto;
  onCancel: () => void;
  onDuplicated: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.duplicate');
  const toast = useToast();
  const [title, setTitle] = useState(shift.title?.trim() ? `${shift.title} (${t('folgeschicht')})` : '');
  const [startTime, setStartTime] = useState(toLocalInput(shift.endTime)); // Standard: schliesst direkt an vorherige Schicht an!

  // Dauer der vorherigen Schicht berechnen
  const prevDurationMs = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
  const nextEndTime = new Date(new Date(shift.endTime).getTime() + prevDurationMs).toISOString();

  const [endTime, setEndTime] = useState(toLocalInput(nextEndTime));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shifts/${shift.id}/duplicate`, {
        method: 'POST',
        json: {
          title: title.trim(),
          startTime: zurichInputToIso(startTime)!,
          endTime: zurichInputToIso(endTime)!,
        },
      });
      toast({ title: t('toastTitle'), description: title.trim() || t('folgeschicht') });
      onDuplicated();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label={t('titleLabel')}>
        <Input
          value={title}
          autoFocus
          placeholder={t('titlePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('beginLabel')} required>
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label={t('endLabel')} required>
          <Input
            type="datetime-local"
            value={endTime}
            min={startTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
      </div>

      <p className="text-xs text-fg-muted">
        {t('tasksCopiedHint', { count: shift.tasks?.length || 1 })}
      </p>

      <FormActions onCancel={onCancel} saving={saving} label={t('duplicateBtn')} />
    </form>
  );
}

/* ---------------------------------------------------- Event als Vorlage speichern */

export function SaveTemplateDialog({
  open,
  eventSlug,
  defaultTitle,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventSlug: string;
  defaultTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.template');
  const toast = useToast();
  const [title, setTitle] = useState(`${defaultTitle} (Vorlage)`);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventSlug}/save-as-template`, {
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
        },
      });
      toast({
        title: t('toastTitle'),
        description: t('toastDesc'),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Copy />}
      title={t('title')}
      description={t('description')}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <Field label={t('nameLabel')} required>
          <Input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label={t('notesLabel')}>
          <Textarea
            rows={3}
            value={description}
            placeholder={t('notesPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <FormActions onCancel={onClose} saving={saving} label={t('saveBtn')} />
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------- OK-Mitglied ernennen */

export function OrganizerDialog({
  open,
  eventSlug,
  organizer,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventSlug: string;
  organizer?: EventOrganizer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.organizer');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<UserPlus />}
      title={organizer ? t('editTitle', { name: organizer.userCeviName || organizer.displayName }) : t('newTitle')}
      description={t('description')}
    >
      <OrganizerForm
        key={organizer?.id ?? 'new'}
        eventSlug={eventSlug}
        organizer={organizer ?? null}
        onCancel={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

function OrganizerForm({
  eventSlug,
  organizer,
  onCancel,
  onSaved,
}: {
  eventSlug: string;
  organizer: EventOrganizer | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.organizer');
  const toast = useToast();
  const org = useOrganization();
  const isVerein = org.slug === 'verein';
  const [form, setForm] = useState({
    who: organizer ? organizer.userCeviName || organizer.displayName : '',
    role: (organizer?.role ?? 'OK_MEMBER') as 'OK_LEAD' | 'OK_MEMBER',
    roleTitle:
      organizer?.roleTitle && organizer.roleTitle !== 'OK-Mitglied' && organizer.roleTitle !== 'OK-Leitung'
        ? organizer.roleTitle
        : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const who = form.who.trim();
    try {
      await api(`/api/events/${eventSlug}/organizers`, {
        method: 'POST',
        json: {
          ...(organizer
            ? { userId: organizer.userId }
            : who.includes('@')
              ? { email: who }
              : { ceviName: who }),
          role: form.role,
          roleTitle: form.roleTitle.trim(),
        },
      });
      toast({ title: organizer ? t('toastUpdated', { who }) : t('toastAdded', { who }) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const roles = [
    { value: 'OK_LEAD' as const, label: t('roleLeadLabel'), text: t('roleLeadText'), icon: Crown },
    { value: 'OK_MEMBER' as const, label: t('roleMemberLabel'), text: t('roleMemberText'), icon: Shield },
  ];

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}
      {organizer ? (
        <Field label={t('personLabel')}>
          <Input value={form.who} disabled />
        </Field>
      ) : (
        <Field
          label={t('x.whoLabel', { nickname: org.nicknameTerm })}
          required
          hint={
            isVerein
              ? t('accountRequiredVerein', { nicknameTerm: org.nicknameTerm })
              : t('accountRequiredOrg', { provider: org.authProviderShort, nicknameTerm: org.nicknameTerm })
          }
        >
          <Input
            value={form.who}
            autoFocus
            placeholder={t('x.whoLabel', { nickname: org.nicknameTerm })}
            onChange={(e) => setForm({ ...form, who: e.target.value })}
          />
        </Field>
      )}
      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-fg">{t('roleLegend')}</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {roles.map((r) => {
            const Icon = r.icon;
            const selected = form.role === r.value;
            return (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-field border p-4 transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  className="sr-only"
                  checked={selected}
                  onChange={() => setForm({ ...form, role: r.value })}
                />
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span>
                  <span className="block text-sm font-semibold text-fg">{r.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{r.text}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label={t('functionLabel')}>
        <Input
          value={form.roleTitle}
          placeholder={t('functionPlaceholder')}
          onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
        />
      </Field>
      <FormActions onCancel={onCancel} saving={saving} label={organizer ? t('saveBtn') : t('addBtn')} />
    </form>
  );
}

/* ------------------------------------------------------ Tages-Verantwortliche bearbeiten */

export function DayResponsiblesDialog({
  open,
  event,
  dayDate,
  dayLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  dayDate: string;
  dayLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.shiftDialogs.dayResponsibles');
  const toast = useToast();
  const [members, setMembers] = useState<DeptMemberItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      api<DeptMemberItem[]>('/api/departments/current/members')
        .then(setMembers)
        .catch(() => {});
      const existing = (event.dayResponsibles?.[dayDate] ?? []).map((r) => r.id);
      setSelectedUserIds(existing);
    }
  }, [open, event, dayDate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${event.slug}/days/${dayDate}/responsibles`, {
        method: 'PUT',
        json: { userIds: selectedUserIds },
      });
      toast({
        title: t('toastTitle'),
        description: t('toastDesc', { dayLabel }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Shield />}
      title={t('title')}
      description={t('description', { dayLabel })}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <p className="text-xs text-fg-muted">
          {t('hint')}
        </p>

        {selectedUserIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUserIds.map((userId) => {
              const member = members.find((m) => m.userId === userId);
              const existingResp = event.dayResponsibles?.[dayDate]?.find((r) => r.id === userId);
              const name = member?.displayName || existingResp?.displayName || t('defaultPersonName');
              return (
                <Badge key={userId} tone="neutral" size="md" className="flex items-center gap-1.5 py-1">
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds((prev) => prev.filter((id) => id !== userId))}
                    className="ml-1 rounded p-0.5 hover:bg-fg/10 text-fg-muted hover:text-fg"
                    title={t('removeTooltip')}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        <Field label={t('addPersonLabel')}>
          <Select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val && !selectedUserIds.includes(val)) {
                setSelectedUserIds((prev) => [...prev, val]);
              }
            }}
          >
            <option value="">{t('selectPlaceholder')}</option>
            {members
              .filter((m) => !selectedUserIds.includes(m.userId))
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
          </Select>
        </Field>

        <FormActions onCancel={onClose} saving={saving} label={t('saveBtn')} />
      </form>
    </Dialog>
  );
}
