// ================================================================
// _logic.js — Logique PURE du débordement (aucun I/O, testable hors-ligne)
// ----------------------------------------------------------------
// On isole ici toutes les décisions à risque (envoi SMS, STOP/START, gabarit,
// TwiML) pour qu'elles soient couvertes par des tests sans Twilio ni base :
//   npm run test:twilio-logic
// Les handlers (voice/sms/_twilio) IMPORTENT ces fonctions → le code testé
// EST le code exécuté en production, pas une copie.
// ================================================================

const E164_RE = /^\+[1-9]\d{6,15}$/;
export function isValidNumber(n) {
  return typeof n === 'string' && E164_RE.test(n.trim());
}

export function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Lien du chat patient porté par le SMS (avec ?a= pour tracer la récupération).
export function smsLink(baseUrl, cabinetId, appelId) {
  const ref = appelId ? `&a=${encodeURIComponent(appelId)}` : '';
  return `${String(baseUrl || '').replace(/\/+$/, '')}/chat?c=${cabinetId}${ref}`;
}

// Corps du SMS de relance à partir du gabarit du cabinet (ou d'un défaut sobre).
export function buildSmsBody(cabinet, lien) {
  const nom = (cabinet && cabinet.nom) || 'le cabinet';
  const modele = (cabinet && cabinet.sms_modele && cabinet.sms_modele.trim())
    || "Bonjour, ici {cabinet}. Desolee d'avoir manque votre appel. Dites-nous en quelques mots ce dont vous avez besoin, on vous rappelle vite : {lien}";
  let body = modele.replace(/\{cabinet\}/g, nom).replace(/\{lien\}/g, lien);
  if (!/stop/i.test(body)) body += ' STOP pour ne plus etre contacte.';
  return body.slice(0, 500);
}

// TABLE DE DÉCISION de l'envoi du SMS sur appel manqué (source unique de vérité).
// Retourne l'état à journaliser : 'desactive' | 'echoue' | 'opt_out' | 'doublon' | 'send'.
export function decideSmsAction({ smsRelanceActif, fromValid, cabinetNumberValid, optedOut, recentSmsSent }) {
  if (smsRelanceActif === false) return 'desactive';       // cabinet a coupé la relance
  if (!fromValid) return 'echoue';                          // numéro appelant inutilisable (masqué/fixe)
  if (!cabinetNumberValid) return 'echoue';                 // pas d'expéditeur Twilio valide
  if (optedOut) return 'opt_out';                           // patient a répondu STOP
  if (recentSmsSent) return 'doublon';                      // déjà relancé récemment (anti-spam)
  return 'send';
}

// Classement d'un SMS entrant : 'stop' | 'start' | 'message'.
const STOP_WORDS = new Set(['STOP', 'STOPP', 'ARRET', 'ARRÊT', 'ARRETER', 'UNSUB', 'UNSUBSCRIBE', 'DESABONNER']);
const START_WORDS = new Set(['START', 'DEBUT', 'DÉBUT', 'OUI', 'YES', 'REABONNER']);
export function classifyInboundSms(body) {
  const word = String(body || '').trim().toUpperCase().replace(/[^A-ZÀ-Ÿ]/g, '');
  if (STOP_WORDS.has(word)) return 'stop';
  if (START_WORDS.has(word)) return 'start';
  return 'message';
}

// --- Constructeurs TwiML (chaînes XML pures) ---
export function twimlEmpty() { return `<Response/>`; }

export function twimlSayHangup(message, lang = 'fr-FR', voice = 'alice') {
  return `<Response><Say language="${lang}" voice="${voice}">${escapeXml(message)}</Say><Hangup/></Response>`;
}

export function twimlMessage(text) {
  return `<Response><Message>${escapeXml(text)}</Message></Response>`;
}

export function twimlDial({ callerId, dialTo, action, timeout = 20 }) {
  return `<Response>` +
    `<Dial timeout="${timeout}" answerOnBridge="true" callerId="${escapeXml(callerId)}" ` +
    `action="${escapeXml(action)}" method="POST">${escapeXml(dialTo)}</Dial>` +
    `</Response>`;
}
