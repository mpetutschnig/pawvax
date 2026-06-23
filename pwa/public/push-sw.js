/* Web-Push handlers — imported by the generated Workbox service worker.
   Payload: { title, body, url } sent by the server (no PII). */
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'PAW'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, else open a new one
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
