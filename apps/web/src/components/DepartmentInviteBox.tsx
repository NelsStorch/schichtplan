'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Mail, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DEPARTMENT_PERMISSION_PRESETS,
  normalizePermissions,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';
import { getLoginUrl } from '@schichtplan/shared/redirect';
import { Button, Select, Textarea, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePermissionText } from '@/lib/permissionText';
import { usePortal } from '@/lib/portal';

type InvitePresetOption = 'MEMBER' | DepartmentPermissionPreset;

const PRESET_ORDER: DepartmentPermissionPreset[] = [
  'EVENT_CREATION',
  'EVENT_COORDINATION',
  'EVENT_EDITING',
  'ADMINISTRATION',
];

function parseEmailList(raw: string): string[] {
  const chunks = raw.split(/[,;\n\r]+/);
  const out: string[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const angle = trimmed.match(/<([^<>@\s]+@[^<>@\s]+)>/);
    if (angle) {
      out.push(angle[1].toLowerCase().trim());
    } else {
      for (const token of trimmed.split(/\s+/)) {
        const clean = token.toLowerCase().trim();
        if (clean) out.push(clean);
      }
    }
  }
  return [...new Set(out)];
}

export function DepartmentInviteBox({ onError }: { onError?: (msg: string) => void }) {
  const t = useTranslations('web.department.invite');
  const perm = usePermissionText();
  const { department, refresh, isDeptAdmin, permissions, can } = usePortal();
  const toast = useToast();

  const [inviteToken, setInviteToken] = useState<string | null>(department?.inviteToken ?? null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [preset, setPreset] = useState<InvitePresetOption>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);

  useEffect(() => {
    if (department?.inviteToken !== undefined) {
      setInviteToken(department.inviteToken ?? null);
    }
  }, [department?.inviteToken]);

  const canInvite = can('DEPARTMENT_SETTINGS') || can('PEOPLE_MANAGE');
  const parsedEmails = useMemo(() => parseEmailList(inviteEmail), [inviteEmail]);

  const allowedPresets = useMemo(() => {
    if (isDeptAdmin) return PRESET_ORDER;
    if (!can('PEOPLE_MANAGE')) return [];
    const own = new Set(permissions);
    return PRESET_ORDER.filter((key) => {
      const normalized = normalizePermissions(DEPARTMENT_PERMISSION_PRESETS[key].permissions);
      return normalized.every((p) => own.has(p)) && normalized.length < own.size;
    });
  }, [isDeptAdmin, can, permissions]);

  if (!canInvite) return null;

  const reportError = (err: unknown) => {
    const msg = errorMessage(err);
    if (onError) onError(msg);
    else toast({ title: 'Das hat nicht geklappt', description: msg, tone: 'error' });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-fg">{t('title')}</p>
          <p className="text-2xs text-fg-muted">
            {t('desc')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inviteToken && typeof window !== 'undefined' && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                const base = getLoginUrl(window.location.origin);
                const url = `${base}${base.includes('?') ? '&' : '?'}invite=${encodeURIComponent(inviteToken)}`;
                await navigator.clipboard.writeText(url);
                toast({ title: t('copiedToast') });
              }}
            >
              <Copy className="size-3.5" /> {t('copyLinkBtn')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={rotatingToken}
            onClick={async () => {
              setRotatingToken(true);
              try {
                const res = await api<{ inviteToken: string }>('/api/departments/current/invite-token', {
                  method: 'POST',
                });
                setInviteToken(res.inviteToken);
                await refresh();
                toast({ title: t('copiedToast') });
              } catch (err) {
                reportError(err);
              } finally {
                setRotatingToken(false);
              }
            }}
          >
            <RefreshCw className="size-3.5" /> {t('rotateBtn')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          rows={2}
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          aria-label={t('x.emailsAria')}
          className="min-h-[2.5rem] text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {allowedPresets.length > 0 && (
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value as InvitePresetOption)}
                aria-label={t('x.roleAria')}
                className="h-9 w-auto min-w-44 text-xs"
              >
                <option value="MEMBER">{t('x.asMember')}</option>
                {allowedPresets.map((key) => (
                  <option key={key} value={key}>
                    {t('x.withRight', { label: perm.presetLabel(key) })}
                  </option>
                ))}
              </Select>
            )}
            {parsedEmails.length > 1 && (
              <span className="text-2xs font-medium text-fg-muted">
                {t('x.emailsFound', { count: parsedEmails.length })}
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={inviting}
            disabled={parsedEmails.length === 0}
            onClick={async () => {
              setInviting(true);
              try {
                const res = await api<{
                  ok: boolean;
                  sent: boolean;
                  sentCount?: number;
                  skippedCount?: number;
                  inviteToken?: string;
                }>('/api/departments/current/invite', {
                  method: 'POST',
                  json: { emails: parsedEmails, preset },
                });
                if (res.inviteToken) setInviteToken(res.inviteToken);
                setInviteEmail('');
                await refresh();
                const count = res.sentCount ?? parsedEmails.length;
                toast({
                  title: t('sentSuccess', { count }),
                });
              } catch (err) {
                reportError(err);
              } finally {
                setInviting(false);
              }
            }}
          >
            <Mail className="size-3.5" />{' '}
            {t('sendBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
