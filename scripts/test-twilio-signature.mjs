#!/usr/bin/env node
// ================================================================
// test-twilio-signature.mjs — Test hors-ligne de la validation Twilio
// ----------------------------------------------------------------
// Vérifie le composant de SÉCURITÉ le plus critique du débordement : la
// validation de signature des webhooks. Tourne sans réseau ni secrets.
//
//   npm run test:twilio
//
// PORTÉE (honnêteté) : ce test prouve la cohérence interne et le comportement
// (tri des params, altérations rejetées, fail-closed, indépendance à l'ordre).
// La preuve FINALE que l'algo correspond bit-à-bit à Twilio reste une vraie
// requête Twilio en staging — voir docs/TWILIO.md §7.
// ================================================================

import { computeSignature, validateTwilioSignature } from '../api/twilio/_signature.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

// Neutralise l'échappatoire de test pour valider le vrai chemin.
delete process.env.TWILIO_SKIP_SIGNATURE;
process.env.NODE_ENV = 'test';
// URL forcée → indépendante des en-têtes proxy pour un test déterministe.
process.env.TWILIO_PUBLIC_URL = 'https://claire.example';

const TOKEN = '12345678901234567890123456789012';
const PATH = '/api/twilio/voice';
const FULL_URL = process.env.TWILIO_PUBLIC_URL + PATH;
const params = { To: '+33111111111', From: '+33600000000', CallSid: 'CA123', Digits: '42' };

// Requête factice signée correctement (round-trip).
function reqWith(body, sig, url = PATH) {
  return { url, headers: { 'x-twilio-signature': sig }, body };
}

const goodSig = computeSignature(FULL_URL, params, TOKEN);

// 1) Déterminisme + indépendance à l'ordre d'insertion des clés
const reordered = { Digits: '42', CallSid: 'CA123', From: '+33600000000', To: '+33111111111' };
ok(computeSignature(FULL_URL, reordered, TOKEN) === goodSig, 'signature indépendante de l\'ordre des params (tri par clé)');

// 2) Requête correctement signée → acceptée
ok(validateTwilioSignature(reqWith(params, goodSig), TOKEN) === true, 'requête correctement signée acceptée');

// 3) Signature altérée → refusée
ok(validateTwilioSignature(reqWith(params, goodSig.slice(0, -2) + 'xx'), TOKEN) === false, 'signature altérée refusée');

// 4) Paramètre altéré → refusée (le corps ne correspond plus à la signature)
ok(validateTwilioSignature(reqWith({ ...params, From: '+33699999999' }, goodSig), TOKEN) === false, 'paramètre altéré refusé');

// 5) URL différente (autre chemin) → refusée
ok(validateTwilioSignature(reqWith(params, goodSig, '/api/twilio/sms'), TOKEN) === false, 'URL différente refusée');

// 6) Mauvais token → refusée
ok(validateTwilioSignature(reqWith(params, goodSig), 'mauvais-token') === false, 'token incorrect refusé');

// 7) Signature absente → refusée
ok(validateTwilioSignature({ url: PATH, headers: {}, body: params }, TOKEN) === false, 'signature absente refusée');

// 8) FAIL-CLOSED : pas de token configuré → refus (même avec une "vraie" signature)
ok(validateTwilioSignature(reqWith(params, goodSig), '') === false, 'fail-closed : aucun token → refus');

// 9) Échappatoire de test : active hors prod, IGNORÉE en production
process.env.TWILIO_SKIP_SIGNATURE = 'true';
process.env.NODE_ENV = 'development';
ok(validateTwilioSignature({ url: PATH, headers: {}, body: {} }, '') === true, 'skip-signature actif hors production');
process.env.NODE_ENV = 'production';
ok(validateTwilioSignature({ url: PATH, headers: {}, body: {} }, '') === false, 'skip-signature IGNORÉ en production (fail-closed)');

console.log(`\n${fail === 0 ? '✅' : '🚨'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
