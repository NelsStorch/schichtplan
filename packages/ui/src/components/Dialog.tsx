'use client';

import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '../utils/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Kleines Icon/Logo links vom Titel */
  icon?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  className?: string;
  /**
   * Wenn true, schliesst ein Klick auf den abgedunkelten Hintergrund den Dialog.
   * Standard ist `false` (damit bei versehentlichem Klick neben das Fenster keine Formulareingaben verloren gehen).
   * Dialoge werden über das «X», «Abbrechen» bzw. Esc geschlossen.
   */
  dismissOnBackdrop?: boolean;
}

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Natives <dialog> (Fokus-Falle, ESC, Top-Layer gratis).
 * Mobile: Bottom-Sheet vom unteren Rand. Ab `sm`: zentrierter Dialog.
 * Inhalt wird nur gerendert, solange der Dialog offen ist (Formulare starten frisch).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  size = 'md',
  children,
  className,
  dismissOnBackdrop = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const t = useTranslations('ui.dialog');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      dialog.style.translate = '';
      dialog.style.transition = '';
    }
  }, [open]);

  // Hintergrund-Scroll sperren, solange offen
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // Mobile: Sheet am Griff/Kopf nach unten wischen schliesst es (wie das «X»)
  const drag = useRef<{ startY: number; startT: number; dy: number; pointerId: number } | null>(null);
  const isSheet = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639.98px)').matches;

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSheet() || e.button !== 0) return;
    // Klicks auf Knöpfe im Kopf (z. B. «X») nicht als Wischen werten
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    drag.current = { startY: e.clientY, startT: performance.now(), dy: 0, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    // `translate` statt `transform`: Die Einblend-Animation hält `transform` fest (fill-mode both)
    ref.current.style.translate = d.dy ? `0 ${d.dy}px` : '';
  };

  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const dialog = ref.current;
    if (!d || d.pointerId !== e.pointerId || !dialog) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.startT);
    const shouldClose = d.dy > Math.min(140, dialog.offsetHeight * 0.3) || (d.dy > 40 && velocity > 0.6);
    dialog.style.transition = 'translate 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    if (shouldClose) {
      dialog.style.translate = '0 100%';
      // Zurücksetzen erst nach dem Schliessen (siehe Effekt oben), sonst blitzt das Sheet kurz auf
      window.setTimeout(onClose, 180);
    } else {
      dialog.style.translate = '';
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
        }
      }}
      aria-labelledby={titleId}
      className={cn(
        'z-sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card border border-b-0 border-line bg-surface p-0 text-fg shadow-lift',
        'backdrop:bg-[rgb(12_10_9/0.65)] backdrop:backdrop-blur-sm open:animate-sheet-up',
        'sm:m-auto sm:max-h-[86dvh] sm:rounded-card sm:border-b sm:open:animate-scale-in',
        widths[size],
        className
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          {/* Griff + Kopf: auf Mobile nach unten wischen schliesst das Sheet */}
          <div
            className="touch-none select-none sm:touch-auto sm:select-auto"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <header className="flex items-start gap-3 px-5 pb-4 pt-4 sm:px-7 sm:pt-6">
            {icon && (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-accent/12 text-accent-ink [&_svg]:size-5">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="font-display text-xl font-bold tracking-tight text-fg">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7 sm:pb-6">
            {children}
          </div>
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-end sm:px-7 sm:pb-5 [&>*]:w-full sm:[&>*]:w-auto">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
