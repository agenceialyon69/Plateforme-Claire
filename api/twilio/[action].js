// ================================================================
// /api/twilio/[action] — Point d'entrée unique des webhooks Twilio
// ----------------------------------------------------------------
// Une SEULE fonction serverless route les 4 webhooks (voice, voice-status,
// sms, sms-status). Pourquoi : le plan Vercel Hobby limite à 12 fonctions
// serverless par déploiement ; regrouper ici évite de dépasser la limite.
// Les URLs publiques restent identiques :
//   POST /api/twilio/voice         → _voice.js
//   POST /api/twilio/voice-status  → _voiceStatus.js
//   POST /api/twilio/sms           → _sms.js
//   POST /api/twilio/sms-status    → _smsStatus.js
// Les handlers vivent dans des modules `_*.js` (préfixe = non routés,
// non comptés comme fonctions).
// ================================================================

import voice from './_voice.js';
import voiceStatus from './_voiceStatus.js';
import sms from './_sms.js';
import smsStatus from './_smsStatus.js';

const HANDLERS = {
  'voice': voice,
  'voice-status': voiceStatus,
  'sms': sms,
  'sms-status': smsStatus,
};

export default function handler(req, res) {
  const action = req.query && req.query.action;
  const fn = HANDLERS[action];
  if (!fn) {
    res.status(404).send('Not found');
    return;
  }
  return fn(req, res);
}
