// ================================================================
// /api/cron/purge — Cron quotidien Vercel : (1) réveille Supabase si en
// pause, (2) purge les données au-delà de la rétention (RGPD).
// ----------------------------------------------------------------
// Déclenché par Vercel Cron (voir vercel.json → "crons"). Vercel envoie
// l'en-tête  Authorization: Bearer <CRON_SECRET>  sur chaque invocation.
//
// 🔐 SÉCURITÉ (action destructrice) :
// - FAIL-CLOSED : sans CRON_SECRET configuré, l'endpoint refuse (503).
// - Vérification du secret en temps constant (anti-timing).
// - La suppression réelle est faite par la fonction SQL SECURITY DEFINER
//   purge_old_data() (plancher à 30 j), jamais par du SQL ad hoc ici.
//
// 🔁 AUTO-RÉVEIL (gratuit, tout sur Vercel) :
// - Si SUPABASE_ACCESS_TOKEN est défini (variable Vercel) et que le projet
//   n'est pas ACTIVE_HEALTHY, on le RÉVEILLE via l'API d'administration
//   Supabase, puis on saute la purge de ce passage (base pas encore prête).
// - Sans ce token : on saute simplement le réveil (best-effort).
// - Le job GitHub (toutes les 6h) reste la prévention principale ; ce
//   réveil quotidien est le filet de sécurité si une pause survient quand même.
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

// Réf projet Supabase déduite de SUPABASE_URL (ex. https://<ref>.supabase.co).
function projectRef() {
  const url = process.env.SUPABASE_URL || '';
  const m = url.match(/^https:\/\/([^.]+)\./);
  return m ? m[1] : null;
}

// Retourne 'awake' (déjà actif), 'woke' (réveil demandé → sauter la purge)
// ou 'skipped' (pas de token / impossible → on continue quand même).
async function ensureAwake() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef();
  if (!token || !ref) return 'skipped';
  const base = `https://api.supabase.com/v1/projects/${ref}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    if (!r.ok) { console.warn('[cron] statut projet HTTP', r.status); return 'skipped'; }
    const data = await r.json().catch(() => ({}));
    if (data && data.status === 'ACTIVE_HEALTHY') return 'awake';
    // Pas actif → tentative de réveil.
    console.warn('[cron] projet non actif:', data && data.status, '→ réveil');
    const rr = await fetch(`${base}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}', signal: ctrl.signal,
    });
    console.warn('[cron] réveil HTTP', rr.status);
    return 'woke';
  } catch (e) {
    console.warn('[cron] ensureAwake exception:', e.message || e);
    return 'skipped';
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return res.status(process.env.CRON_SECRET ? 401 : 503)
      .json({ error: process.env.CRON_SECRET ? 'Unauthorized' : 'CRON_SECRET non configuré' });
  }

  // 1) Auto-réveil si le projet est en pause (filet de sécurité).
  const wake = await ensureAwake();
  if (wake === 'woke') {
    // Base en cours de redémarrage → on ne purge pas ce passage.
    return res.status(200).json({ ok: true, woke: true, purged: false });
  }

  // 2) Purge de rétention.
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '730', 10) || 730;
  try {
    const { data, error } = await supabaseAdmin.rpc('purge_old_data', { retention_days: retentionDays });
    if (error) {
      console.error('[cron/purge] échec:', error.message || error);
      return res.status(500).json({ error: 'Purge échouée' });
    }
    console.log('[cron/purge] OK', JSON.stringify(data));
    return res.status(200).json({ ok: true, woke: false, retention_days: retentionDays, result: data });
  } catch (err) {
    console.error('[cron/purge] exception:', err.message || err);
    return res.status(500).json({ error: 'Purge échouée' });
  }
}
