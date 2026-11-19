'use client';

import { useCallback, useEffect, useState } from 'react';
import { isPushSupported } from '@schichtplan/ui';

const SEEN_KEY = 'schichtplan-push-hinweis-gesehen';

/**
 * Kleiner Punkt am Konto-Knopf, solange auf diesem Gerät kein Push eingeschaltet ist und die Person den
 * Konto-Dialog seither noch nicht geöffnet hat. Nach dem ersten Öffnen verschwindet er für immer
 * (wer Push nicht will, soll nicht ständig daran erinnert werden).
 */
export function usePushHint(userId: string | null | undefined) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!userId || !isPushSupported()) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    let cancelled = false;
    (async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const url = sub ? `/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}` : '/api/push/status';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { deviceSubscribed?: boolean };
      if (!cancelled) setShow(!data.deviceSubscribed);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(() => {
    setShow(false);
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignorieren
    }
  }, []);

  return { show, markSeen };
}
