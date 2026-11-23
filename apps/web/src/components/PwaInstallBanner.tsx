'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@schichtplan/ui';
import { isPwaPromptDismissed, dismissPwaPrompt } from '@/lib/pwaDismissal';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const t = useTranslations('web.pwa');
  const org = useOrganization();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Wenn bereits als Standalone PWA installiert: niemals anzeigen
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari navigator.standalone
      window.navigator.standalone === true;

    if (isStandalone || isPwaPromptDismissed()) {
      return;
    }

    // iOS Safari Erkennung (unterstützt beforeinstallprompt nicht)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setShowIosGuide(true);
      // Kurze Verzögerung für weicheren Einstieg
      const timer = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(timer);
    }

    // Android / Chromium Browser Event abfangen
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      dismissPwaPrompt();
    }
    dismissPwaPrompt();
    setVisible(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    dismissPwaPrompt();
  };

  if (!visible) return null;

  return (
    <aside
      aria-label={t('ariaLabel')}
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg rounded-card border border-border-muted/80 bg-surface/95 p-4 shadow-lift backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-field bg-accent/15 text-accent-fg">
          <Smartphone className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">
            {t('title', { orgName: org.name })}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {t('description')}
          </p>

          {showIosGuide ? (
            <div className="mt-2.5 space-y-2.5">
              <div className="rounded-field bg-surface-muted/60 px-3 py-2 text-xs text-fg">
                <span className="font-medium">{t('iosPrefix')}</span> {t('iosGuidePart1')}
                <span className="inline-flex items-center gap-0.5 font-semibold text-accent-fg">
                  <Share className="inline size-3.5" aria-hidden="true" /> {t('shareLabel')}
                </span>{' '}
                {t('iosGuidePart2')}<strong className="font-semibold">{t('homeScreenLabel')}</strong>{t('iosGuidePart3')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex items-center gap-1.5 rounded-field bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-hover active:scale-95"
                >
                  {t('understoodBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-field px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  {t('laterBtn')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-field bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-hover active:scale-95"
              >
                <Download className="size-3.5" aria-hidden="true" />
                {t('installBtn')}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-field px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
              >
                {t('laterBtn')}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-field p-1 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
          aria-label={t('closeAria')}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
