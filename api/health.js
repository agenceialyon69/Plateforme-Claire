// ================================================================
// /api/health — Diagnostic de la chaîne (PUBLIC, lecture seule)
// ----------------------------------------------------------------
// Vérifie, étape par étape, ce qui empêche la démo de répondre :
//   1) variables d'environnement présentes (booléens, jamais les valeurs)
//   2) connexion Supabase + existence du cabinet de démo
//   3) appel minimal à Claude (modèle accessible avec la clé)
// Aucun secret n'est jamais renvoyé : uniquement des statuts.
// À SUPPRIMER une fois le diagnostic terminé.
// ================================================================

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  const out = {
    ok: false,
    etapes: {},
    model: MODEL,
  };

  // ---------- 1) Variables d'environnement ----------
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    DEMO_CABINET_ID: process.env.DEMO_CABINET_ID || null,
  };
  out.etapes.env = env;
  // Indices de format (sans révéler les valeurs)
  out.etapes.env_format = {
    service_role_prefixe: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').slice(0, 10) || '(vide)',
    anthropic_prefixe: (process.env.ANTHROPIC_API_KEY || '').slice(0, 7) || '(vide)',
    url_finit_par_supabase_co: (process.env.SUPABASE_URL || '').includes('.supabase.co'),
  };

  // ---------- 2) Supabase + cabinet de démo ----------
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante');
    }
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const cabId = req.query?.cabinetId || process.env.DEMO_CABINET_ID;
    const { data, error } = await supabase
      .from('cabinets')
      .select('id, nom')
      .eq('id', cabId)
      .maybeSingle();

    if (error) {
      out.etapes.supabase = { ok: false, erreur: error.message, code: error.code || null };
    } else if (!data) {
      out.etapes.supabase = { ok: false, erreur: 'Cabinet introuvable (cet UUID n\'existe pas dans CE projet)', cabinetId: cabId };
    } else {
      out.etapes.supabase = { ok: true, cabinet_nom: data.nom };
    }
  } catch (e) {
    out.etapes.supabase = { ok: false, erreur: String(e.message || e) };
  }

  // ---------- 3) Appel minimal à Claude ----------
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'dis bonjour' }],
    });
    const txt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    out.etapes.anthropic = { ok: true, reponse: txt.slice(0, 40) };
  } catch (e) {
    out.etapes.anthropic = {
      ok: false,
      erreur: String(e.message || e),
      status: e.status || null,
      type: e.error?.error?.type || e.name || null,
    };
  }

  out.ok = !!(out.etapes.supabase?.ok && out.etapes.anthropic?.ok);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify(out, null, 2));
}
