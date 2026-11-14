'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Filter,
  Mail,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { type EventRosterResponseDto, type ShiftCollisionCheckResult, type ShiftDto } from '@schichtplan/shared';
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
import { HelperHoursDialog } from '@/components/ok/HelperHoursDialog';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { shiftTasks } from '@/components/event/shift-utils';
import { api, ApiError, errorMessage } from '@/lib/api';
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
const SORT_LABEL: Record<SortKey, string> = {
  NAME: 'Name A–Z',
  SHIFTS_ASC: 'Wenigste Schichten zuerst',
  SHIFTS_DESC: 'Meiste Schichten zuerst',
  HOURS_ASC: 'Wenigste Stunden zuerst',
  HOURS_DESC: 'Meiste Stunden zuerst',
  AGE_ASC: 'Jüngste zuerst',
  AGE_DESC: 'Älteste zuerst',
};

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
}

const shiftMinutes = (s: { startTime: string; endTime: string }) =>
  Math.max(0, Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000));

function HelpersPage() {
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
            subName: 'Gast, vom OK eingetragen',
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
    }));
    const all = [...people, ...guests.values()];
    for (const r of all) {
      r.minutes = r.shifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
      r.dayKeys = new Set(r.shifts.map((s) => businessDayKey(s.startTime, event.dayCutoffTime)));
    }
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [event, roster]);

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
      title: `${row.name} austragen?`,
      description: `Aus der Schicht «${shiftName(s)}».`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${s.shiftId}/signup?signupId=${s.signupId}`, { method: 'DELETE' });
      toast({ title: `${row.name} ausgetragen` });
      await refresh();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const removeFromAll = async (row: PersonRow) => {
    const ok = await confirm({
      title: `${row.name} aus allen Schichten austragen?`,
      description: `Die Person wird aus ${row.shifts.length} Schicht${row.shifts.length === 1 ? '' : 'en'} dieses Anlasses ausgetragen.`,
      confirmLabel: 'Aus allen austragen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/unregister-helper`, {
        method: 'POST',
        json: row.userId ? { userId: row.userId } : { guestName: row.name },
      });
      toast({ title: `${row.name} ausgetragen`, description: `Aus ${row.shifts.length} Schichten` });
      await refresh();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const undoDeregistration = async (row: PersonRow) => {
    try {
      await api(`/api/events/${event.slug}/deregistrations/${row.userId}`, { method: 'DELETE' });
      toast({ title: `${row.name} wieder dabei` });
      await loadRoster();
    } catch (err) {
      toast({ title: 'Aktion fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const writeMessage = (ids: string[], label: string) => {
    setMessageDraft({ target: 'PEOPLE', userIds: ids, label });
    router.push(`${base}/nachrichten`);
  };
  const plural = (n: number) => `${n} Person${n === 1 ? '' : 'en'}`;

  const exportFiltered = () => {
    const header = ['Name', 'Vollständiger Name', org.unitTerm, 'Stufen', 'Alter', 'Typ', 'Schichten'];
    if (minShifts) header.push('Soll', 'Fehlend');
    header.push('Stunden', 'Status', 'Eingeteilte Schichten');
    const lines = filtered.map((r) => {
      const line: (string | number)[] = [
        r.name,
        r.isGuest ? '' : (r.subName ?? r.name),
        r.departmentName ?? '',
        r.stufen.map((s) => s.name).join(', '),
        r.age ?? '',
        r.isGuest ? 'Gast' : 'Konto',
        r.shifts.length,
      ];
      if (minShifts) line.push(r.isGuest ? '' : minShifts, r.isGuest ? '' : Math.max(0, minShifts - r.shifts.length));
      line.push(
        Math.round((r.minutes / 60) * 10) / 10,
        r.isDeregistered ? `Abgemeldet${r.deregistrationReason ? ` (${r.deregistrationReason})` : ''}` : '',
        [...r.shifts]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((s) => `${shiftName(s)}${s.taskTitle ? ` (${s.taskTitle})` : ''} ${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`)
          .join(' | ')
      );
      return line;
    });
    downloadCsv(`helfende-${event.slug}.csv`, [header, ...lines]);
  };

  const statusChips: { key: Status; label: string; show: boolean }[] = [
    { key: 'ALL', label: 'Alle', show: true },
    { key: 'WITH', label: 'Mit Schicht', show: true },
    { key: 'WITHOUT', label: 'Ohne Schicht', show: true },
    { key: 'UNDER', label: 'Unter dem Soll', show: Boolean(minShifts) },
    { key: 'MET', label: 'Soll erfüllt', show: Boolean(minShifts) },
    { key: 'DEREGISTERED', label: 'Abgemeldet', show: counts.DEREGISTERED > 0 },
  ];
  const hasGuests = rows.some((r) => r.isGuest);

  return (
    <div>
      <OkPageHeader
        title="Helfende"
        description="Alle Personen, die bei diesem Anlass helfen können oder schon eingetragen sind. Wer nicht helfen kann, meldest du hier ab, dann zählt das Soll nicht."
        help="/ok/helfer-pool/"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setShowHoursDialog(true)}>
            <Clock className="size-4" /> Helferstunden-Statistik
          </Button>
        }
      />

      {rosterError && <Callout tone="danger" className="mb-6">Personen konnten nicht geladen werden: {rosterError}</Callout>}

      {roster && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label="Personen" value={counts.ALL} hint={roster.scopeDescription} />
          <MiniStat label="Mit Schicht" value={counts.WITH} tone="success" />
          <MiniStat
            label={minShifts ? 'Unter dem Soll' : 'Ohne Schicht'}
            value={minShifts ? counts.UNDER : counts.WITHOUT}
            hint={
              minShifts
                ? `Soll: ${minShifts} Schichten${distribution.missing > 0 ? ` · ${distribution.missing} fehlen total` : ''}`
                : undefined
            }
            tone="warning"
            onClick={() => {
              resetFilters();
              setStatus(minShifts ? 'UNDER' : 'WITHOUT');
              setSort('SHIFTS_ASC');
            }}
          />
          <MiniStat label="Abgemeldet" value={counts.DEREGISTERED} hint="müssen nicht helfen" />
        </div>
      )}

      {roster && !roster.isRestricted && (
        <Callout tone="info" className="mb-6">
          Dieser Anlass ist offen für {roster.scopeDescription}. Hier stehen alle Eingetragenen sowie die Personen deiner
          Abteilung. Ein festes Soll pro Person lohnt sich vor allem bei Anlässen nur für die Abteilung oder einzelne Stufen.
        </Callout>
      )}

      {/* Filter */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder={`Name, ${org.nicknameTerm} oder Stufe…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Personen durchsuchen"
            />
          </div>
          {stufen.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={stufe} onChange={(e) => setStufe(e.target.value)} aria-label="Stufe">
              <option value="ALL">Alle Stufen</option>
              {stufen.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}
          {departments.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label={org.unitTerm}>
              <option value="ALL">Alle {org.unitTerm === 'Abteilung' ? 'Abteilungen' : org.unitTerm === 'Schar' ? 'Scharen' : 'Vereine'}</option>
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
              aria-label="Anzahl Schichten filtern"
            >
              <option value="ANY">Beliebig viele Schichten</option>
              <option value="LT">Weniger als …</option>
              <option value="EQ">Genau …</option>
              <option value="GTE">Mindestens …</option>
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
                  aria-label="Anzahl Schichten"
                />
                <span className="text-sm text-fg-muted">Schicht{countN === 1 ? '' : 'en'}</span>
              </>
            )}
          </div>
          {eventDays.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Tag">
              <option value="ALL">Alle Tage</option>
              <optgroup label="Noch frei am …">
                {eventDays.map((k) => (
                  <option key={`frei:${k}`} value={`frei:${k}`}>
                    Frei am {fmtShortWeekday(dayKeyToIso(k))} {fmtDayMonth(dayKeyToIso(k))}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Eingeteilt am …">
                {eventDays.map((k) => (
                  <option key={`am:${k}`} value={`am:${k}`}>
                    Eingeteilt am {fmtShortWeekday(dayKeyToIso(k))} {fmtDayMonth(dayKeyToIso(k))}
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
              aria-label="Personentyp"
            >
              <option value="ALL">Mitglieder und Gäste</option>
              <option value="MEMBER">Nur mit Konto</option>
              <option value="GUEST">Nur Gäste</option>
            </Select>
          )}
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <ArrowDownUp className="size-4 text-fg-subtle" aria-hidden />
            <Select className="h-10 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sortierung">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
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
              <X className="size-3.5" /> Filter zurücksetzen ({activeFilterCount})
            </Button>
          )}
        </div>

        {/* Verteilung der Schichten pro Person, Klick filtert auf genau diese Anzahl */}
        {roster && distribution.buckets.length > 1 && (
          <div className="rounded-card border border-line bg-surface p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">Schichten pro Person</p>
              <p className="text-2xs text-fg-muted">Klick auf einen Balken filtert</p>
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
                    title={`${plural(b.count)} mit ${b.n} Schicht${b.n === 1 ? '' : 'en'}`}
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
            {minShifts && <p className="mt-1 text-2xs text-fg-muted">Orange: unter dem Soll von {minShifts} Schichten</p>}
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
          {selected.size > 0 ? `${selected.size} ausgewählt` : `${filtered.length} Personen`}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Auswahl aufheben
              </Button>
              <Button size="sm" onClick={() => writeMessage([...selected], `${plural(selected.size)} ausgewählt`)}>
                <Mail className="size-4" /> Nachricht an Auswahl
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
                <Mail className="size-4" /> {plural(selectableIds.length)} anschreiben
              </Button>
            )
          )}
          {filtered.length > 0 && (
            <Button size="sm" variant="ghost" onClick={exportFiltered} title="Gefilterte Liste als CSV (Excel)">
              <Download className="size-4" /> CSV
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
          title={rows.length === 0 ? 'Noch niemand dabei' : 'Keine passenden Personen'}
          description={rows.length === 0 ? 'Sobald sich jemand einträgt, erscheint die Person hier.' : 'Passe die Filter an.'}
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
                    aria-label={`${row.name} auswählen`}
                    title={row.userId ? undefined : 'Gäste ohne Konto bekommen keine Nachrichten'}
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
                      {missing > 0 && <span className="text-2xs font-semibold text-warning-ink">fehlt {missing}</span>}
                      {totalMins > 0 && (
                        <span className="font-mono text-xs font-semibold text-fg-muted">
                          {formatMinutes(totalMins)}
                        </span>
                      )}
                      {row.isDeregistered ? (
                        <Badge tone="neutral">Abgemeldet</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : row.shifts.length > 0 ? 'warning' : 'neutral'}>
                          {target ? `${row.shifts.length}/${target} Schichten` : `${row.shifts.length} Schicht${row.shifts.length === 1 ? '' : 'en'}`}
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
                        <Badge tone="neutral">Abgemeldet</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : 'warning'}>
                          {target ? `${row.shifts.length}/${target} Schichten` : `${row.shifts.length} Schichten`}
                        </Badge>
                      )}
                    </div>
                    {row.isDeregistered && row.deregistrationReason && (
                      <p className="text-xs text-fg-muted">Grund: {row.deregistrationReason}</p>
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
                                title="Schicht im Plan öffnen"
                              >
                                <strong>{s.title || s.taskTitle || 'Schicht'}</strong>
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
                      <p className="text-xs italic text-fg-muted">Noch in keiner Schicht.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {permissions.can.HELPERS && event.shifts.length > 0 && (
                        <Button size="sm" variant="secondary" onClick={() => setAssignTarget(row)}>
                          <Plus className="size-3.5" /> In Schicht einteilen
                        </Button>
                      )}
                      {row.shifts.length > 1 && (
                        <Button size="sm" variant="ghost" className="text-danger-ink hover:bg-danger/10" onClick={() => removeFromAll(row)}>
                          <X className="size-3.5" /> Aus allen Schichten austragen
                        </Button>
                      )}
                      {row.userId &&
                        (row.isDeregistered ? (
                          <Button size="sm" variant="secondary" onClick={() => undoDeregistration(row)}>
                            <UserCheck className="size-3.5" /> Abmeldung aufheben
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setDeregTarget(row)}>
                            <UserMinus className="size-3.5" /> Kann nicht helfen (abmelden)
                          </Button>
                        ))}
                    </div>
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

      <AssignPersonToShiftDialog
        row={assignTarget}
        shifts={event.shifts}
        dayCutoffTime={event.dayCutoffTime}
        onClose={() => setAssignTarget(null)}
        onAssigned={async () => {
          setAssignTarget(null);
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
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
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
      toast({ title: `${row.name} abgemeldet`, description: 'Muss an diesem Anlass keine Schichten übernehmen.' });
      setReason('');
      await onSaved();
    } catch (err) {
      toast({ title: 'Abmelden fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(row)}
      onClose={onClose}
      icon={<UserMinus />}
      title={row ? `${row.name} abmelden` : ''}
      description="Die Person muss an diesem Anlass keine Schichten übernehmen und zählt nicht mehr beim Soll. Bestehende Eintragungen bleiben."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Grund (optional)" hint="z. B. Ferien, Militär, verletzt">
          <Input value={reason} maxLength={200} autoFocus onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving}>
            Abmelden
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AssignPersonToShiftDialog({
  row,
  shifts,
  dayCutoffTime,
  onClose,
  onAssigned,
}: {
  row: PersonRow | null;
  shifts: ShiftDto[];
  dayCutoffTime?: string | null;
  onClose: () => void;
  onAssigned: () => Promise<void>;
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [collisionWarning, setCollisionWarning] = useState<ShiftCollisionCheckResult | null>(null);
  const [confirmCollision, setConfirmCollision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setSearch('');
    setOnlyOpen(true);
    setSelectedShiftId('');
    setSelectedTaskId('');
    setCollisionWarning(null);
    setConfirmCollision(false);
    setError(null);
  }, [row]);

  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === selectedShiftId) ?? null,
    [shifts, selectedShiftId]
  );

  const tasks = useMemo(
    () => (selectedShift ? shiftTasks(selectedShift).filter((t) => t.id !== 'default') : []),
    [selectedShift]
  );

  useEffect(() => {
    if (!selectedShift) {
      setSelectedTaskId('');
      return;
    }
    const openTask = tasks.find((t) => t.filled < t.requiredSlots) ?? tasks[0];
    setSelectedTaskId(openTask?.id ?? '');
  }, [selectedShift, tasks]);

  useEffect(() => {
    if (!row || !selectedShiftId) {
      setCollisionWarning(null);
      setConfirmCollision(false);
      return;
    }
    let active = true;
    setConfirmCollision(false);
    const query = row.userId
      ? `userId=${encodeURIComponent(row.userId)}`
      : `guestName=${encodeURIComponent(row.name)}`;
    api<ShiftCollisionCheckResult>(`/api/shifts/${selectedShiftId}/check-collision?${query}`)
      .then((res) => active && setCollisionWarning(res.hasCollision ? res : null))
      .catch(() => active && setCollisionWarning(null));
    return () => {
      active = false;
    };
  }, [row, selectedShiftId]);

  const days = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupByBusinessDay(shifts, dayCutoffTime)
      .map((d) => ({
        ...d,
        items: d.items.filter((s) => {
          const filled = s.signups?.length ?? 0;
          if (onlyOpen && filled >= s.requiredSlots) return false;
          if (
            q &&
            !(s.title?.toLowerCase().includes(q)) &&
            !(s.category?.toLowerCase().includes(q) ?? false) &&
            !s.tasks?.some((t) => t.title.toLowerCase().includes(q))
          )
            return false;
          return true;
        }),
      }))
      .filter((d) => d.items.length > 0);
  }, [shifts, dayCutoffTime, onlyOpen, search]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!row || !selectedShift) return;
    if (collisionWarning?.hasCollision && !confirmCollision) {
      setError('Bitte bestätige die Zeitkollision mit dem Kontrollkästchen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const chosenTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
      await api(`/api/shifts/${selectedShift.id}/signup`, {
        method: 'POST',
        json: {
          taskId: chosenTask?.id || undefined,
          userId: row.userId ?? undefined,
          guestName: row.isGuest ? row.name : undefined,
          guestEmail: row.isGuest && row.guestEmail ? row.guestEmail : undefined,
          guestPhone: row.isGuest && row.guestPhone ? row.guestPhone : undefined,
          confirmCollision: confirmCollision ? true : undefined,
        },
      });
      toast({
        title: `${row.name} eingeteilt`,
        description: `${shiftName(selectedShift)}${chosenTask ? ` (${chosenTask.title})` : ''}`,
      });
      await onAssigned();
    } catch (err) {
      if (err instanceof ApiError && err.data.code === 'TIME_COLLISION') {
        setCollisionWarning({
          hasCollision: true,
          conflicts: (err.data.conflicts as ShiftCollisionCheckResult['conflicts']) || [],
          message: err.message,
        });
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(row)}
      onClose={onClose}
      icon={<UserPlus />}
      title={row ? `${row.name} in Schicht einteilen` : ''}
      description={
        row
          ? `${row.shifts.length} Schicht${row.shifts.length === 1 ? '' : 'en'} bisher${row.age !== null ? ` · ${row.age} Jahre` : ''}`
          : ''
      }
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Schicht oder Arbeit suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
            Nur freie Schichten
          </Chip>
        </div>

        <div className="max-h-72 space-y-4 overflow-y-auto rounded-field border border-line bg-surface-2/40 p-3">
          {days.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-muted">Keine passenden Schichten gefunden.</p>
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
                    const alreadyIn = Boolean(row?.shifts.some((ps) => ps.shiftId === s.id));
                    const isSelected = selectedShiftId === s.id;
                    const disabled = isFull || alreadyIn;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedShiftId(s.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-field border px-3 py-2 text-left text-sm transition',
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-line bg-surface hover:border-line-strong',
                          disabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
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
                              Schon drin
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

        {selectedShift && tasks.length > 1 && (
          <Field label="Arbeit" required>
            <Select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
              {tasks.map((t) => (
                <option key={t.id} value={t.id} disabled={t.filled >= t.requiredSlots}>
                  {t.title} ({t.filled}/{t.requiredSlots} besetzt{t.minAge ? `, ab ${t.minAge} J.` : ''})
                </option>
              ))}
            </Select>
          </Field>
        )}

        {collisionWarning?.hasCollision && (
          <div className="rounded-field border border-warning/40 bg-warning/10 p-3.5 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" />
              <div className="space-y-2">
                <p className="font-semibold text-warning-ink">{collisionWarning.message}</p>
                <label className="flex cursor-pointer items-center gap-2 pt-1 font-medium text-fg">
                  <input
                    type="checkbox"
                    checked={confirmCollision}
                    onChange={(e) => setConfirmCollision(e.target.checked)}
                    className="size-4 accent-warning"
                  />
                  Trotz Zeitkollision einteilen
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving} disabled={!selectedShift}>
            <UserCheck className="size-4" /> Einteilen
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
