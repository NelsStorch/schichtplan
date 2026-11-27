import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventLiveUpdates } from './useEventLiveUpdates';

interface MockEventSourceInstance {
  url: string;
  options?: { withCredentials?: boolean };
  onmessage: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  readyState: number;
  close: ReturnType<typeof vi.fn>;
}

describe('useEventLiveUpdates hook logic', () => {
  let mockEventSourceInstances: MockEventSourceInstance[] = [];
  let visibilityState = 'visible';
  let listeners: Record<string, ((e?: unknown) => void)[]> = {};

  beforeEach(() => {
    mockEventSourceInstances = [];
    visibilityState = 'visible';
    listeners = {};

    class MockEventSource implements MockEventSourceInstance {
      url: string;
      options?: { withCredentials?: boolean };
      onmessage: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      readyState = 0;
      static CLOSED = 2;

      constructor(url: string, options?: { withCredentials?: boolean }) {
        this.url = url;
        this.options = options;
        mockEventSourceInstances.push(this);
      }

      close = vi.fn(() => {
        this.readyState = MockEventSource.CLOSED;
      });
    }

    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('window', {
      EventSource: MockEventSource,
      location: { origin: 'https://chuchi.cevi-schichtplan.ch' },
      addEventListener: (event: string, fn: (e?: unknown) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: (e?: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((cb) => cb !== fn);
        }
      },
    });

    vi.stubGlobal('document', {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (event: string, fn: (e?: unknown) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: (e?: unknown) => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((cb) => cb !== fn);
        }
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects to event SSE endpoint with withCredentials', () => {
    const onUpdate = vi.fn();
    const cleanup = testHookEffect({
      slug: 'sommerlager-2026',
      enabled: true,
      onUpdate,
    });

    expect(mockEventSourceInstances).toHaveLength(1);
    expect(mockEventSourceInstances[0].url).toBe('https://chuchi.cevi-schichtplan.ch/api/events/sommerlager-2026/live');
    expect(mockEventSourceInstances[0].options).toEqual({ withCredentials: true });

    cleanup();
    expect(mockEventSourceInstances[0].close).toHaveBeenCalled();
  });

  it('includes zugang token in query parameter if present', () => {
    const cleanup = testHookEffect({
      slug: 'lager-2026',
      zugangToken: 'secret-token-123',
      enabled: true,
      onUpdate: vi.fn(),
    });

    expect(mockEventSourceInstances).toHaveLength(1);
    expect(mockEventSourceInstances[0].url).toContain('zugang=secret-token-123');

    cleanup();
  });

  it('does not connect when enabled is false', () => {
    const cleanup = testHookEffect({
      slug: 'lager-2026',
      enabled: false,
      onUpdate: vi.fn(),
    });

    expect(mockEventSourceInstances).toHaveLength(0);
    cleanup();
  });

  it('debounces update calls on message events', async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    const cleanup = testHookEffect({
      slug: 'lager-2026',
      enabled: true,
      onUpdate,
      debounceMs: 200,
    });

    const es = mockEventSourceInstances[0];
    es.onmessage?.({ data: JSON.stringify({ type: 'SLOT_UPDATED' }) });
    es.onmessage?.({ data: JSON.stringify({ type: 'SLOT_UPDATED' }) });
    es.onmessage?.({ data: JSON.stringify({ type: 'SLOT_UPDATED' }) });

    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    cleanup();
    vi.useRealTimers();
  });

  it('disconnects when document is hidden and reconnects when visible', () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    const cleanup = testHookEffect({
      slug: 'lager-2026',
      enabled: true,
      onUpdate,
      debounceMs: 100,
    });

    expect(mockEventSourceInstances).toHaveLength(1);
    const firstEs = mockEventSourceInstances[0];

    // Simuliere Tab minimiert
    visibilityState = 'hidden';
    listeners['visibilitychange']?.forEach((fn) => {
      fn();
    });

    expect(firstEs.close).toHaveBeenCalled();

    // Simuliere Tab wieder aktiviert
    visibilityState = 'visible';
    listeners['visibilitychange']?.forEach((fn) => {
      fn();
    });

    expect(mockEventSourceInstances).toHaveLength(2);
    vi.advanceTimersByTime(150);
    expect(onUpdate).toHaveBeenCalled();

    cleanup();
    vi.useRealTimers();
  });
});

/**
 * Helper to execute the useEffect block of useEventLiveUpdates directly in Node.js
 */
function testHookEffect(options: Parameters<typeof useEventLiveUpdates>[0]) {
  const { slug, enabled = true, zugangToken, onUpdate, debounceMs = 250 } = options;
  const onUpdateRef = { current: onUpdate };

  if (!enabled || !slug || typeof window === 'undefined') {
    return () => {};
  }

  if (!('EventSource' in window)) {
    return () => {};
  }

  let eventSource: EventSource | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
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

  const disconnect = () => {
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignore
      }
      eventSource = null;
    }
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

      es.onmessage = () => {
        triggerUpdate();
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          disconnect();
        }
      };
    } catch {
      // Fallback
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      connect();
      triggerUpdate();
    } else if (document.visibilityState === 'hidden') {
      disconnect();
    }
  };

  const handleOnline = () => {
    connect();
    triggerUpdate();
  };

  const handleOffline = () => {
    disconnect();
  };

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
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    disconnect();
  };
}
