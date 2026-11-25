const CACHE = 'rollcall-shell-v2'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg'])))
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('rollcall-shell-') && key !== CACHE)
      .map(key => caches.delete(key)))),
  ]))
})

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE)
          await cache.put(event.request, response.clone())
        } catch (error) {
          console.warn('Rollcall could not cache this offline resource.', error)
        }
      }
      return response
    } catch {
      const cached = await caches.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/')
        if (shell) return shell
      }
      return new Response('This page is unavailable offline.', { status: 503, statusText: 'Offline' })
    }
  })())
})
