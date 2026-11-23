'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Filter,
  History,
  Mail,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { type EventRosterResponseDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  cn,
  useConfirm,
  useOrganization,
  useToast,
} from '@schichtplan/ui';
import { AssignPersonToShiftsDialog } from '@/components/ok/AssignPersonToShiftsDialog';
import { HelperHoursDialog } from '@/components/ok/HelperHoursDialog';
import { PersonHistory } from '@/components/ok/PersonHistory';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/exportFile';
import {
  businessDayKey,
  dayKeyToIso,
  fmtDayMonth,
  fmtShortWeekday,
  fmtTime,
  fmtTimeRange,
  groupByBusinessDay,
  shiftName,
} from '@/lib/format';
import { formatMinutes } from '@/lib/helperStats';

type Status = 'ALL' | 'WITH' | 'WITHOUT' | 'UNDER' | 'MET' | 'DEREGISTERED';
type CountOp = 'ANY' | 'LT' | 'EQ' | 'GTE';
type SortKey = 'NAME' | 'SHIFTS_ASC' | 'SHIFTS_DESC' | 'HOURS_ASC' | 'HOURS_DESC' | 'AGE_ASC' | 'AGE_DESC';
type PersonType = 'ALL' | 'MEMBER' | 'GUEST';

// Filter landen in der URL, damit man eine gefilterte Liste teilen oder neu laden kann
const STATUS_PARAM: Record<Status, string> = {
  ALL: 'alle',
  WITH: 'mit',
  WITHOUT: 'ohne',
  UNDER: 'unter',
  MET: 'erfuellt',
  DEREGISTERED: 'abgemeldet',
};
const COUNT_PARAM: Record<Exclude<CountOp, 'ANY'>, string> = { LT: 'lt', EQ: 'eq', GTE: 'ge' };
const SORT_PARAM: Record<SortKey, string> = {
  NAME: 'name',
  SHIFTS_ASC: 'schichten',
  SHIFTS_DESC: 'schichten-ab',
  HOURS_ASC: 'stunden',
  HOURS_DESC: 'stunden-ab',
  AGE_ASC: 'alter',
  AGE_DESC: 'alter-ab',
};
const SORT_KEYS: SortKey[] = [
  'NAME',
  'SHIFTS_ASC',
  'SHIFTS_DESC',
  'HOURS_ASC',
  'HOURS_DESC',
  'AGE_ASC',
  'AGE_DESC',
];

const fromParam = <K extends string>(map: Record<K, string>, value: string | null, fallback: K): K =>
  (Object.entries(map) as [K, string][]).find(([, v]) => v === value)?.[0] ?? fallback;

function parseCount(value: string | null): { op: CountOp; n: number } {
  const m = value?.match(/^(lt|eq|ge)(\d{1,2})$/);
  if (!m) return { op: 'ANY', n: 1 };
  return { op: fromParam(COUNT_PARAM, m[1], 'LT'), n: Number(m[2]) };
}

interface PersonShift {
  shiftId: string;
  signupId: string;
  title: string | null;
  taskTitle: string | null;
  startTime: string;
  endTime: string;
}

interface PersonRow {
  key: string;
  userId: string | null;
  name: string;
  subName: string | null;
  departmentName: string | null;
  stufen: { id: string; name: string; role: string }[];
  age: number | null;
  shifts: PersonShift[];
  /** Summe der Schichtdauer in Minuten */
  minutes: number;
  /** Geschäftstage (Tageswechsel gemäss Anlass), an denen die Person eingeteilt ist */
  dayKeys: Set<string>;
  isGuest: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  isDeregistered: boolean;
  deregistrationReason: string | null;
  deregisteredAt: string | null;
}

const shiftMinutes = (s: { startTime: string; endTime: string }) =>
  Math.max(0, Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000));

