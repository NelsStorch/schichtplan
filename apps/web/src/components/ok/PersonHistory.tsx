'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Mail, Repeat, UserMinus, UserPlus, UserX } from 'lucide-react';
import { ATTENDANCE_STATUSES, type PersonHistoryDto } from '@schichtplan/shared';
import { Skeleton, cn } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortWeekday, fmtStand, fmtTimeRange } from '@/lib/format';

type Entry = {
  key: string;
  at: string;
  icon: React.ReactNode;
  tone: 'success' | 'danger' | 'warning' | 'accent' | 'neutral';
  title: string;
  detail?: string;
};

const TONE: Record<Entry['tone'], string> = {
  success: 'bg-success/15 text-success-ink',
  danger: 'bg-danger/15 text-danger-ink',
  warning: 'bg-warning/15 text-warning-ink',
  accent: 'bg-accent/15 text-accent-ink',
  neutral: 'bg-surface-3 text-fg-muted',
};

/**
 * Verlauf einer Person am Anlass: Ein-/Austragungen, Übernahmen, Anwesenheit,
 * erhaltene OK-Nachrichten und Abmeldung. Wird erst beim Aufklappen geladen.
 */
export function PersonHistory({
  eventSlug,
  userId,
  guestName,
  deregisteredAt,
  deregistrationReason,
  reloadKey,
}: {
  eventSlug: string;
  userId: string | null;
  guestName: string | null;
  deregisteredAt: string | null;
  deregistrationReason: string | null;
  /** Ändert sich nach Ein-/Austragungen, damit der Verlauf neu lädt */
  reloadKey: number;
}) {
  const [data, setData] = useState<PersonHistoryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = userId ? `userId=${encodeURIComponent(userId)}` : `guestName=${encodeURIComponent(guestName ?? '')}`;
    api<PersonHistoryDto>(`/api/events/${eventSlug}/person-history?${query}`)
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [eventSlug, userId, guestName, reloadKey]);

  if (error) return <p className="text-xs text-danger-ink">Verlauf konnte nicht geladen werden: {error}</p>;
  if (!data) return <Skeleton className="h-16 rounded-field" />;

  const entries: Entry[] = [];
  for (const l of data.logs) {
    const shift = `«${l.shiftTitle}»${l.taskTitle && l.taskTitle !== l.shiftTitle ? ` (${l.taskTitle})` : ''}${
      l.shiftStartTime && l.shiftEndTime ? ` · ${fmtShortWeekday(l.shiftStartTime)} ${fmtTimeRange(l.shiftStartTime, l.shiftEndTime)}` : ''
    }`;
    const self = !l.performedByUserId || (userId !== null && l.performedByUserId === userId);
    if (l.action === 'SIGNUP') {
      entries.push({
        key: l.id,
        at: l.createdAt,
        icon: <UserPlus className="size-3.5" />,
        tone: 'success',
        title: self ? 'Selbst eingetragen' : `Eingeteilt von ${l.performedByName}`,
        detail: shift,
      });
    } else if (l.action === 'SIGNOFF') {
      entries.push({
        key: l.id,
        at: l.createdAt,
        icon: <UserMinus className="size-3.5" />,
        tone: 'danger',
        title: self ? 'Selbst ausgetragen' : `Ausgetragen von ${l.performedByName}`,
        detail: shift,
      });
    } else if (l.action === 'REPLACE') {
      entries.push({
        key: l.id,
        at: l.createdAt,
        icon: <Repeat className="size-3.5" />,
        tone: 'warning',
        title: `Schicht übernommen von ${l.performedByName ?? 'Gast'}`,
        detail: shift,
      });
    } else {
      entries.push({
        key: l.id,
        at: l.createdAt,
        icon: <ClipboardCheck className="size-3.5" />,
        tone: 'accent',
        title: `Anwesenheit: ${l.attendance ? ATTENDANCE_STATUSES[l.attendance] : 'offen'}${
          l.performedByName ? ` (durch ${l.performedByName})` : ' (per QR-Code)'
        }`,
        detail: shift,
      });
    }
  }
  for (const m of data.messages) {
    entries.push({
      key: `msg-${m.id}`,
      at: m.createdAt,
      icon: <Mail className="size-3.5" />,
      tone: 'neutral',
      title: `Nachricht vom OK: «${m.subject}»`,
      detail: `von ${m.sentByName} an ${m.targetLabel}`,
    });
  }
  if (deregisteredAt) {
    entries.push({
      key: 'dereg',
      at: deregisteredAt,
      icon: <UserX className="size-3.5" />,
      tone: 'neutral',
      title: 'Abgemeldet (kann nicht helfen)',
      detail: deregistrationReason ? `Grund: ${deregistrationReason}` : undefined,
    });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  const lastMessage = data.messages[0];

  return (
    <div className="space-y-2">
      <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">
        Verlauf
        {userId && (
          <span className="ml-2 font-normal normal-case tracking-normal text-fg-muted">
            {lastMessage
              ? `zuletzt angeschrieben ${fmtStand(lastMessage.createdAt)}`
              : 'noch nicht vom OK angeschrieben (erfasst seit 14.11.2026)'}
          </span>
        )}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs italic text-fg-muted">Noch keine Einträge.</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.key} className="flex items-start gap-2.5 text-xs">
              <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', TONE[e.tone])}>{e.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{e.title}</span>
                {e.detail && <span className="block truncate text-fg-muted">{e.detail}</span>}
              </span>
              <span className="shrink-0 whitespace-nowrap text-2xs text-fg-subtle">{fmtStand(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
