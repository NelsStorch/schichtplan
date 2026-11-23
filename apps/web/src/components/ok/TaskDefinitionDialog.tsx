'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';
import type { AgeRequirementType, TaskDefinitionDto } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Textarea, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';

export function TaskDefinitionDialog({
  open,
  task,
  onClose,
  onSaved,
}: {
  open: boolean;
  task: TaskDefinitionDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(task);
  const t = useTranslations('web.ok.tasks');
  const tShifts = useTranslations('web.ok.shifts');
  const toast = useToast();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [minAge, setMinAge] = useState(task?.minAge || 0);
  const [ageRequirementType, setAgeRequirementType] = useState<AgeRequirementType>(task?.ageRequirementType || 'ALL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void open;
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setMinAge(task.minAge || 0);
      setAgeRequirementType(task.ageRequirementType || 'ALL');
    } else {
      setTitle('');
      setDescription('');
      setMinAge(0);
      setAgeRequirementType('ALL');
    }
    setError(null);
  }, [task, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('titleRequiredError'));
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        minAge: minAge > 0 ? minAge : null,
        ageRequirementType,
      };

      if (isEdit && task) {
        await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          json: payload,
        });
        toast({ title: t('updatedSuccess'), description: title });
      } else {
        await api('/api/tasks', {
          method: 'POST',
          json: payload,
        });
        toast({ title: t('createdTaskSuccess'), description: title });
      }
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
      icon={<Wrench />}
      title={isEdit ? t('editTitle') : t('createTitle')}
      description={t('dialogDesc')}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <Field label={t('titleLabel')} required>
          <Input
            value={title}
            autoFocus
            placeholder={t('titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label={t('descLabel')}>
          <Textarea
            rows={2}
            value={description}
            placeholder={t('descPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {/* Mindestalter */}
        <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
          <span className="text-[13px] font-semibold text-fg">{t('minAgeHeading')}</span>
          <div className="mt-1 grid h-9 grid-cols-4 gap-1">
            {[0, 14, 16, 18].map((age) => (
              <button
                key={age}
                type="button"
                onClick={() => setMinAge(age)}
                className={cn(
                  'rounded-[0.5rem] text-xs font-semibold transition',
                  minAge === age ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                )}
              >
                {age === 0 ? t('minAgeNone') : t('minAgeFrom', { age })}
              </button>
            ))}
          </div>
          {minAge > 0 && (
            <p className="text-2xs text-fg-muted mt-1">
              {t('minAgeNotice')}
            </p>
          )}
        </div>

        {minAge > 0 && (
          <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
            <span className="text-[13px] font-semibold text-fg">{t('ageReqHeading')}</span>
            <div className="mt-1 grid h-9 grid-cols-2 gap-1 rounded-field border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setAgeRequirementType('ALL')}
                className={cn(
                  'rounded-[0.4rem] text-xs font-semibold transition',
                  ageRequirementType === 'ALL'
                    ? 'bg-accent/15 text-accent-ink font-bold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {t('ageReqAll')}
              </button>
              <button
                type="button"
                onClick={() => setAgeRequirementType('AT_LEAST_ONE')}
                className={cn(
                  'rounded-[0.4rem] text-xs font-semibold transition',
                  ageRequirementType === 'AT_LEAST_ONE'
                    ? 'bg-accent/15 text-accent-ink font-bold'
                    : 'text-fg-muted hover:text-fg'
                )}
                title={t('ageReqAtLeastOneTitle')}
              >
                {t('ageReqAtLeastOne')}
              </button>
            </div>
            <p className="text-2xs text-fg-muted mt-1">
              {ageRequirementType === 'ALL'
                ? t('ageReqAllDesc')
                : t('ageReqOneDesc')}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} type="button">
            {tShifts('cancelBtn')}
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? t('saveChangesBtn') : t('createTaskBtn')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
