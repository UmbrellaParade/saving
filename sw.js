const cacheName = 'yutori-ledger-v3'
const baseUrl = self.registration.scope
const appShell = [
  baseUrl,
  `${baseUrl}index.html`,
  `${baseUrl}manifest.webmanifest`,
  `${baseUrl}favicon.svg`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll(appShell)
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== cacheName)
          .map((key) => caches.delete(key)),
      )
    }),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(cacheName).then((cache) => {
            cache.put(`${baseUrl}index.html`, copy)
          })
          return response
        })
        .catch(() => caches.match(`${baseUrl}index.html`)),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            const copy = response.clone()
            caches.open(cacheName).then((cache) => {
              cache.put(event.request, copy)
            })
            return response
          })
          .catch(() => caches.match(`${baseUrl}index.html`))
      )
    }),
  )
})
