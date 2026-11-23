'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useEventText } from '@/lib/eventText';
import { Check, Copy, Download, Filter, Link2, Plus, Search, Share2, Trash2, User, Users, X } from 'lucide-react';
import {
  PLACEHOLDER_LAST_NAME,
  retentionNotice,
  type EventAccessLinkDto,
  type EventParticipantDto,
  zurichInputToIso,
} from '@schichtplan/shared';
import {
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtFullDate, fmtShortWeekday, fmtTime } from '@/lib/format';
import type { EventDetails } from '@/lib/types';
import { AccessTypeBadge } from './event-meta';

function linkUrl(slug: string, token: string) {
  return `${window.location.origin}/events/${slug}?zugang=${encodeURIComponent(token)}`;
}

/** OK-Dashboard: Wer darf sich eintragen, Zugangs-Links, Angaben der eingetragenen Personen */
export function EventAccessPanel({ event }: { event: EventDetails }) {
  const t = useTranslations('web.ok.access');
  const eventText = useEventText();
  return (
    <div className="space-y-8">
      <Card className="p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} />
          {!event.allowPublicSignup && <Badge tone="warning">{t('closedBadge')}</Badge>}
        </div>
        <p className="mt-3 text-sm text-fg">
          {t('audienceLabel', { audience: event.audience })}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {t('requiredFieldsLabel', {
            fields: event.requiredFields.length
              ? event.requiredFields.map((f) => eventText.profileField(f)).join(', ')
              : t('noneRequired'),
          })}
          {event.questions.length > 0 && ` · ${t('ownQuestions', { count: event.questions.length })}`}. {t('settingsHint')}
        </p>
      </Card>

      <AccessLinks eventSlug={event.slug} />
      <Participants event={event} />
    </div>
  );
}

