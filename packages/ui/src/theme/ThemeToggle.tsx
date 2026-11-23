'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '../utils/cn';
import { THEME_STORAGE_KEY } from './ThemeScript';

type ThemeChoice = 'system' | 'light' | 'dark';

const order: ThemeChoice[] = ['system', 'light', 'dark'];

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Speicher blockiert (privater Modus) – Auswahl gilt dann nur für diese Sitzung
  }
}

/** Wechselt System → Hell → Dunkel. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('ui.theme');
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setChoice(current === 'light' || current === 'dark' ? current : 'system');
  }, []);

  const next = () => {
    const value = order[(order.indexOf(choice) + 1) % order.length];
    setChoice(value);
    applyTheme(value);
  };

  const Icon = choice === 'light' ? Sun : choice === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={next}
      aria-label={t(choice)}
      title={t(choice)}
      className={cn(
        'flex size-10 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg',
        className
      )}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
