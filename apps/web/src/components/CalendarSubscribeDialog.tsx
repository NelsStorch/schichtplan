'use client';

import { useState } from 'react';
import {
  CalendarPlus,
  CalendarSync,
  Check,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Mail,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { helpUrl } from '@schichtplan/shared';
import { Badge, Button, Dialog, buttonClasses, cn, useToast } from '@schichtplan/ui';
import {
  downloadIcs,
  googleCalendarSubscribeUrl,
  outlookCalendarSubscribeUrl,
  type CalendarEntry,
  type ClientDevice,
} from '@/lib/ics';

interface CalendarData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
  resetNotice?: boolean;
}

interface CalendarSubscribeDialogProps {
  open: boolean;
  onClose: () => void;
  calData: CalendarData;
  shifts?: CalendarEntry[];
  clientDevice?: ClientDevice;
  onResetToken?: () => Promise<void>;
  resettingToken?: boolean;
}

export function CalendarSubscribeDialog({
  open,
  onClose,
  calData,
  shifts = [],
  clientDevice = 'other',
  onResetToken,
  resettingToken = false,
}: CalendarSubscribeDialogProps) {
  const t = useTranslations('web.calendarDialog');
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [showManualGoogle, setShowManualGoogle] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(calData.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({
        title: t('copySuccessTitle'),
        description: t('copySuccessDesc'),
      });
    } catch {
      toast({
        title: t('copyErrorTitle'),
        description: t('copyErrorDesc'),
        tone: 'error',
      });
    }
  };

  const isApple = clientDevice === 'ios' || clientDevice === 'mac';

  return (
    <Dialog open={open} onClose={onClose} size="md" title={t('title')}>
      <div className="space-y-5 text-sm">
        {calData.resetNotice && (
          <div className="rounded-card border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-fg">
            <p className="font-semibold">{t('resetWarningTitle')}</p>
            <p className="mt-1 text-fg-muted">
              {t.rich('resetWarningText', {
                bold: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
        )}
        <p className="text-fg-muted">
          {t.rich('intro', {
            bold: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>

        {/* 1. Google Kalender (1. Wahl / Standard) */}
        <div
          className={cn(
            'rounded-card border p-4 transition-all',
            !isApple ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 font-bold text-xs">
                G
              </div>
              <div>
                <span className="font-semibold text-fg">{t('googleCalendarTitle')}</span>
                {!isApple && <Badge tone="accent" className="ml-2">{t('firstChoiceBadge')}</Badge>}
              </div>
            </div>
            <span className="text-2xs text-fg-subtle">{t('googleDeviceHint')}</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            {t('googleDescription')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={googleCalendarSubscribeUrl(calData.webcalUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ size: 'sm', variant: !isApple ? 'primary' : 'secondary' })}
            >
              <CalendarPlus className="size-4" /> {t('subscribeGoogleButton')}
            </a>
            <Button variant="ghost" size="sm" onClick={handleCopyUrl}>
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? t('copiedAction') : t('copyLinkAction')}
            </Button>
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowManualGoogle(!showManualGoogle)}
              className="text-2xs text-fg-subtle hover:text-fg underline underline-offset-2"
            >
              {showManualGoogle ? t('toggleManualInstructionsHide') : t('toggleManualInstructionsShow')}
            </button>

            {showManualGoogle && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-fg-muted bg-surface-2 p-2.5 rounded-lg border border-line/60">
                <li>{t('manualGoogleStep1')}</li>
                <li>
                  {t.rich('manualGoogleStep2', {
                    link: (chunks) => (
                      <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">
                        {chunks}
                      </a>
                    ),
                  })}
                </li>
                <li>
                  {t.rich('manualGoogleStep3', {
                    italic: (chunks) => <em>{chunks}</em>,
                    bold: (chunks) => <strong>{chunks}</strong>,
                  })}
                </li>
                <li>
                  {t.rich('manualGoogleStep4', {
                    bold: (chunks) => <strong>{chunks}</strong>,
                  })}
                </li>
              </ol>
            )}
          </div>
        </div>

        {/* 2. Apple Kalender (iPhone, iPad, Mac) */}
        <div
          className={cn(
            'rounded-card border p-4 transition-all',
            isApple ? 'border-accent bg-accent/5 ring-1 ring-accent/20' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-fg" />
              <div>
                <span className="font-semibold text-fg">{t('appleCalendarTitle')}</span>
                {isApple && <Badge tone="accent" className="ml-2">{t('appleForYourDevice')}</Badge>}
              </div>
            </div>
            <span className="text-2xs text-fg-subtle">{t('appleDeviceHint')}</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            {t('appleDescriptionDetailed')}
          </p>

          <div className="mt-3">
            <a
              href={calData.webcalUrl}
              className={buttonClasses({ size: 'sm', variant: isApple ? 'primary' : 'secondary' })}
            >
              <CalendarSync className="size-4" /> {t('subscribeAppleButton')}
            </a>
          </div>
        </div>

        {/* 3. Microsoft Outlook / 365 */}
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-sky-600" />
              <span className="font-semibold text-fg">{t('outlookCalendarTitle')}</span>
            </div>
            <span className="text-2xs text-fg-subtle">{t('outlookDeviceHint')}</span>
          </div>

          <p className="mt-2 text-xs text-fg-muted">
            {t('outlookDescriptionDetailed')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={outlookCalendarSubscribeUrl(calData.httpsUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ size: 'sm', variant: 'secondary' })}
            >
              <ExternalLink className="size-4" /> {t('subscribeOutlookWeb')}
            </a>
            <a
              href={calData.webcalUrl}
              className={buttonClasses({ size: 'sm', variant: 'ghost' })}
            >
              {t('subscribeOutlookApp')}
            </a>
          </div>
        </div>

        {/* 4. Andere Kalender-Apps & Manuell */}
        <div className="rounded-card border border-line bg-surface p-4">
          <span className="font-semibold text-fg">{t('otherCalendarTitleDetailed')}</span>
          <p className="mt-1 text-xs text-fg-muted">
            {t('otherCalendarDescriptionDetailed')}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={calData.httpsUrl}
              className="w-full rounded-field border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg select-all"
            />
            <Button size="sm" variant="secondary" onClick={handleCopyUrl} className="shrink-0">
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? t('copiedAction') : t('copyButton')}
            </Button>
          </div>
        </div>

        {/* 5. Statischer Download (.ics ohne Abo) */}
        {shifts.length > 0 && (
          <div className="rounded-card border border-line/80 bg-surface-2/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold text-fg">{t('noSubTitle')}</span>
                <p className="mt-0.5 text-2xs text-fg-subtle">
                  {t('noSubDescription')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadIcs('meine-schichten.ics', shifts)}
                className="shrink-0"
              >
                <Download className="size-3.5" /> {t('downloadIcsAction')}
              </Button>
            </div>
          </div>
        )}

        {/* Footer-Aktionen: Erneuern & Hilfe */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3 text-xs text-fg-subtle">
          <a
            href={helpUrl('/helfen/meine-schichten/')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-accent-ink hover:underline"
          >
            <HelpCircle className="size-3.5" /> {t('helpCenterLink')}
          </a>

          {onResetToken && (
            <button
              type="button"
              onClick={onResetToken}
              disabled={resettingToken}
              className="inline-flex items-center gap-1.5 text-fg-subtle hover:text-fg underline underline-offset-2 transition"
            >
              <RefreshCw className={cn('size-3', resettingToken && 'animate-spin')} />
              {t('resetLinkAction')}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
