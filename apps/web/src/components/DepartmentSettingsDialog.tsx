'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronDown, QrCode, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DepartmentJoinMode, PasswordlessAccountsDto } from '@schichtplan/shared';
import {
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  Select,
  Switch,
  applyAccent,
  cn,
  useOrganization,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { DepartmentAuditPanel } from './DepartmentAuditPanel';
import { DepartmentInviteBox } from './DepartmentInviteBox';
import { DepartmentPeoplePanel } from './DepartmentPeoplePanel';
import { DepartmentStatsPanel } from './DepartmentStatsPanel';
import { DepartmentStufenPanel } from './DepartmentStufenPanel';
import { ImageUpload } from './ImageUpload';
import { DepartmentBrandingPreview } from './DepartmentBrandingPreview';

// Kuratierte Akzentfarben mit optimalem Kontrast
const SWATCHES_PRIMARY = ['#e11d48', '#64284b', '#283583', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed'];
const SWATCHES_SECONDARY = ['#003d8f', '#1e293b', '#e11d48', '#16a34a', '#d97706', '#4f46e5', '#0f766e', '#be123c'];

type TabKey = 'general' | 'stufen' | 'people' | 'stats' | 'audit';

export function DepartmentSettingsDialog({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: TabKey;
}) {
  const t = useTranslations('web.department.dialog');
  const { department, can } = usePortal();

  const tabs: { key: TabKey; label: string; isAllowed: boolean }[] = useMemo(() => [
    { key: 'general' as const, label: t('tabGeneral'), isAllowed: can('DEPARTMENT_SETTINGS') },
    { key: 'stufen' as const, label: t('tabStufen'), isAllowed: can('STUFEN_MANAGE') },
    { key: 'people' as const, label: t('tabPeople'), isAllowed: can('PEOPLE_VIEW') },
    { key: 'stats' as const, label: t('tabStats'), isAllowed: can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS') },
    { key: 'audit' as const, label: t('tabAudit'), isAllowed: can('PEOPLE_MANAGE') },
  ].filter((tabItem) => tabItem.isAllowed), [can, t]);

  const [tab, setTab] = useState<TabKey>(initialTab ?? tabs[0]?.key ?? 'general');

  useEffect(() => {
    if (!open) return;
    if (initialTab && tabs.some((t) => t.key === initialTab)) {
      setTab(initialTab);
    } else {
      setTab(tabs[0]?.key ?? 'general');
    }
    // Nur beim Öffnen oder gezielten Wechsel von initialTab synchronisieren
  }, [open, initialTab, tabs]);

  const activeTab = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'general');
  const close = () => {
    applyAccent(department?.primaryColor); // Live-Vorschau zurücksetzen
    setTab(tabs[0]?.key ?? 'general');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      className={activeTab === 'stats' ? 'sm:max-w-4xl' : undefined}
      icon={<Settings2 />}
      title={t('title')}
      description={t('desc')}
    >
      <div role="tablist" aria-label={t('x.sectionsAria')} className="-mt-1 mb-6 flex gap-1 rounded-full bg-surface-2 p-1 overflow-x-auto">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={cn(
              'h-9 flex-1 whitespace-nowrap px-3 rounded-full text-sm font-semibold transition',
              activeTab === tabItem.key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            )}
          >
            {tabItem.label}
          </button>
        ))}
      </div>
      {activeTab === 'general' && can('DEPARTMENT_SETTINGS') && <DepartmentForm onDone={onClose} onCancel={close} />}
      {activeTab === 'stufen' && can('STUFEN_MANAGE') && <DepartmentStufenPanel />}
      {activeTab === 'people' && can('PEOPLE_VIEW') && <DepartmentPeoplePanel />}
      {activeTab === 'stats' && (can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS')) && <DepartmentStatsPanel />}
      {activeTab === 'audit' && can('PEOPLE_MANAGE') && <DepartmentAuditPanel />}
    </Dialog>
  );
}

function DepartmentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const t = useTranslations('web.department.dialog');
  const { department, refresh } = usePortal();
  const toast = useToast();
  const org = useOrganization();
  const [form, setForm] = useState({
    name: department?.name ?? '',
    logoUrl: department?.logoUrl ?? '',
    contactUserId: department?.contactUserId ?? '',
    primaryColor: department?.primaryColor ?? SWATCHES_PRIMARY[0],
    secondaryColor: department?.secondaryColor ?? '#003d8f',
    qrStyle: (department?.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID') ?? 'CORNERS',
    enableTwoTone: Boolean(department?.secondaryColor),
    qrCustomColors: department?.qrCustomColors ?? false,
    qrColorPrimary: department?.qrColorPrimary ?? '#0f172a',
    qrColorSecondary: department?.qrColorSecondary ?? '#e11d48',
    membersOnly: department?.membersOnly ?? true,
    allowPasswordless: department?.allowPasswordless ?? false,
    joinMode: (department?.joinMode ?? 'LINK_ONLY') as DepartmentJoinMode,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ userId: string; displayName: string; isLeader: boolean }[] | null>(null);
  const [passwordless, setPasswordless] = useState<PasswordlessAccountsDto | null>(null);
  const [showLockedOut, setShowLockedOut] = useState(false);

  useEffect(() => {
    api<{ userId: string; displayName: string; isLeader: boolean }[]>('/api/departments/current/contact-candidates')
      .then(setCandidates)
      .catch(() => setCandidates([]));
    api<PasswordlessAccountsDto>('/api/departments/current/passwordless-accounts')
      .then(setPasswordless)
      .catch(() => setPasswordless(null));
  }, []);

  const pickPrimaryColor = (color: string) => {
    setForm((f) => ({ ...f, primaryColor: color }));
    applyAccent(color);
  };

  const pickSecondaryColor = (color: string) => {
    setForm((f) => ({ ...f, secondaryColor: color }));
  };

  const pickQrPrimaryColor = (color: string) => {
    setForm((f) => ({ ...f, qrColorPrimary: color }));
  };

  const pickQrSecondaryColor = (color: string) => {
    setForm((f) => ({ ...f, qrColorSecondary: color }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api<{ inviteToken?: string | null }>('/api/departments/current', {
        method: 'PATCH',
        json: {
          name: form.name.trim() || undefined,
          logoUrl: form.logoUrl.trim() || null,
          contactUserId: form.contactUserId || null,
          primaryColor: form.primaryColor,
          secondaryColor: form.enableTwoTone ? (form.secondaryColor.trim() || null) : null,
          qrStyle: form.qrCustomColors || form.enableTwoTone ? form.qrStyle : 'SOLID',
          qrCustomColors: form.qrCustomColors,
          qrColorPrimary: form.qrCustomColors ? (form.qrColorPrimary.trim() || null) : null,
          qrColorSecondary: form.qrCustomColors ? (form.qrColorSecondary.trim() || null) : null,
          membersOnly: form.membersOnly,
          allowPasswordless: form.allowPasswordless,
          joinMode: form.joinMode,
        },
      });
      await refresh();
      toast({ title: t('savedToast') });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label={t('nameLabel')} hint={t('nameHint')}>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          maxLength={80}
        />
      </Field>

      <Field
        label={t('contactLabel')}
        hint={t('contactHint')}
      >
        <Select
          value={form.contactUserId}
          onChange={(e) => setForm((f) => ({ ...f, contactUserId: e.target.value }))}
        >
          <option value="">{t('contactNone')}</option>
          {candidates?.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName} {c.isLeader ? t('contactLeaderSuffix') : ''}
            </option>
          ))}
        </Select>
      </Field>

      <ImageUpload
        label={t('logoLabel')}
        hint={t('logoHint')}
        value={form.logoUrl}
        onChange={(url) => setForm((f) => ({ ...f, logoUrl: url ?? '' }))}
      />

      <Switch
        checked={form.membersOnly}
        onChange={(v) => setForm((f) => ({ ...f, membersOnly: v }))}
        label={t('membersOnlyLabel')}
        description={t('membersOnlyDesc')}
      />

      <Switch
        checked={form.allowPasswordless}
        onChange={(v) => setForm((f) => ({ ...f, allowPasswordless: v }))}
        label={t('passwordlessLabel')}
        description={t('passwordlessDesc', { nicknameTerm: org.nicknameTerm })}
      />

      {!form.allowPasswordless && passwordless && passwordless.count > 0 && (
        <Callout
          tone="warning"
          title={
            passwordless.count === 1
              ? t('passwordlessLockoutOne')
              : t('passwordlessLockoutOther', { count: passwordless.count })
          }
        >
          <p className="mt-1 text-[13px] leading-relaxed text-fg">
            {passwordless.count === 1 ? t('passwordlessLockoutTextOne') : t('passwordlessLockoutTextOther')}
          </p>
          <button
            type="button"
            aria-expanded={showLockedOut}
            onClick={() => setShowLockedOut((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink underline underline-offset-2"
          >
            {showLockedOut ? t('hideDetails') : t('showDetails')}
            <ChevronDown className={cn('size-3.5 transition-transform', showLockedOut && 'rotate-180')} />
          </button>
          {showLockedOut && (
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
              {passwordless.people.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold text-fg">{p.nickname || p.firstName}</span>
                    {p.nickname && (
                      <span className="text-fg-muted">
                        {' '}
                        ({[p.firstName, p.lastName].filter(Boolean).join(' ')})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-2xs text-fg-subtle">
                    {p.lastSeenOn ? t('lastSeenOn', { date: p.lastSeenOn.split('-').reverse().join('.') }) : t('neverActive')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      <Field
        label={t('joinModeLabel')}
        hint={
          department?.organization === 'OTHER'
            ? t('joinModeHintOther')
            : t('joinModeHintHitobito')
        }
      >
        <Select
          value={form.joinMode}
          onChange={(e) => setForm((f) => ({ ...f, joinMode: e.target.value as DepartmentJoinMode }))}
        >
          <option value="LINK_ONLY">{t('joinModeLinkOnly')}</option>
          <option value="INVITE_ONLY">{t('joinModeInviteOnly')}</option>
          <option value="OPEN">{t('joinModeOpen')}</option>
        </Select>
      </Field>

      <DepartmentInviteBox onError={setError} />

      {/* Farben & QR-Code Gestaltung */}
      <fieldset className="space-y-5 rounded-2xl border border-line bg-surface p-4">
        <legend className="px-1 text-[13px] font-bold text-fg">{t('colorsLegend')}</legend>

        {/* 1. Primärfarbe */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-fg">
            {t('primaryColorLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {SWATCHES_PRIMARY.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Farbe ${color}`}
                aria-pressed={form.primaryColor.toLowerCase() === color.toLowerCase()}
                onClick={() => pickPrimaryColor(color)}
                style={{ backgroundColor: color }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                  form.primaryColor.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                )}
              >
                {form.primaryColor.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
              </button>
            ))}
            <label
              className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
              title={t('customColorTitle')}
            >
              <span aria-hidden>+</span>
              <input
                type="color"
                value={form.primaryColor.startsWith('#') && form.primaryColor.length === 7 ? form.primaryColor : '#e11d48'}
                onChange={(e) => pickPrimaryColor(e.target.value)}
                aria-label={t('customColorTitle')}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <div className="w-28">
              <Input
                value={form.primaryColor}
                onChange={(e) => pickPrimaryColor(e.target.value)}
                placeholder="#e11d48"
                maxLength={7}
                className="h-9 font-mono text-xs uppercase"
                aria-label={t('hexPrimaryAria')}
              />
            </div>
          </div>
        </div>

        {/* 2. QR-Code Farben Modus */}
        <div className="border-t border-line/70 pt-4 space-y-4">
          <Switch
            checked={form.qrCustomColors}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                qrCustomColors: v,
                qrColorPrimary: v && !f.qrColorPrimary ? '#0f172a' : f.qrColorPrimary,
                qrColorSecondary: v && !f.qrColorSecondary ? f.primaryColor : f.qrColorSecondary,
              }))
            }
            label={t('qrCustomColorsLabel')}
            description={t('qrCustomColorsDesc')}
          />

          {/* FALL A: Eigene QR-Code Farben */}
          {form.qrCustomColors ? (
            <div className="space-y-4 rounded-xl border border-line/70 bg-surface-2/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <QrCode className="size-4 text-accent-ink" />
                <span>{t('qrPaletteTitle')}</span>
              </div>

              {/* QR-Hauptfarbe */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-fg">
                  {t('qrPrimaryLabel')}
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {SWATCHES_PRIMARY.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`QR-Hauptfarbe ${color}`}
                      aria-pressed={form.qrColorPrimary.toLowerCase() === color.toLowerCase()}
                      onClick={() => pickQrPrimaryColor(color)}
                      style={{ backgroundColor: color }}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                        form.qrColorPrimary.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                      )}
                    >
                      {form.qrColorPrimary.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                    </button>
                  ))}
                  <label
                    className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                    title={t('customQrPrimaryTitle')}
                  >
                    <span aria-hidden>+</span>
                    <input
                      type="color"
                      value={form.qrColorPrimary.startsWith('#') && form.qrColorPrimary.length === 7 ? form.qrColorPrimary : '#0f172a'}
                      onChange={(e) => pickQrPrimaryColor(e.target.value)}
                      aria-label={t('customQrPrimaryTitle')}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="w-28">
                    <Input
                      value={form.qrColorPrimary}
                      onChange={(e) => pickQrPrimaryColor(e.target.value)}
                      placeholder="#0f172a"
                      maxLength={7}
                      className="h-9 font-mono text-xs uppercase"
                      aria-label={t('hexQrPrimaryAria')}
                    />
                  </div>
                </div>
              </div>

              {/* QR-Zweitfarbe */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-fg">
                  {t('qrSecondaryLabel')}
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {SWATCHES_SECONDARY.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`QR-Zweitfarbe ${color}`}
                      aria-pressed={form.qrColorSecondary.toLowerCase() === color.toLowerCase()}
                      onClick={() => pickQrSecondaryColor(color)}
                      style={{ backgroundColor: color }}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                        form.qrColorSecondary.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                      )}
                    >
                      {form.qrColorSecondary.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                    </button>
                  ))}
                  <label
                    className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                    title={t('customQrSecondaryTitle')}
                  >
                    <span aria-hidden>+</span>
                    <input
                      type="color"
                      value={form.qrColorSecondary.startsWith('#') && form.qrColorSecondary.length === 7 ? form.qrColorSecondary : '#e11d48'}
                      onChange={(e) => pickQrSecondaryColor(e.target.value)}
                      aria-label={t('customQrSecondaryTitle')}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="w-28">
                    <Input
                      value={form.qrColorSecondary}
                      onChange={(e) => pickQrSecondaryColor(e.target.value)}
                      placeholder="#e11d48"
                      maxLength={7}
                      className="h-9 font-mono text-xs uppercase"
                      aria-label={t('hexQrSecondaryAria')}
                    />
                  </div>
                </div>
              </div>

              {/* Stil-Auswahl: CORNERS vs GRADIENT vs SOLID */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-fg">{t('qrStyleLabel')}</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'CORNERS' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'CORNERS'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">{t('qrStyleCornersTitle')}</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      {t('qrStyleCornersDesc')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'GRADIENT' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'GRADIENT'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">{t('qrStyleGradientTitle')}</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      {t('qrStyleGradientDesc')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'SOLID' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'SOLID'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">{t('qrStyleSolidTitle')}</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      {t('qrStyleSolidDesc')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* FALL B: Erbt Abteilungsfarben */
            <>
              <Switch
                checked={form.enableTwoTone}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    enableTwoTone: v,
                    secondaryColor: v && !f.secondaryColor ? '#003d8f' : f.secondaryColor,
                  }))
                }
                label={t('enableTwoToneLabel')}
                description={t('enableTwoToneDesc')}
              />

              {form.enableTwoTone && (
                <div className="space-y-4 rounded-xl border border-line/60 bg-surface-2/40 p-3.5">
                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-fg">
                      {t('secondaryColorLabel')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {SWATCHES_SECONDARY.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Zweitfarbe ${color}`}
                          aria-pressed={form.secondaryColor.toLowerCase() === color.toLowerCase()}
                          onClick={() => pickSecondaryColor(color)}
                          style={{ backgroundColor: color }}
                          className={cn(
                            'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                            form.secondaryColor.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                          )}
                        >
                          {form.secondaryColor.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                        </button>
                      ))}
                      <label
                        className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                        title={t('customSecondaryColorTitle')}
                      >
                        <span aria-hidden>+</span>
                        <input
                          type="color"
                          value={form.secondaryColor.startsWith('#') && form.secondaryColor.length === 7 ? form.secondaryColor : '#003d8f'}
                          onChange={(e) => pickSecondaryColor(e.target.value)}
                          aria-label={t('customSecondaryColorTitle')}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <div className="w-28">
                        <Input
                          value={form.secondaryColor}
                          onChange={(e) => pickSecondaryColor(e.target.value)}
                          placeholder="#003d8f"
                          maxLength={7}
                          className="h-9 font-mono text-xs uppercase"
                          aria-label={t('hexQrSecondaryAria')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-semibold text-fg">{t('qrStyleLabel')}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, qrStyle: 'CORNERS' }))}
                        className={cn(
                          'rounded-xl border p-2.5 text-left transition',
                          form.qrStyle === 'CORNERS'
                            ? 'border-accent bg-accent/10 text-fg shadow-xs'
                            : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                        )}
                      >
                        <span className="block text-xs font-bold text-fg">{t('qrStyleCornersTitle')}</span>
                        <span className="block text-[11px] text-fg-subtle mt-0.5">
                          {t('qrStyleCornersTwoToneDesc')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, qrStyle: 'GRADIENT' }))}
                        className={cn(
                          'rounded-xl border p-2.5 text-left transition',
                          form.qrStyle === 'GRADIENT'
                            ? 'border-accent bg-accent/10 text-fg shadow-xs'
                            : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                        )}
                      >
                        <span className="block text-xs font-bold text-fg">{t('qrStyleGradientTitle')}</span>
                        <span className="block text-[11px] text-fg-subtle mt-0.5">
                          {t('qrStyleGradientTwoToneDesc')}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Live-Vorschau mit Kontrast-Check für beide Farben */}
        <DepartmentBrandingPreview
          name={form.name}
          logoUrl={form.logoUrl}
          primaryColor={form.primaryColor}
          secondaryColor={form.enableTwoTone ? form.secondaryColor : null}
          qrStyle={form.qrCustomColors ? form.qrStyle : (form.enableTwoTone ? form.qrStyle : 'SOLID')}
          qrCustomColors={form.qrCustomColors}
          qrColorPrimary={form.qrColorPrimary}
          qrColorSecondary={form.qrColorSecondary}
          organization={department?.organization}
        />
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancelBtn')}
        </Button>
        <Button type="submit" loading={saving}>
          {saving ? t('savingBtn') : t('saveBtn')}
        </Button>
      </div>
    </form>
  );
}
