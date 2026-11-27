'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Crown, Database, LayoutList, Pencil, Table2, UserMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DEPARTMENT_PERMISSION_KEYS,
  STUFE_ROLES,
  formatZurichDate,
  type OrganizationConfig,
  type DepartmentPermission,
  type DepartmentPersonDto,
  type DepartmentStufeDto,
  type StufeRole,
} from '@schichtplan/shared';
import { Badge, Button, Callout, EmptyState, Input, Skeleton, cn, useConfirm, useOrganization, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePermissionText } from '@/lib/permissionText';
import { usePortal } from '@/lib/portal';
import { DepartmentInviteBox } from './DepartmentInviteBox';
import { PermissionEditor } from './PermissionEditor';

const roleInput = (p: DepartmentPersonDto) => ({
  isLeader: p.departmentRole === 'ADMIN',
  permissions: p.permissions,
  isHomeDepartment: p.isMember ?? p.isHomeDepartment,
});

/** Gehört zur Abteilung (Heimabteilung oder zusätzlich beigetreten) */
const isMemberHere = (p: DepartmentPersonDto) => p.isMember ?? p.isHomeDepartment;

/** Personen der Abteilung: Rechte und Stufen bearbeiten, Übersicht wer was darf. */
export function DepartmentPeoplePanel() {
  const t = useTranslations('web.department.people');
  const permText = usePermissionText();
  const toast = useToast();
  const confirm = useConfirm();
  const { user, isDeptAdmin, permissions } = usePortal();
  const [people, setPeople] = useState<DepartmentPersonDto[] | null>(null);
  const [stufen, setStufen] = useState<DepartmentStufeDto[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [withGuests, setWithGuests] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api<DepartmentPersonDto[]>(`/api/departments/current/people${withGuests ? '?alle=1' : ''}`),
        api<DepartmentStufeDto[]>('/api/departments/current/stufen'),
      ]);
      setPeople(list);
      setStufen(st);
    } catch (err) {
      toast({ title: t('loadFailedToast'), description: errorMessage(err), tone: 'error' });
      setPeople([]);
    }
  }, [toast, withGuests, t]);

  useEffect(() => {
    load();
  }, [load]);

  const org = useOrganization();
  const isVerein = org.slug === 'verein';

  // Was ich vergeben darf: Abteilungsleitung alles (null), sonst nur weniger als die eigenen Rechte
  const grantable = useMemo(() => (isDeptAdmin ? null : new Set(permissions)), [isDeptAdmin, permissions]);

  const remove = async (person: DepartmentPersonDto) => {
    const ok = await confirm({
      title: t('removeConfirmTitle', { name: person.nickname || person.ceviName || person.firstName }),
      description: t('removeConfirmDesc', { unitTerm: org.unitTerm }),
      confirmLabel: t('removeConfirmBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/departments/current/people/${person.userId}`, { method: 'DELETE' });
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: t('removeFailedToast'), description: errorMessage(err), tone: 'error' });
    }
  };

  const confirmHome = async (person: DepartmentPersonDto) => {
    const name = person.nickname || person.ceviName || person.firstName;
    const ok = await confirm({
      title: t('confirmHomeTitle', { name }),
      description: t('confirmHomeDesc', { unitTerm: org.unitTerm }),
      confirmLabel: t('confirmHomeBtn'),
    });
    if (!ok) return;
    try {
      await api(`/api/departments/current/people/${person.userId}/confirm`, { method: 'POST', json: {} });
      toast({ title: t('confirmedToast', { name }) });
      await load();
    } catch (err) {
      toast({ title: t('confirmFailedToast'), description: errorMessage(err), tone: 'error' });
    }
  };

  const unconfirmHome = async (person: DepartmentPersonDto) => {
    try {
      await api(`/api/departments/current/people/${person.userId}/confirm`, { method: 'DELETE' });
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: t('unconfirmFailedToast'), description: errorMessage(err), tone: 'error' });
    }
  };

  if (people === null) return <Skeleton className="h-40 rounded-card" />;
  const q = query.trim().toLowerCase();
  const visible = q ? people.filter((p) => p.displayName.toLowerCase().includes(q)) : people;
  const leaders = people.filter((p) => p.departmentRole === 'ADMIN');
  const missingLeaders = people.filter((p) => p.isCeviDbDepartmentLeader && p.departmentRole !== 'ADMIN');

  return (
    <div className="space-y-4">
      <DepartmentInviteBox />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {t('summaryCount', { count: people.length })}{' '}
          {isVerein
            ? t('summaryHintVerein')
            : t('summaryHintOrg', { leadTerm: org.leadTerm, provider: org.authProviderShort })}
        </p>
        <div role="tablist" aria-label={t('x.viewAria')} className="flex rounded-full bg-surface-2 p-0.5">
          {(
            [
              { key: 'list', label: t('viewList'), icon: LayoutList },
              { key: 'matrix', label: t('viewMatrix'), icon: Table2 },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
                view === v.key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              )}
            >
              <v.icon className="size-3.5" /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {leaders.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <Crown className="size-3.5 text-accent-ink" /> {t('leadersLabel', { unitTerm: org.unitTerm })}
          <span className="font-semibold text-fg">{leaders.map((p) => p.nickname || p.ceviName || p.firstName).join(', ')}</span>
        </p>
      )}
      {missingLeaders.length > 0 && (
        <p className="text-xs text-warning-ink">
          {t('missingLeadersNotice', {
            provider: org.authProviderShort,
            names: missingLeaders.map((p) => p.nickname || p.ceviName || p.firstName).join(', '),
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {people.length > 8 && (
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-10 min-w-48 flex-1"
          />
        )}
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={withGuests}
            onChange={(e) => setWithGuests(e.target.checked)}
            className="size-4 rounded border-line"
          />
          {t('guestsCheckbox')}
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDesc')} />
      ) : view === 'matrix' ? (
        <PermissionMatrix people={visible} />
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-card border border-line">
          {visible.map((p) => (
            <li key={p.userId} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                    <span className="truncate">{p.displayName}</span>
                    <Badge size="sm" tone={p.departmentRole === 'ADMIN' ? 'accent' : 'neutral'}>
                      {p.departmentRole === 'ADMIN' && <Crown className="size-3" />} {permText.roleLabel(roleInput(p))}
                    </Badge>
                    {p.source === 'CEVIDB' && !isVerein && (
                      <Badge size="sm">
                        <Database className="size-3" /> {org.authProviderShort}
                      </Badge>
                    )}
                    {p.source === 'CONFIRMED' && (
                      <Badge size="sm">
                        <BadgeCheck className="size-3" /> {t('badgeConfirmed')}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {!isMemberHere(p)
                      ? t('memberOther')
                      : p.isAdditionalMember && !p.stufen.length
                        ? t('memberAdditional')
                        : p.stufen.length
                        ? p.stufen.map((s) => `${s.name} (${STUFE_ROLES[s.role]})`).join(', ')
                        : t('noStufe')}
                  </p>
                  {p.source === 'CONFIRMED' && (
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {p.isAdditionalMember
                        ? (p.confirmedBy ? t('confirmedByPerson', { name: p.confirmedBy }) : t('confirmedByInvite'))
                        : t('confirmedManual', { by: p.confirmedBy ? ` von ${p.confirmedBy}` : '' })}
                      {p.confirmedAt ? t('confirmedOn', { date: formatZurichDate(p.confirmedAt) }) : ''}
                      {!isVerein && !p.isAdditionalMember && t('notFromProvider', { provider: org.authProviderShort })}
                    </p>
                  )}
                </div>
                {p.canConfirmHome && (
                  <Button size="sm" variant="ghost" onClick={() => confirmHome(p)} aria-label={t('x.confirmAria', { name: p.displayName })}>
                    <BadgeCheck /> <span className="hidden sm:inline">{t('confirmBtn')}</span>
                  </Button>
                )}
                {p.canEdit && (
                  <Button
                    size="sm"
                    variant={editing === p.userId ? 'primary' : 'ghost'}
                    onClick={() => setEditing(editing === p.userId ? null : p.userId)}
                    aria-expanded={editing === p.userId}
                    aria-label={`${p.displayName} bearbeiten`}
                  >
                    <Pencil /> <span className="hidden sm:inline">{t('editBtn')}</span>
                  </Button>
                )}
              </div>
              {editing === p.userId && (
                <PersonEditor
                  person={p}
                  stufen={stufen}
                  grantable={grantable}
                  isSelf={user?.id === p.userId}
                  isDeptAdmin={Boolean(isDeptAdmin)}
                  org={org}
                  onCancel={() => setEditing(null)}
                  onRemove={() => remove(p)}
                  onUnconfirm={isDeptAdmin && p.source === 'CONFIRMED' ? () => unconfirmHome(p) : undefined}
                  onSaved={async () => {
                    setEditing(null);
                    toast({ title: t('personSavedToast', { name: p.ceviName || p.firstName }) });
                    await load();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Übersicht: Personen mit Rechten (Zeilen) und Rechte (Spalten) */
function PermissionMatrix({ people }: { people: DepartmentPersonDto[] }) {
  const t = useTranslations('web.department.people');
  const permText = usePermissionText();
  const rows = people.filter((p) => p.departmentRole === 'ADMIN' || p.permissions.length > 0);
  if (rows.length === 0) {
    return <EmptyState title={t('matrixEmptyTitle')} description={t('matrixEmptyDesc')} />;
  }
  return (
    <>
    {/* Handy: eine Karte pro Person mit ihren Berechtigungen statt einer breiten Matrix */}
    <ul className="max-h-[28rem] divide-y divide-line overflow-auto rounded-card border border-line md:hidden">
      {rows.map((p) => {
        const isLeader = p.departmentRole === 'ADMIN';
        const granted = isLeader ? DEPARTMENT_PERMISSION_KEYS : DEPARTMENT_PERMISSION_KEYS.filter((perm) => p.permissions.includes(perm));
        return (
          <li key={p.userId} className="px-4 py-3">
            <p className="font-semibold text-fg">{p.ceviName || p.firstName}</p>
            <p className="text-2xs text-fg-subtle">{permText.roleLabel(roleInput(p))}</p>
            {granted.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {granted.map((perm) => (
                  <li
                    key={perm}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
                      isLeader ? 'border-line text-fg-subtle' : 'border-accent/30 bg-accent/10 text-accent-ink'
                    )}
                  >
                    <Check className="size-3" aria-hidden /> {permText.label(perm)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-fg-subtle">–</p>
            )}
          </li>
        );
      })}
    </ul>
    <div className="max-h-[28rem] overflow-auto rounded-card border border-line max-md:hidden">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-fg-subtle">
              {t('x.colPerson')}
            </th>
            {DEPARTMENT_PERMISSION_KEYS.map((perm) => (
              <th key={perm} scope="col" className="px-1 py-2 align-bottom font-semibold text-fg-subtle">
                <span
                  title={permText.description(perm)}
                  className="mx-auto block max-h-52 rotate-180 whitespace-nowrap [writing-mode:vertical-rl]"
                >
                  {permText.label(perm)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => {
            const isLeader = p.departmentRole === 'ADMIN';
            const has = new Set<DepartmentPermission>(p.permissions);
            return (
              <tr key={p.userId}>
                <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                  <span className="block max-w-40 truncate font-semibold text-fg">{p.ceviName || p.firstName}</span>
                  <span className="block text-2xs text-fg-subtle">{permText.roleLabel(roleInput(p))}</span>
                </th>
                {DEPARTMENT_PERMISSION_KEYS.map((perm) => (
                  <td key={perm} className="px-1 py-2 text-center">
                    {isLeader || has.has(perm) ? (
                      <Check
                        className={cn('mx-auto size-4', isLeader ? 'text-fg-subtle' : 'text-accent-ink')}
                        aria-label={t('x.yes', { label: permText.label(perm) })}
                      />
                    ) : (
                      <span
                        className="text-fg-subtle/40"
                        role="img"
                        aria-label={t('x.no', { label: permText.label(perm) })}
                      >
                        ·
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function PersonEditor({
  person,
  stufen,
  grantable,
  isSelf,
  isDeptAdmin,
  org,
  onCancel,
  onRemove,
  onUnconfirm,
  onSaved,
}: {
  person: DepartmentPersonDto;
  stufen: DepartmentStufeDto[];
  grantable: ReadonlySet<DepartmentPermission> | null;
  isSelf: boolean;
  isDeptAdmin: boolean;
  org: OrganizationConfig;
  onCancel: () => void;
  onRemove: () => void;
  onUnconfirm?: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('web.department.people');
  const isVerein = org.slug === 'verein';
  const [role, setRole] = useState<'ADMIN' | 'HELPER'>(person.departmentRole === 'ADMIN' ? 'ADMIN' : 'HELPER');
  const [roles, setRoles] = useState<Record<string, StufeRole>>(
    Object.fromEntries(person.stufen.map((s) => [s.stufeId, s.role]))
  );
  const [perms, setPerms] = useState<DepartmentPermission[]>(person.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = new Set(person.stufen.filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId));
  const isLeader = isVerein && isDeptAdmin ? role === 'ADMIN' : person.departmentRole === 'ADMIN';
  const canHaveRights = !isLeader && !person.isCeviNameProfile;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/departments/current/people/${person.userId}`, {
        method: 'PATCH',
        json: {
          role: isVerein && isDeptAdmin ? role : undefined,
          permissions: canHaveRights ? perms : undefined,
          stufen: isMemberHere(person)
            ? Object.entries(roles).map(([stufeId, r]) => ({ stufeId, role: r }))
            : undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-4 rounded-field border border-line bg-surface-2/60 p-3">
      {error && <Callout tone="danger">{error}</Callout>}
      {isVerein && isDeptAdmin && !person.isCeviNameProfile && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-subtle">{t('roleInVerein')}</p>
          <div role="radiogroup" aria-label={t('roleInVerein')} className="flex rounded-full bg-surface p-0.5">
            {/* biome-ignore lint/a11y/useSemanticElements: Segmented Control mit ARIA-Radio-Pattern */}
            <button
              type="button"
              role="radio"
              aria-checked={role === 'ADMIN'}
              onClick={() => setRole('ADMIN')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition',
                role === 'ADMIN' ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
              )}
            >
              <Crown className="size-3.5 text-accent-ink" /> {t('roleVereinsleitung')}
            </button>
            {/* biome-ignore lint/a11y/useSemanticElements: Segmented Control mit ARIA-Radio-Pattern */}
            <button
              type="button"
              role="radio"
              aria-checked={role === 'HELPER'}
              onClick={() => setRole('HELPER')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition',
                role === 'HELPER' ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
              )}
            >
              {t('roleMitglied')}
            </button>
          </div>
        </div>
      )}
      {isLeader ? (
        <p className="text-xs leading-relaxed text-fg-muted">
          <Crown className="mr-1 inline size-3.5 text-accent-ink" />
          {isVerein
            ? t('leaderExplanationVerein')
            : t('leaderExplanationOrg', {
                leadTerm: org.leadTerm,
                source: person.leaderSource === 'CEVIDB' ? `laut ${org.authProviderShort}` : 'vom Admin-Portal',
                provider: org.authProviderShort,
              })}
        </p>
      ) : person.isCeviNameProfile ? (
        <p className="text-xs leading-relaxed text-warning-ink">
          {t('nicknameOnlyWarning', {
            nicknameTerm: org.nicknameTerm,
            accountHint: isVerein
              ? 'mit E-Mail und Passwort.'
              : `mit ${org.authProviderShort} oder mit E-Mail und Passwort.`,
          })}
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-subtle">{t('rightsInUnit', { unitTerm: org.unitTerm })}</p>
          <PermissionEditor value={perms} onChange={setPerms} grantable={isSelf ? new Set() : grantable} />
          <div className="mt-3 rounded-card border border-line/60 bg-surface/60 p-2 text-2xs leading-normal text-fg-subtle">
            {t('okTeamHint')}
          </div>
        </div>
      )}

      {isMemberHere(person) && stufen.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-fg-subtle">{t('x.levels')}</p>
          <ul className="space-y-1.5">
            {stufen.map((stufe) => {
              const isLocked = locked.has(stufe.id);
              const current = roles[stufe.id] ?? null;
              return (
                <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-fg">
                    {stufe.name}
                    {isLocked && !isVerein && (
                      <span className="ml-1.5 text-xs text-fg-subtle">{t('fromProvider', { provider: org.authProviderShort })}</span>
                    )}
                  </span>
                  <div role="radiogroup" aria-label={t('roleInStufeAria', { name: stufe.name })} className="flex rounded-full bg-surface p-0.5">
                    {([null, 'TEILNEHMER', 'LEITUNG'] as const).map((value) => (
                      /* biome-ignore lint/a11y/useSemanticElements: Segmented Control mit ARIA-Radio-Pattern */
                      <button
                        key={value ?? 'none'}
                        type="button"
                        role="radio"
                        aria-checked={current === value}
                        disabled={isLocked}
                        onClick={() =>
                          setRoles((prev) => {
                            const next = { ...prev };
                            if (value) next[stufe.id] = value;
                            else delete next[stufe.id];
                            return next;
                          })
                        }
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                          current === value ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
                        )}
                      >
                        {value ? STUFE_ROLES[value] : t('roleNone')}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-2">
          {isMemberHere(person) && person.source !== 'CEVIDB' && (!isLeader || isVerein) && (
            <Button size="sm" variant="ghost" onClick={onRemove} className="hover:text-danger-ink">
              <UserMinus /> {t('removeFromUnit', { unitTerm: org.unitTerm })}
            </Button>
          )}
          {onUnconfirm && (
            <Button size="sm" variant="ghost" onClick={onUnconfirm}>
              {t('unconfirmHome')}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
