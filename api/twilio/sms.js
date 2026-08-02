// ================================================================
// /api/twilio/sms — Webhook "SMS entrant" (le patient répond au SMS)
// ----------------------------------------------------------------
// Gère trois cas :
//   • STOP / ARRET / STOP … → opt-out : on n'enverra plus de SMS à ce numéro.
//   • START / DEBUT         → ré-abonnement.
//   • tout autre message     → message du patient : on le transmet au cabinet
//     (webhook de notification) et on répond un accusé chaleureux avec le lien
//     du chat pour préciser la demande.
//
// NB : le chat conversationnel complet vit sur le web (meilleure UX, résumé
// qualifié, coût maîtrisé). Le SMS sert d'accroche fiable, pas de canal IA
// bidirectionnel — un vrai dialogue IA par SMS est une évolution ultérieure
// (coût + cadre réglementaire à part). Ici : zéro message perdu, réponse utile.
//
// Configurer côté Twilio : Phone Numbers → (numéro) → Messaging → "A message comes in"
//   Webhook  POST  https://<votre-domaine>/api/twilio/sms
// ================================================================

import {
  guardWebhook, findCabinetByTwilioNumber, sendTwiml, escapeXml, publicBaseUrl,
} from './_twilio.js';
import { supabaseAdmin } from '../_supabase.js';

const STOP_WORDS = new Set(['STOP', 'STOPP', 'ARRET', 'ARRÊT', 'ARRETER', 'UNSUB', 'UNSUBSCRIBE', 'DESABONNER']);
const START_WORDS = new Set(['START', 'DEBUT', 'DÉBUT', 'OUI', 'YES', 'REABONNER']);

const reply = (res, msg) =>
  sendTwiml(res, `<Response><Message>${escapeXml(msg)}</Message></Response>`);

export default async function handler(req, res) {
  if (!guardWebhook(req, res)) return;

  const { From, To, Body } = req.body || {};
  const cabinet = await findCabinetByTwilioNumber(To);
  if (!cabinet) return sendTwiml(res, `<Response/>`);

  const text = String(Body || '').trim();
  const word = text.toUpperCase().replace(/[^A-ZÀ-Ÿ]/g, '');

  // --- Opt-out ---
  if (STOP_WORDS.has(word)) {
    await supabaseAdmin.from('sms_optout')
      .upsert({ cabinet_id: cabinet.id, numero: From }, { onConflict: 'cabinet_id,numero' });
    return reply(res, "C'est note : vous ne recevrez plus de SMS. Repondez START pour reactiver.");
  }

  // --- Ré-abonnement ---
  if (START_WORDS.has(word)) {
    await supabaseAdmin.from('sms_optout')
      .delete().eq('cabinet_id', cabinet.id).eq('numero', From);
    return reply(res, 'Vous etes de nouveau abonne. Comment pouvons-nous vous aider ?');
  }

  // --- Message réel du patient : on ne perd rien, on transmet au cabinet ---
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.NOTIFY_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (webhookUrl) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(webhookSecret ? { 'X-Claire-Secret': webhookSecret } : {}) },
        body: JSON.stringify({
          event: 'sms_entrant',
          cabinet: { id: cabinet.id, nom: cabinet.nom },
          sms: { de: From, message: text.slice(0, 1000) },
        }),
        signal: controller.signal,
      });
    } catch (e) {
      console.error('[twilio] notif SMS entrant échouée:', e.message || e);
    } finally {
      clearTimeout(t);
    }
  }

  const lien = `${publicBaseUrl(req)}/chat?c=${cabinet.id}`;
  return reply(res,
    `Merci, votre message est transmis a ${cabinet.nom || 'notre equipe'} qui vous rappellera. ` +
    `Pour preciser votre demande : ${lien}`);
}
