'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DEPARTMENT_PERMISSIONS,
  formatZurichTime,
  isDepartmentPermission,
  type DepartmentAuditEntryDto,
  type OrganizationConfig,
} from '@schichtplan/shared';
import { Button, EmptyState, Skeleton, useOrganization, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortDate } from '@/lib/format';

const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
const permLabel = (p: string) => (isDepartmentPermission(p) ? DEPARTMENT_PERMISSIONS[p].label : p);
const time = (iso: string) => formatZurichTime(iso);

/** Was sich geändert hat, in Worten: «+ Anlässe erstellen · − Anlässe löschen» */
function changeText(entry: DepartmentAuditEntryDto, org: OrganizationConfig, t: ReturnType<typeof useTranslations<'web.department.audit'>>): string | null {
  const d = entry.details ?? {};
  if (entry.action === 'PERMISSIONS_SET' || entry.action === 'STUFEN_SET') {
    const before = list(d.before);
    const after = list(d.after);
    const label = entry.action === 'PERMISSIONS_SET' ? permLabel : (s: string) => s;
    const added = after.filter((x) => !before.includes(x)).map((x) => `+ ${label(x)}`);
    const removed = before.filter((x) => !after.includes(x)).map((x) => `− ${label(x)}`);
    const parts = [...added, ...removed];
    return parts.length ? parts.join(' · ') : null;
  }
  const provider = org.authProviderShort || 'Verband';
  if (entry.action === 'LEADER_REVOKE' && d.reason === 'NO_LEADER_ROLE') return t('reasonNoLeader', { provider });
  if (entry.action === 'LEADER_REVOKE' && d.reason === 'OTHER_DEPARTMENT') return t('reasonOtherDept', { provider });
  if (entry.action === 'LEADER_GRANT' && (d.source === 'CEVIDB' || d.source === 'HITOBITO')) return t('reasonLeaderRole', { provider });
  if (entry.action === 'MEMBER_JOIN') return t('reasonRoleHere', { provider });
  if (entry.action === 'MEMBER_LEAVE') return t('reasonNoRoleHere', { provider });
  return null;
}

/** Protokoll der Abteilung: wer wem welche Rechte gegeben hat, Abteilungsleitung, Stufen */
export function DepartmentAuditPanel() {
  const t = useTranslations('web.department.audit');
  const toast = useToast();
  const org = useOrganization();
  const [items, setItems] = useState<DepartmentAuditEntryDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const actionLabels: Record<string, string> = {
    PERMISSIONS_SET: t('actionPermissionsSet'),
    LEADER_GRANT: t('actionLeaderGrant'),
    LEADER_REVOKE: t('actionLeaderRevoke'),
    STUFEN_SET: t('actionStufenSet'),
    MEMBER_REMOVE: t('actionMemberRemove'),
    MEMBER_CONFIRM: t('actionMemberConfirm'),
    MEMBER_UNCONFIRM: t('actionMemberUnconfirm'),
    MEMBER_JOIN: t('actionMemberJoin'),
    MEMBER_LEAVE: t('actionMemberLeave'),
  };

  const load = useCallback(
    async (p: number) => {
      try {
        const res = await api<{ items: DepartmentAuditEntryDto[]; pageCount: number }>(
          `/api/departments/current/audit?page=${p}`
        );
        setItems((prev) => (p === 1 ? res.items : [...(prev ?? []), ...res.items]));
        setPageCount(res.pageCount);
        setPage(p);
      } catch (err) {
        toast({ title: t('loadFailedToast'), description: errorMessage(err), tone: 'error' });
        setItems([]);
      }
    },
    [toast, t]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  if (items === null) return <Skeleton className="h-40 rounded-card" />;
  if (items.length === 0) {
    return <EmptyState title={t('emptyTitle')} description={t('emptyDesc')} />;
  }

  return (
    <div className="space-y-3">
      <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
        {items.map((entry) => {
          const change = changeText(entry, org, t);
          return (
            <li key={entry.id} className="px-4 py-3">
              <p className="text-sm text-fg">
                <span className="font-semibold">{entry.targetLabel}</span>: {actionLabels[entry.action] ?? entry.action}
              </p>
              {change && <p className="mt-0.5 text-xs text-fg-muted">{change}</p>}
              <p className="mt-0.5 text-2xs text-fg-subtle">
                {fmtShortDate(entry.createdAt)}, {time(entry.createdAt)} · {entry.actorName}
              </p>
            </li>
          );
        })}
      </ul>
      {page < pageCount && (
        <Button variant="secondary" size="sm" onClick={() => load(page + 1)}>
          {t('loadMoreBtn')}
        </Button>
      )}
    </div>
  );
}
