self.addEventListener('push', function (event) {
  if (!event.data) return

  var payload
  try {
    payload = event.data.json()
  } catch (_e) {
    payload = { title: 'Daily Brain', body: event.data.text() }
  }

  var options = {
    body: payload.body || '',
    icon: '/logo.png',
    badge: '/favicon.png',
    data: payload.data || {},
    tag: payload.data && payload.data.notificationId ? payload.data.notificationId : undefined,
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Daily Brain', options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  var data = event.notification.data || {}
  var url = '/notifications'
  if (data.taskId) {
    url = '/tasks'
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.includes(self.location.origin)) {
          clients[i].focus()
          clients[i].navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
