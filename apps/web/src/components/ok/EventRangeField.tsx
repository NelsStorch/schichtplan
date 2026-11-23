'use client';

import { useState } from 'react';
import { CalendarClock, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { addZurichDays, dayKeyDiff, formatDays, zurichDayKey as zurichDay } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateRange } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

const daysLabel = (n: number) => formatDays(Math.abs(n));

/**
 * Zeitraum eines Anlasses in den Einstellungen: ergibt sich aus der ersten und letzten Schicht.
 * Ändern geht nur über «Verschieben», dabei wandern alle Schichten mit.
 */
export function EventRangeField({ event, onMoved }: { event: EventDetails; onMoved: () => void | Promise<void> }) {
  const t = useTranslations('web.ok.settings');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(zurichDay(event.startDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shifts = event.shifts ?? [];
  const signupCount = shifts.reduce((sum, s) => sum + (s.signups?.length ?? 0), 0);
  const days = day ? dayKeyDiff(zurichDay(event.startDate), day) : 0;
  const preview =
    days !== 0
      ? fmtDateRange(addZurichDays(event.startDate, days).toISOString(), addZurichDays(event.endDate, days).toISOString(), event.dayCutoffTime)
      : null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setDay(zurichDay(event.startDate));
    setError(null);
  };

  const move = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${event.slug}/move`, { method: 'POST', json: { days } });
      toast({
        title: t('rangeMovedSuccess'),
        description: t('rangeMovedSuccessDesc', { count: shifts.length, days: daysLabel(days) }),
        tone: 'success',
      });
      setOpen(false);
      await onMoved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const direction = days > 0 ? t('rangeMoveForward') : t('rangeMoveBackward');

  return (
    <>
      <div className="flex flex-col gap-3 rounded-field border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <CalendarDays className="size-4 text-accent-ink" aria-hidden /> {fmtDateRange(event.startDate, event.endDate, event.dayCutoffTime)}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {shifts.length > 0 ? t('rangeCalculatedHint') : t('rangeNoShiftsHint')}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
          <CalendarClock aria-hidden /> {t('rangeMoveBtn')}
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={close}
        icon={<CalendarClock />}
        title={t('rangeMoveDialogTitle')}
        description={t('rangeMoveDialogDesc')}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t('rangeMoveCancelBtn')}
            </Button>
            <Button onClick={move} disabled={busy || days === 0}>
              <CalendarClock aria-hidden />
              {busy ? t('rangeMoveSubmittingBtn') : t('rangeMoveSubmitBtn')}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label={t('rangeNewFirstDayLabel')} error={error ?? undefined}>
            <Input type="date" value={day} required onChange={(e) => setDay(e.target.value)} />
          </Field>
          {days !== 0 && (
            <Callout tone="warning">
              <p>
                {shifts.length > 0
                  ? t.rich('rangeMoveWarningShifts', {
                      count: shifts.length,
                      days: daysLabel(days),
                      direction,
                      preview: () => <strong>{preview}</strong>,
                    })
                  : t.rich('rangeMoveWarningNoShifts', {
                      days: daysLabel(days),
                      direction,
                      preview: () => <strong>{preview}</strong>,
                    })}
                {event.signupOpensAt && t('rangeMoveOpensAtNote')}
              </p>
              {signupCount > 0 && (
                <p className="mt-2">
                  {t('rangeMoveSignupsNote', { count: signupCount })}
                </p>
              )}
            </Callout>
          )}
        </div>
      </Dialog>
    </>
  );
}
