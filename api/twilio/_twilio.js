// ================================================================
// _twilio.js — Socle commun des webhooks Twilio (débordement d'appels)
// ----------------------------------------------------------------
// Contient tout ce qui est sensible et partagé :
//   - validation de la signature Twilio (X-Twilio-Signature) → FAIL-CLOSED
//   - envoi de SMS via l'API REST Twilio (fetch natif, sans SDK)
//   - recherche du cabinet par son numéro Twilio
//   - logique "appel manqué → SMS" avec anti-doublon, cooldown et opt-out
//
// 🔐 MODÈLE DE MENACE : ces endpoints sont PUBLICS (Twilio les appelle depuis
// Internet). Sans validation de signature, n'importe qui pourrait les forger
// pour faire envoyer des SMS à vos frais ou polluer la base. La signature est
// donc vérifiée systématiquement ; en cas de doute, on REFUSE (fail-closed).
// ================================================================

import crypto from 'node:crypto';
import { supabaseAdmin } from '../_supabase.js';

// ----------------------------------------------------------------
// Config / helpers de base
// ----------------------------------------------------------------
export function twilioConfig() {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
  };
}

export function twilioConfigured() {
  const { sid, token } = twilioConfig();
  return !!sid && !!token;
}

const E164_RE = /^\+[1-9]\d{6,15}$/;
export function isValidNumber(n) {
  return typeof n === 'string' && E164_RE.test(n.trim());
}

// Réponse TwiML (XML) standard
export function sendTwiml(res, xml) {
  res.status(200).setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>${xml}`);
}

export function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ----------------------------------------------------------------
// Validation de la signature Twilio (spec officielle, POST x-www-form-urlencoded)
// Algo : HMAC-SHA1( URL_exacte + concat(clé+valeur trié par clé) , AUTH_TOKEN )
// puis base64, comparé en temps constant à X-Twilio-Signature.
// ----------------------------------------------------------------
function requestUrl(req) {
  // On reconstruit l'URL EXACTE que Twilio a appelée (query comprise).
  // TWILIO_PUBLIC_URL permet de forcer l'origine si les en-têtes proxy diffèrent.
  const base = (process.env.TWILIO_PUBLIC_URL || '').replace(/\/+$/, '');
  if (base) return base + req.url;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.url}`;
}

export function validateTwilioSignature(req) {
  // Échappatoire de test UNIQUEMENT hors production (jamais en prod).
  if (process.env.TWILIO_SKIP_SIGNATURE === 'true' && process.env.NODE_ENV !== 'production') {
    return true;
  }
  const { token } = twilioConfig();
  if (!token) return false; // pas de secret → on ne peut pas vérifier → refus

  const signature = req.headers['x-twilio-signature'];
  if (!signature || typeof signature !== 'string') return false;

  const url = requestUrl(req);
  const params = (req.body && typeof req.body === 'object') ? req.body : {};
  let data = url;
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (Array.isArray(v)) continue; // Twilio n'envoie pas de tableaux ici
    data += key + (v == null ? '' : v);
  }

  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Garde commune à tous les webhooks : POST only, Twilio configuré, signature valide.
 * Retourne true si la requête peut être traitée ; sinon répond directement (403/405/503)
 * et retourne false.
 */
export function guardWebhook(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
    return false;
  }
  if (!twilioConfigured()) {
    res.status(503).send('Twilio non configuré');
    return false;
  }
  if (!validateTwilioSignature(req)) {
    console.warn('[twilio] signature invalide — requête refusée');
    res.status(403).send('Signature invalide');
    return false;
  }
  return true;
}

