'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  Keyboard,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  Sun,
  Ticket,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import {
  compareSwissText,
  getLandingUrl,
  type DepartmentPersonDto,
  type EventDto,
  type ShiftDto,
  type ShiftSignupDto,
} from '@schichtplan/shared';
import { useOrganization, useToast, type BadgeTone } from '@schichtplan/ui';
import { api, errorMessage, useLoginHref } from '@/lib/api';
import { eventStatus } from '@/components/EventTile';
import { fmtShortDate, fmtShortWeekday, fmtTimeRange, shiftName } from '@/lib/format';
import { downloadIcs, googleCalendarUrl, type CalendarEntry } from '@/lib/ics';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { useCommandPalette } from './CommandContext';
import { getRecentCommandIds, recordRecentCommand } from './recentCommands';
import type {
  CommandItem,
  CommandQuickAction,
  CommandSection,
  CommandSubAction,
} from './types';

const THEME_STORAGE_KEY = 'schichtplan.theme';

interface DepartmentPerson {
  id: string;
  userId: string;
  firstName: string;
  lastName?: string | null;
  ceviName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  departmentRole?: string | null;
  stufen?: { name: string }[];
}

export type PrefixMode = 'ALL' | 'PEOPLE' | 'EVENTS' | 'SHIFTS' | 'HELP';

