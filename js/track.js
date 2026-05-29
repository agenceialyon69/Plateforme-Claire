// ================================================================
// track.js — Suivi de conversion cookieless (Vercel Web Analytics)
// ----------------------------------------------------------------
// N'utilise AUCUN cookie ni identifiant : aucun bandeau requis.
// Les événements ne partent que si Web Analytics est activé sur le
// projet Vercel. En local / hors Vercel, l'appel est silencieux.
// ================================================================

export function track(name, data) {
  try {
    if (typeof window !== 'undefined' && typeof window.va === 'function') {
      window.va('event', data ? { name, data } : { name });
    }
  } catch {
    /* le suivi ne doit jamais casser l'expérience */
  }
}
