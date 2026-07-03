const BUILD = '__BUILD__';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    self.clients.claim()
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'sw-updated' })))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => Response.error()));
    return;
  }
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'The Dead Notes App', body: '' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const targetPath = new URL(url, self.location.origin).pathname;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Find a client already on the target page
      const match = clientList.find(c => new URL(c.url).pathname === targetPath);
      if (match) {
        match.postMessage({ type: 'sw-navigate', url });
        return match.focus();
      }
      // Any client open: navigate it to target page
      if (clientList.length > 0) {
        clientList[0].navigate(url).catch(() => clients.openWindow(url));
        return clientList[0].focus();
      }
      return clients.openWindow(url);
    })
  );
});
