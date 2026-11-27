'use client';

import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, AlertTriangle, CalendarPlus, Check, ChevronDown, Crown, LifeBuoy, Loader2, Palette, Plus, QrCode, Shield, Trash2, Users, UtensilsCrossed, X } from 'lucide-react';
import {
  ATTENDANCE_MODES,
  REPLACEMENT_CUTOFF_HOURS,
  STAFF_PIN_MIN_LENGTH,
  helpUrl,
  toZurichInput,
  zurichInputToIso,
  type AttendanceMode,
  type EventTemplateDto,
  type EventContactVisibility,
} from '@schichtplan/shared';
import { Badge, Button, Callout, Dialog, Field, Input, Select, Switch, Textarea, cn, useOrganization, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { BANNER_PRESETS } from './event-meta';
import { EMPTY_ACCESS, EventAccessFields, accessPayload, type EventAccessValues } from './EventAccessFields';
import { ImageUpload } from './ImageUpload';
import { questionDraft } from './ok/QuestionsEditor';
import { SectionBody, useSection } from './ok/SettingsSections';
import { PhysicalBonsManager } from './ok/PhysicalBonsManager';

/** Eingetippt, aber kürzer als erlaubt (leer heisst «kein PIN» und ist in Ordnung) */
function staffPinTooShort(pin: string): boolean {
  const trimmed = pin.trim();
  return trimmed.length > 0 && trimmed.length < STAFF_PIN_MIN_LENGTH;
}

export interface EventFormValues {
  title: string;
  slug: string;
  description: string;
  reminderNote: string;
  logoUrl: string;
  bannerUrl: string;
  /** Nur beim Anlegen: Tag des Anlasses (YYYY-MM-DD). Danach ergibt sich der Zeitraum aus den Schichten. */
  startDate: string;
  /** false = Eintragen geschlossen (nur noch das OK teilt ein) */
  allowPublicSignup: boolean;
  minShiftsPerPerson: number | null;
  cancelDeadlineDays: number | null;
  overlapToleranceMinutes: number;
  contactUserId: string | null;
  dayCutoffTime: string;
  responsibleMode: 'BY_SHIFT' | 'BY_DAY';
  contactVisibility: EventContactVisibility;
  signupOpensAt: string;
  attendanceMode: AttendanceMode;
  checkinEarlyMinutes: number;
  checkinLateMinutes: number;
  cateringTokensEnabled: boolean;
  cateringTokenItems: string[];
  cateringEarlyHours: number;
  cateringStaffPin: string;
  cateringRemindersEnabled: boolean;
  /** «Ersatz gesucht» erlaubt, bis so viele Stunden vor Schichtbeginn */
  allowReplacement: boolean;
  replacementCutoffHours: number;
  access: EventAccessValues;
}

/** Startwerte für «Design & Einstellungen» eines bestehenden Anlasses */
export function eventFormInitial(event: EventDetails): Partial<EventFormValues> {
  return {
    title: event.title,
    slug: event.slug,
    description: event.description ?? '',
    reminderNote: event.reminderNote ?? '',
    logoUrl: event.logoUrl ?? '',
    bannerUrl: event.bannerUrl ?? '',
    allowPublicSignup: event.allowPublicSignup,
    minShiftsPerPerson: event.minShiftsPerPerson ?? null,
    cancelDeadlineDays: event.cancelDeadlineDays ?? null,
    overlapToleranceMinutes: event.overlapToleranceMinutes ?? 15,
    contactUserId: event.contactUserId ?? null,
    dayCutoffTime: event.dayCutoffTime ?? '04:00',
    responsibleMode: event.responsibleMode ?? 'BY_SHIFT',
    contactVisibility: event.contactVisibility ?? 'BOTH',
    signupOpensAt: event.signupOpensAt ? toZurichInput(event.signupOpensAt) : '',
    attendanceMode: event.attendanceMode ?? 'OFF',
    checkinEarlyMinutes: event.checkinEarlyMinutes ?? 30,
    checkinLateMinutes: event.checkinLateMinutes ?? 30,
    cateringTokensEnabled: event.cateringTokensEnabled ?? false,
    cateringTokenItems: event.cateringTokenItems ?? ['1x Helfermenü', '1x Getränk'],
    cateringEarlyHours: event.cateringEarlyHours ?? 2,
    cateringStaffPin: event.cateringStaffPin ?? '',
    cateringRemindersEnabled: event.cateringRemindersEnabled ?? true,
    allowReplacement: event.allowReplacement ?? true,
    replacementCutoffHours: event.replacementCutoffHours ?? 0,
    access: {
      accessType: event.accessType,
      leadersOnly: event.leadersOnly,
      requiredFields: event.requiredFields,
      allowedDepartmentIds: event.allowedDepartments.map((d) => d.id),
      allowedStufeIds: event.allowedStufen.map((s) => s.id),
      questions: event.questions.map(questionDraft),
    },
  };
}

export interface FormOrganizer {
  userId?: string;
  ceviName?: string;
  email?: string;
  displayName: string;
  role: 'OK_LEAD' | 'OK_MEMBER';
  roleTitle?: string;
}

interface DeptMemberItem {
  id: string;
  userId: string;
  role: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  email?: string | null;
  displayName: string;
  /** Nur Cevi-Name-Profil: kann nicht ins OK */
  isCeviNameProfile?: boolean;
}

const EMPTY: EventFormValues = {
  title: '',
  slug: '',
  description: '',
  reminderNote: '',
  logoUrl: '',
  bannerUrl: BANNER_PRESETS[0].url,
  startDate: '',
  allowPublicSignup: true,
  minShiftsPerPerson: null,
  cancelDeadlineDays: null,
  overlapToleranceMinutes: 15,
  contactUserId: null,
  dayCutoffTime: '04:00',
  responsibleMode: 'BY_SHIFT',
  contactVisibility: 'BOTH',
  signupOpensAt: '',
  attendanceMode: 'OFF',
  checkinEarlyMinutes: 30,
  checkinLateMinutes: 30,
  cateringTokensEnabled: false,
  cateringTokenItems: ['1x Helfermenü', '1x Getränk'],
  cateringEarlyHours: 2,
  cateringStaffPin: '',
  cateringRemindersEnabled: true,
  allowReplacement: true,
  replacementCutoffHours: 0,
  access: EMPTY_ACCESS,
};

/** Tag aus <input type="date"> als Zeitpunkt: 12:00 Schweizer Zeit, damit er nie als Vortag erscheint */
const dayToIso = (day: string) => zurichInputToIso(`${day}T12:00`)!;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Ein Formular für "Neuer Anlass" (POST) und "Design & Einstellungen" (PATCH). */
export function EventFormDialog({
  open,
  onClose,
  onSaved,
  mode,
  initial,
  eventSlug,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (slug: string) => void;
  mode: 'create' | 'edit';
  initial?: Partial<EventFormValues>;
  eventSlug?: string;
}) {
  const t = useTranslations('web.eventForm');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={mode === 'create' ? <CalendarPlus /> : <Palette />}
      title={mode === 'create' ? t('createTitle') : t('editTitle')}
      description={
        mode === 'create'
          ? t('createDescription')
          : t('editDescription')
      }
    >
      <EventForm mode={mode} initial={initial} eventSlug={eventSlug} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

/** Abschnitt im Dialog: nur Überschrift */
function DialogSection({
  title,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h4 className="text-[13px] font-semibold text-fg">{title}</h4>
      {children}
    </section>
  );
}

/** Abschnitt auf der Einstellungs-Seite: eigene Karte mit Sprungmarke, seltene lassen sich einklappen */
function PageSection({
  id,
  title,
  description,
  summary,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  /** Eingeklappt: die wichtigsten Werte des Abschnitts */
  summary?: string;
  children: ReactNode;
}) {
  const { open, collapsible, setOpen } = useSection(id);
  const bodyId = `${id}-inhalt`;

  return (
    <section id={id} className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
      {collapsible ? (
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="flex w-full items-start justify-between gap-3 rounded-field text-left"
          >
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold text-fg">{title}</span>
              <span className="mt-0.5 block text-sm text-fg-muted">{open ? description : summary}</span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn('mt-1 size-5 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        </h3>
      ) : (
        <>
          <h3 className="font-display text-lg font-bold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </>
      )}
      <SectionBody id={bodyId} open={open} onFound={() => setOpen(true)}>
        {children}
      </SectionBody>
    </section>
  );
}

/** Stand des automatischen Speicherns in der Leiste unten */
function SaveStatus({
  saving,
  dirty,
  error,
  blocked,
  savedAt,
}: {
  saving: boolean;
  dirty: boolean;
  error: string | null;
  /** Warum gerade nicht automatisch gespeichert wird */
  blocked: string | null;
  savedAt: Date | null;
}) {
  const t = useTranslations('web.eventForm');
  const row = 'flex min-w-0 items-center gap-1.5 text-sm font-medium';
  if (saving) {
    return (
      <p role="status" className={cn(row, 'text-fg-muted')}>
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" /> {t('saveStatusSaving')}
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className={cn(row, 'text-danger-ink')}>
        <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" /> {error}
      </p>
    );
  }
  if (blocked) {
    return (
      <p role="status" className={cn(row, 'text-warning-ink')}>
        <AlertCircle aria-hidden className="size-4 shrink-0 text-warning" /> {blocked}
      </p>
    );
  }
  if (dirty) {
    return (
      <p role="status" className={cn(row, 'text-accent-ink')}>
        <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-accent" /> {t('saveStatusSaving')}
      </p>
    );
  }
  if (savedAt) {
    return (
      <p role="status" className={cn(row, 'text-success-ink')}>
        <Check aria-hidden className="size-4 shrink-0 text-success" /> {t('saveStatusSavedAt', { time: fmtTime(savedAt.toISOString()) })}
      </p>
    );
  }
  return <p className={cn(row, 'font-normal text-fg-subtle')}>{t('saveStatusAutoNotice')}</p>;
}

/**
 * Formular für «Neuer Anlass» (POST, im Dialog) und die Einstellungen eines Anlasses (PATCH,
 * im OK-Bereich als Seite mit `layout="page"`).
 */
export function EventForm({
  mode,
  initial,
  eventSlug,
  onCancel,
  onSaved,
  onAutoSaved,
  layout = 'dialog',
  dateRange,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<EventFormValues>;
  eventSlug?: string;
  /** Nur im Dialog: Auf der Seite ersetzt «Rückgängig» das Abbrechen */
  onCancel?: () => void;
  onSaved: (slug: string) => void;
  /** Nach dem automatischen Speichern auf der Seite */
  onAutoSaved?: () => void;
  layout?: 'dialog' | 'page';
  /** Bearbeiten: Anzeige des Zeitraums (aus den Schichten) mit «Verschieben» */
  dateRange?: ReactNode;
}) {
  const t = useTranslations('web.eventForm');
  const toast = useToast();
  const org = useOrganization();
  const { user } = usePortal();
  const tCatering = useTranslations('web.ok.catering');
  const [form, setForm] = useState<EventFormValues>(() => ({
    ...EMPTY,
    // Standard-Bons in der Sprache der Person, die den Anlass anlegt
    cateringTokenItems: [tCatering('defaultItemMeal'), tCatering('defaultItemDrink')],
    ...initial,
  }));
  const [saving, setSaving] = useState(false);
  const [newCateringItem, setNewCateringItem] = useState('');
  const addCateringItem = () => {
    const trimmed = newCateringItem.trim();
    if (!trimmed || form.cateringTokenItems.includes(trimmed)) return;
    set('cateringTokenItems', [...form.cateringTokenItems, trimmed]);
    setNewCateringItem('');
  };
  const removeCateringItem = (idx: number) => {
    set('cateringTokenItems', form.cateringTokenItems.filter((_, i) => i !== idx));
  };
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Nach einem Klick auf Speichern zur Fehlermeldung oben scrollen (nicht beim Auto-Speichern im Hintergrund)
  const [scrollToError, setScrollToError] = useState(false);
  useEffect(() => {
    if (!scrollToError || !error) return;
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollToError(false);
  }, [scrollToError, error]);
  const [slugTouched, setSlugTouched] = useState(false);
  const initialSlug = initial?.slug || eventSlug || '';

  // Auto-Save für Einstellungs-Seite (layout === 'page' && mode === 'edit')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify({ ...EMPTY, ...initial }));
  // Stand beim Öffnen der Seite: dorthin führt «Rückgängig», auch nach dem automatischen Speichern
  const openedSnapshotRef = useRef<string>(lastSavedSnapshotRef.current);

  const formSnapshot = JSON.stringify(form);
  const isDirty = formSnapshot !== lastSavedSnapshotRef.current;
  const changedSinceOpen = formSnapshot !== openedSnapshotRef.current;

  // Auto-Save Effect
  useEffect(() => {
    if (mode !== 'edit' || layout !== 'page' || !eventSlug) return;
    if (!isDirty || saving) return;

    // Slug-Änderung darf NIE im Hintergrund gespeichert werden (benötigt 10s Countdown)
    if (form.slug !== initialSlug) return;

    // Validierung: Mindestens Titel muss vorhanden sein
    if (!form.title.trim()) return;

    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      setError(null);
      try {
        const shared = {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          reminderNote: form.reminderNote.trim() || null,
          logoUrl: form.logoUrl.trim() || null,
          bannerUrl: form.bannerUrl.trim() || null,
          minShiftsPerPerson: form.minShiftsPerPerson ?? null,
          cancelDeadlineDays:
            form.cancelDeadlineDays !== null &&
            form.cancelDeadlineDays !== undefined &&
            (form.cancelDeadlineDays as unknown as string) !== ''
              ? Number(form.cancelDeadlineDays)
              : null,
          overlapToleranceMinutes: form.overlapToleranceMinutes ?? 15,
          contactUserId: form.contactUserId || null,
          dayCutoffTime: form.dayCutoffTime || '04:00',
          responsibleMode: form.responsibleMode,
          contactVisibility: form.contactVisibility,
          signupOpensAt: form.signupOpensAt ? zurichInputToIso(form.signupOpensAt) : null,
          attendanceMode: form.attendanceMode,
          checkinEarlyMinutes: form.checkinEarlyMinutes,
          checkinLateMinutes: form.checkinLateMinutes,
          cateringTokensEnabled: form.cateringTokensEnabled,
          cateringTokenItems: form.cateringTokenItems,
          cateringEarlyHours: form.cateringEarlyHours,
          // Zu kurzer PIN (noch beim Tippen oder ein alter kurzer PIN): nicht mitschicken, der bisherige bleibt
          ...(staffPinTooShort(form.cateringStaffPin) ? {} : { cateringStaffPin: form.cateringStaffPin.trim() || null }),
          cateringRemindersEnabled: form.cateringRemindersEnabled,
          allowReplacement: form.allowReplacement,
          replacementCutoffHours: form.replacementCutoffHours,
          ...accessPayload(form.access),
        };

        await api(`/api/events/${eventSlug}`, {
          method: 'PATCH',
          json: {
            ...shared,
            description: form.description.trim() || null,
            allowPublicSignup: form.allowPublicSignup,
          },
        });

        lastSavedSnapshotRef.current = JSON.stringify(form);
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
        onAutoSaved?.();
      } catch (err) {
        setAutoSaveStatus('error');
        setError(errorMessage(err));
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [form, isDirty, saving, mode, layout, eventSlug, initialSlug, onAutoSaved]);

  // Schutz beim Verlassen des Fensters mit ungespeicherten Daten
  useEffect(() => {
    if (layout !== 'page') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || autoSaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [layout, isDirty, autoSaveStatus]);

  // 10s Countdown bei Adress-Änderung eines bestehenden Events
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!showSlugWarning) return;
    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showSlugWarning]);

  // OK-Mitglieder für neues Event
  const [organizers, setOrganizers] = useState<FormOrganizer[]>([]);
  const [deptMembers, setDeptMembers] = useState<DeptMemberItem[]>([]);
  const [selectedMemberUserId, setSelectedMemberUserId] = useState('');
  const [customWho, setCustomWho] = useState('');
  const [newRole, setNewRole] = useState<'OK_LEAD' | 'OK_MEMBER'>('OK_MEMBER');
  const [newRoleTitle, setNewRoleTitle] = useState('');

  // Vorlagen
  const [templates, setTemplates] = useState<EventTemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Abteilungsmitglieder & Vorlagen laden
  useEffect(() => {
    api<DeptMemberItem[]>('/api/departments/current/members')
      .then(setDeptMembers)
      .catch(() => setDeptMembers([]));

    if (mode === 'create') {
      api<EventTemplateDto[]>('/api/event-templates')
        .then(setTemplates)
        .catch(() => setTemplates([]));
    }
  }, [mode]);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addOrganizer = () => {
    if (selectedMemberUserId) {
      const found = deptMembers.find((m) => m.userId === selectedMemberUserId);
      if (found) {
        if (organizers.some((o) => o.userId === found.userId)) {
          toast({ title: t('alreadyInOkTitle'), description: t('alreadyInOkDesc', { name: found.displayName }) });
          return;
        }
        setOrganizers((prev) => [
          ...prev,
          {
            userId: found.userId,
            displayName: found.displayName,
            role: newRole,
            roleTitle: newRoleTitle.trim() || undefined,
          },
        ]);
        setSelectedMemberUserId('');
        setNewRoleTitle('');
        return;
      }
    }

    const who = customWho.trim();
    if (who) {
      const isEmail = who.includes('@');
      setOrganizers((prev) => [
        ...prev,
        {
          ...(isEmail ? { email: who } : { ceviName: who }),
          displayName: who,
          role: newRole,
          roleTitle: newRoleTitle.trim() || undefined,
        },
      ]);
      setCustomWho('');
      setNewRoleTitle('');
    }
  };

  const removeOrganizer = (index: number) => {
    setOrganizers((prev) => prev.filter((_, i) => i !== index));
  };

  const executeSave = async (slugToSave?: string) => {
    setSaving(true);
    setError(null);
    try {
      const shared = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        reminderNote: form.reminderNote.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        minShiftsPerPerson: form.minShiftsPerPerson ?? null,
        cancelDeadlineDays:
          form.cancelDeadlineDays !== null &&
          form.cancelDeadlineDays !== undefined &&
          (form.cancelDeadlineDays as unknown as string) !== ''
            ? Number(form.cancelDeadlineDays)
            : null,
        overlapToleranceMinutes: form.overlapToleranceMinutes ?? 15,
        contactUserId: form.contactUserId || null,
        dayCutoffTime: form.dayCutoffTime || '04:00',
        responsibleMode: form.responsibleMode,
        contactVisibility: form.contactVisibility,
        signupOpensAt: form.signupOpensAt ? zurichInputToIso(form.signupOpensAt) : null,
        attendanceMode: form.attendanceMode,
        checkinEarlyMinutes: form.checkinEarlyMinutes,
        checkinLateMinutes: form.checkinLateMinutes,
        allowReplacement: form.allowReplacement,
        replacementCutoffHours: form.replacementCutoffHours,
        ...accessPayload(form.access, mode === 'create'),
      };

      if (mode === 'create') {
        if (selectedTemplateId) {
          await api(`/api/event-templates/${selectedTemplateId}/instantiate`, {
            method: 'POST',
            json: {
              ...shared,
              slug: form.slug,
              logoUrl: shared.logoUrl ?? undefined,
              bannerUrl: shared.bannerUrl ?? undefined,
              startDate: dayToIso(form.startDate),
              allowPublicSignup: true,
            },
          });
          toast({
            title: t('templateCreatedTitle'),
            description: t('templateCreatedDesc', { title: form.title }),
          });
        } else {
          await api('/api/events', {
            method: 'POST',
            json: {
              ...shared,
              slug: form.slug,
              logoUrl: shared.logoUrl ?? undefined,
              bannerUrl: shared.bannerUrl ?? undefined,
              startDate: dayToIso(form.startDate),
              allowPublicSignup: true,
              organizers: organizers.map((o) => ({
                userId: o.userId,
                ceviName: o.ceviName,
                email: o.email,
                role: o.role,
                roleTitle: o.roleTitle?.trim() || undefined,
              })),
            },
          });
          toast({ title: t('createdTitle'), description: t('createdDesc', { title: form.title }) });
        }
        onSaved(form.slug);
      } else {
        const targetSlug = slugToSave || form.slug;
        const res = await api<{ id: string; slug: string }>(`/api/events/${eventSlug}`, {
          method: 'PATCH',
          json: {
            ...shared,
            slug: targetSlug !== initialSlug ? targetSlug : undefined,
            description: form.description.trim() || null,
            allowPublicSignup: form.allowPublicSignup,
          },
        });
        lastSavedSnapshotRef.current = JSON.stringify(form);
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
        toast({ title: t('settingsSavedTitle') });
        onSaved(res.slug || targetSlug);
      }
    } catch (err) {
      setError(errorMessage(err));
      setScrollToError(true);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'edit' && form.slug !== initialSlug) {
      setShowSlugWarning(true);
      return;
    }
    await executeSave();
  };

  // Verfügbare Mitglieder, die noch nicht im OK sind (Cevi-Name-Profile können keine Rolle haben)
  const availableMembers = deptMembers.filter(
    (m) => !m.isCeviNameProfile && !organizers.some((o) => o.userId === m.userId)
  );

  const undo = () => {
    setForm(JSON.parse(openedSnapshotRef.current));
    setError(null);
  };

  const S = layout === 'page' ? PageSection : DialogSection;
  // Auf der Seite passen kurze Felder nebeneinander, im Dialog bleibt alles untereinander
  const fieldColumns = layout === 'page' ? 'grid items-start gap-5 lg:grid-cols-2' : 'space-y-4';

  // Gründe, warum nicht automatisch gespeichert wird: Der Slug braucht die Bestätigung, ohne Titel gibt es keinen Anlass
  const titleMissing = !form.title.trim();
  const slugChanged = form.slug !== initialSlug;
  const autoSaveBlocked = titleMissing
    ? t('saveStatusBlockedTitle')
    : slugChanged
      ? t('saveStatusBlockedSlug')
      : null;
  const needsManualSave = isDirty && !titleMissing && (slugChanged || Boolean(error));

  const contactName = deptMembers.find((m) => m.userId === form.contactUserId)?.displayName;
  const bannerPreset = BANNER_PRESETS.find((p) => p.url === form.bannerUrl);
  const bannerName = bannerPreset ? t(`banners.${bannerPreset.id}`) : form.bannerUrl ? t('customImageText') : t('noBannerText');

  return (
    <form onSubmit={submit} className={layout === 'page' ? 'space-y-6' : 'space-y-7'}>
      {/* Auf der Seite steht die Meldung in der Speicherleiste, die immer sichtbar ist */}
      {error && layout === 'dialog' && (
        <div ref={errorRef} className="scroll-mt-24">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <S id="grunddaten" title={t('grunddatenTitle')} description={t('grunddatenDesc')}>
        <div className="grid gap-5 sm:grid-cols-2">
          {mode === 'create' && templates.length > 0 && (
            <Field
              label={t('fromTemplateLabel')}
              hint={t('fromTemplateHint')}
              className="sm:col-span-2"
            >
              <Select
                value={selectedTemplateId}
                onChange={(e) => {
                  const tId = e.target.value;
                  setSelectedTemplateId(tId);
                  setSlugTouched(false);
                  if (tId) {
                    const found = templates.find((t) => t.id === tId);
                    if (found) {
                      const cleanTitle = found.title.replace(/\s*\(Vorlage\)\s*/i, '');
                      setForm((prev) => ({
                        ...prev,
                        title: cleanTitle,
                        slug: slugify(cleanTitle),
                        description: found.description || '',
                        reminderNote: found.data.reminderNote || '',
                        cancelDeadlineDays: found.cancelDeadlineDays ?? null,
                        overlapToleranceMinutes: found.overlapToleranceMinutes ?? 15,
                        allowReplacement: found.data.allowReplacement ?? true,
                        replacementCutoffHours: found.data.replacementCutoffHours ?? 0,
                        access: {
                          accessType: found.accessType,
                          leadersOnly: found.leadersOnly,
                          requiredFields: found.requiredFields,
                          allowedDepartmentIds: found.data.allowedDepartmentIds ?? [],
                          allowedStufeIds: found.data.allowedStufeIds ?? [],
                          questions: (found.data.questions ?? []).map(questionDraft),
                        },
                      }));
                    }
                  }
                }}
              >
                <option value="">{t('noTemplateOption')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {t('templateOptionLabel', { title: tpl.title, count: tpl.shiftCount })}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label={t('titleLabel')} required className={cn('sm:col-span-2', layout === 'page' && 'lg:col-span-1')}>
            <Input
              value={form.title}
              placeholder={t('titlePlaceholder')}
              autoFocus={mode === 'create'}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  title: val,
                  slug: mode === 'create' && !slugTouched ? slugify(val) : f.slug,
                }));
              }}
            />
          </Field>

          <Field
            label={
              <span className="flex items-center justify-between gap-2 flex-wrap">
                <span>
                  {t('slugLabel')} <span className="text-accent-ink" aria-hidden>*</span>
                </span>
                {mode === 'edit' && form.slug !== initialSlug ? (
                  <Badge tone="danger" size="sm" className="-my-1 font-normal">
                    {t('slugBadgeWarning')}
                  </Badge>
                ) : mode === 'edit' ? (
                  <Badge tone="outline" size="sm" className="-my-1 font-normal text-fg-subtle">
                    {t('slugBadgeBreaks')}
                  </Badge>
                ) : null}
              </span>
            }
            hint={
              mode === 'create' ? (
                <span>
                  <span className="font-mono text-fg-muted">…/events/{form.slug || 'chilbi-2026'}</span>
                  <span className="mx-1.5 text-line-strong">·</span>
                  <span>
                    {t('slugHintCreate')}
                  </span>
                </span>
              ) : (
                <span>
                  <span className="font-mono text-fg-muted">…/events/{form.slug}</span>
                  <span className="mx-1.5 text-line-strong">·</span>
                  <span className={form.slug !== initialSlug ? 'text-danger-ink font-semibold' : 'text-fg-subtle'}>
                    {t('slugHintEdit')}
                  </span>
                </span>
              )
            }
            className={cn('sm:col-span-2', layout === 'page' && 'lg:col-span-1')}
          >
            <Input
              value={form.slug}
              pattern="[a-z0-9\-]+"
              maxLength={50}
              required
              placeholder={t('slugPlaceholder')}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', slugify(e.target.value));
              }}
              className="font-mono"
            />
          </Field>

          {mode === 'create' ? (
            <Field
              label={
                <span>
                  {t('dateLabel')} <span className="text-accent-ink" aria-hidden>*</span>
                </span>
              }
              hint={t('dateHint')}
              className="sm:col-span-2"
            >
              <Input type="date" value={form.startDate} required onChange={(e) => set('startDate', e.target.value)} />
            </Field>
          ) : (
            dateRange && <div className="sm:col-span-2">{dateRange}</div>
          )}
          <Field label={t('descriptionLabel')} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.description}
              placeholder={t('descriptionPlaceholder')}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>
      </S>

      {/* Organisationskomitee (OK) bei neuem Event angeben */}
      {mode === 'create' && (
        <fieldset className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-accent-ink" />
            <legend className="text-[13px] font-semibold text-fg">{t('okSectionTitle')}</legend>
          </div>
          <p className="mb-4 text-xs text-fg-muted">
            {t('okSectionDesc')}
          </p>

          {/* Bereits im OK eingetragene Personen */}
          <div className="mb-4 divide-y divide-line rounded-field border border-line bg-surface-1">
            {organizers.map((org, idx) => {
              const isLead = org.role === 'OK_LEAD';
              return (
                <div key={org.userId || org.email || `${org.displayName}-${idx}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        isLead ? 'bg-amber-500/15 text-amber-600' : 'bg-surface-3 text-fg-muted'
                      )}
                    >
                      {isLead ? <Crown className="size-3.5" /> : <Shield className="size-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <span className="font-semibold text-fg truncate block">{org.displayName}</span>
                      <span className="text-xs text-fg-subtle">
                        {isLead ? t('roleOkLead') : t('roleOkMember')}
                        {org.roleTitle && ` · ${org.roleTitle}`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeOrganizer(idx)}
                    title={t('removeOrganizerTitle')}
                    className="relative touch-hitbox rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
            {organizers.length === 0 && (
              <div className="p-3 text-xs text-fg-subtle text-center">{t('noOrganizersYet')}</div>
            )}
          </div>
          {/* Wer erstellt, kommt nicht automatisch ins OK: hier mit einem Klick, wenn gewünscht */}
          {user && !organizers.some((o) => o.userId === user.id) && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mb-4"
              onClick={() =>
                setOrganizers((prev) => [
                  ...prev,
                  { userId: user.id, displayName: displayName(user), role: 'OK_LEAD', roleTitle: t('roleOkLead') },
                ])
              }
            >
              <Crown /> {t('addSelfAsLead')}
            </Button>
          )}

          {/* Weitere Person hinzufügen */}
          <div className="space-y-3 rounded-field border border-line/70 bg-surface-2 p-3 text-xs">
            <span className="font-semibold text-fg block">{t('addPersonTitle')}</span>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="ok-member-select" className="text-[11px] font-medium text-fg-subtle block mb-1">{t('chooseMemberLabel')}</label>
                <select
                  id="ok-member-select"
                  value={selectedMemberUserId}
                  onChange={(e) => {
                    setSelectedMemberUserId(e.target.value);
                    if (e.target.value) setCustomWho('');
                  }}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <option value="">{t('chooseMemberPlaceholder')}</option>
                  {availableMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ok-custom-who" className="text-[11px] font-medium text-fg-subtle block mb-1">
                  {t('orCustomWhoLabel', { nicknameTerm: org.nicknameTerm })}
                </label>
                <input
                  id="ok-custom-who"
                  type="text"
                  placeholder={org.slug === 'verein' ? t('customWhoPlaceholderVerein') : t('customWhoPlaceholderYouth')}
                  value={customWho}
                  onChange={(e) => {
                    setCustomWho(e.target.value);
                    if (e.target.value) setSelectedMemberUserId('');
                  }}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 items-end">
              <div>
                <label htmlFor="ok-new-role" className="text-[11px] font-medium text-fg-subtle block mb-1">{t('roleInOkLabel')}</label>
                <select
                  id="ok-new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'OK_LEAD' | 'OK_MEMBER')}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <option value="OK_MEMBER">{t('roleOptionMember')}</option>
                  <option value="OK_LEAD">{t('roleOptionLead')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="ok-new-role-title" className="text-[11px] font-medium text-fg-subtle block mb-1">{t('roleTitleLabel')}</label>
                <input
                  id="ok-new-role-title"
                  type="text"
                  placeholder={t('roleTitlePlaceholder')}
                  value={newRoleTitle}
                  onChange={(e) => setNewRoleTitle(e.target.value)}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedMemberUserId && !customWho.trim()}
                onClick={addOrganizer}
              >
                <Plus className="size-3.5" /> {t('addPersonBtn')}
              </Button>
            </div>
          </div>
        </fieldset>
      )}


      <S
        id="eintragen"
        title={t('eintragenTitle')}
        description={t('eintragenDesc')}
      >
        {mode === 'edit' && (
          <Switch
            checked={form.allowPublicSignup}
            onChange={(v) => set('allowPublicSignup', v)}
            label={t('allowPublicSignupLabel')}
            description={t('allowPublicSignupDesc')}
          />
        )}
        <div className={fieldColumns}>
        <Field
          label={t('signupOpensAtLabel')}
          hint={
            <span>
              {t('signupOpensAtHint')}{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> {t('helpLink')}
              </a>
            </span>
          }
        >
          <Input
            type="datetime-local"
            value={form.signupOpensAt}
            onChange={(e) => set('signupOpensAt', e.target.value)}
          />
        </Field>

        <Field
          label={t('cancelDeadlineDaysLabel')}
          hint={
            <span>
              {t('cancelDeadlineDaysHint')}{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> {t('helpLink')}
              </a>
            </span>
          }
        >
          <Input
            type="number"
            min={0}
            max={365}
            placeholder={t('cancelDeadlineDaysPlaceholder')}
            value={form.cancelDeadlineDays ?? ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              set('cancelDeadlineDays', val === '' ? null : Math.max(0, parseInt(val, 10) || 0));
            }}
          />
        </Field>
        </div>

        <Switch
          checked={form.allowReplacement}
          onChange={(v) => set('allowReplacement', v)}
          label={t('allowReplacementLabel')}
          description={t('allowReplacementDesc')}
        />
        <div className={fieldColumns}>
        {form.allowReplacement && (
          <Field
            label={t('replacementCutoffLabel')}
            hint={
              <span>
                {t('replacementCutoffHint')}{' '}
                <a
                  href={helpUrl('/helfen/ersatz-suchen/')}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
                >
                  <LifeBuoy className="size-3 inline" /> {t('helpLink')}
                </a>
              </span>
            }
          >
            <Select
              value={form.replacementCutoffHours}
              onChange={(e) => set('replacementCutoffHours', Number(e.target.value))}
            >
              {REPLACEMENT_CUTOFF_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? t('cutoffShiftStart') : t('cutoffHoursBefore', { hours: h })}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label={t('overlapLabel')}
          hint={
            <span>
              {t('overlapHint')}{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> {t('helpLink')}
              </a>
            </span>
          }
        >
          <Select
            value={form.overlapToleranceMinutes ?? 15}
            onChange={(e) => set('overlapToleranceMinutes', Number(e.target.value))}
          >
            <option value={0}>{t('overlapMin0')}</option>
            <option value={10}>{t('overlapMin10')}</option>
            <option value={15}>{t('overlapMin15')}</option>
            <option value={20}>{t('overlapMin20')}</option>
            <option value={30}>{t('overlapMin30')}</option>
          </Select>
        </Field>

        <Field
          label={t('minShiftsLabel')}
          hint={t('minShiftsHint')}
        >
          <Input
            type="number"
            min={1}
            max={50}
            placeholder={t('minShiftsPlaceholder')}
            value={form.minShiftsPerPerson ?? ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              set('minShiftsPerPerson', val === '' ? null : Math.max(1, parseInt(val, 10) || 1));
            }}
          />
        </Field>
        </div>

        <Field
          label={t('reminderNoteLabel')}
          hint={t('reminderNoteHint')}
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={form.reminderNote}
            placeholder={t('reminderNotePlaceholder')}
            onChange={(e) => set('reminderNote', e.target.value)}
          />
        </Field>
      </S>

      <S id="zugang" title={t('zugangTitle')} description={t('zugangDesc')}>
        <EventAccessFields values={form.access} onChange={(access) => set('access', access)} />
      </S>

      <S
        id="zustaendigkeiten"
        title={t('zustaendigkeitenTitle')}
        description={t('zustaendigkeitenDesc')}
        summary={[
          contactName ? t('summaryContact', { name: contactName }) : t('summaryNoContact'),
          form.responsibleMode === 'BY_DAY' ? t('summaryResponsibleDay') : t('summaryResponsibleShift'),
          t('summaryDayCutoff', { time: form.dayCutoffTime }),
        ].join(' · ')}
      >
        <div className={fieldColumns}>
        <Field
          label={t('contactUserLabel')}
          hint={t('contactUserHint')}
        >
          <Select
            value={form.contactUserId || ''}
            onChange={(e) => set('contactUserId', e.target.value || null)}
          >
            <option value="">{t('noContactPersonOption')}</option>
            {deptMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t('responsiblesLabel')}
          hint={t('responsiblesHint')}
        >
          <Select
            value={form.responsibleMode}
            onChange={(e) => set('responsibleMode', e.target.value as 'BY_SHIFT' | 'BY_DAY')}
          >
            <option value="BY_SHIFT">{t('respByShift')}</option>
            <option value="BY_DAY">{t('respByDay')}</option>
          </Select>
        </Field>

        <Field
          label={t('dayCutoffLabel')}
          hint={t('dayCutoffHint')}
        >
          <Input
            type="time"
            value={form.dayCutoffTime}
            onChange={(e) => set('dayCutoffTime', e.target.value)}
          />
        </Field>

        <Field
          label={t('contactVisibilityLabel')}
          hint={t('contactVisibilityHint')}
        >
          <Select
            value={form.contactVisibility}
            onChange={(e) => set('contactVisibility', e.target.value as EventContactVisibility)}
          >
            <option value="BOTH">{t('visBoth')}</option>
            <option value="PHONE">{t('visPhone')}</option>
            <option value="EMAIL">{t('visEmail')}</option>
            <option value="NONE">{t('visNone')}</option>
          </Select>
        </Field>
        </div>
      </S>

      <S
        id="anwesenheit"
        title={t('anwesenheitTitle')}
        description={t('anwesenheitDesc')}
        summary={ATTENDANCE_MODES[form.attendanceMode]}
      >
        <Field
          label={t('attendanceModeLabel')}
          hint={t('attendanceModeHint')}
        >
          <Select
            value={form.attendanceMode}
            onChange={(e) => set('attendanceMode', e.target.value as AttendanceMode)}
          >
            {(Object.keys(ATTENDANCE_MODES) as AttendanceMode[]).map((key) => (
              <option key={key} value={key}>
                {ATTENDANCE_MODES[key]}
              </option>
            ))}
          </Select>
        </Field>

        {form.attendanceMode === 'OK_AND_QR' && (
          <div className="mt-4 space-y-4 rounded-xl border border-line bg-surface-2/40 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <QrCode className="size-4 text-accent-ink" />
              <span>{t('qrWindowHeader')}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t('checkinEarlyMinutesLabel')}
                hint={t('checkinEarlyMinutesHint')}
              >
                <Select
                  value={String(form.checkinEarlyMinutes)}
                  onChange={(e) => set('checkinEarlyMinutes', Number(e.target.value))}
                >
                  <option value="0">{t('early0')}</option>
                  <option value="15">{t('early15')}</option>
                  <option value="30">{t('early30')}</option>
                  <option value="45">{t('early45')}</option>
                  <option value="60">{t('early60')}</option>
                  <option value="90">{t('early90')}</option>
                  <option value="120">{t('early120')}</option>
                  <option value="180">{t('early180')}</option>
                </Select>
              </Field>

              <Field
                label={t('checkinLateMinutesLabel')}
                hint={t('checkinLateMinutesHint')}
              >
                <Select
                  value={String(form.checkinLateMinutes)}
                  onChange={(e) => set('checkinLateMinutes', Number(e.target.value))}
                >
                  <option value="0">{t('late0')}</option>
                  <option value="15">{t('late15')}</option>
                  <option value="30">{t('late30')}</option>
                  <option value="45">{t('late45')}</option>
                  <option value="60">{t('late60')}</option>
                  <option value="90">{t('late90')}</option>
                  <option value="120">{t('late120')}</option>
                </Select>
              </Field>
            </div>
            <p className="text-xs text-fg-subtle">
              {t('posterNotice')}
            </p>
          </div>
        )}



      </S>

      <S
        id="catering"
        title={t('cateringTitle')}
        description={t('cateringDesc')}
        summary={
          form.cateringTokensEnabled
            ? form.cateringEarlyHours < 0
              ? t('cateringSummaryAlways', { count: form.cateringTokenItems.length })
              : t('cateringSummaryHours', { count: form.cateringTokenItems.length, hours: form.cateringEarlyHours })
            : t('cateringSummaryDisabled')
        }
      >
        <div className="space-y-6">
          {/* Hauptschalter */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="size-4 text-accent-ink" />
                <span className="text-[13px] font-semibold text-fg">{t('cateringSwitchLabel')}</span>
              </div>
              <p className="text-xs text-fg-muted mt-0.5">
                {t('cateringSwitchDesc')}
              </p>
            </div>
            <Switch
              checked={form.cateringTokensEnabled}
              onChange={(checked) => set('cateringTokensEnabled', checked)}
              aria-label={t('cateringSwitchLabel')}
            />
          </div>

          {form.cateringTokensEnabled && (
            <div className="space-y-6 animate-in fade-in">
              {/* 1. DIGITALE BONS EINSTELLUNGEN */}
              <div className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
                <h4 className="font-display text-xs font-bold uppercase tracking-wider text-fg-subtle">
                  {t('cateringTokensSectionTitle')}
                </h4>

                <Field
                  label={t('cateringTokensPerShiftLabel')}
                  hint={t('cateringTokensPerShiftHint')}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {form.cateringTokenItems.map((item, idx) => (
                        <Badge
                          // biome-ignore lint/suspicious/noArrayIndexKey: Token items are tracked and removed by index
                          key={idx}
                          tone="neutral"
                          className="pl-2.5 pr-1.5 py-1 text-xs gap-1.5 font-medium"
                        >
                          {item}
                          <button
                            type="button"
                            onClick={() => removeCateringItem(idx)}
                            className="relative touch-hitbox hover:text-danger-ink focus-visible:ring-2 focus-visible:ring-accent p-0.5 rounded"
                            title={t('cateringRemoveItemAria', { item })}
                            aria-label={t('cateringRemoveItemAria', { item })}
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                        </Badge>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder={t('cateringNewItemPlaceholder')}
                        value={newCateringItem}
                        onChange={(e) => setNewCateringItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCateringItem();
                          }
                        }}
                        className="text-xs h-8"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addCateringItem}
                        disabled={!newCateringItem.trim()}
                        className="shrink-0 h-8"
                      >
                        <Plus className="size-3.5 mr-1" /> {t('cateringAddItemBtn')}
                      </Button>
                    </div>
                  </div>
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <Field
                    label={t('cateringEarlyHoursLabel')}
                    hint={t('cateringEarlyHoursHint')}
                  >
                    <Select
                      value={String(form.cateringEarlyHours)}
                      onChange={(e) => set('cateringEarlyHours', Number(e.target.value))}
                    >
                      <option value="-1">{t('earlyHoursAlways')}</option>
                      <option value="0">{t('earlyHours0')}</option>
                      <option value="1">{t('earlyHours1')}</option>
                      <option value="2">{t('earlyHours2')}</option>
                      <option value="3">{t('earlyHours3')}</option>
                      <option value="4">{t('earlyHours4')}</option>
                      <option value="6">{t('earlyHours6')}</option>
                      <option value="12">{t('earlyHours12')}</option>
                      <option value="24">{t('earlyHours24')}</option>
                    </Select>
                  </Field>

                  <Field
                    label={t('staffPinLabel')}
                    hint={
                      staffPinTooShort(form.cateringStaffPin)
                        ? t('staffPinHintShort', { min: STAFF_PIN_MIN_LENGTH })
                        : t('staffPinHintNormal', { min: STAFF_PIN_MIN_LENGTH })
                    }
                  >
                    <Input
                      placeholder={t('staffPinPlaceholder')}
                      maxLength={20}
                      value={form.cateringStaffPin}
                      onChange={(e) => set('cateringStaffPin', e.target.value)}
                      className="font-mono"
                    />
                  </Field>
                </div>

                <div className="border-t border-line pt-3">
                  <Switch
                    checked={form.cateringRemindersEnabled}
                    onChange={(checked) => set('cateringRemindersEnabled', checked)}
                    label={t('cateringRemindersSwitchLabel')}
                    description={t('cateringRemindersSwitchDesc')}
                  />
                </div>
              </div>

              {/* 2. UNTERABSCHNITT: PHYSISCHE BONS (A4-DRUCKBÖGEN & TRANCHEN) */}
              <div className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <QrCode className="size-4 text-accent-ink" />
                  <h4 className="font-display text-sm font-bold text-fg">
                    {t('physicalBonsTitle')}
                  </h4>
                </div>
                <p className="text-xs text-fg-muted">
                  {t('physicalBonsDesc')}
                </p>

                {eventSlug ? (
                  <PhysicalBonsManager
                    eventSlug={eventSlug}
                    eventTitle={form.title}
                    items={form.cateringTokenItems}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-fg-muted">
                    {t('physicalBonsAfterSaveNotice')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </S>
      <S
        id="design"
        title={t('designTitle')}
        description={t('designDesc')}
        summary={t('designSummary', { banner: bannerName, logo: form.logoUrl ? t('customImageText') : t('defaultLogoText') })}
      >
        <fieldset className="space-y-5">
          <div>
            <legend className="mb-3 text-[13px] font-semibold text-fg">{t('bannerLegend')}</legend>
            <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', layout === 'page' && 'xl:grid-cols-6')}>
              {BANNER_PRESETS.map((preset) => {
                const selected = form.bannerUrl === preset.url;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('bannerUrl', preset.url)}
                    className={cn(
                      'group relative aspect-[16/10] overflow-hidden rounded-tile ring-2 ring-offset-2 ring-offset-surface transition',
                      selected ? 'ring-accent' : 'ring-transparent hover:ring-line-strong'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.url} alt={t(`banners.${preset.id}`)} className="size-full object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6 text-left text-xs font-semibold text-white">
                      {t(`banners.${preset.id}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={fieldColumns}>
          {/* Eigenes Bannerbild hochladen (kein Pfad/URL eingeben) */}
          <ImageUpload
            label={t('customBannerUploadLabel')}
            hint={t('customBannerUploadHint')}
            aspectRatio="banner"
            value={BANNER_PRESETS.some((p) => p.url === form.bannerUrl) ? null : form.bannerUrl}
            onChange={(url) => set('bannerUrl', url ?? BANNER_PRESETS[0].url)}
            showCeviFallback={false}
          />

          {/* Logo des Anlasses hochladen (kein Pfad/URL eingeben) */}
          <ImageUpload
            label={t('logoUploadLabel')}
            hint={t('logoUploadHint')}
            aspectRatio="square"
            value={form.logoUrl}
            onChange={(url) => set('logoUrl', url ?? '')}
            showCeviFallback={true}
          />
          </div>
        </fieldset>

      </S>

      {layout === 'page' ? (
        <div className="sticky bottom-20 z-10 flex min-h-[3.125rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card border border-line-strong bg-surface/95 px-4 py-1.5 shadow-lift backdrop-blur md:bottom-4">
          <SaveStatus
            saving={saving || autoSaveStatus === 'saving'}
            dirty={isDirty}
            error={error}
            blocked={autoSaveBlocked}
            savedAt={lastSavedAt}
          />
          {(changedSinceOpen || needsManualSave) && (
            <div className="ml-auto flex items-center gap-2">
              {changedSinceOpen && (
                <Button size="sm" variant="ghost" onClick={undo} title={t('undoTooltip')}>
                  {t('undoAction')}
                </Button>
              )}
              {needsManualSave && (
                <Button size="sm" type="submit" loading={saving}>
                  {t('saveAction')}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {t('cancelAction')}
          </Button>
          <Button type="submit" loading={saving}>
            {mode === 'create' ? t('createAction') : t('saveAction')}
          </Button>
        </div>
      )}

      {/* 10s Countdown-Warnungs-Dialog bei Adressänderung */}
      {showSlugWarning && (
        <Dialog
          open={showSlugWarning}
          onClose={() => setShowSlugWarning(false)}
          size="md"
          icon={<AlertTriangle className="text-danger-ink" />}
          title={t('slugWarningTitle')}
        >
          <div className="space-y-4">
            <Callout tone="danger">
              <p className="font-semibold text-danger-ink">
                {t('slugWarningCalloutTitle')}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                {t('slugWarningCalloutDesc', { initialSlug, newSlug: form.slug })}
              </p>
            </Callout>

            <div className="rounded-card border border-line bg-surface-2 p-3 text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-fg-subtle">
                <span>{t('slugOldUrl')}</span>
                <span className="line-through text-danger-ink/80">…/events/{initialSlug}</span>
              </div>
              <div className="flex items-center justify-between font-semibold text-fg">
                <span>{t('slugNewUrl')}</span>
                <span className="text-accent-ink">…/events/{form.slug}</span>
              </div>
            </div>

            <div className="rounded-card border border-line bg-surface-1 p-3 text-center">
              <p className="text-xs text-fg-muted">
                {countdown > 0 ? (
                  <span>
                    {t('countdownWaiting', { seconds: countdown })}
                  </span>
                ) : (
                  <span className="font-medium text-success-ink">
                    {t('countdownDone')}
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSlugWarning(false)}
              >
                {t('cancelAction')}
              </Button>
              <Button
                type="button"
                disabled={countdown > 0}
                loading={saving}
                onClick={async () => {
                  setShowSlugWarning(false);
                  await executeSave(form.slug);
                }}
                className={countdown === 0 ? 'bg-danger text-white hover:bg-danger-hover' : ''}
              >
                {countdown > 0 ? t('slugWaitBtn', { seconds: countdown }) : t('slugConfirmBtn')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </form>
  );
}
