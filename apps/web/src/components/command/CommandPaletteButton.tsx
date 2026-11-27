'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@schichtplan/ui';
import { useCommandPalette } from './CommandContext';

export function CommandPaletteButton({ className }: { className?: string }) {
  const t = useTranslations('web.commandButton');
  const { open } = useCommandPalette();
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  // Kein aria-label: Der Name kommt aus dem sichtbaren Text (WCAG 2.5.3, Sprachsteuerung findet «Suchen»).
  // Auf schmalen Bildschirmen ist der Text nur visuell ausgeblendet.
  return (
    <button
      type="button"
      onClick={open}
      title={t('title', { shortcut: isMac ? '⌘K' : 'Ctrl+K' })}
      className={cn(
        'group flex items-center gap-2 rounded-full border border-line bg-surface/80 px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-2xs backdrop-blur-md transition',
        'hover:border-line-strong hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent sm:px-3',
        className
      )}
    >
      <Search className="size-3.5 text-fg-subtle transition group-hover:text-fg" />
      <span className="sr-only sm:not-sr-only sm:inline">{t('searchPlaceholder')}</span>
      <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-subtle shadow-2xs group-hover:border-line-strong sm:inline-block">
        {isMac ? '⌘K' : 'Ctrl+K'}
      </kbd>
    </button>
  );
}