export function useCommandItems(query: string) {
  const t = useTranslations('web.command');
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const loginHref = useLoginHref();
  const { user, department, can, isDeptAdmin, logout } = usePortal();
  const { contextData, close, setActiveSubActionItem } = useCommandPalette();
  const org = useOrganization();

  const [allEvents, setAllEvents] = useState<EventDto[]>([]);
  const [people, setPeople] = useState<DepartmentPerson[]>([]);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, 'PRESENT' | null>>({});
  const [loadedEventDetails, setLoadedEventDetails] = useState<EventDetails | null>(null);

  // Anlässe laden (und cachen)
  useEffect(() => {
    if (!department) return;
    api<EventDto[]>('/api/events')
      .then((data) => setAllEvents(data || []))
      .catch(() => setAllEvents([]));
  }, [department]);

  // Personen laden, falls Berechtigung vorhanden
  const canViewPeople = can('PEOPLE_VIEW') || isDeptAdmin;
  useEffect(() => {
    if (!canViewPeople || !department) return;
    api<Array<DepartmentPersonDto & { id?: string }>>('/api/departments/current/people?alle=1')
      .then((data) => {
        const mapped: DepartmentPerson[] = (data || []).map((p) => ({
          ...p,
          id: p.userId || p.id || '',
          userId: p.userId || p.id || '',
          role: p.departmentRole || undefined,
        }));
        setPeople(mapped);
      })
      .catch(() => setPeople([]));
  }, [canViewPeople, department]);

  // Aktueller Anlass: entweder aus contextData oder aus dem Pfad (/events/[slug])
  const activeSlug = useMemo(() => {
    if (contextData.slug) return contextData.slug;
    const match = pathname.match(/^\/events\/([^/]+)/);
    return match ? match[1] : null;
  }, [contextData.slug, pathname]);

  const activeEvent = useMemo(() => {
    if (contextData.event) return contextData.event;
    if (!activeSlug || !allEvents.length) return null;
    return allEvents.find((e) => e.slug === activeSlug) || null;
  }, [contextData.event, activeSlug, allEvents]);

  // EventDetails mit Schichten laden, falls contextData.event noch keine Schichten hat
  useEffect(() => {
    if (!activeSlug) {
      setLoadedEventDetails(null);
      return;
    }
    const ctxEv = contextData.event as EventDetails | undefined;
    if (ctxEv && Array.isArray(ctxEv.shifts)) {
      setLoadedEventDetails(ctxEv);
      return;
    }
    api<EventDetails>(`/api/events/${activeSlug}`)
      .then((data) => {
        if (data && Array.isArray(data.shifts)) {
          setLoadedEventDetails(data);
        }
      })
      .catch(() => {});
  }, [activeSlug, contextData.event]);

  const detailedEvent = useMemo(() => {
    const ctxEv = contextData.event as EventDetails | undefined;
    if (ctxEv && Array.isArray(ctxEv.shifts)) return ctxEv;
    return loadedEventDetails;
  }, [contextData.event, loadedEventDetails]);

  const isOkArea = pathname.includes('/ok') || Boolean(contextData.isOkArea);

  // Erkennung von Präfixen (@, #, :, !, ?, >)
  const { prefixMode, cleanQuery } = useMemo(() => {
    const raw = query.trim();
    if (raw.startsWith('@')) return { prefixMode: 'PEOPLE' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith('#') || raw.startsWith('>')) return { prefixMode: 'EVENTS' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith(':') || raw.startsWith('!')) return { prefixMode: 'SHIFTS' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith('?')) return { prefixMode: 'HELP' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    return { prefixMode: 'ALL' as PrefixMode, cleanQuery: raw };
  }, [query]);

  // =========================================================================
  // DIREKTE HILFSFUNKTIONEN (KLIPPEN, TEILEN, KALENDER, CHAT)
  // =========================================================================

  const copyToClipboard = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t('copiedToast', { title }), tone: 'success' });
    } catch {
      toast({ title: t('copyFailedToast'), tone: 'error' });
    }
  };

  const openWhatsAppDirect = (phone: string, firstName?: string) => {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = '41' + cleanPhone.slice(1);
    }
    const greeting = firstName ? t('toast.greetingName', { name: firstName }) : t('toast.greeting');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openSmsDirect = (phone: string) => {
    const cleanPhone = phone.replace(/\s+/g, '');
    window.location.href = `sms:${cleanPhone}`;
  };

  const handleDownloadIcs = (event: EventDto | EventDetails) => {
    const entries: CalendarEntry[] = [
      {
        uid: `event-${event.id}`,
        title: event.title,
        description: event.description || undefined,
        start: event.startDate,
        end: event.endDate || event.startDate,
      },
    ];
    downloadIcs(`${event.slug}.ics`, entries);
    toast({
      title: t('icsDownloadedToast'),
      description: t('icsDownloadedDesc', { slug: event.slug }),
      tone: 'success',
    });
  };

  const handleGoogleCalendar = (event: EventDto | EventDetails) => {
    const entry: CalendarEntry = {
      uid: `event-${event.id}`,
      title: event.title,
      description: event.description || undefined,
      start: event.startDate,
      end: event.endDate || event.startDate,
    };
    const url = googleCalendarUrl(entry);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyShiftWhatsAppCall = (eventTitle: string, shift: ShiftDto, eventUrl: string) => {
    const shiftTime = `${fmtShortWeekday(shift.startTime)} ${fmtTimeRange(shift.startTime, shift.endTime)}`;
    const freeSlots = Math.max(0, shift.requiredSlots - (shift.signups?.length || 0));
    const link = `${eventUrl}#shift-${shift.id}`;
    const text = [
      t('wa.shiftHeading', { event: eventTitle }),
      t('wa.shiftLine', { shift: shift.title || shiftName(shift) }),
      t('wa.time', { time: shiftTime }),
      shift.category ? t('wa.area', { area: shift.category }) : null,
      t('wa.freeSlots', { count: freeSlots }),
      '',
      t('wa.viewAndSignUp'),
      link,
    ]
      .filter(Boolean)
      .join('\n');
    copyToClipboard(text, t('wa.callLabel'));
  };

  const copyEventWhatsAppCall = (
    event: EventDto | EventDetails,
    shiftsWithGaps: ShiftDto[],
    eventUrl: string
  ) => {
    const dateText = fmtShortDate(event.startDate);
    const totalMissing = shiftsWithGaps.reduce(
      (acc, s) => acc + Math.max(0, s.requiredSlots - (s.signups?.length || 0)),
      0
    );
    const text = [
      t('wa.eventHeading', { event: event.title }),
      t('wa.date', { date: dateText }),
      '',
      t('wa.missingHands', { count: totalMissing }),
      ...shiftsWithGaps.slice(0, 8).map((s) => {
        const free = Math.max(0, s.requiredSlots - (s.signups?.length || 0));
        return t('wa.gapLine', { shift: s.title || shiftName(s), time: `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`, count: free });
      }),
      shiftsWithGaps.length > 8 ? t('wa.moreShifts', { count: shiftsWithGaps.length - 8 }) : null,
      '',
      t('wa.openAndSignUp'),
      eventUrl,
    ]
      .filter(Boolean)
      .join('\n');
    copyToClipboard(text, t('wa.eventCallLabel', { count: totalMissing }));
  };

  const copyEventTextPlan = (event: EventDto | EventDetails, shifts: ShiftDto[]) => {
    const dateText = fmtShortDate(event.startDate);
    const lines = [
      t('text.planHeading', { event: event.title, date: dateText }),
      t('text.totalShifts', { count: shifts.length }),
      '--------------------------------------------------',
      ...shifts.map((s) => {
        const time = `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`;
        const names = (s.signups || []).map((su) => su.displayName).join(', ') || t('text.noHelpers');
        const count = `${s.signups?.length || 0}/${s.requiredSlots}`;
        return `• [${time}] ${s.title || shiftName(s)}${s.category ? ` (${s.category})` : ''}: ${names} [${count}]`;
      }),
    ];
    copyToClipboard(lines.join('\n'), t('text.planLabel'));
  };

  const copyHelpersEmailList = (shifts: ShiftDto[]) => {
    const emails = new Set<string>();
    for (const s of shifts) {
      for (const su of s.signups || []) {
        if (su.guestEmail) emails.add(su.guestEmail.trim());
      }
    }
    for (const p of people) {
      if (p.email && shifts.some((s) => s.signups?.some((su) => su.userId === p.id))) {
        emails.add(p.email.trim());
      }
    }
    const list = Array.from(emails).filter(Boolean);
    if (list.length === 0) {
      toast({ title: t('text.noEmails'), tone: 'info' });
      return;
    }
    copyToClipboard(list.join(', '), t('text.helperEmails', { count: list.length }));
  };

  const copyHelpersPhoneList = (shifts: ShiftDto[], eventTitle: string) => {
    const helperMap = new Map<string, { name: string; phone?: string | null; shifts: string[] }>();
    for (const s of shifts) {
      const time = `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`;
      const sName = `${s.title || shiftName(s)} (${time})`;
      for (const su of s.signups || []) {
        const key = su.userId || su.displayName;
        const existing = helperMap.get(key) || { name: su.displayName, phone: su.guestPhone, shifts: [] };
        existing.shifts.push(sName);
        if (!existing.phone && su.userId) {
          const found = people.find((p) => p.id === su.userId);
          if (found?.phone) existing.phone = found.phone;
        }
        helperMap.set(key, existing);
      }
    }
    const lines = [
      t('text.phoneHeading', { event: eventTitle }),
      '--------------------------------------------------',
      ...Array.from(helperMap.values()).map((h) => {
        const phoneStr = h.phone ? h.phone : t('text.noPhone');
        return `• ${h.name}: ${phoneStr} [${h.shifts.join('; ')}]`;
      }),
    ];
    copyToClipboard(lines.join('\n'), t('text.phoneLabel'));
  };

  // =========================================================================
  // DIREKTE AKTIONEN (EINTRAGEN, STORNIEREN, ERSATZ, CHECK-IN)
  // =========================================================================

  const handleDirectSignup = async (shift: ShiftDto) => {
    if (!user) {
      window.location.href = loginHref;
      return;
    }
    try {
      const res = await api<{ id?: string; signupId?: string }>(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {},
      });
      const newSignupId = res?.id || res?.signupId || `temp-${Date.now()}`;
      toast({
        title: t('toast.signedUp'),
        description: t('toast.signedUpDesc', { shift: shift.title || shiftName(shift) }),
        tone: 'success',
      });

      // Optimistisches Update in den geladenen EventDetails
      setLoadedEventDetails((prev) => {
        if (!prev) return prev;
        const updatedShifts = prev.shifts.map((s) => {
          if (s.id !== shift.id) return s;
          const newSignup: ShiftSignupDto = {
            id: newSignupId,
            shiftId: shift.id,
            userId: user.id,
            displayName: displayName(user),
            guestName: null,
            guestEmail: null,
            guestPhone: null,
            taskTitle: null,
            createdAt: new Date().toISOString(),
            isConfirmed: true,
            attendance: null,
          };
          return {
            ...s,
            signups: [...(s.signups || []), newSignup],
          };
        });
        return { ...prev, shifts: updatedShifts };
      });
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: t('toast.signUpFailed'),
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const handleDirectCancelSignup = async (shiftId: string, signupId: string, shiftTitle: string) => {
    try {
      await api(`/api/shifts/${shiftId}/signup?signupId=${signupId}`, {
        method: 'DELETE',
      });
      toast({
        title: t('toast.cancelled'),
        description: t('toast.cancelledDesc', { shift: shiftTitle }),
        tone: 'info',
      });
      setLoadedEventDetails((prev) => {
        if (!prev) return prev;
        const updatedShifts = prev.shifts.map((s) => {
          if (s.id !== shiftId) return s;
          return {
            ...s,
            signups: (s.signups || []).filter((su) => su.id !== signupId),
          };
        });
        return { ...prev, shifts: updatedShifts };
      });
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: t('toast.cancelFailed'),
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const handleDirectReplacement = async (signupId: string, isAlreadyOffered: boolean) => {
    try {
      if (isAlreadyOffered) {
        await api(`/api/signups/${signupId}/replacement`, { method: 'DELETE' });
        toast({
          title: t('toast.replacementWithdrawn'),
          description: t('toast.replacementWithdrawnDesc'),
          tone: 'info',
        });
      } else {
        await api(`/api/signups/${signupId}/replacement`, {
          method: 'PUT',
          json: { note: t('toast.replacementNote') },
        });
        toast({
          title: t('toast.replacementOffered'),
          description: t('toast.replacementOfferedDesc'),
          tone: 'info',
        });
      }
      if (activeSlug) {
        api<EventDetails>(`/api/events/${activeSlug}`)
          .then((data) => {
            if (data && Array.isArray(data.shifts)) setLoadedEventDetails(data);
          })
          .catch(() => {});
      }
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: t('toast.actionFailed'),
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const toggleAttendance = async (signupId: string, helperName: string, currentStatus: string | null) => {
    if (!activeSlug) return;
    const newStatus = currentStatus === 'PRESENT' ? null : 'PRESENT';
    try {
      await api(`/api/events/${activeSlug}/signups/${signupId}/attendance`, {
        method: 'PUT',
        json: { status: newStatus },
      });
      setAttendanceOverrides((prev) => ({ ...prev, [signupId]: newStatus }));
      toast({
        title: newStatus === 'PRESENT' ? t('toast.checkedIn', { name: helperName }) : t('toast.attendanceReset'),
        description: newStatus === 'PRESENT' ? t('toast.markedPresent') : t('toast.statusReset'),
        tone: newStatus === 'PRESENT' ? 'success' : 'info',
      });
    } catch {
      toast({
        title: t('toast.checkInFailed'),
        description: t('toast.checkInFailedDesc'),
        tone: 'error',
      });
    }
  };

  const toggleShiftAllAttendance = async (shift: ShiftDto) => {
    if (!activeSlug || !shift.signups?.length) return;
    const allPresent = shift.signups.every(
      (su) => (attendanceOverrides[su.id] ?? su.attendance) === 'PRESENT'
    );
    const targetStatus = allPresent ? null : 'PRESENT';
    try {
      for (const su of shift.signups) {
        await api(`/api/events/${activeSlug}/signups/${su.id}/attendance`, {
          method: 'PUT',
          json: { status: targetStatus },
        });
      }
      const updates: Record<string, 'PRESENT' | null> = {};
      for (const su of shift.signups) {
        updates[su.id] = targetStatus;
      }
      setAttendanceOverrides((prev) => ({ ...prev, ...updates }));
      toast({
        title: targetStatus === 'PRESENT' ? t('toast.allCheckedIn') : t('toast.attendanceReset'),
        description: t('toast.peopleUpdated', { count: shift.signups.length }),
        tone: targetStatus === 'PRESENT' ? 'success' : 'info',
      });
    } catch {
      toast({ title: t('toast.updateFailed'), tone: 'error' });
    }
  };

  // Theme wechseln
  const setTheme = (choice: 'system' | 'light' | 'dark') => {
    const root = document.documentElement;
    if (choice === 'system') delete root.dataset.theme;
    else root.dataset.theme = choice;
    try {
      if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {}
    toast({
      title:
        choice === 'dark'
          ? t('toast.darkOn')
          : choice === 'light'
            ? t('toast.lightOn')
            : t('toast.systemOn'),
      tone: 'info',
    });
    close();
  };

  // =========================================================================
  // LISTE ALLER VERFÜGBAREN BEFEHLE GENERIEREN
  // =========================================================================

  // biome-ignore lint/correctness/useExhaustiveDependencies: Die Aktionen in items greifen über Closures auf die aktuellen Handler zu; items wird gezielt nur bei Datenänderungen neu gebaut
  const items = useMemo(() => {
    const list: CommandItem[] = [];

    // =========================================================================
    // 0. HILFE-BEFEHLE (bei '?' oder prefixMode === 'HELP')
    // =========================================================================
    if (prefixMode === 'HELP') {
      list.push({
        id: 'help-shortcuts',
        title: t('help.keyboardTitle'),
        subtitle: t('help.keyboardSubtitle'),
        section: 'HELP',
        icon: <Keyboard className="size-4 text-accent-ink" />,
        keywords: ['hilfe', 'tastatur', 'shortcuts', 'navigation'],
        onSelect: () => {},
        preview: {
          type: 'ACTION',
          details: [
            { label: t('help.open'), value: t('help.openKeys') },
            { label: t('help.mainAction'), value: '↵ Enter' },
            { label: t('help.subActions'), value: '⇥ Tab' },
            { label: t('help.backClose'), value: 'Esc' },
            { label: t('help.instantActions'), value: t('help.instantValue') },
          ],
        },
      });

      list.push({
        id: 'help-prefix-people',
        title: t('help.prefixPeopleTitle'),
        subtitle: t('help.prefixPeopleSubtitle'),
        section: 'HELP',
        icon: <UserRound className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'person', 'helfer', '@'],
        onSelect: () => {},
      });

      list.push({
        id: 'help-prefix-events',
        title: t('help.prefixEventsTitle'),
        subtitle: t('help.prefixEventsSubtitle'),
        section: 'HELP',
        icon: <CalendarDays className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'anlass', 'event', '#', '>'],
        onSelect: () => {},
      });

      list.push({
        id: 'help-prefix-shifts',
        title: t('help.prefixShiftsTitle'),
        subtitle: t('help.prefixShiftsSubtitle'),
        section: 'HELP',
        icon: <Ticket className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'schicht', 'aufgabe', ':', '!'],
        onSelect: () => {},
      });

      return list;
    }

    // =========================================================================
    // 1. POSITION / KONTEXTBEZOGEN: Aktueller Anlass
    // =========================================================================
    if (activeSlug && activeEvent) {
      const eventTitle = activeEvent.title;
      const eventUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/events/${activeSlug}`
          : `/events/${activeSlug}`;
      const canManageEvent = can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin;

      // Hauptaktionen für den aktuellen Anlass
      if (isOkArea) {
        list.push({
          id: `context-to-helper-view`,
          title: t('ctx.helperView'),
          subtitle: t('ctx.helperViewSubtitle', { event: eventTitle }),
          section: 'CONTEXT',
          icon: <Ticket className="size-4 text-accent-ink" />,
          keywords: ['helfer', 'ansicht', 'eintragen', 'öffentlich', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-to-helper-view`);
            router.push(`/events/${activeSlug}`);
            close();
          },
          subActions: [
            {
              id: 'copy-link',
              title: t('ctx.copyEventLink'),
              icon: <Copy className="size-3.5" />,
              closeOnSelect: false,
              onSelect: () => copyToClipboard(eventUrl, 'Anlass-Link'),
            },
          ],
          preview: {
            type: 'EVENT',
            event: activeEvent,
            details: [
              { label: t('ctx.area'), value: t('ctx.helperViewValue') },
              { label: 'URL', value: eventUrl },
            ],
          },
        });
      } else {
        if (canManageEvent) {
          list.push({
            id: `context-to-ok-view`,
            title: t('ctx.okArea'),
            subtitle: t('ctx.okAreaSubtitle', { event: eventTitle }),
            section: 'CONTEXT',
            icon: <LayoutDashboard className="size-4 text-accent-ink" />,
            keywords: ['ok', 'leitung', 'admin', 'planung', activeSlug, eventTitle],
            onSelect: () => {
              recordRecentCommand(`context-to-ok-view`);
              router.push(`/events/${activeSlug}/ok`);
              close();
            },
            subActions: [
              {
                id: 'ok-schichten',
                title: t('ctx.toShifts'),
                icon: <CalendarDays className="size-3.5" />,
                onSelect: () => {
                  router.push(`/events/${activeSlug}/ok/schichten`);
                  close();
                },
              },
              {
                id: 'ok-helfende',
                title: t('ctx.toHelpers'),
                icon: <Users className="size-3.5" />,
                onSelect: () => {
                  router.push(`/events/${activeSlug}/ok/helfende`);
                  close();
                },
              },
            ],
            preview: {
              type: 'EVENT',
              event: activeEvent,
              details: [
                { label: t('ctx.area'), value: t('ctx.okCentral') },
                { label: t('ctx.role'), value: isDeptAdmin ? org.leadTerm : t('ctx.okPlanning') },
              ],
            },
          });
        }
      }

      // Lücken-Finder: Unbesetzte Schichten im aktuellen Anlass
      const shiftsWithGaps =
        detailedEvent?.shifts?.filter(
          (s) => Math.max(0, s.requiredSlots - (s.signups?.length || 0)) > 0
        ) || [];

      if (shiftsWithGaps.length > 0) {
        const totalMissing = shiftsWithGaps.reduce(
          (acc, s) => acc + Math.max(0, s.requiredSlots - (s.signups?.length || 0)),
          0
        );

        list.push({
          id: `context-open-shifts`,
          title: t('ctx.gapFinder', { count: totalMissing }),
          subtitle: t('ctx.gapFinderSubtitle', { count: shiftsWithGaps.length }),
          section: 'CONTEXT',
          badge: t('ctx.openCount', { count: totalMissing }),
          badgeTone: 'warning',
          icon: <Search className="size-4 text-warning-ink" />,
          keywords: ['lücken', 'frei', 'offen', 'unbesetzt', 'bedarf', 'helfer gesucht', activeSlug],
          onSelect: () => {
            recordRecentCommand(`context-open-shifts`);
            if (pathname.startsWith(`/events/${activeSlug}`)) {
              const el = document.getElementById(`shift-${shiftsWithGaps[0]?.id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              router.push(`/events/${activeSlug}`);
            }
            close();
          },
          subActions: [
            {
              id: 'copy-whatsapp-gaps',
              title: t('ctx.copyWaCall'),
              subtitle: t('ctx.copyWaCallSubtitle'),
              icon: <Share2 className="size-3.5 text-accent-ink" />,
              closeOnSelect: false,
              onSelect: () => copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl),
            },
            {
              id: 'copy-link',
              title: t('ctx.copySignupLink'),
              icon: <Copy className="size-3.5" />,
              closeOnSelect: false,
              onSelect: () => copyToClipboard(eventUrl, t('ctx.signupLinkLabel')),
            },
          ],
          preview: {
            type: 'ACTION',
            details: [
              { label: t('ctx.openSpots'), value: t('ctx.helpersWanted', { count: totalMissing }) },
              {
                label: t('ctx.affectedShifts'),
                value: `${shiftsWithGaps.length} von ${detailedEvent?.shifts?.length || 0}`,
              },
            ],
            quickActions: [
              {
                id: 'wa-gaps',
                label: t('wa.callLabel'),
                icon: <Share2 className="size-3.5" />,
                tone: 'accent',
                onClick: () => copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl),
              },
              {
                id: 'copy-url',
                label: t('ctx.copyLink'),
                icon: <Copy className="size-3.5" />,
                onClick: () => copyToClipboard(eventUrl, t('ctx.signupLinkLabel')),
              },
            ],
          },
        });
      }

      // Direkte Schnellaktionen für den aktuellen Anlass: WhatsApp-Aufruf, Plan kopieren, Kalender
      list.push({
        id: `context-share-whatsapp`,
        title: t('ctx.copyWaCall'),
        subtitle: t('ctx.copyWaCallSubtitle2'),
        section: 'CONTEXT',
        icon: <Share2 className="size-4 text-accent-ink" />,
        keywords: ['whatsapp', 'aufruf', 'teilen', 'chat', 'helfer gesucht', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-share-whatsapp`);
          copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl);
        },
      });

      if (detailedEvent?.shifts?.length) {
        list.push({
          id: `context-copy-textplan`,
          title: t('ctx.copyPlanText'),
          subtitle: t('ctx.copyPlanTextSubtitle'),
          section: 'CONTEXT',
          icon: <Copy className="size-4 text-accent-ink" />,
          keywords: ['plan', 'text', 'kopieren', 'übersicht', 'export', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-textplan`);
            copyEventTextPlan(activeEvent, detailedEvent.shifts);
          },
        });

        list.push({
          id: `context-copy-helpers-email`,
          title: t('ctx.copyEmails'),
          subtitle: t('ctx.copyEmailsSubtitle'),
          section: 'CONTEXT',
          icon: <Mail className="size-4 text-accent-ink" />,
          keywords: ['mail', 'email', 'verteiler', 'helfer', 'rundmail', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-helpers-email`);
            copyHelpersEmailList(detailedEvent.shifts);
          },
        });

        list.push({
          id: `context-copy-helpers-phone`,
          title: t('ctx.copyPhones'),
          subtitle: t('ctx.copyPhonesSubtitle'),
          section: 'CONTEXT',
          icon: <Phone className="size-4 text-accent-ink" />,
          keywords: ['telefon', 'liste', 'notfall', 'kontakte', 'anrufen', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-helpers-phone`);
            copyHelpersPhoneList(detailedEvent.shifts, eventTitle);
          },
        });
      }

      list.push({
        id: `context-download-ics`,
        title: t('ctx.downloadIcs'),
        subtitle: t('ctx.downloadIcsSubtitle'),
        section: 'CONTEXT',
        icon: <Download className="size-4 text-accent-ink" />,
        keywords: ['kalender', 'ics', 'ical', 'outlook', 'apple', 'download', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-download-ics`);
          handleDownloadIcs(activeEvent);
        },
      });

      list.push({
        id: `context-add-gcal`,
        title: t('ctx.addGoogle'),
        subtitle: t('ctx.addGoogleSubtitle'),
        section: 'CONTEXT',
        icon: <ExternalLink className="size-4 text-accent-ink" />,
        keywords: ['google', 'kalender', 'termin', 'gcal', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-add-gcal`);
          handleGoogleCalendar(activeEvent);
        },
      });

      // Neue Schicht erfassen (im aktuellen Anlass)
      if (canManageEvent) {
        list.push({
          id: `context-add-shift`,
          title: t('ctx.newShift'),
          subtitle: t('ctx.newShiftSubtitle', { event: eventTitle }),
          section: 'CONTEXT',
          icon: <CalendarPlus className="size-4 text-accent-ink" />,
          keywords: ['schicht', 'neu', 'erstellen', 'anlegen', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-add-shift`);
            if (contextData.onOpenShiftForm) {
              contextData.onOpenShiftForm();
            } else {
              router.push(`/events/${activeSlug}/ok/schichten`);
            }
            close();
          },
        });

        // Helfer zuweisen
        list.push({
          id: `context-assign-helper`,
          title: t('ctx.assignHelper'),
          subtitle: t('ctx.assignHelperSubtitle', { event: eventTitle }),
          section: 'CONTEXT',
          icon: <UserPlus className="size-4 text-accent-ink" />,
          keywords: ['helfer', 'zuweisen', 'zuteilen', 'eintragen', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-assign-helper`);
            if (contextData.onOpenAssignModal) {
              contextData.onOpenAssignModal();
            } else {
              router.push(`/events/${activeSlug}/ok/helfende`);
            }
            close();
          },
        });
      }

      // Check-in & Anwesenheit
      list.push({
        id: `context-checkin`,
        title: t('ctx.checkin'),
        subtitle: t('ctx.checkinSubtitle'),
        section: 'CONTEXT',
        icon: <ClipboardCheck className="size-4 text-accent-ink" />,
        keywords: ['checkin', 'anwesenheit', 'qr', 'scannen', 'vor ort', activeSlug, eventTitle],
        onSelect: () => {
          recordRecentCommand(`context-checkin`);
          router.push(`/events/${activeSlug}/checkin`);
          close();
        },
      });

      // Plan drucken / PDF-Export
      list.push({
        id: `context-print-pdf`,
        title: t('ctx.print'),
        subtitle: t('ctx.printSubtitle', { event: eventTitle }),
        section: 'CONTEXT',
        icon: <Printer className="size-4 text-accent-ink" />,
        keywords: ['drucken', 'pdf', 'export', 'aushang', 'papier', activeSlug, eventTitle],
        onSelect: () => {
          recordRecentCommand(`context-print-pdf`);
          if (contextData.onPrintPlan) {
            contextData.onPrintPlan();
          } else {
            router.push(`/events/${activeSlug}/ok/export`);
          }
          close();
        },
      });

      // Link kopieren
      list.push({
        id: `context-copy-link`,
        title: t('ctx.copyEventLink'),
        subtitle: eventUrl,
        section: 'CONTEXT',
        icon: <Copy className="size-4 text-accent-ink" />,
        keywords: ['link', 'kopieren', 'teilen', 'url', activeSlug, eventTitle],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-copy-link`);
          copyToClipboard(eventUrl, 'Anlass-Link');
        },
      });

      // =========================================================================
      // SCHICHTEN DES AKTUELLEN ANLASSES (MIT DIREKTEN SOFORTAKTIONEN!)
      // =========================================================================
      if (detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          const shiftTime = `${fmtShortWeekday(shift.startTime)} ${fmtTimeRange(shift.startTime, shift.endTime)}`;
          const freeSlots = Math.max(0, shift.requiredSlots - (shift.signups?.length || 0));
          const slotBadge = freeSlots > 0 ? t('shift.freeBadge', { count: freeSlots }) : t('fullyStaffed');

          // Hat der aktuell angemeldete Benutzer diese Schicht übernommen?
          const mySignup = user ? shift.signups?.find((su) => su.userId === user.id) : null;
          const isMyShift = Boolean(mySignup);
          const isMyShiftReplacement = Boolean(
            mySignup && (mySignup as unknown as { isReplacement?: boolean }).isReplacement
          );

          // Subaktionen für diese Schicht aufbauen
          const shiftSubActions: CommandSubAction[] = [];

          // 1. Direktaktion: Eintragen (ohne Seitenwechsel!)
          if (user && !isMyShift && freeSlots > 0) {
            shiftSubActions.push({
              id: 'direct-signup',
              title: t('shift.signUpNow', { name: displayName(user) }),
              subtitle: t('shift.signUpNowSubtitle'),
              icon: <UserPlus className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => handleDirectSignup(shift),
            });
          }

          // 2. Direktaktion: Stornieren / Austragen
          if (isMyShift && mySignup) {
            shiftSubActions.push({
              id: 'direct-cancel',
              title: t('shift.cancelMine'),
              subtitle: t('shift.cancelMineSubtitle'),
              icon: <Trash2 className="size-3.5 text-danger-ink" />,
              closeOnSelect: false,
              onSelect: () =>
                handleDirectCancelSignup(shift.id, mySignup.id, shift.title || shiftName(shift)),
            });

            shiftSubActions.push({
              id: 'direct-replacement',
              title: isMyShiftReplacement ? t('shift.withdrawReplacement') : t('shift.offerReplacement'),
              subtitle: isMyShiftReplacement ? t('shift.withdrawReplacementSubtitle') : t('shift.offerReplacementSubtitle'),
              icon: <RotateCcw className="size-3.5 text-warning-ink" />,
              closeOnSelect: false,
              onSelect: () => handleDirectReplacement(mySignup.id, isMyShiftReplacement),
            });
          }

          // 3. Direktaktion für OK: Alle Helfenden dieser Schicht einchecken
          if (canManageEvent && shift.signups && shift.signups.length > 0) {
            const allPresent = shift.signups.every(
              (su) => (attendanceOverrides[su.id] ?? su.attendance) === 'PRESENT'
            );
            shiftSubActions.push({
              id: 'checkin-all-shift',
              title: allPresent
                ? t('shift.resetAttendance', { count: shift.signups.length })
                : t('shift.checkInAll', { count: shift.signups.length }),
              subtitle: allPresent ? t('shift.markAllOpen') : t('shift.markAllPresent'),
              icon: allPresent ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => toggleShiftAllAttendance(shift),
            });

            // Einzelne Helfer der Schicht direkt einchecken
            for (const su of shift.signups) {
              const curAtt = attendanceOverrides[su.id] ?? su.attendance;
              const isPres = curAtt === 'PRESENT';
              shiftSubActions.push({
                id: `checkin-helper-${su.id}`,
                title: isPres ? t('shift.checkOut', { name: su.displayName }) : t('shift.checkIn', { name: su.displayName }),
                subtitle: isPres ? t('shift.markOpen') : t('shift.confirmPresent'),
                icon: isPres ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5 text-success-ink" />,
                closeOnSelect: false,
                onSelect: () => toggleAttendance(su.id, su.displayName, isPres ? 'PRESENT' : null),
              });
            }

            // Einzelne Helfer der Schicht direkt per WhatsApp anschreiben
            for (const su of shift.signups) {
              const matchedPerson = people.find((p) => p.userId === su.userId || p.id === su.userId);
              const helperPhone = su.guestPhone || su.userPhone || matchedPerson?.phone;
              shiftSubActions.push({
                id: `wa-helper-${su.id}`,
                title: t('shift.waTo', { name: su.displayName }),
                subtitle: helperPhone ? t('person.directChat', { phone: helperPhone }) : t('shift.enterPhoneAndChat'),
                icon: <MessageSquare className="size-3.5 text-success-ink" />,
                closeOnSelect: false,
                onSelect: () => {
                  if (helperPhone) {
                    openWhatsAppDirect(helperPhone, su.userFirstName || su.displayName);
                  } else {
                    const input = window.prompt(t('person.phonePrompt', { name: su.displayName }));
                    if (input?.trim()) {
                      openWhatsAppDirect(input.trim(), su.userFirstName || su.displayName);
                    }
                  }
                },
              });
            }
          }

          // 4. Direktaktion: WhatsApp-Aufruf für diese Schicht
          shiftSubActions.push({
            id: 'copy-shift-whatsapp',
            title: t('shift.copyWaCall'),
            subtitle: t('shift.copyWaCallSubtitle'),
            icon: <Share2 className="size-3.5 text-accent-ink" />,
            closeOnSelect: false,
            onSelect: () => copyShiftWhatsAppCall(eventTitle, shift, eventUrl),
          });

          // 5. Direktaktion: Schichtdetails als Text kopieren
          shiftSubActions.push({
            id: 'copy-shift-text',
            title: t('shift.copyDetails'),
            subtitle: `${shiftTime} · ${shift.category || t('shift.general')} · ${shift.signups?.length || 0}/${shift.requiredSlots}`,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => {
              const names = (shift.signups || []).map((su) => su.displayName).join(', ') || t('shift.nobody');
              const text = [
                t('shift.detailShift', { shift: shift.title || shiftName(shift) }),
                t('shift.detailEvent', { event: eventTitle }),
                t('shift.detailTime', { time: shiftTime }),
                shift.category ? t('shift.detailArea', { area: shift.category }) : null,
                t('shift.detailStaffing', { filled: shift.signups?.length || 0, total: shift.requiredSlots, free: freeSlots }),
                t('shift.detailHelpers', { names }),
                shift.description ? t('shift.detailNotes', { notes: shift.description }) : null,
                `Link: ${eventUrl}#shift-${shift.id}`,
              ]
                .filter(Boolean)
                .join('\n');
              copyToClipboard(text, t('shift.detailsLabel'));
            },
          });

          // 6. Direktlink kopieren
          shiftSubActions.push({
            id: 'copy-shift-link',
            title: t('shift.copyDirectLink'),
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => {
              const url = `${eventUrl}#shift-${shift.id}`;
              copyToClipboard(url, 'Schicht-Link');
            },
          });

          // 7. Navigation
          shiftSubActions.push({
            id: 'select-shift-plan',
            title: t('shift.jumpTo'),
            subtitle: `${shiftTime} · ${slotBadge}`,
            icon: <Ticket className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(shift.id);
                }
                const el = document.getElementById(`shift-${shift.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${shift.id}#shift-${shift.id}`);
              }
              close();
            },
          });

          if (canManageEvent) {
            shiftSubActions.push({
              id: 'manage-shift',
              title: t('shift.editInOk'),
              icon: <Settings className="size-3.5" />,
              onSelect: () => {
                router.push(`/events/${activeSlug}/ok/schichten`);
                close();
              },
            });
          }

          // QuickActions für Desktop-Vorschau
          const quickActions: CommandQuickAction[] = [];
          if (user && !isMyShift && freeSlots > 0) {
            quickActions.push({
              id: 'quick-signup',
              label: t('shift.signUpQuick'),
              icon: <UserPlus className="size-3.5" />,
              tone: 'success',
              onClick: () => handleDirectSignup(shift),
            });
          } else if (isMyShift && mySignup) {
            quickActions.push({
              id: 'quick-cancel',
              label: t('shift.cancelQuick'),
              icon: <Trash2 className="size-3.5" />,
              tone: 'danger',
              onClick: () =>
                handleDirectCancelSignup(shift.id, mySignup.id, shift.title || shiftName(shift)),
            });
          }
          quickActions.push({
            id: 'quick-wa',
            label: 'WhatsApp',
            icon: <Share2 className="size-3.5" />,
            tone: 'accent',
            onClick: () => copyShiftWhatsAppCall(eventTitle, shift, eventUrl),
          });
          quickActions.push({
            id: 'quick-copy',
            label: t('shift.copy'),
            icon: <Copy className="size-3.5" />,
            onClick: () => copyToClipboard(`${eventUrl}#shift-${shift.id}`, 'Schicht-Link'),
          });

          list.push({
            id: `shift-${shift.id}`,
            title: shift.title || shiftTime,
            subtitle: `${shiftTime} · ${shift.category || t('shift.general')} (${slotBadge})${isMyShift ? ` · ★ ${t('shift.assigned')}` : ''}`,
            section: 'SHIFTS',
            badge: isMyShift ? t('shift.myShift') : slotBadge,
            badgeTone: isMyShift
              ? 'success'
              : freeSlots > 0
                ? freeSlots <= 2
                  ? 'warning'
                  : 'accent'
                : 'neutral',
            icon: isMyShift ? (
              <CheckCircle2 className="size-4 text-success-ink" />
            ) : (
              <Ticket className="size-4 text-accent-ink" />
            ),
            keywords: [
              'schicht',
              shift.title || '',
              shift.category || '',
              shiftTime,
              freeSlots > 0 ? 'frei offen unbesetzt lücke' : 'voll',
              isMyShift ? 'meine einsatz ich' : '',
              activeSlug,
              eventTitle,
            ],
            onSelect: () => {
              recordRecentCommand(`shift-${shift.id}`);
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(shift.id);
                }
                const el = document.getElementById(`shift-${shift.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${shift.id}#shift-${shift.id}`);
              }
              close();
            },
            subActions: shiftSubActions,
            preview: {
              type: 'SHIFT',
              shift: {
                id: shift.id,
                title: shift.title,
                startTime: shift.startTime,
                endTime: shift.endTime,
                requiredSlots: shift.requiredSlots,
                category: shift.category,
                description: shift.description,
                signups: (shift.signups || []).map((su) => ({
                  id: su.id,
                  displayName: su.displayName,
                  userId: su.userId,
                  attendance: attendanceOverrides[su.id] ?? su.attendance,
                  isSelf: user ? su.userId === user.id : false,
                })),
              },
              quickActions,
              details: [
                { label: t('shift.time'), value: shiftTime },
                { label: t('shift.category'), value: shift.category || t('shift.general') },
                { label: t('ctx.openSpots'), value: t('shift.freeOf', { free: freeSlots, total: shift.requiredSlots }) },
                ...(shift.signups?.length
                  ? [{ label: t('shift.assigned'), value: shift.signups.map((s) => s.displayName).join(', ') }]
                  : []),
              ],
            },
          });
        }
      }
    }

    // =========================================================================
    // 2. SCHNELLAKTIONEN (GLOBAL)
    // =========================================================================
    if (can('EVENTS_CREATE') || isDeptAdmin) {
      list.push({
        id: 'action-create-event',
        title: t('admin.newEvent'),
        subtitle: t('admin.newEventSubtitle'),
        section: 'ACTIONS',
        icon: <CalendarPlus className="size-4 text-accent-ink" />,
        keywords: ['anlass', 'event', 'neu', 'erstellen', 'veranstaltung'],
        onSelect: () => {
          recordRecentCommand('action-create-event');
          if (pathname === '/') {
            const url = new URL(window.location.href);
            url.searchParams.set('createEvent', '1');
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
          } else {
            router.push('/?createEvent=1');
          }
          close();
        },
      });
    }

    if (can('DEPARTMENT_SETTINGS') || isDeptAdmin) {
      list.push({
        id: 'action-dept-settings',
        title: t('admin.editUnit', { unit: org.unitTerm }),
        subtitle: t('admin.editUnitSubtitle'),
        section: 'ACTIONS',
        icon: <Settings2 className="size-4 text-accent-ink" />,
        keywords: ['abteilung', 'einstellungen', 'logo', 'farbe', 'design'],
        onSelect: () => {
          recordRecentCommand('action-dept-settings');
          router.push('/?settings=1');
          close();
        },
      });
    }

    if (can('STUFEN_MANAGE') || isDeptAdmin) {
      list.push({
        id: 'action-manage-stufen',
        title: t('admin.levels'),
        subtitle: t('admin.levelsSubtitle', { provider: org.authProviderShort || t('admin.association') }),
        section: 'ACTIONS',
        icon: <Wrench className="size-4 text-accent-ink" />,
        keywords: ['stufen', 'gruppen', ...(org.authProviderShort ? [org.authProviderShort.toLowerCase()] : []), 'verwalten'],
        onSelect: () => {
          recordRecentCommand('action-manage-stufen');
          router.push('/?stufen=1');
          close();
        },
      });
    }

    if (can('PEOPLE_MANAGE') || isDeptAdmin) {
      list.push({
        id: 'action-manage-people',
        title: t('admin.people'),
        subtitle: t('admin.peopleSubtitle'),
        section: 'ACTIONS',
        icon: <UserCheck className="size-4 text-accent-ink" />,
        keywords: ['personen', 'rechte', 'rollen', 'mitglieder', 'admin'],
        onSelect: () => {
          recordRecentCommand('action-manage-people');
          router.push('/?people=1');
          close();
        },
      });
    }

    if (can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS') || isDeptAdmin) {
      list.push({
        id: 'action-dept-stats',
        title: t('admin.stats'),
        subtitle: t('admin.statsSubtitle'),
        section: 'ACTIONS',
        icon: <BarChart3 className="size-4 text-accent-ink" />,
        keywords: ['statistik', 'gv', 'jahresbericht', 'helferstunden', 'ehrentafel', 'stufen', 'ranking', 'auswertung', 'stunden'],
        onSelect: () => {
          recordRecentCommand('action-dept-stats');
          router.push('/?stats=1');
          close();
        },
      });
    }

    // Globale E-Mail-Verteiler-Aktion
    if (canViewPeople && people.length > 0) {
      list.push({
        id: 'action-copy-dept-emails',
        title: t('admin.copyMemberEmails'),
        subtitle: t('admin.copyMemberEmailsSubtitle', { count: people.filter((p) => p.email).length }),
        section: 'ACTIONS',
        icon: <Mail className="size-4 text-accent-ink" />,
        keywords: ['mail', 'verteiler', 'abteilung', 'alle', 'rundmail'],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand('action-copy-dept-emails');
          const emails = Array.from(new Set(people.map((p) => p.email?.trim()).filter(Boolean)));
          if (emails.length === 0) {
            toast({ title: t('text.noEmails'), tone: 'info' });
            return;
          }
          copyToClipboard(emails.join(', '), t('admin.memberEmails', { count: emails.length }));
        },
      });
    }

    // Direkter WhatsApp-Chat per Handynummer
    list.push({
      id: 'action-direct-whatsapp',
      title: t('admin.waDirect'),
      subtitle: t('admin.waDirectSubtitle'),
      section: 'ACTIONS',
      icon: <MessageSquare className="size-4 text-success-ink" />,
      keywords: ['whatsapp', 'chat', 'nachricht', 'schreiben', 'direktchat', 'kontakt', 'handy', 'wa', 'message'],
      closeOnSelect: false,
      onSelect: () => {
        recordRecentCommand('action-direct-whatsapp');
        const input = window.prompt(t('admin.waDirectPrompt'));
        if (input?.trim()) {
          openWhatsAppDirect(input.trim());
        }
      },
    });

    // =========================================================================
    // 3. ANLÄSSE DER ABTEILUNG (MIT KALENDER, WHATSAPP, TEILEN & EXPORT)
    // =========================================================================
    for (const event of allEvents) {
      const status = eventStatus(event);
      const statusBadge = status === 'past' ? t('event.past') : status === 'live' ? t('event.live') : t('event.upcoming');
      const badgeTone: BadgeTone = status === 'past' ? 'neutral' : status === 'live' ? 'accent' : 'success';
      const eventUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/events/${event.slug}`
          : `/events/${event.slug}`;
      const dateText = fmtShortDate(event.startDate);

      const eventQuickActions: CommandQuickAction[] = [
        {
          id: 'quick-ics',
          label: t('event.calendarIcs'),
          icon: <Download className="size-3.5" />,
          onClick: () => handleDownloadIcs(event),
        },
        {
          id: 'quick-gcal',
          label: t('event.googleCalendar'),
          icon: <ExternalLink className="size-3.5" />,
          onClick: () => handleGoogleCalendar(event),
        },
        {
          id: 'quick-link',
          label: t('ctx.copyLink'),
          icon: <Copy className="size-3.5" />,
          onClick: () => copyToClipboard(eventUrl, 'Anlass-Link'),
        },
      ];

      const eventSubActions: CommandSubAction[] = [
        {
          id: 'open-event',
          title: t('event.goTo'),
          subtitle: t('event.goToSubtitle'),
          icon: <Ticket className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}`);
            close();
          },
        },
        {
          id: 'download-ics',
          title: t('event.downloadIcs'),
          subtitle: t('event.downloadIcsSubtitle'),
          icon: <Download className="size-3.5 text-accent-ink" />,
          closeOnSelect: false,
          onSelect: () => handleDownloadIcs(event),
        },
        {
          id: 'add-gcal',
          title: t('ctx.addGoogle'),
          subtitle: t('event.addGoogleSubtitle'),
          icon: <ExternalLink className="size-3.5 text-accent-ink" />,
          closeOnSelect: false,
          onSelect: () => handleGoogleCalendar(event),
        },
        {
          id: 'copy-link',
          title: t('ctx.copyEventLink'),
          subtitle: eventUrl,
          icon: <Copy className="size-3.5" />,
          closeOnSelect: false,
          onSelect: () => copyToClipboard(eventUrl, 'Anlass-Link'),
        },
      ];

      if (can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin) {
        eventSubActions.push({
          id: 'open-ok',
          title: t('event.openOk'),
          subtitle: t('event.openOkSubtitle'),
          icon: <LayoutDashboard className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}/ok`);
            close();
          },
        });
        eventSubActions.push({
          id: 'open-export',
          title: t('event.export'),
          subtitle: t('event.exportSubtitle'),
          icon: <Download className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}/ok/export`);
            close();
          },
        });
      }

      eventSubActions.push({
        id: 'open-checkin',
        title: t('ctx.checkin'),
        subtitle: t('event.checkinSubtitle'),
        icon: <ClipboardCheck className="size-3.5" />,
        onSelect: () => {
          router.push(`/events/${event.slug}/checkin`);
          close();
        },
      });

      list.push({
        id: `event-${event.id}`,
        title: event.title,
        subtitle: `${dateText} · ${statusBadge}`,
        section: 'EVENTS',
        badge: statusBadge,
        badgeTone,
        icon: <CalendarDays className="size-4 text-accent-ink" />,
        keywords: ['anlass', 'event', event.title, event.slug, dateText, statusBadge],
        onSelect: () => {
          recordRecentCommand(`event-${event.id}`);
          router.push(`/events/${event.slug}`);
          close();
        },
        subActions: eventSubActions,
        preview: {
          type: 'EVENT',
          event,
          quickActions: eventQuickActions,
          details: [
            { label: t('event.date'), value: `${fmtShortWeekday(event.startDate)} ${fmtShortDate(event.startDate)}` },
            { label: t('event.status'), value: statusBadge },
            { label: 'Slug', value: event.slug },
          ],
        },
      });
    }

    // =========================================================================
    // 4. PERSONEN & HELFENDE (UNIFIZIERT MIT SCHICHTEN & DIREKT-AKTIONEN)
    // =========================================================================
    if (canViewPeople || detailedEvent?.shifts?.length) {
      interface HelperShiftEntry {
        shiftId: string;
        signupId: string;
        title: string;
        taskTitle?: string | null;
        startTime: string;
        endTime: string;
        category?: string | null;
        attendance?: 'PRESENT' | null;
      }

      const eventSignupsByHelper = new Map<string, HelperShiftEntry[]>();
      const guestHelpers = new Map<
        string,
        {
          id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          shifts: HelperShiftEntry[];
        }
      >();

      if (detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          for (const signup of shift.signups ?? []) {
            const curAtt =
              attendanceOverrides[signup.id] ??
              (signup as unknown as { attendance?: 'PRESENT' | null }).attendance ??
              null;
            const entry: HelperShiftEntry = {
              shiftId: shift.id,
              signupId: signup.id,
              title: shift.title || fmtTimeRange(shift.startTime, shift.endTime),
              taskTitle: signup.taskTitle,
              startTime: shift.startTime,
              endTime: shift.endTime,
              category: shift.category,
              attendance: curAtt,
            };

            if (signup.userId) {
              const existing = eventSignupsByHelper.get(signup.userId) ?? [];
              existing.push(entry);
              eventSignupsByHelper.set(signup.userId, existing);
            } else {
              const gKey = `guest:${signup.guestName || signup.displayName || signup.id}`;
              const existingGuest = guestHelpers.get(gKey) ?? {
                id: signup.id,
                name: signup.displayName,
                email: signup.guestEmail,
                phone: signup.guestPhone,
                shifts: [],
              };
              existingGuest.shifts.push(entry);
              guestHelpers.set(gKey, existingGuest);
            }
          }
        }
      }

      interface UnifiedPerson {
        id: string;
        name: string;
        firstName?: string;
        lastName?: string | null;
        ceviName?: string | null;
        email?: string | null;
        phone?: string | null;
        role?: string | null;
        stufen?: { name: string }[];
        shifts: HelperShiftEntry[];
        isGuest?: boolean;
      }

      const unifiedPeople: UnifiedPerson[] = [];

      // 1. Abteilungsmitglieder
      for (const person of people) {
        const pName = displayName(person);
        const pShifts = eventSignupsByHelper.get(person.id) ? [...eventSignupsByHelper.get(person.id)!] : [];

        // Zusätzliche Namens-Matches prüfen falls userId nicht verknüpft war
        if (pShifts.length === 0 && detailedEvent?.shifts?.length) {
          for (const [key, g] of guestHelpers.entries()) {
            if (
              g.name.toLowerCase() === pName.toLowerCase() ||
              (person.ceviName && g.name.toLowerCase() === person.ceviName.toLowerCase()) ||
              (person.email && g.email && person.email.toLowerCase() === g.email.toLowerCase())
            ) {
              pShifts.push(...g.shifts);
              guestHelpers.delete(key);
            }
          }
        }

        unifiedPeople.push({
          id: person.id,
          name: pName,
          firstName: person.firstName,
          lastName: person.lastName,
          ceviName: person.ceviName,
          email: person.email,
          phone: person.phone,
          role: person.role,
          stufen: person.stufen,
          shifts: pShifts,
        });
      }

      // 2. Gast-Helfer aus dem aktuellen Anlass, die noch nicht zugeordnet wurden
      for (const [, guest] of guestHelpers) {
        unifiedPeople.push({
          id: `guest-${guest.id}`,
          name: guest.name,
          firstName: guest.name,
          email: guest.email,
          phone: guest.phone,
          role: 'Gast-Helfer',
          shifts: guest.shifts,
          isGuest: true,
        });
      }

      // 3. Weitere angemeldete Helfende des aktuellen Anlasses (falls nicht in people)
      for (const [userId, shifts] of eventSignupsByHelper.entries()) {
        if (!unifiedPeople.some((p) => p.id === userId)) {
          const firstSignup = detailedEvent?.shifts
            ?.flatMap((s) => s.signups ?? [])
            .find((su) => su.userId === userId);
          if (firstSignup) {
            unifiedPeople.push({
              id: userId,
              name: firstSignup.displayName,
              firstName: firstSignup.userFirstName || firstSignup.displayName,
              lastName: firstSignup.userLastName,
              ceviName: firstSignup.userCeviName,
              email: firstSignup.userEmail || null,
              phone: firstSignup.userPhone || null,
              role: 'Helfer*in',
              shifts,
            });
          }
        }
      }

      // Sortieren: Helfer mit Schichten im aktuellen Anlass ZUERST!
      unifiedPeople.sort((a, b) => {
        if (a.shifts.length > 0 && b.shifts.length === 0) return -1;
        if (a.shifts.length === 0 && b.shifts.length > 0) return 1;
        if (a.shifts.length !== b.shifts.length) return b.shifts.length - a.shifts.length;
        return compareSwissText(a.name, b.name);
      });

      // CommandItems erzeugen
      for (const person of unifiedPeople) {
        const personShifts = person.shifts;
        const hasShifts = personShifts.length > 0;
        const presentCount = personShifts.filter((s) => s.attendance === 'PRESENT').length;
        const allPresent = hasShifts && presentCount === personShifts.length;

        let badgeText: string | undefined = undefined;
        let badgeTone: BadgeTone = 'neutral';

        if (hasShifts) {
          if (allPresent) {
            badgeText = t('person.presentAll', { count: personShifts.length });
            badgeTone = 'success';
          } else if (presentCount > 0) {
            badgeText = t('person.presentPartial', { present: presentCount, total: personShifts.length });
            badgeTone = 'warning';
          } else {
            badgeText = `${t('person.shiftCount', { count: personShifts.length })}`;
            badgeTone = 'accent';
          }
        } else if (activeEvent && prefixMode === 'PEOPLE') {
          badgeText = t('person.shiftCount', { count: 0 });
          badgeTone = 'neutral';
        }

        let subtitleText = '';
        if (hasShifts) {
          const shiftSummaries = personShifts
            .slice(0, 2)
            .map((s) => `${shiftName(s)} (${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)})`);
          subtitleText = `${t('person.shiftCount', { count: personShifts.length })}: ${shiftSummaries.join(', ')}${personShifts.length > 2 ? ` ${t('person.more', { count: personShifts.length - 2 })}` : ''}`;
        } else if (activeEvent) {
          subtitleText = `${t('person.noShiftsIn', { event: activeEvent.title })} · ${person.ceviName ? `«${person.ceviName}»` : person.role || t('person.member')}`;
        } else {
          subtitleText = `${person.ceviName ? `«${person.ceviName}» · ` : ''}${person.email || person.phone || person.role || t('person.member')}`;
        }

        const canManageCurrent = can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin;

        // Subaktionen für Person
        const personSubActions: CommandSubAction[] = [];

        // 1. Direktaktion: Check-in Toggle für alle Schichten
        if (hasShifts && canManageCurrent) {
          personSubActions.push({
            id: 'toggle-checkin-all',
            title: allPresent
              ? t('person.resetAttendance', { name: person.name })
              : t('person.checkInAll', { shifts: t('person.shiftCount', { count: personShifts.length }) }),
            subtitle: t('person.checkedInOf', { present: presentCount, total: personShifts.length }),
            icon: allPresent ? (
              <RotateCcw className="size-3.5" />
            ) : (
              <CheckCircle2 className="size-3.5 text-success-ink" />
            ),
            closeOnSelect: false,
            onSelect: async () => {
              for (const s of personShifts) {
                await toggleAttendance(s.signupId, person.name, allPresent ? 'PRESENT' : null);
              }
            },
          });
        }

        // 2. Aktionen für jede einzelne übernommene Schicht
        for (const s of personShifts) {
          const isPres = s.attendance === 'PRESENT';
          personSubActions.push({
            id: `person-shift-${s.shiftId}-${s.signupId}`,
            title: t('person.shiftTitle', { shift: `${s.title?.trim() || s.taskTitle || shiftName(s)}${s.title?.trim() && s.taskTitle ? ` (${s.taskTitle})` : ''}` }),
            subtitle: `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}${s.category ? ` · ${s.category}` : ''} · ${isPres ? t('checkedIn') : t('person.stillOpen')}`,
            icon: <CalendarDays className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(s.shiftId);
                }
                const el = document.getElementById(`shift-${s.shiftId}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${s.shiftId}#shift-${s.shiftId}`);
              }
              close();
            },
          });

          if (canManageCurrent) {
            personSubActions.push({
              id: `toggle-single-att-${s.signupId}`,
              title: isPres ? t('person.resetShiftAttendance', { shift: s.title }) : t('person.markShiftPresent', { shift: s.title }),
              icon: isPres ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => toggleAttendance(s.signupId, person.name, isPres ? 'PRESENT' : null),
            });
          }
        }

        // 3. Direkte Kommunikation (WhatsApp immer an erster Stelle)
        if (person.phone) {
          personSubActions.push({
            id: 'wa-chat',
            title: t('person.waTo', { name: person.firstName || person.name }),
            subtitle: t('person.directChat', { phone: person.phone }),
            icon: <MessageSquare className="size-3.5 text-success-ink" />,
            closeOnSelect: false,
            onSelect: () => openWhatsAppDirect(person.phone!, person.firstName),
          });

          personSubActions.push({
            id: 'call-phone',
            title: t('person.call', { phone: person.phone }),
            icon: <Phone className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              window.location.href = `tel:${person.phone}`;
            },
          });

          personSubActions.push({
            id: 'sms-phone',
            title: t('person.sms', { phone: person.phone }),
            icon: <Phone className="size-3.5" />,
            onSelect: () => openSmsDirect(person.phone!),
          });

          personSubActions.push({
            id: 'copy-phone',
            title: t('person.copyPhone'),
            subtitle: person.phone,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => copyToClipboard(person.phone!, t('person.phoneLabel')),
          });
        } else {
          personSubActions.push({
            id: 'wa-chat-prompt',
            title: t('person.waTo', { name: person.firstName || person.name }),
            subtitle: t('person.noMobile'),
            icon: <MessageSquare className="size-3.5 text-success-ink" />,
            closeOnSelect: false,
            onSelect: () => {
              const input = window.prompt(
                t('person.phonePrompt', { name: person.firstName || person.name })
              );
              if (input?.trim()) {
                openWhatsAppDirect(input.trim(), person.firstName);
              }
            },
          });
        }

        if (person.email) {
          personSubActions.push({
            id: 'send-email',
            title: t('person.emailTo', { email: person.email }),
            icon: <Mail className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              window.location.href = `mailto:${person.email}`;
            },
          });

          personSubActions.push({
            id: 'copy-email',
            title: t('person.copyEmail'),
            subtitle: person.email,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => copyToClipboard(person.email!, 'E-Mail'),
          });
        }

        // 4. Navigation & Einteilung
        if (activeSlug && canManageCurrent) {
          personSubActions.push({
            id: 'assign-shift',
            title: t('person.assign'),
            subtitle: t('person.assignSubtitle', { event: activeEvent?.title || t('person.eventFallback') }),
            icon: <UserPlus className="size-3.5" />,
            onSelect: () => {
              if (contextData.onOpenAssignModal) {
                contextData.onOpenAssignModal();
              } else {
                router.push(`/events/${activeSlug}/ok/schichten`);
              }
              close();
            },
          });

          personSubActions.push({
            id: 'view-ok-helpers',
            title: t('person.openInOk'),
            subtitle: t('person.openInOkSubtitle', { name: person.name }),
            icon: <Users className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              router.push(`/events/${activeSlug}/ok/helfende?search=${encodeURIComponent(person.name)}`);
              close();
            },
          });
        }

        // QuickActions für Desktop-Vorschau
        const personQuickActions: CommandQuickAction[] = [
          {
            id: 'p-wa',
            label: 'WhatsApp',
            icon: <MessageSquare className="size-3.5" />,
            tone: 'success',
            onClick: () => {
              if (person.phone) {
                openWhatsAppDirect(person.phone, person.firstName);
              } else {
                const input = window.prompt(
                  t('person.phonePrompt', { name: person.firstName || person.name })
                );
                if (input?.trim()) {
                  openWhatsAppDirect(input.trim(), person.firstName);
                }
              }
            },
          },
        ];
        if (person.phone) {
          personQuickActions.push({
            id: 'p-call',
            label: t('person.callShort'),
            icon: <Phone className="size-3.5" />,
            onClick: () => {
              window.location.href = `tel:${person.phone}`;
            },
          });
        }
        if (person.email) {
          personQuickActions.push({
            id: 'p-mail',
            label: 'E-Mail',
            icon: <Mail className="size-3.5" />,
            onClick: () => {
              window.location.href = `mailto:${person.email}`;
            },
          });
        }

        const item: CommandItem = {
          id: `person-${person.id}`,
          title: person.name,
          subtitle: subtitleText,
          section: 'PEOPLE',
          badge: badgeText,
          badgeTone,
          icon: allPresent ? (
            <CheckCircle2 className="size-4 text-success-ink" />
          ) : hasShifts ? (
            <UserRound className="size-4 text-accent-ink" />
          ) : (
            <UserRound className="size-4 text-fg-subtle" />
          ),
          keywords: [
            'person',
            'helfer',
            'whatsapp',
            'wa',
            'chat',
            'nachricht',
            'sms',
            'telefon',
            'kontakt',
            person.name,
            person.firstName || '',
            person.lastName || '',
            person.ceviName || '',
            person.email || '',
            person.phone || '',
            ...(hasShifts ? ['schichten', 'eingeteilt', ...personShifts.map((s) => s.title)] : []),
          ],
          onSelect: () => {
            recordRecentCommand(`person-${person.id}`);
            setActiveSubActionItem(item);
          },
          subActions: personSubActions,
          preview: {
            type: 'PERSON',
            person: {
              id: person.id,
              name: person.name,
              ceviName: person.ceviName,
              email: person.email,
              phone: person.phone,
              role: person.role || (hasShifts ? t('person.assignedCount', { count: personShifts.length }) : t('person.member')),
              stufen: person.stufen?.map((s) => s.name),
              shifts: personShifts.map((s) => ({
                id: s.shiftId,
                signupId: s.signupId,
                title: s.title,
                time: `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`,
                category: s.category,
                attendance: s.attendance,
              })),
            },
            quickActions: personQuickActions,
            details: [
              { label: t('person.name'), value: `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.name },
              ...(person.ceviName ? [{ label: org.nicknameTerm, value: person.ceviName }] : []),
              ...(person.email ? [{ label: 'E-Mail', value: person.email }] : []),
              ...(person.phone ? [{ label: t('person.phone'), value: person.phone }] : []),
              ...(activeEvent
                ? [
                    {
                      label: t('person.shifts'),
                      value: hasShifts
                        ? `${t('person.shiftCount', { count: personShifts.length })}`
                        : t('person.noShifts'),
                    },
                  ]
                : []),
            ],
          },
        };

        list.push(item);
      }
    }

    // =========================================================================
    // 5. NAVIGATION (SEITEN & PORTAL)
    // =========================================================================
    list.push({
      id: 'nav-home',
      title: t('nav.home'),
      subtitle: t('nav.homeSubtitle', { name: department?.name || org.unitTerm }),
      section: 'NAVIGATION',
      icon: <CalendarDays className="size-4" />,
      keywords: ['start', 'home', 'anlässe', 'events', 'abteilung'],
      onSelect: () => {
        recordRecentCommand('nav-home');
        router.push('/');
        close();
      },
    });

    list.push({
      id: 'nav-my-shifts',
      title: t('nav.myShifts'),
      subtitle: t('nav.myShiftsSubtitle'),
      section: 'NAVIGATION',
      icon: <Ticket className="size-4" />,
      keywords: ['meine', 'schichten', 'einsätze', 'termine', 'helfer'],
      onSelect: () => {
        recordRecentCommand('nav-my-shifts');
        router.push('/meine-schichten');
        close();
      },
      subActions: [
        {
          id: 'open-my-shifts',
          title: t('nav.openMyShifts'),
          icon: <Ticket className="size-3.5" />,
          onSelect: () => {
            router.push('/meine-schichten');
            close();
          },
        },
      ],
    });

    if (user) {
      list.push({
        id: 'nav-profile',
        title: t('nav.profile'),
        subtitle: t('nav.profileSubtitle', { name: displayName(user) }),
        section: 'NAVIGATION',
        icon: <UserRound className="size-4" />,
        keywords: ['profil', 'konto', 'name', 'einstellungen', 'telefon', 'mail'],
        onSelect: () => {
          recordRecentCommand('nav-profile');
          window.location.href = getLandingUrl('/profil');
          close();
        },
      });
    }

    const helpBase = `https://hilfe.${org.domain}`;
    const statusBase = `https://status.${org.domain}`;

    list.push({
      id: 'nav-help',
      title: t('nav.help'),
      subtitle: t('nav.helpSubtitle', { lead: org.leadTerm }),
      section: 'NAVIGATION',
      icon: <LifeBuoy className="size-4" />,
      keywords: ['hilfe', 'anleitung', 'support', 'doku', 'faq'],
      onSelect: () => {
        window.open(helpBase, '_blank', 'noopener,noreferrer');
        close();
      },
      subActions: [
        {
          id: 'help-external',
          title: t('nav.newTab'),
          icon: <ExternalLink className="size-3.5" />,
          onSelect: () => {
            window.open(helpBase, '_blank');
          },
        },
      ],
    });

    list.push({
      id: 'nav-status',
      title: t('nav.status'),
      subtitle: t('nav.statusSubtitle'),
      section: 'NAVIGATION',
      icon: <ExternalLink className="size-4" />,
      keywords: ['status', 'uptime', 'server', 'betrieb'],
      onSelect: () => {
        window.open(statusBase, '_blank', 'noopener,noreferrer');
        close();
      },
    });

    // =========================================================================
    // 6. SYSTEM & THEME
    // =========================================================================
    list.push({
      id: 'system-theme-dark',
      title: t('nav.dark'),
      subtitle: t('nav.darkSubtitle'),
      section: 'SYSTEM',
      icon: <Moon className="size-4" />,
      keywords: ['dark', 'dunkel', 'nacht', 'theme', 'design', 'schwarz'],
      onSelect: () => setTheme('dark'),
    });

    list.push({
      id: 'system-theme-light',
      title: t('nav.light'),
      subtitle: t('nav.lightSubtitle'),
      section: 'SYSTEM',
      icon: <Sun className="size-4" />,
      keywords: ['light', 'hell', 'tag', 'theme', 'design', 'weiss'],
      onSelect: () => setTheme('light'),
    });

    list.push({
      id: 'system-theme-system',
      title: t('nav.system'),
      subtitle: t('nav.systemSubtitle'),
      section: 'SYSTEM',
      icon: <Sparkles className="size-4" />,
      keywords: ['system', 'automatisch', 'theme', 'design'],
      onSelect: () => setTheme('system'),
    });

    if (user) {
      list.push({
        id: 'system-logout',
        title: t('nav.logout'),
        subtitle: t('nav.logoutSubtitle', { name: displayName(user) }),
        section: 'SYSTEM',
        icon: <LogOut className="size-4 text-danger-ink" />,
        keywords: ['abmelden', 'logout', 'ausloggen', 'verlassen'],
        onSelect: () => {
          logout();
          close();
        },
      });
    } else {
      list.push({
        id: 'system-login',
        title: t('nav.login'),
        subtitle: org.authProviderShort ? t('nav.loginWith', { provider: org.authProviderShort }) : t('nav.loginEmail'),
        section: 'SYSTEM',
        icon: <LogIn className="size-4 text-accent-ink" />,
        keywords: ['anmelden', 'login', 'einloggen', ...(org.authProviderShort ? [org.authProviderShort.toLowerCase()] : [])],
        onSelect: () => {
          window.location.href = loginHref;
          close();
        },
      });
    }

    return list;
  }, [
    prefixMode,
    activeSlug,
    activeEvent,
    detailedEvent,
    isOkArea,
    contextData,
    attendanceOverrides,
    allEvents,
    people,
    canViewPeople,
    department,
    user,
    can,
    isDeptAdmin,
    pathname,
    router,
    close,
    setActiveSubActionItem,
    loginHref,
    logout,
  ]);

  // Fuzzy-Suche & Relevanz-Berechnung
  const filteredItems = useMemo(() => {
    // Wenn im Hilfe-Modus, direkt alle Hilfe-Items zurückgeben
    if (prefixMode === 'HELP') return items;

    // Präfix-Filterung nach Sektion
    let pool = items;
    if (prefixMode === 'PEOPLE') pool = items.filter((i) => i.section === 'PEOPLE');
    else if (prefixMode === 'EVENTS') pool = items.filter((i) => i.section === 'EVENTS');
    else if (prefixMode === 'SHIFTS') pool = items.filter((i) => i.section === 'SHIFTS');

    const q = cleanQuery.trim().toLowerCase();

    // Wenn keine Suchanfrage eingetippt ist
    if (!q) {
      // Wenn im Präfix-Modus, zeige den gesamten Bereich
      if (prefixMode !== 'ALL') return pool;

      // Wenn normal leer: Zuletzt verwendete Befehle an den Anfang setzen
      const recentIds = getRecentCommandIds();
      const recentItems: CommandItem[] = [];

      for (const rId of recentIds) {
        const found = items.find((i) => i.id === rId);
        if (found && !recentItems.some((r) => r.id === found.id)) {
          recentItems.push({
            ...found,
            id: `recent-${found.id}`,
            section: 'RECENT',
            subtitle: `Zuletzt verwendet · ${found.subtitle || ''}`,
            onSelect: found.onSelect,
          });
        }
      }

      if (recentItems.length > 0) {
        return [...recentItems, ...items];
      }

      return items;
    }

    const terms = q.split(/\s+/).filter(Boolean);

    interface ScoredItem {
      item: CommandItem;
      score: number;
    }

    const scored: ScoredItem[] = [];

    for (const item of pool) {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const subLower = (item.subtitle || '').toLowerCase();
      const kwString = (item.keywords || []).join(' ').toLowerCase();

      // Prüfe jedes Suchwort
      let allTermsMatched = true;

      for (const term of terms) {
        let termScore = 0;

        if (titleLower === term) {
          termScore += 120;
        } else if (titleLower.startsWith(term)) {
          termScore += 80;
        } else if (titleLower.includes(` ${term}`)) {
          termScore += 60;
        } else if (titleLower.includes(term)) {
          termScore += 40;
        } else if (subLower.includes(term)) {
          termScore += 25;
        } else if (kwString.includes(term)) {
          termScore += 20;
        } else {
          // Akronym-Match (z. B. "soli" für "Sommer Lager")
          const initials = titleLower
            .split(/[\s-]+/)
            .map((w) => w[0])
            .join('');
          if (initials.includes(term)) {
            termScore += 30;
          } else {
            allTermsMatched = false;
            break;
          }
        }

        termScore += termScore;
      }

      if (allTermsMatched && score >= 0) {
        // Bonus für Kontext-Sektion
        if (item.section === 'CONTEXT') score += 50;
        else if (item.section === 'ACTIONS') score += 20;
        else if (item.section === 'EVENTS') score += 15;

        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [items, cleanQuery, prefixMode]);

  // Sektionen gruppieren
  const groupedSections = useMemo(() => {
    const sectionLabels: Record<CommandSection, string> = {
      RECENT: t('sectionRecent'),
      CONTEXT: activeEvent ? t('sectionContextWithEvent', { title: activeEvent.title }) : t('sectionContextDefault'),
      ACTIONS: t('sectionActions'),
      EVENTS: t('sectionEvents'),
      SHIFTS: t('sectionShifts'),
      PEOPLE: t('sectionPeople'),
      NAVIGATION: t('sectionNavigation'),
      HELP: t('sectionHelp'),
      SYSTEM: t('sectionSystem'),
    };

    const sectionOrder: CommandSection[] = [
      'RECENT',
      'CONTEXT',
      'ACTIONS',
      'EVENTS',
      'SHIFTS',
      'PEOPLE',
      'NAVIGATION',
      'HELP',
      'SYSTEM',
    ];

    const groups: { section: CommandSection; label: string; items: CommandItem[] }[] = [];

    for (const sec of sectionOrder) {
      const secItems = filteredItems.filter((i) => i.section === sec);
      if (secItems.length > 0) {
        groups.push({
          section: sec,
          label: sectionLabels[sec],
          items: secItems,
        });
      }
    }

    return groups;
  }, [filteredItems, activeEvent, t]);

  return {
    items: filteredItems,
    groupedSections,
    activeEvent,
    isOkArea,
    prefixMode,
    cleanQuery,
  };
}
