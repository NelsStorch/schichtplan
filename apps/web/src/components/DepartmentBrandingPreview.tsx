'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import { useTranslations } from 'next-intl';
import { Badge, Callout, evaluateContrast, useOrganization } from '@schichtplan/ui';
import { getOrganizationByDbType, type OrganizationType } from '@schichtplan/shared';
import { AlertTriangle, CheckCircle2, QrCode as QrCodeIcon, Sparkles } from 'lucide-react';

export function isFinderPattern(r: number, c: number, n: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
}

export function DepartmentBrandingPreview({
  name,
  logoUrl,
  primaryColor,
  secondaryColor,
  qrStyle = 'CORNERS',
  qrCustomColors = false,
  qrColorPrimary,
  qrColorSecondary,
  organization,
}: {
  name: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  qrStyle?: 'CORNERS' | 'GRADIENT' | 'SOLID';
  qrCustomColors?: boolean;
  qrColorPrimary?: string | null;
  qrColorSecondary?: string | null;
  organization?: OrganizationType | string;
}) {
  const t = useTranslations('web.brandingPreview');
  const browserOrg = useOrganization();
  const orgConfig = organization ? getOrganizationByDbType(organization as OrganizationType) : browserOrg;
  const effectiveLogo = logoUrl || orgConfig.logoUrl;

  const uiPrimaryContrast = useMemo(() => evaluateContrast(primaryColor), [primaryColor]);
  const hasUiSecondary = Boolean(secondaryColor?.trim());
  const uiSecondaryContrast = useMemo(
    () => (hasUiSecondary && secondaryColor ? evaluateContrast(secondaryColor) : null),
    [secondaryColor, hasUiSecondary]
  );

  const effectiveQrPrimary = qrCustomColors && qrColorPrimary?.trim() ? qrColorPrimary : primaryColor;
  const effectiveQrSecondary =
    qrCustomColors && qrColorSecondary?.trim() ? qrColorSecondary : secondaryColor || null;

  const qrPrimaryContrast = useMemo(() => evaluateContrast(effectiveQrPrimary), [effectiveQrPrimary]);
  const qrSecondaryContrast = useMemo(
    () => (effectiveQrSecondary ? evaluateContrast(effectiveQrSecondary) : null),
    [effectiveQrSecondary]
  );

  const qrData = useMemo(() => {
    try {
      const qr = QRCode.create('https://cevi-schichtplan.ch/preview', {
        errorCorrectionLevel: 'M',
      });
      const modules = qr.modules;
      const size = modules.size;
      const data = modules.data;

      let bodyPaths = '';
      let cornerPaths = '';

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (data[r * size + c]) {
            const rect = `M${c},${r} h1 v1 h-1 Z `;
            if (isFinderPattern(r, c, size)) {
              cornerPaths += rect;
            } else {
              bodyPaths += rect;
            }
          }
        }
      }

      return { size, bodyPaths, cornerPaths };
    } catch {
      return null;
    }
  }, []);

  const isTwoTone = Boolean(effectiveQrSecondary && qrStyle !== 'SOLID');

  let bodyColor = effectiveQrPrimary;
  let cornerColor = effectiveQrPrimary;

  if (isTwoTone) {
    if (qrStyle === 'CORNERS') {
      cornerColor = effectiveQrSecondary!;
      bodyColor = effectiveQrPrimary;
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-subtle">
          <Sparkles className="size-3.5 text-accent" />
          {t('livePreview', { name: name || t('defaultDeptName') })}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            tone={
              qrPrimaryContrast.level === 'optimal'
                ? 'success'
                : qrPrimaryContrast.level === 'sufficient'
                ? 'warning'
                : 'danger'
            }
            className="gap-1 text-[11px]"
          >
            {qrPrimaryContrast.level === 'poor' ? (
              <AlertTriangle className="size-3" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            {t('qrPrimary', { ratio: qrPrimaryContrast.ratioAgainstWhite })}
          </Badge>
          {qrSecondaryContrast && (
            <Badge
              tone={
                qrSecondaryContrast.level === 'optimal'
                  ? 'success'
                  : qrSecondaryContrast.level === 'sufficient'
                  ? 'warning'
                  : 'danger'
              }
              className="gap-1 text-[11px]"
            >
              {qrSecondaryContrast.level === 'poor' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {t('qrSecondary', { ratio: qrSecondaryContrast.ratioAgainstWhite })}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        {/* Linke Seite: UI-Elemente & Erklärung */}
        <div className="space-y-3">
          <div className="rounded-xl border border-line/80 bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">{t('portalDesign')}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  tabIndex={-1}
                  style={{ backgroundColor: primaryColor, color: uiPrimaryContrast.textOnAccent }}
                  className="rounded-full px-3 py-1 text-xs font-semibold shadow-sm pointer-events-none"
                >
                  {t('signUpShift')}
                </button>
                {secondaryColor && (
                  <span
                    style={{
                      backgroundColor: secondaryColor,
                      color: uiSecondaryContrast ? uiSecondaryContrast.textOnAccent : '#ffffff',
                    }}
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm"
                  >
                    {t('secondaryColor')}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
              <span>{t('qrCodeMode')}</span>
              <span className="font-medium text-fg">
                {qrCustomColors ? t('customQrColors') : t('inheritsDeptColors')}
                {' · '}
                {!isTwoTone
                  ? t('singleColor')
                  : qrStyle === 'CORNERS'
                  ? t('cornersAccented')
                  : t('colorGradient')}
              </span>
            </div>
          </div>

          {qrPrimaryContrast.level === 'poor' || (qrSecondaryContrast && qrSecondaryContrast.level === 'poor') ? (
            <Callout tone="warning" className="text-xs">
              {t('contrastWarning')}
            </Callout>
          ) : (
            <p className="text-xs text-fg-muted">
              {isTwoTone
                ? t('contrastSuccessTwoTone')
                : t('contrastSuccessSingle')}
            </p>
          )}
        </div>

        {/* Rechte Seite: Live QR-Code Vorschau */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white border border-line/80 shadow-sm w-36 h-36 mx-auto sm:mx-0">
          {qrData ? (
            <svg
              viewBox={`0 0 ${qrData.size} ${qrData.size}`}
              className="w-full h-full"
              shapeRendering="crispEdges"
              role="img"
              aria-label={t('qrPreviewAria')}
            >
              {isTwoTone && qrStyle === 'GRADIENT' && (
                <defs>
                  <linearGradient id="preview-qr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={effectiveQrPrimary} />
                    <stop offset="100%" stopColor={effectiveQrSecondary!} />
                  </linearGradient>
                </defs>
              )}

              <path
                fill={isTwoTone && qrStyle === 'GRADIENT' ? 'url(#preview-qr-grad)' : bodyColor}
                d={qrData.bodyPaths}
              />
              {qrData.cornerPaths && <path fill={cornerColor} d={qrData.cornerPaths} />}

              {effectiveLogo && (
                <image
                  href={effectiveLogo}
                  x={qrData.size / 2 - 2.5}
                  y={qrData.size / 2 - 2.5}
                  width="5"
                  height="5"
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
            </svg>
          ) : (
            <div className="flex flex-col items-center justify-center text-fg-subtle gap-1">
              <QrCodeIcon className="size-8" />
              <span className="text-[10px]">{t('x.loading')}</span>
            </div>
          )}
          <span className="text-[11px] font-medium text-fg-subtle text-center mt-1">
            {qrPrimaryContrast.ratioAgainstWhite}:1
          </span>
        </div>
      </div>
    </div>
  );
}
