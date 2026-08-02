// ================================================================
// /api/cron/purge — Purge quotidienne des données (rétention RGPD)
// ----------------------------------------------------------------
// Déclenché par Vercel Cron (voir vercel.json → "crons"). Vercel envoie
// l'en-tête  Authorization: Bearer <CRON_SECRET>  sur chaque invocation.
//
// 🔐 SÉCURITÉ (action destructrice) :
// - FAIL-CLOSED : sans CRON_SECRET configuré, l'endpoint refuse (503).
// - Vérification du secret en temps constant (anti-timing).
// - Aucune donnée exposée ; ne renvoie que des compteurs.
// - La suppression réelle est faite par la fonction SQL SECURITY DEFINER
//   purge_old_data() (plancher à 30 j), jamais par du SQL ad hoc ici.
// ================================================================

import crypto from 'node:crypto';
import { supabaseAdmin } from '../_supabase.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed : pas de secret → jamais exécuté
  const header = req.headers.authorization || req.headers.Authorization || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return res.status(process.env.CRON_SECRET ? 401 : 503)
      .json({ error: process.env.CRON_SECRET ? 'Unauthorized' : 'CRON_SECRET non configuré' });
  }

  const retentionDays = parseInt(process.env.RETENTION_DAYS || '730', 10) || 730;
  try {
    const { data, error } = await supabaseAdmin.rpc('purge_old_data', { retention_days: retentionDays });
    if (error) {
      console.error('[cron/purge] échec:', error.message || error);
      return res.status(500).json({ error: 'Purge échouée' });
    }
    console.log('[cron/purge] OK', JSON.stringify(data));
    return res.status(200).json({ ok: true, retention_days: retentionDays, result: data });
  } catch (err) {
    console.error('[cron/purge] exception:', err.message || err);
    return res.status(500).json({ error: 'Purge échouée' });
  }
}
