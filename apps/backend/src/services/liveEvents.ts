import { EventEmitter } from 'node:events';

export type LiveEventType = 'SLOT_UPDATED' | 'SHIFT_CHANGED' | 'EVENT_CHANGED';

export interface LiveEventPayload {
  type: LiveEventType;
  slug: string;
  departmentId?: string;
  shiftId?: string;
  timestamp: number;
}

export interface LiveEventNotifyOptions {
  slug: string;
  type?: LiveEventType;
  shiftId?: string;
  departmentId?: string;
}

export class LiveEventsBus {
  private emitter = new EventEmitter();

  constructor() {
    // Erhöhe max listeners, da viele Browser-Tabs gleichzeitig zuhören können
    this.emitter.setMaxListeners(2000);
  }

  /**
   * Benachrichtigt alle aktiven SSE-Clients eines Anlasses über eine Änderung.
   * Wichtig: Es werden keine Personendaten im Payload gesendet, nur Signals.
   * Unterstützt Options-Objekt oder Positions-Parameter für flexible und typsichere Nutzung.
   */
  notify(
    slugOrOptions: string | LiveEventNotifyOptions,
    type: LiveEventType = 'SLOT_UPDATED',
    shiftId?: string,
    departmentId?: string
  ): void {
    const payload: LiveEventPayload =
      typeof slugOrOptions === 'object'
        ? {
            slug: slugOrOptions.slug,
            type: slugOrOptions.type ?? 'SLOT_UPDATED',
            shiftId: slugOrOptions.shiftId,
            departmentId: slugOrOptions.departmentId,
            timestamp: Date.now(),
          }
        : {
            slug: slugOrOptions,
            type,
            shiftId,
            departmentId,
            timestamp: Date.now(),
          };

    this.emitter.emit(`event:${payload.slug}`, payload);
    if (payload.departmentId) {
      this.emitter.emit(`event:${payload.departmentId}:${payload.slug}`, payload);
    }
  }

  /**
   * Abonniert Aktualisierungen für einen Anlass.
   * Gibt eine Cleanup-Funktion (unsubscribe) zurück.
   */
  subscribe(
    slug: string,
    listener: (payload: LiveEventPayload) => void,
    departmentId?: string
  ): () => void {
    const channel = departmentId ? `event:${departmentId}:${slug}` : `event:${slug}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  /** Anzahl der aktuellen Zuhörer (für Tests/Monitoring) */
  listenerCount(slug: string, departmentId?: string): number {
    const channel = departmentId ? `event:${departmentId}:${slug}` : `event:${slug}`;
    return this.emitter.listenerCount(channel);
  }

  /** Nur für Tests: Entfernt alle registrierten Listener */
  clear(): void {
    this.emitter.removeAllListeners();
  }
}

export const liveEvents = new LiveEventsBus();
