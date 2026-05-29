// ================================================================
// sw.js — Service Worker de l'app Claire (PWA installable)
// ----------------------------------------------------------------
// Stratégie volontairement prudente :
//  - /api/*           → réseau uniquement (jamais mis en cache)
//  - cross-origin     → réseau uniquement (Supabase, esm.sh, fonts)
//  - navigations HTML → réseau d'abord, cache en repli (mode hors-ligne)
//  - JS / CSS         → réseau d'abord (le code reste toujours à jour),
//                       cache en repli si hors-ligne
//  - images / icônes  → cache d'abord (rarement modifiées)
// ================================================================

const CACHE = 'claire-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/cabinet.html',
  '/conversations.html',
  '/conversation.html',
  '/demandes.html',
  '/parametres.html',
  '/etude-de-cas.html',
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

// Détecte les ressources de "code" (HTML, JS, CSS) : on veut toujours
// la dernière version → réseau d'abord, cache seulement en repli hors-ligne.
function isCodeRequest(request, url) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'document') return true;
  return /\.(?:js|mjs|css|html)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jamais de cache pour l'API, l'analytics Vercel, ni le cross-origin
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_vercel/')
  ) {
    return; // laisse le navigateur gérer normalement
  }

  // HTML / JS / CSS : réseau d'abord (le code reste à jour), cache en repli
  if (isCodeRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((r) => r || (request.mode === 'navigate' ? caches.match('/index.html') : undefined))
        )
    );
    return;
  }

  // Autres assets (images, icônes, polices locales) : cache d'abord
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
