#!/usr/bin/env node
// ================================================================
// test-twilio-logic.mjs — Test hors-ligne de la logique du débordement
// ----------------------------------------------------------------
// Couvre les décisions à risque SANS Twilio ni base : table de décision SMS,
// classement STOP/START, gabarit SMS, validation numéro, lien, TwiML.
//   npm run test:twilio-logic
// ================================================================

import {
  isValidNumber, escapeXml, smsLink, buildSmsBody,
  decideSmsAction, classifyInboundSms,
  twimlEmpty, twimlSayHangup, twimlMessage, twimlDial,
} from '../api/twilio/_logic.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

// --- isValidNumber ---
ok(isValidNumber('+33600000000'), 'numéro E.164 valide accepté');
ok(!isValidNumber('0600000000'), 'numéro sans + refusé');
ok(!isValidNumber('+33'), 'numéro trop court refusé');
ok(!isValidNumber('+33abc600000'), 'numéro avec lettres refusé');
ok(!isValidNumber(null) && !isValidNumber(undefined), 'null/undefined refusés');

// --- smsLink ---
ok(smsLink('https://x.fr', 'CAB', 'AP1') === 'https://x.fr/chat?c=CAB&a=AP1', 'lien avec appelId');
ok(smsLink('https://x.fr/', 'CAB', null) === 'https://x.fr/chat?c=CAB', 'lien sans appelId + slash final nettoyé');

// --- buildSmsBody ---
const b1 = buildSmsBody({ nom: 'Cabinet Test' }, 'https://x.fr/chat?c=1');
ok(b1.includes('Cabinet Test') && b1.includes('https://x.fr/chat?c=1'), 'gabarit par défaut remplace {cabinet} et {lien}');
ok(/stop/i.test(b1), 'mention STOP ajoutée si absente');
const b2 = buildSmsBody({ nom: 'X', sms_modele: 'Rappel {cabinet}. STOP possible. {lien}' }, 'L');
ok((b2.match(/stop/gi) || []).length === 1, 'mention STOP non dupliquée si déjà présente');
ok(buildSmsBody({ nom: 'X', sms_modele: 'a'.repeat(600) }, 'L').length === 500, 'corps tronqué à 500 caractères');

// --- decideSmsAction (table complète) ---
const base = { smsRelanceActif: true, fromValid: true, cabinetNumberValid: true, optedOut: false, recentSmsSent: false };
ok(decideSmsAction({ ...base, smsRelanceActif: false }) === 'desactive', 'relance désactivée → desactive');
ok(decideSmsAction({ ...base, fromValid: false }) === 'echoue', 'numéro appelant invalide → echoue');
ok(decideSmsAction({ ...base, cabinetNumberValid: false }) === 'echoue', 'numéro Twilio invalide → echoue');
ok(decideSmsAction({ ...base, optedOut: true }) === 'opt_out', 'opt-out → opt_out (priorité sur envoi)');
ok(decideSmsAction({ ...base, recentSmsSent: true }) === 'doublon', 'relance récente → doublon');
ok(decideSmsAction(base) === 'send', 'cas nominal → send');
// priorité : désactivé l'emporte sur tout le reste
ok(decideSmsAction({ smsRelanceActif: false, fromValid: false, cabinetNumberValid: false, optedOut: true, recentSmsSent: true }) === 'desactive', 'priorité : desactive avant tout');

// --- classifyInboundSms ---
ok(classifyInboundSms('STOP') === 'stop', 'STOP → stop');
ok(classifyInboundSms('  Arrêt ! ') === 'stop', 'variante accentuée/ponctuée → stop');
ok(classifyInboundSms('start') === 'start', 'start → start');
ok(classifyInboundSms("J'ai mal à une dent") === 'message', 'message libre → message');

// --- TwiML ---
ok(twimlEmpty() === '<Response/>', 'TwiML vide');
ok(twimlSayHangup('Bonjour & <toi>').includes('&amp;') && twimlSayHangup('a<b').includes('&lt;'), 'Say échappe le XML');
ok(twimlMessage('a"b').includes('&quot;'), 'Message échappe le XML');
const dial = twimlDial({ callerId: '+331', dialTo: '+336', action: 'https://x.fr/a?b=1&c=2' });
ok(dial.includes('<Dial') && dial.includes('+336') && dial.includes('&amp;c=2'), 'Dial construit + action échappée');

console.log(`\n${fail === 0 ? '✅' : '🚨'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
