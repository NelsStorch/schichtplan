'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Edit, Lock, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { EventForm, eventFormInitial } from '@/components/EventFormDialog';
import { EventRangeField } from '@/components/ok/EventRangeField';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { SectionNav, SectionsProvider } from '@/components/ok/SettingsSections';
import { OrganizerDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';
import type { EventOrganizer } from '@/lib/types';

const SECTION_IDS = [
  'ok-team',
  'grunddaten',
  'eintragen',
  'zugang',
  'zustaendigkeiten',
  'anwesenheit',
  'catering',
  'design',
] as const;

/** Selten gebraucht: Beim Öffnen eingeklappt mit Zusammenfassung */
const COLLAPSED_SECTIONS = ['zustaendigkeiten', 'anwesenheit', 'design'];

/**
 * Anlass endgültig löschen (nur Abteilungsleitung). Der Knopf wird erst aktiv, wenn das Kürzel
 * eingetippt ist; das Backend prüft dasselbe nochmals.
 */
function DeleteEventSection({
  slug,
  title,
  shiftCount,
  signupCount,
}: {
  slug: string;
  title: string;
  shiftCount: number;
  signupCount: number;
}) {
  const t = useTranslations('web.ok.settings');
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${slug}`, { method: 'DELETE', json: { confirm: typed.trim() } });
      toast({ title: t('deleteSection.deletedToast'), description: title, tone: 'success' });
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const matches = typed.trim() === slug;

  return (
    <section id="loeschen" className="mt-6">
      <Card className="border-danger/30 bg-danger/5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-danger-ink">{t('deleteSection.title')}</h3>
            <p className="mt-0.5 text-sm text-fg-muted">
              {t('deleteSection.desc')}
            </p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => setOpen(true)}>
            <Trash2 aria-hidden /> {t('deleteSection.btn')}
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onClose={close}
        title={t('deleteSection.confirmTitle', { title })}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {t('deleteSection.cancelBtn')}
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy || !matches}>
              <Trash2 aria-hidden />
              {busy ? t('deleteSection.deletingBtn') : t('deleteSection.confirmDeleteBtn')}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Callout tone="danger">
            {t('deleteSection.warningNotice', { shiftCount, signupCount })}
          </Callout>
          <Field
            label={t.rich('deleteSection.confirmLabel', {
              slug: () => <span className="font-mono text-danger-ink">{slug}</span>,
            })}
            error={error ?? undefined}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches && !busy) remove();
              }}
            />
          </Field>
        </div>
      </Dialog>
    </section>
  );
}

export default function SettingsPage() {
  const t = useTranslations('web.ok.settings');
  const { event, reload, permissions } = useOkEvent();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [formKey, setFormKey] = useState(0);
  const [okDialog, setOkDialog] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<EventOrganizer | null>(null);

  const sections = useMemo(
    () =>
      [
        ['ok-team', t('sections.okTeam')],
        ['grunddaten', t('sections.basicData')],
        ['eintragen', t('sections.signupRules')],
        ['zugang', t('sections.accessRules')],
        ['zustaendigkeiten', t('sections.responsibilities')],
        ['anwesenheit', t('sections.attendance')],
        ['catering', t('sections.catering')],
        ['design', t('sections.design')],
      ] as const,
    [t]
  );

  if (!permissions.canEditSettings) {
    return (
      <EmptyState
        icon={<Lock />}
        title={t('emptyTitle')}
        description={t('emptyDesc')}
      />
    );
  }

  const removeOrganizer = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('removeConfirmTitle', { name }),
      description: t('removeConfirmDesc'),
      confirmLabel: t('removeConfirmBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/organizers/${id}`, { method: 'DELETE' });
      toast({ title: t('removedToast', { name }) });
      await reload();
    } catch (err) {
      toast({ title: t('removeFailedToast'), description: errorMessage(err), tone: 'error' });
    }
  };

  const organizers = event.organizers ?? [];

  return (
    <SectionsProvider sections={SECTION_IDS} collapsed={COLLAPSED_SECTIONS}>
      <OkPageHeader
        title={t('pageTitle')}
        description={t('pageDesc')}
        help="/ok/anlass-erstellen/"
      />

      <SectionNav sections={sections} />

      <section id="ok-team" className="mb-6">
        <Card className="p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-fg">{t('okTeam')}</h3>
              <p className="mt-0.5 text-sm text-fg-muted">
                {t('okTeamDesc')}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingOrganizer(null);
                setOkDialog(true);
              }}
            >
              <UserPlus className="size-4" /> {t('addOrganizerBtn')}
            </Button>
          </div>
          {organizers.length === 0 ? (
            <Callout tone="warning" className="mt-4">
              {t('noOrganizersNotice')}
            </Callout>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-field border border-line">
              {organizers.map((org) => {
                const lead = org.role === 'OK_LEAD';
                const name = org.userCeviName || org.displayName;
                return (
                  <li key={org.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={name} size="sm" highlight={lead} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                        {name}
                        {lead ? <Crown className="size-3.5 text-accent-ink" /> : <Shield className="size-3.5 text-fg-subtle" />}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {lead ? t('leadRole') : t('memberRole')}
                        {org.roleTitle && org.roleTitle !== 'OK-Mitglied' && org.roleTitle !== 'OK-Leitung'
                          ? ` · ${org.roleTitle}`
                          : ''}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingOrganizer(org);
                          setOkDialog(true);
                        }}
                        aria-label={t('editOrganizerAria', { name })}
                        title={t('editOrganizerTitle')}
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeOrganizer(org.id, name)}
                        aria-label={t('removeOrganizerAria', { name })}
                        className="text-fg-subtle hover:text-danger-ink"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <EventForm
        key={formKey}
        mode="edit"
        layout="page"
        eventSlug={event.slug}
        initial={eventFormInitial(event)}
        dateRange={<EventRangeField key={`${event.startDate}-${event.endDate}`} event={event} onMoved={reload} />}
        onAutoSaved={reload}
        onSaved={async (slug) => {
          if (slug !== event.slug) {
            router.replace(`/events/${slug}/ok/einstellungen`);
            return;
          }
          await reload();
          setFormKey((k) => k + 1);
        }}
      />

      {permissions.canDeleteEvent && (
        <DeleteEventSection
          slug={event.slug}
          title={event.title}
          shiftCount={event.shifts?.length ?? 0}
          signupCount={(event.shifts ?? []).reduce((sum, s) => sum + (s.signups?.length ?? 0), 0)}
        />
      )}

      <OrganizerDialog
        open={okDialog}
        eventSlug={event.slug}
        organizer={editingOrganizer}
        onClose={() => {
          setOkDialog(false);
          setEditingOrganizer(null);
        }}
        onSaved={async () => {
          setOkDialog(false);
          setEditingOrganizer(null);
          await reload();
        }}
      />
    </SectionsProvider>
  );
}
