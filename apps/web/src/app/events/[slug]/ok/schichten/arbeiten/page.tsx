'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Edit, Plus, Trash2, Wrench } from 'lucide-react';
import type { TaskDefinitionDto } from '@schichtplan/shared';
import { Badge, Button, Callout, Card, EmptyState, Skeleton, useConfirm, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { TaskDefinitionDialog } from '@/components/ok/TaskDefinitionDialog';
import { api, errorMessage } from '@/lib/api';

export default function TaskCatalogPage() {
  const t = useTranslations('web.ok.tasks');
  const tShifts = useTranslations('web.ok.shifts');
  const { event, base } = useOkEvent();
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<TaskDefinitionDto[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDefinitionDto | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await api<TaskDefinitionDto[]>('/api/tasks'));
    } catch (err) {
      setTasks([]);
      toast({ title: t('loadError'), description: errorMessage(err), tone: 'error' });
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (td: TaskDefinitionDto, usedIn: number) => {
    if (usedIn > 0) {
      toast({
        title: t('usedInShifts'),
        description: t('usedInShiftsDesc', { title: td.title, count: usedIn }),
        tone: 'error',
      });
      return;
    }

    const ok = await confirm({
      title: t('confirmDeleteTitle', { title: td.title }),
      description: t('confirmDeleteDesc'),
      confirmLabel: t('confirmDeleteBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/tasks/${td.id}`, { method: 'DELETE' });
      toast({ title: t('deletedSuccess'), description: td.title });
      await load();
    } catch (err) {
      toast({ title: t('deleteFailed'), description: errorMessage(err), tone: 'error' });
    }
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div>
      <OkPageHeader
        title={t('pageTitle')}
        description={t('pageDesc')}
        help="/ok/arbeiten-katalog/"
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> {t('newBtn')}
          </Button>
        }
      />

      <Callout tone="info" className="mb-6">
        {t('callout')}
      </Callout>

      {tasks === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-44 rounded-card" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> {t('createFirstBtn')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((td) => {
            const usedIn = event.shifts.filter((s) =>
              s.tasks?.some(
                (item) => (item.taskDefinitionId && item.taskDefinitionId === td.id) || item.title.toLowerCase() === td.title.toLowerCase()
              )
            ).length;
            return (
              <Card key={td.id} className="flex flex-col justify-between p-5 shadow-soft">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-fg">{td.title}</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('editTitle')}
                        onClick={() => {
                          setEditing(td);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('confirmDeleteBtn')}
                        disabled={usedIn > 0}
                        title={usedIn > 0 ? t('usedInShiftsDesc', { title: td.title, count: usedIn }) : t('confirmDeleteBtn')}
                        onClick={() => remove(td, usedIn)}
                        className={usedIn > 0 ? 'text-fg-subtle/40 cursor-not-allowed' : 'text-fg-subtle hover:text-danger-ink'}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                    {td.description || <span className="italic text-fg-subtle">{t('noDescription')}</span>}
                  </p>
                  <div className="mt-3">
                    {td.minAge ? (
                      <Badge tone="warning">
                        {t('minAgeBadge', {
                          age: td.minAge,
                          type: td.ageRequirementType === 'AT_LEAST_ONE' ? tShifts('card.ageRequirementOne') : tShifts('card.ageRequirementAll'),
                        })}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t('noMinAge')}</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs">
                  {usedIn > 0 ? (
                    <Link
                      href={`${base}/schichten?arbeit=${encodeURIComponent(td.title)}`}
                      className="font-semibold text-accent-ink hover:underline"
                    >
                      {t('showInShifts', { count: usedIn })}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">{t('notUsedInEvent')}</span>
                  )}
                  <Link href={`${base}/schichten?neu=1`} className="font-bold text-accent-ink hover:underline">
                    {t('addShift')}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TaskDefinitionDialog
        open={dialogOpen}
        task={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setDialogOpen(false);
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}
