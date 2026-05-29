// ================================================================
// pwa.js — Enregistre le service worker (app installable)
// Chargé sur toutes les pages. Sans effet si le navigateur ne
// supporte pas les service workers.
// ================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker non enregistré :', err);
    });
  });
}
