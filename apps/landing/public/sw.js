// Cevi Schichtplan Web Push Service Worker (Landingpage / Profil)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Cevi Schichtplan',
    body: 'Du hast eine neue Benachrichtigung.',
    url: '/profil',
    tag: 'cevi-schichtplan',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/images/cevi-logo.png',
    badge: payload.badge || '/images/cevi-logo.png',
    tag: payload.tag || 'cevi-schichtplan',
    renotify: true,
    data: { url: payload.url || '/profil' },
  };

  event.waitUntil(
    self.registration
      .showNotification(payload.title, options)
      .catch(() => self.registration.showNotification(payload.title, { body: payload.body }))
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          for (const client of windowClients) {
            client.postMessage({ type: 'CEVI_PUSH_SHOWN', tag: options.tag, title: payload.title });
          }
        })
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/profil';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Der Browser kann ein Push-Abo von sich aus erneuern (abgelaufen, Schlüsselwechsel). Ohne diesen Handler
// fiele Push still aus, bis man den Schalter neu betätigt. Wir melden das neue Abo dem Backend, das alte
// Abo dient dabei als Nachweis (kein Login nötig, der Service Worker läuft im Hintergrund).
function toBase64Url(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

self.addEventListener('pushsubscriptionchange', (event) => {
  const oldSub = event.oldSubscription;
  event.waitUntil(
    (async () => {
      let newSub = event.newSubscription;
      if (!newSub && oldSub && oldSub.options) {
        newSub = await self.registration.pushManager.subscribe(oldSub.options).catch(() => null);
      }
      if (!newSub) return;
      const keys = { p256dh: toBase64Url(newSub.getKey('p256dh')), auth: toBase64Url(newSub.getKey('auth')) };
      if (oldSub && oldSub.endpoint) {
        const res = await fetch('/api/push/resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldEndpoint: oldSub.endpoint, endpoint: newSub.endpoint, keys }),
        }).catch(() => null);
        if (res && res.ok) return;
      }
      // Ohne altes Abo: mit dem Login-Cookie neu anmelden, falls die Person noch angemeldet ist
      await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: newSub.endpoint, keys }),
      }).catch(() => null);
    })()
  );
});
