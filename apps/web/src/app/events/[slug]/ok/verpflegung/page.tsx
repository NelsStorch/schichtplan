'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import { PhysicalBonsManager } from '@/components/ok/PhysicalBonsManager';
import type { CateringTokensOverviewDto } from '@schichtplan/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  buttonClasses,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { useOk } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { fmtDayMonth, fmtTime, fmtTimeRange, fmtWeekday } from '@/lib/format';

type StatusFilter = 'ALL' | 'AVAILABLE' | 'REDEEMED' | 'READY_NOW';
type RoleFilter = 'ALL' | 'HELPER' | 'LEADER';

export default function OkCateringPage() {
  const t = useTranslations('web.ok.catering');
  const { event } = useOk();
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<CateringTokensOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [itemFilter, setItemFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'digital' | 'physical'>('digital');

  const loadOverview = useCallback(async () => {
    if (!event) return;
    setLoading(true);
    try {
      const res = await api<CateringTokensOverviewDto>(`/api/events/${event.slug}/catering-overview`);
      setData(res);
    } catch (err) {
      toast({
        title: 'Verpflegungs-Übersicht konnte nicht geladen werden',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [event, toast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredTokens = useMemo(() => {
    const list = data?.tokens ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((t) => {
      if (statusFilter === 'AVAILABLE' && t.status !== 'AVAILABLE') return false;
      if (statusFilter === 'REDEEMED' && t.status !== 'REDEEMED') return false;
      if (statusFilter === 'READY_NOW' && (t.status !== 'AVAILABLE' || !t.isAvailableNow)) return false;
      if (roleFilter === 'HELPER' && t.isResponsible) return false;
      if (roleFilter === 'LEADER' && !t.isResponsible) return false;
      if (itemFilter !== 'ALL' && t.title !== itemFilter) return false;
      if (q) {
        const hay = `${t.helperName} ${t.title} ${t.shiftTitle ?? ''} ${t.taskTitle ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, query, statusFilter, roleFilter, itemFilter]);

  if (!event) return null;

  const handleManualRedeem = async (tokenId: string, title: string, helperName: string) => {
    const ok = await confirm({
      title: t('manualRedeemConfirmTitle'),
      description: t('manualRedeemConfirmDesc', { title, helperName }),
      confirmLabel: t('manualRedeemBtn'),
      tone: 'default',
    });
    if (!ok) return;

    setBusyId(tokenId);
    try {
      await api(`/api/events/${event.slug}/catering-tokens/${tokenId}/redeem`, {
        method: 'POST',
      });
      toast({
        title: t('manualRedeemSuccess'),
        description: `${title} (${helperName}) wurde als eingelöst markiert.`,
        tone: 'success',
      });
      await loadOverview();
    } catch (err) {
      toast({
        title: t('manualRedeemFailed'),
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleResetToken = async (tokenId: string, title: string, helperName: string) => {
    const ok = await confirm({
      title: t('x.resetConfirmTitle'),
      description: t('x.resetConfirmDesc', { item: title, name: helperName }),
      confirmLabel: t('x.reset'),
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(tokenId);
    try {
      await api(`/api/events/${event.slug}/catering-tokens/${tokenId}/reset`, {
        method: 'POST',
      });
      toast({
        title: t('x.resetDone'),
        description: t('x.resetDoneDesc', { item: title, name: helperName }),
      });
      await loadOverview();
    } catch (err) {
      toast({
        title: t('x.resetFailed'),
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      [t('x.csvPerson'), t('x.csvRole'), t('x.csvVoucher'), t('x.csvStatus'), t('x.csvRedeemedAt'), t('x.csvShift'), t('x.csvShiftStart'), t('x.csvShiftEnd')],
      ...(data.tokens ?? []).map((tok) => [
        tok.helperName,
        tok.isResponsible ? t('x.csvLeader') : t('x.csvHelper'),
        tok.title,
        tok.status === 'REDEEMED' ? t('x.csvRedeemed') : t('x.csvOpen'),
        tok.redeemedAt ? `${fmtDayMonth(tok.redeemedAt)} ${fmtTime(tok.redeemedAt)}` : '',
        tok.shiftTitle || t('x.shift'),
        `${fmtDayMonth(tok.shiftStartTime)} ${fmtTime(tok.shiftStartTime)}`,
        `${fmtDayMonth(tok.shiftEndTime)} ${fmtTime(tok.shiftEndTime)}`,
      ]),
    ];
    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('x.csvFilePrefix')}-${event.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!event.cateringTokensEnabled) {
    return (
      <div>
        <OkPageHeader
          title={t('pageTitle')}
          description={t('pageDesc')}
        />
        <EmptyState
          icon={<UtensilsCrossed />}
          title={t('x.disabledTitle')}
          description={t('x.disabledDesc')}
          action={
            <Link href={`/events/${event.slug}/ok/einstellungen`} className={buttonClasses()}>
              <Settings className="size-4" /> {t('x.enableInSettings')}
            </Link>
          }
        />
      </div>
    );
  }

  const earlyHoursLabel =
    data?.earlyHours !== undefined
      ? data.earlyHours < 0
        ? t('x.validAlways')
        : data.earlyHours === 0
          ? t('x.validFromStart')
          : t('x.validEarly', { count: data.earlyHours })
      : '';

  return (
    <div className="space-y-8">
      <OkPageHeader
        title={t('pageTitle')}
        description={
          <span>
            {t('pageDesc')}{' '}
            {earlyHoursLabel && <span className="font-semibold text-fg">{t('x.validity', { label: earlyHoursLabel })}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void loadOverview()} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> {t('x.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={!data || data.totalTokens === 0}
            >
              <Download className="size-4" /> {t('x.csvExport')}
            </Button>
            <Link
              href={`/events/${event.slug}/ok/einstellungen`}
              className={buttonClasses({ variant: 'ghost', size: 'sm' })}
            >
              <Settings className="size-4" /> {t('x.configure')}
            </Link>
          </>
        }
      />

      {/* Reiter-Auswahl */}
      <div className="flex border-b border-line gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('digital')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'digital'
              ? 'border-accent text-accent-ink'
              : 'border-transparent text-fg-muted hover:text-fg'
          )}
        >
          <UtensilsCrossed className="size-4" /> {t('tabDigital')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('physical')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
            activeTab === 'physical'
              ? 'border-accent text-accent-ink'
              : 'border-transparent text-fg-muted hover:text-fg'
          )}
        >
          <Printer className="size-4" /> {t('tabPhysical')}
        </button>
      </div>

      {activeTab === 'physical' ? (
        <PhysicalBonsManager
          eventSlug={event.slug}
          eventTitle={event.title}
          items={event.cateringTokenItems ?? [t('defaultItemMeal'), t('defaultItemDrink')]}
        />
      ) : loading && !data ? (
        <div className="py-16 text-center text-fg-muted flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-accent-ink" />
          <p className="text-sm">{t('x.loading')}</p>
        </div>
      ) : data ? (
        <>
          {/* 1. Kennzahlen (KPI-Karten) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">{t('kpiIssued')}</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-fg tabular">{data.totalTokens}</p>
              <p className="mt-1 text-xs text-fg-muted">{t('x.inclLeaders')}</p>
            </Card>
            <Card className="p-4 sm:p-5 border-success/30 bg-success/5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-success-ink">{t('kpiRedeemed')}</p>
                <span className="text-xs font-bold text-success-ink tabular">
                  {data.totalTokens > 0 ? Math.round((data.redeemedTokens / data.totalTokens) * 100) : 0}%
                </span>
              </div>
              <p className="mt-1 font-display text-3xl font-extrabold text-success-ink tabular">
                {data.redeemedTokens}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{t('x.collected')}</p>
            </Card>
            <Card className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-fg-subtle">{t('kpiAvailable')}</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-fg tabular">{data.availableTokens}</p>
              <p className="mt-1 text-xs text-fg-muted">{t('x.notRedeemed')}</p>
            </Card>
          </div>

          {/* 2. Aufschlüsselung nach Bon-Typ (Kassensturz) */}
          {data.byItem.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-fg">{t('x.byItemTitle')}</h3>
                {itemFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setItemFilter('ALL')}
                    className="text-xs font-semibold text-accent-ink hover:underline"
                  >
                    {t('x.resetFilter')}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.byItem.map((item) => {
                  const pct = item.total > 0 ? Math.round((item.redeemed / item.total) * 100) : 0;
                  const active = itemFilter === item.title;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setItemFilter(active ? 'ALL' : item.title)}
                      className={cn(
                        'text-left rounded-card border p-4 transition-all',
                        active
                          ? 'border-accent bg-accent/8 ring-2 ring-accent/30'
                          : 'border-line bg-surface hover:border-line-strong'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-fg truncate">{item.title}</span>
                        <Badge tone={item.redeemed > 0 ? 'accent' : 'neutral'} size="sm">
                          {t('x.pctRedeemed', { pct })}
                        </Badge>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-fg-muted tabular">
                        <span>
                          {t.rich('x.redeemedCount', { count: item.redeemed, strong: (chunks) => <strong className="text-fg">{chunks}</strong> })}
                        </span>
                        <span>
                          {t('x.openOf', { open: item.available, total: item.total })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 3. Alle Bons durchsuchen, manuell entwerten oder zurücksetzen */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-fg">
                  {filteredTokens.length !== (data.tokens?.length ?? 0)
                    ? t('x.allTokensFiltered', { shown: filteredTokens.length, total: data.tokens?.length ?? 0 })
                    : t('x.allTokens', { count: filteredTokens.length })}
                </h3>
                <p className="text-xs text-fg-muted">
                  {t('x.allTokensHint')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="pl-9"
                />
              </div>

              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label={t('x.filterStatus')}
              >
                <option value="ALL">{t('statusFilterAll')} ({data.totalTokens})</option>
                <option value="AVAILABLE">{t('statusFilterAvailable')} ({data.availableTokens})</option>
                <option value="READY_NOW">{t('statusFilterReadyNow')}</option>
                <option value="REDEEMED">{t('statusFilterRedeemed')} ({data.redeemedTokens})</option>
              </Select>

              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                aria-label={t('x.filterRole')}
              >
                <option value="ALL">{t('roleFilterAll')}</option>
                <option value="HELPER">{t('roleFilterHelper')}</option>
                <option value="LEADER">{t('roleFilterLeader')}</option>
              </Select>

              <Select
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
                aria-label={t('x.filterItem')}
              >
                <option value="ALL">{t('itemFilterAll')}</option>
                {data.byItem.map((i) => (
                  <option key={i.title} value={i.title}>
                    {i.title} ({i.redeemed}/{i.total})
                  </option>
                ))}
              </Select>
            </div>

            {filteredTokens.length === 0 ? (
              <EmptyState
                icon={<Ticket />}
                title={t('emptyTokensTitle')}
                description={t('emptyTokensDesc')}
              />
            ) : (
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="divide-y divide-line">
                  {filteredTokens.map((tRow) => {
                    const isRedeemed = tRow.status === 'REDEEMED';
                    return (
                      <div
                        key={tRow.id}
                        className={cn(
                          'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                          isRedeemed && 'bg-surface-2/40'
                        )}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-fg">{tRow.helperName}</span>
                            {tRow.isResponsible && (
                              <Badge tone="accent" size="sm">
                                <Shield className="size-3" /> {t('responsibleBadge')}
                              </Badge>
                            )}
                            <Badge tone={isRedeemed ? 'neutral' : 'accent'} size="sm">
                              {tRow.title}
                            </Badge>
                          </div>
                          <p className="text-xs text-fg-muted">
                            {tRow.shiftTitle || t('x.shift')}
                            {tRow.taskTitle && !tRow.isResponsible ? ` (${tRow.taskTitle})` : ''} ·{' '}
                            {fmtWeekday(tRow.shiftStartTime)}, {fmtDayMonth(tRow.shiftStartTime)},{' '}
                            {fmtTimeRange(tRow.shiftStartTime, tRow.shiftEndTime)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0">
                          {isRedeemed ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-ink">
                                <CheckCircle2 className="size-3.5" />
                                {t('redeemedBadge')} {tRow.redeemedAt ? `(${fmtTime(tRow.redeemedAt)})` : ''}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={busyId === tRow.id}
                                onClick={() => void handleResetToken(tRow.id, tRow.title, tRow.helperName)}
                                title={t('x.resetTitle')}
                              >
                                <RotateCcw className="size-3.5" /> {t('x.reset')}
                              </Button>
                            </>
                          ) : (
                            <>
                              {tRow.isAvailableNow ? (
                                <Badge tone="success" size="sm">
                                  <Check className="size-3" /> {t('availableNowBadge')}
                                </Badge>
                              ) : (
                                <Badge tone="neutral" size="sm">
                                  <Clock className="size-3" /> {t('x.availableFrom', { time: fmtTime(tRow.availableFrom) })}
                                </Badge>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={busyId === tRow.id}
                                onClick={() => void handleManualRedeem(tRow.id, tRow.title, tRow.helperName)}
                              >
                                <Check className="size-3.5" /> {t('redeemManuallyBtn')}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 4. Letzte Einlösungen */}
          {data.recentRedemptions.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-display text-base font-bold text-fg">{t('x.recentTitle')}</h3>
              <div className="rounded-card border border-line bg-surface divide-y divide-line">
                {data.recentRedemptions.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="size-4 text-success-ink shrink-0" />
                      <span className="font-semibold text-fg truncate">{r.helperName}</span>
                      <span className="text-fg-muted truncate">· {r.title}</span>
                      {r.shiftTitle && <span className="text-fg-subtle truncate hidden sm:inline">({r.shiftTitle})</span>}
                    </div>
                    <span className="font-mono text-fg-muted shrink-0 tabular">
                      {t('x.timeOClock', { time: fmtTime(r.redeemedAt) })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
