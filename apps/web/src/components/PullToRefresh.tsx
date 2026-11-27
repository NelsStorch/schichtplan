'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn, isStandaloneDisplay } from '@schichtplan/ui';

const THRESHOLD = 80;
const MAX_PULL = 120;

/**
 * Herunterziehen zum Neuladen – nur in der installierten App (Home-Bildschirm).
 * Dort fehlt der Neu-laden-Knopf des Browsers; nach einem Verbindungsabbruch erwarten Leute die Geste.
 * Im normalen Browser bleibt das eingebaute Verhalten unangetastet.
 */
export function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    setEnabled(isStandaloneDisplay() && window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onStart = (e: TouchEvent) => {
      // Nur ganz oben, mit einem Finger und ohne offenen Dialog
      if (window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('dialog[open]')) {
        start.current = null;
        return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      // Seitliches Wischen (Chip-Leisten, Tabellen) oder Scrollen nach unten: abbrechen
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        start.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Gedämpft, damit es sich wie Gummi anfühlt
      const value = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = value;
      setPull(value);
    };

    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.location.reload();
      } else {
        setPull(0);
      }
      pullRef.current = 0;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing)) return null;

  const ready = pull >= THRESHOLD;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-toast flex justify-center"
      style={{ transform: `translateY(${pull - 40}px)`, opacity: Math.min(1, pull / THRESHOLD) }}
    >
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-full border border-line bg-surface-2 shadow-lift transition-colors',
          ready ? 'text-accent-ink' : 'text-fg-muted'
        )}
      >
        <RefreshCw
          className={cn('size-5', refreshing && 'animate-spin')}
          style={refreshing ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 270}deg)` }}
        />
      </div>
    </div>
  );
}
