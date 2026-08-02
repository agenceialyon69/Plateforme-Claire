// ================================================================
// /api/twilio/voice — Webhook "appel entrant" (Twilio Voice)
// ----------------------------------------------------------------
// Deux modes selon la config du cabinet :
//  • numero_reel défini  → on fait sonner le secrétariat (Dial, 20 s). Si
//    personne ne décroche, le callback /api/twilio/voice-status déclenche le SMS.
//  • numero_reel vide    → mode "seulement appels manqués" : le cabinet renvoie
//    ses appels non répondus vers le numéro Twilio (renvoi conditionnel opérateur).
//    On considère alors l'appel comme manqué immédiatement → message + SMS.
//
// Configurer côté Twilio : Phone Numbers → (numéro) → Voice → "A call comes in"
//   Webhook  POST  https://<votre-domaine>/api/twilio/voice
// ================================================================

import {
  guardWebhook, findCabinetByTwilioNumber, sendTwiml, escapeXml,
  handleMissedCall, publicBaseUrl,
} from './_twilio.js';
import { supabaseAdmin } from '../_supabase.js';

const DIAL_TIMEOUT = 20; // secondes avant de considérer l'appel comme manqué

export default async function handler(req, res) {
  if (!guardWebhook(req, res)) return;

  const { From, To, CallSid } = req.body || {};
  const cabinet = await findCabinetByTwilioNumber(To);

  // Numéro Twilio non rattaché à un cabinet → message neutre, on raccroche.
  if (!cabinet) {
    return sendTwiml(res,
      `<Response><Say language="fr-FR">Ce numero n'est pas encore configure. Au revoir.</Say><Hangup/></Response>`);
  }

  const baseUrl = publicBaseUrl(req);

  // --- Mode A : on fait sonner le secrétariat, SMS seulement si non répondu ---
  if (cabinet.numero_reel) {
    const { data: appel } = await supabaseAdmin.from('appels').insert({
      cabinet_id: cabinet.id, call_sid: CallSid || null,
      from_number: From || null, to_number: To || null, statut: 'recu',
    }).select('id').single();

    const action = `${baseUrl}/api/twilio/voice-status?appel=${encodeURIComponent(appel?.id || '')}`;
    return sendTwiml(res,
      `<Response>` +
      `<Dial timeout="${DIAL_TIMEOUT}" answerOnBridge="true" callerId="${escapeXml(To)}" ` +
      `action="${escapeXml(action)}" method="POST">${escapeXml(cabinet.numero_reel)}</Dial>` +
      `</Response>`);
  }

  // --- Mode B : appel déjà "manqué" (renvoi conditionnel opérateur) ---
  await handleMissedCall({ cabinet, from: From, to: To, callSid: CallSid, baseUrl });
  return sendTwiml(res,
    `<Response>` +
    `<Say language="fr-FR" voice="alice">Desolee, nous ne pouvons pas prendre votre appel pour le moment. ` +
    `Vous allez recevoir un SMS pour nous laisser votre demande. A tres vite.</Say>` +
    `<Hangup/></Response>`);
}