function AccessLinks({ eventSlug }: { eventSlug: string }) {
  const t = useTranslations('web.ok.access');
  const toast = useToast();
  const confirm = useConfirm();
  const [links, setLinks] = useState<EventAccessLinkDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(await api<EventAccessLinkDto[]>(`/api/events/${eventSlug}/access-links`));
    } catch (err) {
      toast({ title: 'Links konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setLinks([]);
    }
  }, [eventSlug, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const share = async (link: EventAccessLinkDto) => {
    const url = linkUrl(eventSlug, link.token);
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: link.label, url });
        return;
      } catch {
        // abgebrochen: auf Kopieren zurückfallen
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(link.id);
    toast({ title: t('copySuccess'), description: 'Er gilt nur zusammen mit einer Anmeldung.' });
    setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 2000);
  };

  const remove = async (link: EventAccessLinkDto) => {
    const ok = await confirm({
      title: t('x.deleteTitle', { label: link.label }),
      description:
        link.redeemedBy.length > 0
          ? t('x.deleteLoseAccess', { count: link.redeemedBy.length })
          : t('x.deleteNoLonger'),
      confirmLabel: t('deleteBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${eventSlug}/access-links/${link.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast({ title: 'Löschen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <section aria-labelledby="links-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="links-title" className="text-base font-bold text-fg">
            {t('linksTitle')}
          </h3>
          <p className="text-xs text-fg-muted">
            {t('linksDesc')}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> {t('createLinkBtn')}
        </Button>
      </div>

      {links === null ? (
        <Skeleton className="h-24 rounded-card" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title={t('noLinks')}
          description={t('x.noLinksDesc')}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  link.kind === 'GROUP' ? 'bg-accent/12 text-accent-ink' : 'bg-surface-2 text-fg-muted'
                )}
              >
                {link.kind === 'GROUP' ? <Users className="size-4" /> : <User className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  {link.label}
                  <Badge size="sm">{link.kind === 'GROUP' ? t('x.kindGroup') : t('x.kindPersonal')}</Badge>
                  {link.isExpired && (
                    <Badge size="sm" tone="danger">
                      {t('x.expired')}
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {link.redeemedBy.length === 0
                    ? link.kind === 'PERSONAL'
                      ? t('x.notRedeemed')
                      : t('x.nobodyYet')
                    : t('x.redeemedBy', { names: link.redeemedBy.map((r) => r.displayName).join(', ') })}
                  {link.expiresAt && ` · ${t('x.deadline', { date: fmtFullDate(link.expiresAt) })}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => share(link)} disabled={link.isExpired}>
                  {copied === link.id ? <Check /> : <Share2 />}
                  <span className="hidden sm:inline">{copied === link.id ? 'Kopiert' : 'Teilen'}</span>
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(link)}
                  aria-label={t('x.deleteAria', { label: link.label })}
                  className="hover:text-danger-ink"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateLinkDialog
        open={creating}
        eventSlug={eventSlug}
        onClose={() => setCreating(false)}
        onCreated={async (token, label) => {
          setCreating(false);
          await load();
          try {
            await navigator.clipboard.writeText(linkUrl(eventSlug, token));
            toast({ title: `Link für ${label} kopiert`, description: 'Füge ihn im Chat oder in einer E-Mail ein.' });
          } catch {
            toast({ title: 'Link erstellt' });
          }
        }}
      />
    </section>
  );
}


function CreateLinkDialog({
  open,
  eventSlug,
  onClose,
  onCreated,
}: {
  open: boolean;
  eventSlug: string;
  onClose: () => void;
  onCreated: (token: string, label: string) => void;
}) {
  const t = useTranslations('web.ok.access');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'PERSONAL' | 'GROUP'>('PERSONAL');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ token: string }>(`/api/events/${eventSlug}/access-links`, {
        method: 'POST',
        json: {
          label: label.trim(),
          kind,
          // Gültig bis Ende des gewählten Tages in Schweizer Zeit
          expiresAt: expires ? zurichInputToIso(`${expires}T23:59`) : null,
        },
      });
      onCreated(res.token, label.trim());
      setLabel('');
      setExpires('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const kinds = [
    {
      value: 'PERSONAL' as const,
      title: t('x.kindPersonal'),
      text: t('x.kindPersonalText'),
      icon: User,
    },
    {
      value: 'GROUP' as const,
      title: t('x.kindGroup'),
      text: t('x.kindGroupText'),
      icon: Users,
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} icon={<Link2 />} title={t('x.createTitle')}>
      <form onSubmit={submit} className="space-y-5">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label={t('x.forWhom')} required hint={t('x.forWhomHint')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus minLength={2} maxLength={100} />
        </Field>
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label={t('x.kindAria')}>
          {kinds.map((k) => {
            const Icon = k.icon;
            const selected = kind === k.value;
            return (
              /* biome-ignore lint/a11y/useSemanticElements: Zugriffsmodus-Auswahlkachel mit ARIA-Radio-Rolle */
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.value)}
                className={cn(
                  'flex gap-3 rounded-field border p-4 text-left transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span>
                  <span className="block text-sm font-semibold text-fg">{k.title}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{k.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Field
          label={t('x.expiresLabel')}
          hint={t('x.expiresHint')}
        >
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t('x.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={label.trim().length < 2}>
            <Copy /> {t('x.createAndCopy')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  // Formeln in Excel verhindern
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const answerText = (question: EventDetails['questions'][number], value: string | undefined) =>
  !value ? '' : question.type === 'YES_NO' ? (value === 'JA' ? 'Ja' : 'Nein') : value;

/** Antworten pro Eintragung als «Schicht (Tag Zeit): Antwort» */
const perSignup = (question: EventDetails['questions'][number], person: EventParticipantDto) =>
  person.signupAnswers
    .filter((sa) => sa.answers[question.id])
    .map((sa) => ({
      label: `${sa.shiftTitle} (${fmtShortWeekday(sa.startTime)} ${fmtTime(sa.startTime)})`,
      text: answerText(question, sa.answers[question.id]),
      raw: sa.answers[question.id]!,
    }));

function Participants({ event }: { event: EventDetails }) {
  const t = useTranslations('web.ok.access');
  const [people, setPeople] = useState<EventParticipantDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [answerFilter, setAnswerFilter] = useState<{ questionId: string; value: string } | null>(null);

  useEffect(() => {
    api<EventParticipantDto[]>(`/api/events/${event.slug}/participants`)
      .then(setPeople)
      .catch((err) => setError(errorMessage(err)));
  }, [event.slug]);

  const questionSummaries = useMemo(() => {
    if (!people || people.length === 0) return [];
    return event.questions
      .filter((q) => q.type === 'YES_NO' || q.type === 'CHOICE')
      .map((q) => {
        const counts = new Map<string, number>();
        if (q.type === 'YES_NO') {
          counts.set('JA', 0);
          counts.set('NEIN', 0);
        } else {
          for (const opt of q.options ?? []) counts.set(opt, 0);
        }
        for (const p of people) {
          if (q.scope === 'PER_SIGNUP') {
            for (const sa of p.signupAnswers) {
              const v = sa.answers[q.id];
              if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
            }
          } else {
            const v = p.answers[q.id];
            if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        }
        const entries = [...counts.entries()].map(([value, count]) => ({
          value,
          label: q.type === 'YES_NO' ? (value === 'JA' ? 'Ja' : 'Nein') : value,
          count,
        }));
        return { question: q, entries };
      });
  }, [people, event.questions]);

  const filteredPeople = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (answerFilter) {
        const targetQ = event.questions.find((x) => x.id === answerFilter.questionId);
        if (targetQ) {
          const matchesAnswer =
            targetQ.scope === 'PER_SIGNUP'
              ? p.signupAnswers.some((sa) => sa.answers[targetQ.id] === answerFilter.value)
              : p.answers[targetQ.id] === answerFilter.value;
          if (!matchesAnswer) return false;
        }
      }
      if (!q) return true;
      const answerStrings = event.questions.flatMap((question) =>
        question.scope === 'PER_SIGNUP'
          ? perSignup(question, p).map((a) => `${a.label} ${a.text}`)
          : [answerText(question, p.answers[question.id])]
      );
      const haystack = [
        p.displayName,
        p.firstName,
        p.lastName === PLACEHOLDER_LAST_NAME ? '' : p.lastName,
        p.homeDepartmentName,
        p.email,
        p.phone,
        ...answerStrings,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, search, answerFilter, event.questions]);

  const download = () => {
    if (!people) return;
    const header = [
      t('x.csvName'),
      t('x.csvFirstName'),
      t('x.csvLastName'),
      t('x.csvEmail'),
      t('x.csvMobile'),
      t('x.csvBirthDate'),
      t('x.csvUnit'),
      t('x.csvShifts'),
      ...event.questions.map((q) => q.label),
    ];
    const rows = people.map((p) => [
      p.displayName,
      p.firstName,
      p.lastName === PLACEHOLDER_LAST_NAME ? '' : p.lastName,
      p.email,
      p.phone,
      p.birthDate,
      p.homeDepartmentName,
      p.shiftCount,
      ...event.questions.map((q) =>
        q.scope === 'PER_SIGNUP'
          ? perSignup(q, p)
              .map((a) => `${a.label}: ${a.text}`)
              .join(' | ')
          : answerText(q, p.answers[q.id])
      ),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-helfer.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="people-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="people-title" className="text-base font-bold text-fg">
            {t('participantsTitle')}
          </h3>
          <p className="text-xs text-fg-muted">{t('participantsDesc')}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={download} disabled={!people?.length}>
          <Download /> {t('exportCsv')}
        </Button>
      </div>

      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : people === null ? (
        <Skeleton className="h-40 rounded-card" />
      ) : people.length === 0 ? (
        <EmptyState icon={<Users />} title={t('x.nobodySignedUp')} />
      ) : (
        <div className="space-y-4">
          {questionSummaries.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {questionSummaries.map(({ question, entries }) => (
                <Card key={question.id} className="p-3.5">
                  <p className="text-xs font-semibold text-fg">{question.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entries.map((entry) => {
                      const active =
                        answerFilter?.questionId === question.id && answerFilter?.value === entry.value;
                      return (
                        <Chip
                          key={entry.value}
                          selected={active}
                          count={entry.count}
                          onClick={() =>
                            setAnswerFilter(
                              active ? null : { questionId: question.id, value: entry.value }
                            )
                          }
                        >
                          {entry.label}
                        </Chip>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                className="h-9 pl-9 pr-8 text-sm"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('x.searchAria')}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                  aria-label={t('x.clearSearch')}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {(search || answerFilter) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setAnswerFilter(null);
                }}
              >
                {t('x.resetFilter')}
              </Button>
            )}
          </div>


          {filteredPeople.length === 0 ? (
            <EmptyState
              icon={<Filter />}
              title={t('x.noMatches')}
              description={t('x.noMatchesDesc')}
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-surface-2 text-xs font-semibold text-fg-subtle">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">{t('x.colPerson')}</th>
                    <th scope="col" className="px-4 py-2.5">{t('x.colContact')}</th>
                    <th scope="col" className="px-4 py-2.5">{t('x.csvShifts')}</th>
                    {event.questions.map((q) => (
                      <th scope="col" key={q.id} className="px-4 py-2.5">
                        {q.label}
                        <span className="block font-normal text-fg-subtle">{retentionNotice(q.retentionDays)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredPeople.map((p) => (
                    <tr key={p.userId ?? p.displayName} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-fg">{p.displayName}</p>
                        <p className="text-xs text-fg-muted">
                          {[
                            p.firstName && p.lastName && p.lastName !== PLACEHOLDER_LAST_NAME
                              ? `${p.firstName} ${p.lastName}`
                              : null,
                            p.homeDepartmentName ?? t('x.noUnit'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {p.viaLink && (
                          <Badge size="sm" className="mt-1">
                            <Link2 className="size-3" /> {t('x.viaLink')}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="block text-fg hover:underline">
                            {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="block break-all hover:underline">
                            {p.email}
                          </a>
                        )}
                        {p.birthDate && <span className="block">{t('x.born', { date: p.birthDate.split('-').reverse().join('.') })}</span>}
                      </td>
                      <td className="tabular px-4 py-3 text-fg">{p.shiftCount}</td>
                      {event.questions.map((q) => (
                        <td key={q.id} className="px-4 py-3 text-fg">
                          {q.scope === 'PER_SIGNUP' ? (
                            perSignup(q, p).length ? (
                              <ul className="space-y-0.5">
                                {perSignup(q, p).map((a) => (
                                  <li key={a.label}>
                                    <span className="text-xs text-fg-subtle">{a.label}:</span> {a.text}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-fg-subtle">–</span>
                            )
                          ) : (
                            answerText(q, p.answers[q.id]) || <span className="text-fg-subtle">–</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