// ----------------------------------------------------------------
// Envoi d'un SMS via l'API REST Twilio (fetch natif, borné dans le temps)
// ----------------------------------------------------------------
export async function sendSms({ to, from, body, statusCallback }) {
  const { sid, token } = twilioConfig();
  if (!sid || !token) return { ok: false, error: 'Twilio non configuré' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    if (statusCallback) params.set('StatusCallback', statusCallback);

    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.message || `HTTP ${r.status}` };
    return { ok: true, sid: data.sid };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------
// Recherche du cabinet par son numéro Twilio (le "To" de l'appel entrant)
// ----------------------------------------------------------------
export async function findCabinetByTwilioNumber(toNumber) {
  if (!toNumber) return null;
  const { data } = await supabaseAdmin
    .from('cabinets')
    .select('id, nom, numero_twilio, numero_reel, sms_relance_actif, sms_modele')
    .eq('numero_twilio', String(toNumber).trim())
    .single();
  return data || null;
}

// URL publique du site (pour construire le lien du chat dans le SMS)
export function publicBaseUrl(req) {
  const env = process.env.PUBLIC_SITE_URL || process.env.TWILIO_PUBLIC_URL;
  if (env) return env.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Construit le corps du SMS à partir du gabarit du cabinet (ou d'un défaut sobre).
function buildSmsBody(cabinet, lien) {
  const nom = cabinet.nom || 'le cabinet';
  const modele = (cabinet.sms_modele && cabinet.sms_modele.trim())
    || "Bonjour, ici {cabinet}. Desolee d'avoir manque votre appel. Dites-nous en quelques mots ce dont vous avez besoin, on vous rappelle vite : {lien}";
  let body = modele.replace(/\{cabinet\}/g, nom).replace(/\{lien\}/g, lien);
  // Mention d'opt-out (bonne pratique + conformité) si pas déjà présente.
  if (!/stop/i.test(body)) body += ' STOP pour ne plus etre contacte.';
  return body.slice(0, 500);
}

// ----------------------------------------------------------------
// handleMissedCall — cœur métier : un appel non pris → un SMS de relance.
// Idempotent et prudent : anti-opt-out, anti-doublon (cooldown), journalisé.
//   cabinet   : ligne cabinet (avec numero_twilio, sms_relance_actif, sms_modele)
//   from/to   : numéros de l'appel (E.164)
//   callSid   : identifiant Twilio de l'appel
//   appelId   : (optionnel) id d'une ligne `appels` déjà créée à mettre à jour
//   baseUrl   : origine publique pour le lien du chat
// ----------------------------------------------------------------
const SMS_COOLDOWN_MS = 10 * 60 * 1000; // 1 SMS max / appelant / 10 min

export async function handleMissedCall({ cabinet, from, to, callSid, appelId, baseUrl }) {
  // Assure une ligne `appels` (créée si absente) marquée "manqué".
  let rowId = appelId || null;
  if (rowId) {
    await supabaseAdmin.from('appels').update({ statut: 'manque' }).eq('id', rowId);
  } else {
    const { data } = await supabaseAdmin.from('appels').insert({
      cabinet_id: cabinet.id, call_sid: callSid || null,
      from_number: from || null, to_number: to || null, statut: 'manque',
    }).select('id').single();
    rowId = data?.id || null;
  }

  const setSms = (sms_statut, extra = {}) =>
    rowId ? supabaseAdmin.from('appels').update({ sms_statut, ...extra }).eq('id', rowId) : Promise.resolve();

  // Relance désactivée par le cabinet
  if (cabinet.sms_relance_actif === false) { await setSms('desactive'); return; }
  // Numéro appelant inutilisable (masqué, fixe non SMS…)
  if (!isValidNumber(from)) { await setSms('echoue', {}); return; }
  // Il faut un expéditeur (le numéro Twilio du cabinet)
  if (!isValidNumber(cabinet.numero_twilio)) { await setSms('echoue'); return; }

  // Opt-out (le patient a déjà répondu STOP)
  const { data: opt } = await supabaseAdmin.from('sms_optout')
    .select('numero').eq('cabinet_id', cabinet.id).eq('numero', from).limit(1);
  if (opt && opt.length) { await setSms('opt_out'); return; }

  // Anti-doublon : un SMS déjà parti à ce numéro il y a moins de 10 min
  const since = new Date(Date.now() - SMS_COOLDOWN_MS).toISOString();
  const { data: recent } = await supabaseAdmin.from('appels')
    .select('id').eq('cabinet_id', cabinet.id).eq('from_number', from)
    .in('sms_statut', ['envoye', 'livre']).gte('created_at', since).limit(1);
  if (recent && recent.length) { await setSms('doublon'); return; }

  // Envoi — le lien porte l'id de l'appel (?a=) pour mesurer la récupération
  // (appel manqué → conversation créée) côté /api/chat.
  const refParam = rowId ? `&a=${encodeURIComponent(rowId)}` : '';
  const lien = `${(baseUrl || '').replace(/\/+$/, '')}/chat?c=${cabinet.id}${refParam}`;
  const body = buildSmsBody(cabinet, lien);
  const statusCb = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/api/twilio/sms-status` : undefined;
  const r = await sendSms({ to: from, from: cabinet.numero_twilio, body, statusCallback: statusCb });

  if (r.ok) await setSms('envoye', { sms_sid: r.sid || null });
  else { console.error('[twilio] échec envoi SMS relance:', r.error); await setSms('echoue'); }
}
