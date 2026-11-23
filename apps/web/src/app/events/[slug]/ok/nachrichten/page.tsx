'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, Mail, Send, Users } from 'lucide-react';
import { zurichDateTimeFormat, type EventMessageDto, type EventMessageResultDto, type EventMessageTarget } from '@schichtplan/shared';
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Skeleton, Textarea, cn, useConfirm, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtShortWeekday, groupByBusinessDay, fmtTimeRange } from '@/lib/format';

const MAX_BODY = 5000;

/** Beim Aufruf holen, damit die aktive Sprache gilt */
const stampFmt = () =>
  zurichDateTimeFormat({
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export default function MessagesPage() {
  const t = useTranslations('web.ok.messages');
  const { event, base, messageDraft, setMessageDraft } = useOkEvent();
  const toast = useToast();
  const confirm = useConfirm();

  const [target, setTarget] = useState<EventMessageTarget>(messageDraft?.target ?? 'ALL');
  const [shiftIds, setShiftIds] = useState<Set<string>>(
    new Set(messageDraft?.target === 'SHIFTS' ? messageDraft.shiftIds : [])
  );
  const userIds = useMemo(() => (messageDraft?.target === 'PEOPLE' ? messageDraft.userIds : []), [messageDraft]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<EventMessageResultDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<EventMessageDto[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const days = useMemo(() => groupByBusinessDay(event.shifts, event.dayCutoffTime), [event]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api<EventMessageDto[]>(`/api/events/${event.slug}/messages`));
    } catch {
      setHistory([]);
    }
  }, [event.slug]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const targetPayload = useMemo(
    () => ({
      target,
      shiftIds: target === 'SHIFTS' ? [...shiftIds] : undefined,
      userIds: target === 'PEOPLE' ? userIds : undefined,
    }),
    [target, shiftIds, userIds]
  );
  const targetReady =
    (target !== 'SHIFTS' || shiftIds.size > 0) && (target !== 'PEOPLE' || userIds.length > 0);

  // Empfänger zählen, sobald die Auswahl steht
  useEffect(() => {
    if (!targetReady) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api<EventMessageResultDto>(`/api/events/${event.slug}/messages`, {
          method: 'POST',
          json: { ...targetPayload, subject: 'Vorschau', body: 'Vorschau', dryRun: true },
        });
        if (!cancelled) {
          setPreview(res);
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) setPreviewError(errorMessage(err));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [event.slug, targetPayload, targetReady]);

  const toggleShift = (id: string) =>
    setShiftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview || preview.recipientCount === 0) return;
    const ok = await confirm({
      title: t('confirmTitle', { count: preview.recipientCount }),
      description: t('confirmDesc'),
      confirmLabel: t('confirmButton'),
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await api<EventMessageResultDto>(`/api/events/${event.slug}/messages`, {
        method: 'POST',
        json: { ...targetPayload, subject: subject.trim(), body: body.trim() },
      });
      toast({ title: t('sendSuccess'), description: t('sendSuccessDesc', { count: res.sent }) });
      setSubject('');
      setBody('');
      setMessageDraft(null);
      if (target === 'PEOPLE') setTarget('ALL');
      await loadHistory();
    } catch (err) {
      toast({ title: t('sendFailed'), description: errorMessage(err), tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const options: { key: EventMessageTarget; label: string; text: string; show: boolean }[] = [
    { key: 'ALL', label: t('targetAllLabel'), text: t('targetAllText'), show: true },
    {
      key: 'OPEN',
      label: event.minShiftsPerPerson ? t('targetOpenTargetLabel') : t('targetOpenNoneLabel'),
      text: event.minShiftsPerPerson
        ? t('targetOpenTargetText', { min: event.minShiftsPerPerson })
        : t('targetOpenNoneText'),
      show: true,
    },
    { key: 'SHIFTS', label: t('targetShiftsLabel'), text: t('targetShiftsText'), show: event.shifts.length > 0 },
    {
      key: 'PEOPLE',
      label: t('targetPeopleLabel'),
      text: messageDraft?.target === 'PEOPLE' ? messageDraft.label : t('targetPeopleSelectHint'),
      show: true,
    },
    { key: 'OK', label: t('targetOkLabel'), text: t('targetOkText'), show: true },
  ];

  return (
    <div>
      <OkPageHeader
        title={t('title')}
        description={t('desc')}
        help="/ok/nachrichten/"
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={submit} className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-[13px] font-semibold text-fg">{t('targetLegend')}</legend>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {options
                .filter((o) => o.show)
                .map((o) => {
                  const selected = target === o.key;
                  const disabled = o.key === 'PEOPLE' && userIds.length === 0;
                  return (
                    <label
                      key={o.key}
                      className={cn(
                        'flex gap-3 rounded-field border p-3.5 transition-colors',
                        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                        selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                      )}
                    >
                      <input
                        type="radio"
                        name="target"
                        className="mt-1 accent-accent"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => setTarget(o.key)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-fg">{o.label}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">
                          {o.key === 'PEOPLE' && disabled ? (
                            <Link href={`${base}/helfende`} className="font-semibold text-accent-ink hover:underline">
                              {t('targetPeopleSelectHint')}
                            </Link>
                          ) : (
                            o.text
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>

          {target === 'SHIFTS' && (
            <Card className="max-h-80 overflow-y-auto p-3">
              {days.map((d) => (
                <div key={d.key} className="mb-3 last:mb-0">
                  <p className="mb-1 px-1 text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                    {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key))}
                  </p>
                  {d.items.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-field px-1 py-1.5 text-sm hover:bg-surface-2">
                      <input type="checkbox" className="size-4 accent-accent" checked={shiftIds.has(s.id)} onChange={() => toggleShift(s.id)} />
                      <span className="min-w-0 flex-1 truncate text-fg">{s.title}</span>
                      <span className="shrink-0 font-mono text-2xs text-fg-muted">
                        {fmtTimeRange(s.startTime, s.endTime)} · {s.signups?.length ?? 0}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </Card>
          )}

          {/* Empfänger */}
          {previewError ? (
            <Callout tone="danger">{previewError}</Callout>
          ) : preview && targetReady ? (
            <div
              className={cn(
                'rounded-field border p-3.5 text-sm',
                preview.recipientCount > 0 ? 'border-line bg-surface-2/60' : 'border-warning/40 bg-warning/8'
              )}
            >
              <p className="flex items-center gap-2 font-semibold text-fg">
                <Users className="size-4" />
                {t('recipientsCount', { count: preview.recipientCount })}
              </p>
              {preview.withoutEmail.length > 0 && (
                <details className="mt-1.5 text-xs text-fg-muted">
                  <summary className="cursor-pointer">
                    {t('recipientsWithoutEmail', { count: preview.withoutEmail.length })}
                  </summary>
                  <p className="mt-1">{preview.withoutEmail.join(', ')}</p>
                </details>
              )}
            </div>
          ) : null}

          <Field label={t('subjectLabel')} required>
            <Input value={subject} maxLength={150} placeholder={t('subjectPlaceholder')} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field
            label={t('bodyLabel')}
            required
            hint={t('bodyHint', { count: body.length, max: MAX_BODY })}
          >
            <Textarea
              rows={8}
              value={body}
              maxLength={MAX_BODY}
              placeholder={t('bodyPlaceholder')}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={sending}
              disabled={!targetReady || !preview || preview.recipientCount === 0 || subject.trim().length < 3 || !body.trim()}
            >
              <Send className="size-4" /> {t('sendButton')}
            </Button>
          </div>
        </form>

        <section aria-labelledby="history-title">
          <h3 id="history-title" className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-subtle">
            {t('historySection')}
          </h3>
          {history === null ? (
            <Skeleton className="h-32 rounded-card" />
          ) : history.length === 0 ? (
            <EmptyState icon={<Mail />} title={t('noHistory')} description={t('noHistoryDesc')} />
          ) : (
            <div className="space-y-3">
              {history.map((m) => {
                const isExpanded = expandedIds.has(m.id);
                const isLong = m.body.length > 160 || m.body.split('\n').length > 3;
                return (
                  <Card key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-fg">{m.subject}</p>
                      {m.failedCount > 0 ? (
                        <Badge tone="danger" size="sm">
                          <AlertTriangle className="size-3" /> {t('failedBadge', { count: m.failedCount })}
                        </Badge>
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-success-ink" aria-label={t('sentAria')} />
                      )}
                    </div>
                    <p className="mt-0.5 text-2xs text-fg-muted">
                      {stampFmt().format(new Date(m.createdAt))} · {m.sentByName} · {m.targetLabel} ({m.recipientCount})
                    </p>
                    <p className={cn('mt-2 whitespace-pre-line text-xs text-fg-muted', !isExpanded && 'line-clamp-3')}>
                      {m.body}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                      {isLong ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            })
                          }
                          className="inline-flex items-center gap-1 font-semibold text-fg-muted hover:text-fg"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="size-3.5" /> {t('showLess')}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3.5" /> {t('readFull')}
                            </>
                          )}
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSubject(m.subject);
                          setBody(m.body);
                          toast({ title: t('templateApplied'), description: m.subject });
                        }}
                        className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                      >
                        <Copy className="size-3" /> {t('useAsTemplate')}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