function HelpersPage() {
  const t = useTranslations('web.ok.helpers');
  const { event, base, reload, setMessageDraft, permissions } = useOkEvent();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const org = useOrganization();


  const [roster, setRoster] = useState<EventRosterResponseDto | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const minShifts = event.minShiftsPerPerson ?? null;

  const statusParam = params.get('status');
  const initialStatus: Status =
    statusParam === 'offen' ? (minShifts ? 'UNDER' : 'WITHOUT') : fromParam(STATUS_PARAM, statusParam, 'ALL');
  const initialCount = parseCount(params.get('anzahl'));
  const [status, setStatus] = useState<Status>(initialStatus);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [stufe, setStufe] = useState(params.get('stufe') ?? 'ALL');
  const [dept, setDept] = useState(params.get('abt') ?? 'ALL');
  const [countOp, setCountOp] = useState<CountOp>(initialCount.op);
  const [countN, setCountN] = useState(initialCount.n);
  const [sort, setSort] = useState<SortKey>(fromParam(SORT_PARAM, params.get('sort'), 'NAME'));
  const [personType, setPersonType] = useState<PersonType>(
    params.get('typ') === 'gaeste' ? 'GUEST' : params.get('typ') === 'mitglieder' ? 'MEMBER' : 'ALL'
  );
  // «frei:2026-11-14» = am Tag keine Schicht, «am:2026-11-14» = am Tag eingeteilt
  const [day, setDay] = useState(params.get('tag') ?? 'ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deregTarget, setDeregTarget] = useState<PersonRow | null>(null);
  const [assignTarget, setAssignTarget] = useState<PersonRow | null>(null);
  const [showHoursDialog, setShowHoursDialog] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      setRoster(await api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`));
      setRosterError(null);
    } catch (err) {
      setRosterError(errorMessage(err));
    }
  }, [event.slug]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const refresh = async () => {
    await Promise.all([reload(), loadRoster()]);
    setHistoryKey((k) => k + 1);
  };

  // Personen aus dem Pool plus vom OK eingetragene Gäste (ohne Konto)
  const rows = useMemo<PersonRow[]>(() => {
    const shiftsByUser = new Map<string, PersonShift[]>();
    const guests = new Map<string, PersonRow>();
    for (const shift of event.shifts) {
      for (const su of shift.signups ?? []) {
        const entry: PersonShift = {
          shiftId: shift.id,
          signupId: su.id,
          title: shift.title,
          taskTitle: su.taskTitle ?? null,
          startTime: shift.startTime,
          endTime: shift.endTime,
        };
        if (su.userId) {
          shiftsByUser.set(su.userId, [...(shiftsByUser.get(su.userId) ?? []), entry]);
        } else {
          const key = `guest:${su.guestName || su.id}`;
          const guest = guests.get(key) ?? {
            key,
            userId: null,
            name: su.displayName,
            subName: t('guestSubname'),
            departmentName: null,
            stufen: [],
            age: null,
            shifts: [],
            minutes: 0,
            dayKeys: new Set<string>(),
            isGuest: true,
            guestEmail: su.guestEmail ?? null,
            guestPhone: su.guestPhone ?? null,
            isDeregistered: false,
            deregistrationReason: null,
            deregisteredAt: null,
          };
          guest.shifts.push(entry);
          guests.set(key, guest);
        }
      }
    }
    const people: PersonRow[] = (roster?.items ?? []).map((i) => ({
      key: i.userId,
      userId: i.userId,
      name: i.nickname || i.ceviName || `${i.firstName} ${i.lastName}`.trim(),
      subName: (i.nickname || i.ceviName) ? `${i.firstName} ${i.lastName}`.trim() : null,
      departmentName: i.departmentName,
      stufen: i.stufen,
      age: i.age,
      shifts: shiftsByUser.get(i.userId) ?? [],
      minutes: 0,
      dayKeys: new Set<string>(),
      isGuest: false,
      guestEmail: null,
      guestPhone: null,
      isDeregistered: i.isDeregistered,
      deregistrationReason: i.deregistrationReason,
      deregisteredAt: i.deregisteredAt,
    }));
    const all = [...people, ...guests.values()];
    for (const r of all) {
      r.minutes = r.shifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
      r.dayKeys = new Set(r.shifts.map((s) => businessDayKey(s.startTime, event.dayCutoffTime)));
    }
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [event, roster, t]);

  const counts = useMemo(() => {
    const active = rows.filter((r) => !r.isDeregistered);
    return {
      ALL: rows.length,
      WITH: active.filter((r) => r.shifts.length > 0).length,
      WITHOUT: active.filter((r) => r.shifts.length === 0).length,
      UNDER: minShifts ? active.filter((r) => !r.isGuest && r.shifts.length < minShifts).length : 0,
      MET: minShifts ? active.filter((r) => !r.isGuest && r.shifts.length >= minShifts).length : 0,
      DEREGISTERED: rows.filter((r) => r.isDeregistered).length,
    };
  }, [rows, minShifts]);

  // Verteilung: wie viele (nicht abgemeldete) Personen haben 0, 1, 2 … Schichten
  const distribution = useMemo(() => {
    const active = rows.filter((r) => !r.isDeregistered);
    const max = active.reduce((m, r) => Math.max(m, r.shifts.length), 0);
    const buckets = Array.from({ length: max + 1 }, (_, n) => ({
      n,
      count: active.filter((r) => r.shifts.length === n).length,
    }));
    const missing = minShifts
      ? active.filter((r) => !r.isGuest).reduce((sum, r) => sum + Math.max(0, minShifts - r.shifts.length), 0)
      : 0;
    return { buckets, max: Math.max(1, ...buckets.map((b) => b.count)), missing };
  }, [rows, minShifts]);

  const eventDays = useMemo(
    () => groupByBusinessDay(event.shifts, event.dayCutoffTime).map((d) => d.key),
    [event.shifts, event.dayCutoffTime]
  );

  // Filter in die URL schreiben (ohne Navigation), Standardwerte weglassen
  useEffect(() => {
    const next = new URLSearchParams();
    if (status !== 'ALL') next.set('status', STATUS_PARAM[status]);
    if (search.trim()) next.set('q', search.trim());
    if (stufe !== 'ALL') next.set('stufe', stufe);
    if (dept !== 'ALL') next.set('abt', dept);
    if (countOp !== 'ANY') next.set('anzahl', `${COUNT_PARAM[countOp]}${countN}`);
    if (sort !== 'NAME') next.set('sort', SORT_PARAM[sort]);
    if (personType !== 'ALL') next.set('typ', personType === 'GUEST' ? 'gaeste' : 'mitglieder');
    if (day !== 'ALL') next.set('tag', day);
    const qs = next.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
  }, [status, search, stufe, dept, countOp, countN, sort, personType, day]);

  const activeFilterCount = [
    status !== 'ALL',
    search.trim() !== '',
    stufe !== 'ALL',
    dept !== 'ALL',
    countOp !== 'ANY',
    personType !== 'ALL',
    day !== 'ALL',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatus('ALL');
    setSearch('');
    setStufe('ALL');
    setDept('ALL');
    setCountOp('ANY');
    setCountN(1);
    setPersonType('ALL');
    setDay('ALL');
  };

  const stufen = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) for (const s of r.stufen) map.set(s.id, s.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [rows]);
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.departmentName).filter((d): d is string => Boolean(d)))].sort(),
    [rows]
  );

  const q = search.trim().toLowerCase();
  const [dayMode, dayKey] = day.includes(':') ? (day.split(':') as ['frei' | 'am', string]) : [null, null];
  const filtered = rows
    .filter((r) => {
      const n = r.shifts.length;
      if (status === 'WITH' && (r.isDeregistered || n === 0)) return false;
      if (status === 'WITHOUT' && (r.isDeregistered || n > 0)) return false;
      if (status === 'UNDER' && (r.isDeregistered || r.isGuest || n >= (minShifts ?? 0))) return false;
      if (status === 'MET' && (r.isDeregistered || r.isGuest || n < (minShifts ?? 0))) return false;
      if (status === 'DEREGISTERED' && !r.isDeregistered) return false;
      if (countOp === 'LT' && n >= countN) return false;
      if (countOp === 'EQ' && n !== countN) return false;
      if (countOp === 'GTE' && n < countN) return false;
      if (personType === 'GUEST' && !r.isGuest) return false;
      if (personType === 'MEMBER' && r.isGuest) return false;
      if (dayMode === 'frei' && (r.isDeregistered || r.dayKeys.has(dayKey!))) return false;
      if (dayMode === 'am' && !r.dayKeys.has(dayKey!)) return false;
      if (stufe !== 'ALL' && !r.stufen.some((s) => s.id === stufe)) return false;
      if (dept !== 'ALL' && r.departmentName !== dept) return false;
      if (q && !`${r.name} ${r.subName ?? ''} ${r.stufen.map((s) => s.name).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      // Abgemeldete bei Zahlen-Sortierungen immer ans Ende, sonst stehen sie bei «wenigste zuerst» oben
      if (sort !== 'NAME' && a.isDeregistered !== b.isDeregistered) return a.isDeregistered ? 1 : -1;
      const byName = a.name.localeCompare(b.name, 'de');
      switch (sort) {
        case 'SHIFTS_ASC':
          return a.shifts.length - b.shifts.length || a.minutes - b.minutes || byName;
        case 'SHIFTS_DESC':
          return b.shifts.length - a.shifts.length || b.minutes - a.minutes || byName;
        case 'HOURS_ASC':
          return a.minutes - b.minutes || byName;
        case 'HOURS_DESC':
          return b.minutes - a.minutes || byName;
        case 'AGE_ASC':
        case 'AGE_DESC': {
          // Personen ohne Alter immer ans Ende
          if (a.age === null || b.age === null) return a.age === null ? (b.age === null ? byName : 1) : -1;
          return (sort === 'AGE_ASC' ? a.age - b.age : b.age - a.age) || byName;
        }
        default:
          return byName;
      }
    });
  const selectableIds = filtered.filter((r) => r.userId).map((r) => r.userId!);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSignup = async (row: PersonRow, s: PersonShift) => {
    const ok = await confirm({
      title: t('confirmSignoffTitle', { name: row.name }),
      description: t('confirmSignoffDesc', { title: shiftName(s) }),
      confirmLabel: t('confirmSignoffBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${s.shiftId}/signup?signupId=${s.signupId}`, { method: 'DELETE' });
      toast({ title: t('signoffSuccess', { name: row.name }) });
      await refresh();
    } catch (err) {
      toast({ title: t('signoffFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  const removeFromAll = async (row: PersonRow) => {
    const ok = await confirm({
      title: t('confirmRemoveAllTitle', { name: row.name }),
      description: t('confirmRemoveAllDesc', { count: row.shifts.length }),
      confirmLabel: t('confirmRemoveAllBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/unregister-helper`, {
        method: 'POST',
        json: row.userId ? { userId: row.userId } : { guestName: row.name },
      });
      toast({
        title: t('removeAllSuccess', { name: row.name }),
        description: t('removeAllSuccessDesc', { count: row.shifts.length }),
      });
      await refresh();
    } catch (err) {
      toast({ title: t('signoffFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  const undoDeregistration = async (row: PersonRow) => {
    try {
      await api(`/api/events/${event.slug}/deregistrations/${row.userId}`, { method: 'DELETE' });
      toast({ title: t('undoDeregSuccess', { name: row.name }) });
      await loadRoster();
    } catch (err) {
      toast({ title: t('actionFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  const writeMessage = (ids: string[], label: string) => {
    setMessageDraft({ target: 'PEOPLE', userIds: ids, label });
    router.push(`${base}/nachrichten`);
  };
  const plural = (n: number) => t('pluralPeople', { count: n });

  const exportFiltered = () => {
    const header = [t('x.csvName'), t('x.csvFullName'), org.unitTerm, t('x.csvLevels'), t('x.csvAge'), t('x.csvType'), t('x.csvShifts')];
    if (minShifts) header.push(t('x.csvTarget'), t('x.csvMissing'));
    header.push(t('x.csvHours'), t('x.csvStatus'), t('x.csvAssignedShifts'));
    const lines = filtered.map((r) => {
      const line: (string | number)[] = [
        r.name,
        r.isGuest ? '' : (r.subName ?? r.name),
        r.departmentName ?? '',
        r.stufen.map((s) => s.name).join(', '),
        r.age ?? '',
        r.isGuest ? t('x.guest') : t('x.account'),
        r.shifts.length,
      ];
      if (minShifts) line.push(r.isGuest ? '' : minShifts, r.isGuest ? '' : Math.max(0, minShifts - r.shifts.length));
      line.push(
        Math.round((r.minutes / 60) * 10) / 10,
        r.isDeregistered ? `${t('x.deregistered')}${r.deregistrationReason ? ` (${r.deregistrationReason})` : ''}` : '',
        [...r.shifts]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((s) => `${shiftName(s)}${s.taskTitle ? ` (${s.taskTitle})` : ''} ${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`)
          .join(' | ')
      );
      return line;
    });
    downloadCsv(`${t('x.csvFilePrefix')}-${event.slug}.csv`, [header, ...lines]);
  };

  const getSortLabel = (k: SortKey) => {
    switch (k) {
      case 'NAME':
        return t('sortName');
      case 'SHIFTS_ASC':
        return t('sortShiftsAsc');
      case 'SHIFTS_DESC':
        return t('sortShiftsDesc');
      case 'HOURS_ASC':
        return t('sortHoursAsc');
      case 'HOURS_DESC':
        return t('sortHoursDesc');
      case 'AGE_ASC':
        return t('sortAgeAsc');
      case 'AGE_DESC':
        return t('sortAgeDesc');
    }
  };

  const statusChips: { key: Status; label: string; show: boolean }[] = [
    { key: 'ALL', label: t('chips.all'), show: true },
    { key: 'WITH', label: t('chips.with'), show: true },
    { key: 'WITHOUT', label: t('chips.without'), show: true },
    { key: 'UNDER', label: t('chips.under'), show: Boolean(minShifts) },
    { key: 'MET', label: t('chips.met'), show: Boolean(minShifts) },
    { key: 'DEREGISTERED', label: t('chips.deregistered'), show: counts.DEREGISTERED > 0 },
  ];
  const hasGuests = rows.some((r) => r.isGuest);

  return (
    <div>
      <OkPageHeader
        title={t('pageTitle')}
        description={t('pageDesc')}
        help="/ok/helfer-pool/"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setShowHoursDialog(true)}>
            <Clock className="size-4" /> {t('statsBtn')}
          </Button>
        }
      />

      {rosterError && <Callout tone="danger" className="mb-6">{t('loadError', { error: rosterError })}</Callout>}

      {roster && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label={t('statPeople')} value={counts.ALL} hint={roster.scopeDescription} />
          <MiniStat label={t('statWithShifts')} value={counts.WITH} tone="success" />
          <MiniStat
            label={minShifts ? t('statUnderTarget') : t('statWithoutShifts')}
            value={minShifts ? counts.UNDER : counts.WITHOUT}
            hint={
              minShifts
                ? t('targetHint', { min: minShifts, missing: distribution.missing })
                : undefined
            }
            tone="warning"
            onClick={() => {
              resetFilters();
              setStatus(minShifts ? 'UNDER' : 'WITHOUT');
              setSort('SHIFTS_ASC');
            }}
          />
          <MiniStat label={t('statDeregistered')} value={counts.DEREGISTERED} hint={t('deregisteredHint')} />
        </div>
      )}

      {roster && !roster.isRestricted && (
        <Callout tone="info" className="mb-6">
          {t('openScopeNotice', { scope: roster.scopeDescription })}
        </Callout>
      )}

      {/* Filter */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder={t('searchPlaceholder', { nicknameTerm: org.nicknameTerm })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('searchAria')}
            />
          </div>
          {stufen.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={stufe} onChange={(e) => setStufe(e.target.value)} aria-label={t('x.levelAria')}>
              <option value="ALL">{t('allStufen')}</option>
              {stufen.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}
          {departments.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label={org.unitTerm}>
              <option value="ALL">
                {t('allDepartments', {
                  unitPlural:
                    org.unitTerm === 'Abteilung' ? 'Abteilungen' : org.unitTerm === 'Schar' ? 'Scharen' : 'Vereine',
                })}
              </option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Select
              className="h-10 w-auto text-sm"
              value={countOp}
              onChange={(e) => setCountOp(e.target.value as CountOp)}
              aria-label={t('x.countFilterAria')}
            >
              <option value="ANY">{t('allCount')}</option>
              <option value="LT">{t('countLt')}</option>
              <option value="EQ">{t('countEq')}</option>
              <option value="GTE">{t('countGte')}</option>
            </Select>
            {countOp !== 'ANY' && (
              <>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  className="h-10 w-16 text-center text-sm"
                  value={countN}
                  onChange={(e) => setCountN(Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  aria-label={t('x.countAria')}
                />
                <span className="text-sm text-fg-muted">{t('countSuffix', { count: countN })}</span>
              </>
            )}
          </div>
          {eventDays.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label={t('x.dayAria')}>
              <option value="ALL">{t('allDays')}</option>
              <optgroup label={t('freeOnDayGroup')}>
                {eventDays.map((k) => (
                  <option key={`frei:${k}`} value={`frei:${k}`}>
                    {t('freeOnDay', { day: `${fmtShortWeekday(dayKeyToIso(k))} ${fmtDayMonth(dayKeyToIso(k))}` })}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('busyOnDayGroup')}>
                {eventDays.map((k) => (
                  <option key={`am:${k}`} value={`am:${k}`}>
                    {t('busyOnDay', { day: `${fmtShortWeekday(dayKeyToIso(k))} ${fmtDayMonth(dayKeyToIso(k))}` })}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
          {hasGuests && (
            <Select
              className="h-10 w-auto text-sm"
              value={personType}
              onChange={(e) => setPersonType(e.target.value as PersonType)}
              aria-label={t('x.personTypeAria')}
            >
              <option value="ALL">{t('allTypes')}</option>
              <option value="MEMBER">{t('typeMembers')}</option>
              <option value="GUEST">{t('typeGuests')}</option>
            </Select>
          )}
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <ArrowDownUp className="size-4 text-fg-subtle" aria-hidden />
            <Select className="h-10 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t('sortAria')}>
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {getSortLabel(k)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusChips
            .filter((c) => c.show)
            .map((c) => (
              <Chip key={c.key} selected={status === c.key} count={counts[c.key]} onClick={() => setStatus(c.key)}>
                {c.label}
              </Chip>
            ))}
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              <X className="size-3.5" /> {t('resetFilters')} ({activeFilterCount})
            </Button>
          )}
        </div>

        {/* Verteilung der Schichten pro Person, Klick filtert auf genau diese Anzahl */}
        {roster && distribution.buckets.length > 1 && (
          <div className="rounded-card border border-line bg-surface p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">{t('barTitle')}</p>
              <p className="text-2xs text-fg-muted">{t('barHint')}</p>
            </div>
            <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
              {distribution.buckets.map((b) => {
                const isActive = countOp === 'EQ' && countN === b.n;
                const below = minShifts !== null && b.n < minShifts;
                return (
                  <button
                    key={b.n}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setCountOp('ANY');
                      } else {
                        setCountOp('EQ');
                        setCountN(b.n);
                        if (status !== 'ALL' && status !== 'DEREGISTERED') setStatus('ALL');
                      }
                    }}
                    aria-pressed={isActive}
                    title={t('x.bucketTitle', { people: plural(b.count), count: b.n })}
                    className={cn(
                      'group flex min-w-[2.5rem] flex-1 flex-col items-center gap-1 rounded-field px-1 pt-1 transition',
                      isActive ? 'bg-accent/10' : 'hover:bg-surface-2'
                    )}
                  >
                    <span className="tabular text-2xs font-bold text-fg-muted">{b.count}</span>
                    <span className="flex h-12 w-full items-end">
                      <span
                        className={cn(
                          'w-full rounded-t-sm transition-[height]',
                          isActive ? 'bg-accent' : below ? 'bg-warning/60 group-hover:bg-warning' : 'bg-success/50 group-hover:bg-success'
                        )}
                        style={{ height: `${b.count === 0 ? 2 : Math.max(8, (b.count / distribution.max) * 100)}%` }}
                      />
                    </span>
                    <span className={cn('tabular text-xs font-semibold', isActive ? 'text-accent-ink' : 'text-fg')}>{b.n}</span>
                  </button>
                );
              })}
            </div>
            {minShifts && <p className="mt-1 text-2xs text-fg-muted">{t('barBelowTargetHint', { min: minShifts })}</p>}
          </div>
        )}
      </div>

      {/* Auswahl-Leiste */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="inline-flex items-center gap-2 text-fg-muted">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={allSelected}
            disabled={selectableIds.length === 0}
            onChange={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of selectableIds) {
                  if (allSelected) next.delete(id);
                  else next.add(id);
                }
                return next;
              })
            }
          />
          {selected.size > 0 ? t('selectedCount', { count: selected.size }) : t('pluralPeople', { count: filtered.length })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t('unselect')}
              </Button>
              <Button size="sm" onClick={() => writeMessage([...selected], t('x.selected', { people: plural(selected.size) }))}>
                <Mail className="size-4" /> {t('messageSelection')}
              </Button>
            </>
          ) : (
            activeFilterCount > 0 &&
            selectableIds.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  writeMessage(
                    selectableIds,
                    status === 'UNDER' && activeFilterCount === 1
                      ? `${plural(selectableIds.length)} unter dem Soll`
                      : `${plural(selectableIds.length)} (gefiltert)`
                  )
                }
              >
                <Mail className="size-4" /> {t('contactPeople', { count: selectableIds.length })}
              </Button>
            )
          )}
          {filtered.length > 0 && (
            <Button size="sm" variant="ghost" onClick={exportFiltered} title={t('x.exportTitle')}>
              <Download className="size-4" /> {t('exportCsv')}
            </Button>
          )}
        </div>
      </div>

      {!roster && !rosterError ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={rows.length === 0 ? <Users /> : <Filter />}
          title={rows.length === 0 ? t('emptyPoolTitle') : t('emptyTitle')}
          description={rows.length === 0 ? t('emptyPoolDesc') : t('emptyDesc')}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {filtered.map((row) => {
            const isOpen = expanded === row.key;
            const target = minShifts && !row.isGuest ? minShifts : null;
            const met = target ? row.shifts.length >= target : row.shifts.length > 0;
            const totalMins = row.minutes;
            const missing = target && !row.isDeregistered ? Math.max(0, target - row.shifts.length) : 0;

            return (
              <div key={row.key} className={cn('px-4 py-3', row.isDeregistered && 'bg-surface-2/40')}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-accent disabled:opacity-30"
                    checked={row.userId ? selected.has(row.userId) : false}
                    disabled={!row.userId}
                    onChange={() => row.userId && toggle(row.userId)}
                    aria-label={t('x.selectAria', { name: row.name })}
                    title={row.userId ? undefined : t('x.guestNoMessages')}
                  />
                  <Avatar name={row.name} size="sm" />
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{row.name}</span>
                      <span className="block truncate text-2xs text-fg-muted">
                        {[row.subName, row.departmentName, row.age !== null ? `${row.age} J.` : null, ...row.stufen.map((s) => s.name)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="hidden shrink-0 sm:flex sm:items-center sm:gap-2">
                      {missing > 0 && <span className="text-2xs font-semibold text-warning-ink">{t('missingBadge', { count: missing })}</span>}
                      {totalMins > 0 && (
                        <span className="font-mono text-xs font-semibold text-fg-muted">
                          {formatMinutes(totalMins)}
                        </span>
                      )}
                      {row.isDeregistered ? (
                        <Badge tone="neutral">{t('chips.deregistered')}</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : row.shifts.length > 0 ? 'warning' : 'neutral'}>
                          {target ? t('shiftsRatio', { count: row.shifts.length, target }) : t('shiftsCount', { count: row.shifts.length })}
                        </Badge>
                      )}
                    </span>
                    {isOpen ? <ChevronUp className="size-4 shrink-0 text-fg-subtle" /> : <ChevronDown className="size-4 shrink-0 text-fg-subtle" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-3 pl-7 sm:pl-[4.25rem]">
                    <div className="flex items-center gap-2 sm:hidden">
                      {totalMins > 0 && (
                        <span className="font-mono text-xs font-semibold text-fg-muted">
                          {formatMinutes(totalMins)}
                        </span>
                      )}
                      {row.isDeregistered ? (
                        <Badge tone="neutral">{t('chips.deregistered')}</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : 'warning'}>
                          {target ? t('shiftsRatio', { count: row.shifts.length, target }) : t('shiftsCount', { count: row.shifts.length })}
                        </Badge>
                      )}
                    </div>
                    {row.isDeregistered && row.deregistrationReason && (
                      <p className="text-xs text-fg-muted">{t('reasonDisplay', { reason: row.deregistrationReason })}</p>
                    )}
                    {(row.guestEmail || row.guestPhone) && (
                      <p className="text-xs text-fg-muted">
                        {[row.guestEmail, row.guestPhone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {row.shifts.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {[...row.shifts]
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map((s) => (
                            <li key={s.signupId} className="flex items-center justify-between gap-2 rounded-field bg-surface-2/60 px-3 py-1.5">
                              <Link
                                href={`${base}/schichten?suche=${encodeURIComponent(s.title || s.taskTitle || '')}`}
                                className="min-w-0 truncate text-fg hover:underline"
                                title={t('x.openShift')}
                              >
                                <strong>{s.title || s.taskTitle || t('x.shift')}</strong>
                                {s.taskTitle && s.title && s.taskTitle !== s.title ? ` (${s.taskTitle})` : ''}
                                <span className="text-fg-muted">
                                  {' '}
                                  · {fmtShortWeekday(s.startTime)} {fmtTime(s.startTime)}
                                </span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => removeSignup(row, s)}
                                className="shrink-0 rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger-ink"
                                aria-label={`Aus ${shiftName(s)} austragen`}
                              >
                                <X className="size-3.5" />
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-fg-muted">{t('noShiftsYet')}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {permissions.can.HELPERS && event.shifts.length > 0 && (
                        <Button size="sm" variant="secondary" onClick={() => setAssignTarget(row)}>
                          <Plus className="size-3.5" /> {t('assignShiftsBtn')}
                        </Button>
                      )}
                      {row.shifts.length > 1 && (
                        <Button size="sm" variant="ghost" className="text-danger-ink hover:bg-danger/10" onClick={() => removeFromAll(row)}>
                          <X className="size-3.5" /> {t('removeFromAllBtn')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryOpen(historyOpen === row.key ? null : row.key)}
                        aria-expanded={historyOpen === row.key}
                      >
                        <History className="size-3.5" /> {historyOpen === row.key ? t('hideHistoryBtn') : t('viewHistoryBtn')}
                      </Button>
                      {row.userId &&
                        (row.isDeregistered ? (
                          <Button size="sm" variant="secondary" onClick={() => undoDeregistration(row)}>
                            <UserCheck className="size-3.5" /> {t('undoDeregBtn')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setDeregTarget(row)}>
                            <UserMinus className="size-3.5" /> {t('deregisterBtn')}
                          </Button>
                        ))}
                    </div>
                    {historyOpen === row.key && (
                      <div className="rounded-field border border-line bg-surface-2/40 p-3">
                        <PersonHistory
                          eventSlug={event.slug}
                          userId={row.userId}
                          guestName={row.isGuest ? row.name : null}
                          deregisteredAt={row.deregisteredAt}
                          deregistrationReason={row.deregistrationReason}
                          reloadKey={historyKey}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <DeregisterDialog
        row={deregTarget}
        eventSlug={event.slug}
        onClose={() => setDeregTarget(null)}
        onSaved={async () => {
          setDeregTarget(null);
          await loadRoster();
        }}
      />

      <AssignPersonToShiftsDialog
        person={assignTarget}
        shifts={event.shifts}
        dayCutoffTime={event.dayCutoffTime}
        minShifts={minShifts}
        onClose={() => setAssignTarget(null)}
        onChanged={async (done) => {
          if (done) setAssignTarget(null);
          await refresh();
        }}
      />

      <HelperHoursDialog
        open={showHoursDialog}
        event={event}
        roster={roster}
        onClose={() => setShowHoursDialog(false)}
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'success' | 'warning';
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn('p-4', onClick && 'cursor-pointer transition hover:border-line-strong')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={onClick ? 'Diese Personen anzeigen' : undefined}
    >
      <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-extrabold tabular',
          tone === 'success' ? 'text-success-ink' : tone === 'warning' ? 'text-warning-ink' : 'text-fg'
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-2xs text-fg-muted" title={hint}>{hint}</p>}
    </Card>
  );
}

function DeregisterDialog({
  row,
  eventSlug,
  onClose,
  onSaved,
}: {
  row: PersonRow | null;
  eventSlug: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const tDereg = useTranslations('web.ok.helpers.deregDialog');
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!row?.userId) return;
    setSaving(true);
    try {
      await api(`/api/events/${eventSlug}/deregistrations`, {
        method: 'POST',
        json: { userId: row.userId, reason: reason.trim() || undefined },
      });
      toast({ title: tDereg('successToast', { name: row.name }) });
      setReason('');
      await onSaved();
    } catch (err) {
      toast({ title: tDereg('failToast'), description: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(row)}
      onClose={onClose}
      icon={<UserMinus />}
      title={row ? tDereg('title', { name: row.name }) : ''}
      description={tDereg('desc')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={tDereg('reasonLabel')} hint={tDereg('reasonPlaceholder')}>
          <Input value={reason} maxLength={200} autoFocus onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tDereg('cancelBtn')}
          </Button>
          <Button type="submit" loading={saving}>
            {tDereg('confirmBtn')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <HelpersPage />
    </Suspense>
  );
}
