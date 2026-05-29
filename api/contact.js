// ================================================================
// /api/contact — Formulaire de contact depuis la landing publique
// Avec rate-limit et CORS.
// ================================================================

import { supabaseAdmin, ok, badRequest, serverError } from './_supabase.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5; // 5 leads/min/IP max
const rateLimitStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rateLimitStore.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  arr.push(now);
  rateLimitStore.set(ip, arr);
  return arr.length > RATE_LIMIT_MAX;
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return badRequest(res, 'Method not allowed');

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' });
  }

  try {
    const { nom, cabinet, email, telephone, message } = req.body || {};

    if (!nom || typeof nom !== 'string' || !email || typeof email !== 'string') {
      return badRequest(res, 'nom et email sont requis');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest(res, 'Email invalide');
    }
    if (nom.length > 200 || email.length > 200 ||
        (cabinet && cabinet.length > 200) ||
        (telephone && telephone.length > 50) ||
        (message && message.length > 2000)) {
      return badRequest(res, 'Champs trop longs');
    }

    const { error } = await supabaseAdmin
      .from('contact_leads')
      .insert({
        nom: nom.trim().slice(0, 200),
        cabinet: cabinet?.trim().slice(0, 200) || null,
        email: email.trim().toLowerCase().slice(0, 200),
        telephone: telephone?.trim().slice(0, 50) || null,
        message: message?.trim().slice(0, 2000) || null,
        source: 'landing',
      });
    if (error) return serverError(res, error);

    // Webhook d'automatisation (Make, n8n, Zapier…). NOTIFY_* est le nom retenu ;
    // N8N_* reste accepté pour rétrocompatibilité.
    const webhookUrl = process.env.NOTIFY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.NOTIFY_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookSecret ? { 'X-Claire-Secret': webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: 'nouveau_lead',
          lead: { nom, cabinet, email, telephone, message },
        }),
      }).catch(e => console.error('Webhook notif failed:', e));
    }
    return ok(res, { success: true });
  } catch (err) {
    return serverError(res, err);
  }
}
