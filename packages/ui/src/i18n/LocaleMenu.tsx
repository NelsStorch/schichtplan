'use client';

/**
 * Gestyltes Sprach-Dropdown (statt nativem <select>, dessen Liste sich nicht gestalten lässt).
 * Tastatur: Pfeile/Home/End wählen, Enter/Leertaste bestätigt, Escape schliesst. Schliesst bei Klick ausserhalb.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { cn } from '../utils/cn';

export interface LocaleMenuOption {
  value: string;
  label: string;
  /** BCP-47-Kurzcode für `lang` (Screenreader sprechen den Namen in der eigenen Sprache) */
  lang?: string;
  /** Kurzcode als Badge in der Liste (DE, FR …) */
  code?: string;
}

export interface LocaleMenuProps {
  value: string;
  options: readonly LocaleMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Liste öffnet nach oben (z. B. im Footer) */
  placement?: 'bottom' | 'top';
  className?: string;
}

export function LocaleMenu({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  placement = 'bottom',
  className,
}: LocaleMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-fg-muted transition',
          'hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          open && 'bg-surface-2 text-fg',
          disabled && 'pointer-events-none opacity-60'
        )}
      >
        <Languages className="size-3.5 shrink-0" aria-hidden="true" />
        <span lang={selected?.lang}>{selected?.label}</span>
        <ChevronDown
          className={cn('size-3 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            'absolute right-0 z-sheet min-w-44 origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-line',
            'bg-surface/95 p-1.5 shadow-lift backdrop-blur-xl',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Tastatursteuerung liegt am Button (aria-activedescendant)
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                lang={option.lang}
                onClick={() => choose(index)}
                onPointerMove={() => setActive(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors',
                  index === active ? 'bg-surface-2 text-fg' : 'text-fg-muted',
                  isSelected && 'font-semibold text-fg'
                )}
              >
                {option.code && (
                  <span
                    className={cn(
                      'inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide',
                      isSelected ? 'bg-accent/12 text-accent-ink' : 'bg-surface-2 text-fg-subtle'
                    )}
                    aria-hidden="true"
                  >
                    {option.code}
                  </span>
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
