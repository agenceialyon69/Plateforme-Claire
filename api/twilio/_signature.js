// ================================================================
// _signature.js — Validation de la signature Twilio (logique PURE)
// ----------------------------------------------------------------
// Isolée (aucun import Supabase) pour être testable hors-ligne :
//   node scripts/test-twilio-signature.mjs
//
// Spec Twilio (POST application/x-www-form-urlencoded) :
//   base = URL_exacte + concat( clé + valeur , pour chaque param trié par clé )
//   signature = base64( HMAC-SHA1(base, AUTH_TOKEN) )
// Comparaison en temps constant avec l'en-tête X-Twilio-Signature.
// ================================================================

import crypto from 'node:crypto';

// Calcule la signature attendue pour une URL + des params POST donnés.
export function computeSignature(url, params, authToken) {
  let base = url;
  for (const key of Object.keys(params || {}).sort()) {
    const v = params[key];
    if (Array.isArray(v)) continue; // Twilio n'envoie pas de tableaux ici
    base += key + (v == null ? '' : v);
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(base, 'utf-8')).digest('base64');
}

// Reconstruit l'URL EXACTE appelée par Twilio (query comprise).
export function requestUrl(req) {
  const forced = (process.env.TWILIO_PUBLIC_URL || '').replace(/\/+$/, '');
  if (forced) return forced + req.url;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.url}`;
}

// Comparaison en temps constant (évite les attaques temporelles).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Valide la requête. FAIL-CLOSED : en cas de doute, retourne false.
export function validateTwilioSignature(req, authToken) {
  // Échappatoire de test UNIQUEMENT hors production.
  if (process.env.TWILIO_SKIP_SIGNATURE === 'true' && process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (!authToken) return false; // pas de secret → impossible de vérifier → refus
  const signature = req.headers && req.headers['x-twilio-signature'];
  if (!signature || typeof signature !== 'string') return false;

  const url = requestUrl(req);
  const params = (req.body && typeof req.body === 'object') ? req.body : {};
  const expected = computeSignature(url, params, authToken);
  return safeEqual(expected, signature);
}
