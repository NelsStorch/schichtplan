'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Copy, FileText, Plus, Trash2 } from 'lucide-react';
import type { EventTemplateDto } from '@schichtplan/shared';
import { EVENT_ACCESS_TYPES } from '@schichtplan/shared';
import { Button, Callout, Card, EmptyState, Skeleton, buttonClasses, useConfirm, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { SaveTemplateDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';

export default function TemplatesPage() {
  const t = useTranslations('web.ok.templates');
  const { event } = useOkEvent();
  const toast = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<EventTemplateDto[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setTemplates(await api<EventTemplateDto[]>('/api/event-templates'));
    } catch (err) {
      setTemplates([]);
      toast({ title: t('loadError'), description: errorMessage(err), tone: 'error' });
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (tpl: EventTemplateDto) => {
    const ok = await confirm({
      title: t('confirmDeleteTitle', { title: tpl.title }),
      description: t('confirmDeleteDesc'),
      confirmLabel: t('confirmDeleteBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/event-templates/${tpl.id}`, { method: 'DELETE' });
      toast({ title: t('deletedSuccess'), description: tpl.title });
      await load();
    } catch (err) {
      toast({ title: t('deleteFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div>
      <OkPageHeader
        title={t('pageTitle')}
        description={t('pageDesc')}
        help="/ok/vorlagen/"
        actions={
          <Button size="sm" onClick={() => setSaveOpen(true)}>
            <Copy className="size-4" /> {t('saveEventBtn')}
          </Button>
        }
      />

      <Callout tone="info" className="mb-6">
        {t('callout')}
      </Callout>

      {templates === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          action={
            <Button onClick={() => setSaveOpen(true)}>
              <Copy className="size-4" /> {t('saveAsTemplateBtn')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col justify-between p-5 shadow-soft">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-fg">{tpl.title}</h3>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t('shiftsInfo', {
                        count: tpl.shiftCount,
                        access: EVENT_ACCESS_TYPES[tpl.accessType]?.short ?? t('publicAccess'),
                      })}
                    </p>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove(tpl)}
                    className="hover:text-danger-ink"
                    aria-label={t('deleteAria', { title: tpl.title })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {tpl.description && <p className="mt-2 text-xs leading-relaxed text-fg-muted">{tpl.description}</p>}
                <ul className="mt-4 space-y-1 rounded-field bg-surface-2 p-3 text-2xs text-fg-muted">
                  {tpl.data?.shifts?.slice(0, 5).map((s) => (
                    <li key={`${s.title}-${s.dayOffset}-${s.startTimeStr}-${s.endTimeStr}`}>
                      <strong className="text-fg">{s.title}</strong> · {t('dayOffsetInfo', {
                        day: s.dayOffset + 1,
                        start: s.startTimeStr,
                        end: s.endTimeStr,
                      })}
                    </li>
                  ))}
                  {(tpl.data?.shifts?.length || 0) > 5 && (
                    <li className="italic">{t('andMore', { count: tpl.data.shifts.length - 5 })}</li>
                  )}
                </ul>
              </div>
              <div className="mt-5 border-t border-line pt-3">
                <Link
                  href={`/?templateId=${tpl.id}&createEvent=1`}
                  className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'w-full' })}
                >
                  <Plus className="size-4" /> {t('createEventFromTemplate')}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SaveTemplateDialog
        open={saveOpen}
        eventSlug={event.slug}
        defaultTitle={event.title}
        onClose={() => setSaveOpen(false)}
        onSaved={async () => {
          setSaveOpen(false);
          await load();
        }}
      />
    </div>
  );
}
