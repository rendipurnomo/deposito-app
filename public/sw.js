const CACHE = 'depositoplus-v1'

const PRECACHE = [
  '/',
  '/index.html',
  '/bank_rates.json',
]

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// Activate — hapus cache lama
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Fetch strategy:
//   bank_rates.json → Network first, fallback cache (supaya data selalu terbaru)
//   aset lain       → Cache first, fallback network
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Hanya handle request same-origin + https
  if (e.request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  if (url.pathname.includes('bank_rates.json')) {
    // Network first untuk data
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request))
    )
  } else {
    // Cache first untuk aset
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
      })
    )
  }
})