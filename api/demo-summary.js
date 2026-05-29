// ================================================================
// /api/demo-summary — Résumé qualifié d'une conversation de DÉMO
// ----------------------------------------------------------------
// Sert UNIQUEMENT le cabinet de démonstration (env DEMO_CABINET_ID).
// Permet à la page d'accueil d'afficher « ce que reçoit le cabinet »
// après quelques échanges. Ne peut jamais exposer de données réelles :
// la requête est filtrée sur conversation_id ET cabinet_id = démo.
// ================================================================

import { supabaseAdmin, ok, badRequest, serverError } from './_supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate-limit en mémoire (par instance serverless — best-effort), cohérent
// avec /api/chat et /api/contact. Endpoint public touchant la base.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // 30 req/min/IP
const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateLimitStore.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitStore.set(ip, recent);
  if (rateLimitStore.size > 1000) {
    for (const [k, v] of rateLimitStore) {
      if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) rateLimitStore.delete(k);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin || '';
  if (allowed.length === 0 || allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return badRequest(res, 'Method not allowed');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans 1 min.' });
  }

  const demoCabinetId = process.env.DEMO_CABINET_ID;
  // Démo non configurée côté serveur → réponse neutre (pas une erreur)
  if (!demoCabinetId || !UUID_RE.test(demoCabinetId)) {
    return ok(res, { enabled: false });
  }

  try {
    const { conversationId } = req.query || {};
    if (!conversationId || !UUID_RE.test(conversationId)) {
      return badRequest(res, 'conversationId invalide');
    }

    const { data, error } = await supabaseAdmin
      .from('demandes')
      .select('patient_nom, patient_telephone, motif, souhait, urgence')
      .eq('conversation_id', conversationId)
      .eq('cabinet_id', demoCabinetId) // garde-fou : uniquement la démo
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return serverError(res, error);

    return ok(res, { enabled: true, demande: (data && data[0]) || null });
  } catch (err) {
    return serverError(res, err);
  }
}
