import { describe, expect, it } from 'vitest';
import { LiveEventsBus, type LiveEventPayload } from './liveEvents.js';

describe('LiveEventsBus', () => {
  it('notifies subscribers on slug channel', () => {
    const bus = new LiveEventsBus();
    const received: LiveEventPayload[] = [];

    const unsubscribe = bus.subscribe('chlaushock-2026', (payload) => {
      received.push(payload);
    });

    bus.notify('chlaushock-2026', 'SLOT_UPDATED', 'shift-123');

    expect(received).toHaveLength(1);
    expect(received[0].slug).toBe('chlaushock-2026');
    expect(received[0].type).toBe('SLOT_UPDATED');
    expect(received[0].shiftId).toBe('shift-123');
    expect(typeof received[0].timestamp).toBe('number');

    unsubscribe();
    bus.notify('chlaushock-2026', 'SLOT_UPDATED', 'shift-456');
    expect(received).toHaveLength(1);
  });

  it('notifies subscribers with department isolation', () => {
    const bus = new LiveEventsBus();
    const dept1Received: LiveEventPayload[] = [];
    const dept2Received: LiveEventPayload[] = [];

    const unsub1 = bus.subscribe(
      'sommerlager-2026',
      (payload) => dept1Received.push(payload),
      'dept-1'
    );
    const unsub2 = bus.subscribe(
      'sommerlager-2026',
      (payload) => dept2Received.push(payload),
      'dept-2'
    );

    bus.notify('sommerlager-2026', 'SLOT_UPDATED', 'shift-1', 'dept-1');

    expect(dept1Received).toHaveLength(1);
    expect(dept2Received).toHaveLength(0);

    unsub1();
    unsub2();
  });

  it('reports listener counts accurately', () => {
    const bus = new LiveEventsBus();
    expect(bus.listenerCount('test-event')).toBe(0);

    const unsub1 = bus.subscribe('test-event', () => {});
    const unsub2 = bus.subscribe('test-event', () => {});
    expect(bus.listenerCount('test-event')).toBe(2);

    unsub1();
    expect(bus.listenerCount('test-event')).toBe(1);

    unsub2();
    expect(bus.listenerCount('test-event')).toBe(0);
  });
});
