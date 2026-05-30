// ================================================================
// _supabase.js — Helper Supabase pour les API routes (server-side)
// Utilise la SERVICE_ROLE_KEY → bypass RLS, à ne JAMAIS exposer côté client
// ================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('⚠️ Variables Supabase manquantes côté serveur.');
}

// Client avec service role (bypass RLS — usage interne uniquement)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ----------------------------------------------------------------
// authenticateRequest(req) → retourne { user, cabinet } ou null
// Vérifie le token JWT envoyé par le client dans le header Authorization
// ----------------------------------------------------------------
export async function authenticateRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '');

  // Vérification du token via Supabase
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  // Récupère le cabinet associé
  const { data: cabinet } = await supabaseAdmin
    .from('cabinets')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!cabinet) return null;
  return { user, cabinet };
}

// ----------------------------------------------------------------
// isAdminUser(user) → true si l'email fait partie de ADMIN_EMAILS
// ADMIN_EMAILS = liste d'emails séparés par des virgules (variable env).
// Sert à autoriser l'invitation de nouveaux cabinets.
// ----------------------------------------------------------------
export function isAdminUser(user) {
  if (!user?.email) return false;
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

// ----------------------------------------------------------------
// Helpers de réponse JSON standardisés
// ----------------------------------------------------------------
export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}
export const ok = (res, body) => json(res, 200, body);
export const created = (res, body) => json(res, 201, body);
export const badRequest = (res, msg = 'Bad request') => json(res, 400, { error: msg });
export const unauthorized = (res) => json(res, 401, { error: 'Unauthorized' });
export const forbidden = (res, msg = 'Forbidden') => json(res, 403, { error: msg });
export const notFound = (res, msg = 'Not found') => json(res, 404, { error: msg });
export const serverError = (res, err) => {
  console.error('Server error:', err);
  json(res, 500, { error: 'Internal server error' });
};
