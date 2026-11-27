'use client';

import { useEffect, useRef } from 'react';

export interface UseEventLiveUpdatesOptions {
  /** Slug des Anlasses */
  slug: string;
  /** Ob der Live-Stream aktiv sein soll (z. B. nicht wenn Anlass 404/Members-only ist) */
  enabled?: boolean;
  /** Optionaler Zugangstoken (?zugang=) */
  zugangToken?: string | null;
  /** Callback, wenn eine Aktualisierung eintrifft */
  onUpdate: () => void | Promise<void>;
  /** Entprellzeit in ms für aufeinanderfolgende Aktualisierungen (Standard: 250ms) */
  debounceMs?: number;
}

/**
 * useEventLiveUpdates:
 * Lauscht über Server-Sent Events (SSE) auf Echtzeit-Aktualisierungen eines Anlasses
 * (neue Anmeldungen, Abmeldungen, Ersatzübernahmen, Schichtänderungen).
 *
 * Eigenschaften:
 * - Automatische Trennung im Hintergrund (`visibilitychange === 'hidden'`), um Akku
 *   und mobile Bandbreite zu schonen.
 * - Sofortige Wiederverbindung und Refresh beim Zurückkehren in den Vordergrund.
 * - Debouncing bei schnellen aufeinanderfolgenden Änderungen.
 * - Automatisches Beenden beim Unmounten der Komponente.
 */
export function useEventLiveUpdates({
  slug,
  enabled = true,
  zugangToken,
  onUpdate,
  debounceMs = 250,
}: UseEventLiveUpdatesOptions): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !slug || typeof window === 'undefined') {
      return;
    }

    if (!('EventSource' in window)) {
      return;
    }

    let eventSource: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 3000;
    let isDisposed = false;

    const triggerUpdate = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (!isDisposed) {
          void onUpdateRef.current();
        }
      }, debounceMs);
    };

    const clearTimers = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const disconnect = (keepReconnect = false) => {
      if (!keepReconnect) {
        clearTimers();
      } else if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (eventSource) {
        try {
          eventSource.close();
        } catch {
          // ignore
        }
        eventSource = null;
      }
    };

    const scheduleReconnect = () => {
      if (isDisposed || reconnectTimer || typeof document === 'undefined' || document.visibilityState === 'hidden') {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!isDisposed && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
          connect();
          triggerUpdate();
        }
      }, retryDelay);
      retryDelay = Math.min(Math.round(retryDelay * 1.5), 30000);
    };

    const connect = () => {
      if (isDisposed || eventSource) return;

      const url = new URL(`/api/events/${encodeURIComponent(slug)}/live`, window.location.origin);
      if (zugangToken) {
        url.searchParams.set('zugang', zugangToken);
      }

      try {
        const es = new EventSource(url.toString(), { withCredentials: true });
        eventSource = es;

        es.onopen = () => {
          retryDelay = 3000;
        };

        es.onmessage = () => {
          retryDelay = 3000;
          triggerUpdate();
        };

        es.onerror = () => {
          // Bei Verbindungsverlust oder Stream-Ende sauber aufräumen und mit Backoff erneut versuchen
          if (es.readyState === EventSource.CLOSED) {
            disconnect(true);
            scheduleReconnect();
          }
        };
      } catch {
        scheduleReconnect();
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        retryDelay = 3000;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        connect();
        triggerUpdate();
      } else if (document.visibilityState === 'hidden') {
        disconnect();
      }
    };

    const handleOnline = () => {
      retryDelay = 3000;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connect();
      triggerUpdate();
    };

    const handleOffline = () => {
      disconnect();
    };

    // Nur verbinden, wenn Tab sichtbar ist
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      connect();
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isDisposed = true;
      disconnect();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [slug, enabled, zugangToken, debounceMs]);
}
