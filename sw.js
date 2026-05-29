// ================================================================
// sw.js — Service Worker de l'app Claire (PWA installable)
// ----------------------------------------------------------------
// Stratégie volontairement prudente :
//  - /api/*           → réseau uniquement (jamais mis en cache)
//  - cross-origin     → réseau uniquement (Supabase, esm.sh, fonts)
//  - navigations HTML → réseau d'abord, cache en repli (mode hors-ligne)
//  - assets statiques → cache d'abord, puis réseau (mise à jour en fond)
// ================================================================

const CACHE = 'claire-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/cabinet.html',
  '/conversations.html',
  '/conversation.html',
  '/demandes.html',
  '/parametres.html',
  '/mentions-legales.html',
  '/confidentialite.html',
  '/css/styles.css',
  '/css/dashboard.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jamais de cache pour l'API ni le cross-origin (Supabase, CDN, fonts)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return; // laisse le navigateur gérer normalement
  }

  // Navigations : réseau d'abord, repli cache si hors-ligne
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Assets statiques : cache d'abord
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
