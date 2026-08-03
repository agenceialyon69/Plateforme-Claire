// ================================================================
// /api/twilio/voice-status — Callback de fin de <Dial> (mode A)
// ----------------------------------------------------------------
// Twilio appelle cette URL quand la tentative d'appel vers le secrétariat
// se termine. On lit DialCallStatus :
//   • completed / answered → l'appel a été pris → rien à faire.
//   • no-answer / busy / failed / canceled → appel MANQUÉ → SMS de relance.
//
// L'id de la ligne `appels` créée à l'étape voice.js est passé en query (?appel=).
// ================================================================

import {
  guardWebhook, findCabinetByTwilioNumber, sendTwiml,
  handleMissedCall, publicBaseUrl,
} from './_twilio.js';
import { supabaseAdmin } from '../_supabase.js';

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);

export default async function handler(req, res) {
  if (!guardWebhook(req, res)) return;

  const { From, To, CallSid, DialCallStatus } = req.body || {};
  const appelId = (req.query && req.query.appel) || null;

  // Appel pris : on marque "répondu" et on termine proprement.
  if (!MISSED.has(String(DialCallStatus))) {
    if (appelId) {
      await supabaseAdmin.from('appels').update({ statut: 'repondu' }).eq('id', appelId);
    }
    return sendTwiml(res, `<Response/>`);
  }

  // Appel manqué : relance SMS (idempotent, anti-doublon géré dans le helper).
  const cabinet = await findCabinetByTwilioNumber(To);
  if (cabinet) {
    await handleMissedCall({
      cabinet, from: From, to: To, callSid: CallSid,
      appelId, baseUrl: publicBaseUrl(req),
    });
  }

  return sendTwiml(res,
    `<Response>` +
    `<Say language="fr-FR" voice="alice">Nous n'avons pas pu prendre votre appel. ` +
    `Vous allez recevoir un SMS pour nous laisser votre demande. A tres vite.</Say>` +
    `<Hangup/></Response>`);
}
