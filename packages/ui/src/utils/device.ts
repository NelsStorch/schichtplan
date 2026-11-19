/** iPhone/iPad (auch iPadOS im Desktop-Modus): Web Push nur in der zum Home-Bildschirm hinzugefügten App */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Läuft die Seite als installierte App (Home-Bildschirm / PWA)? */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Unterstützt der Browser Web Push? */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
