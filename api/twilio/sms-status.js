// ================================================================
// /api/twilio/sms-status — Callback de statut de livraison des SMS sortants
// ----------------------------------------------------------------
// Twilio notifie ici l'état final du SMS de relance (delivered / failed / …).
// On met à jour la ligne `appels` correspondante (par MessageSid) pour une
// vraie observabilité : le cabinet/le fondateur sait si le SMS est bien arrivé.
// ================================================================

import { guardWebhook } from './_twilio.js';
import { supabaseAdmin } from '../_supabase.js';

export default async function handler(req, res) {
  if (!guardWebhook(req, res)) return;

  const { MessageSid, MessageStatus } = req.body || {};
  if (MessageSid) {
    // delivered → livre ; failed/undelivered → echoue ; autres statuts intermédiaires ignorés.
    let sms_statut = null;
    if (MessageStatus === 'delivered') sms_statut = 'livre';
    else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') sms_statut = 'echoue';

    if (sms_statut) {
      await supabaseAdmin.from('appels').update({ sms_statut }).eq('sms_sid', MessageSid);
    }
  }

  res.status(204).end();
}
