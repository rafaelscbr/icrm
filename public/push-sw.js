/* Handlers de Web Push — anexados ao service worker do PWA via
   workbox importScripts. Recebe o payload da Edge Function send-push. */

self.addEventListener('push', (event) => {
  if (!event.data) return
  let d
  try { d = event.data.json() } catch { return }
  event.waitUntil(
    self.registration.showNotification(d.title || 'iCRM', {
      body: d.body || '',
      icon: '/icon-192x192.svg',
      badge: '/icon-128x128.svg',
      tag: d.tag,
      vibrate: [200, 100, 200],
      data: { url: d.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
