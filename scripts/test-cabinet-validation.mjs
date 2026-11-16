#!/usr/bin/env node
// ================================================================
// test-cabinet-validation.mjs — Preuve hors-ligne du correctif « E1 »
// ----------------------------------------------------------------
// Valide que les paramètres cabinet sont strictement contrôlés AVANT
// d'atteindre la base ou Twilio : numéro français hors 08, SMS sans lien,
// liste blanche des champs, et que /api/cabinet refuse les valeurs
// dangereuses. npm run test:cabinet
// ================================================================

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
process.env.SUPABASE_ANON_KEY = 'fake-anon';

const writes = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('/auth/v1/user')) {
    return (headers.get('authorization') || '').includes('tok-cab')
      ? json(200, { id: 'u-cab', email: 'cabinet@example.fr' }) : json(401, { message: 'invalid jwt' });
  }
  if (url.includes('/rest/v1/cabinets')) {
    if (method === 'PATCH') { writes.push(JSON.parse(init.body)); return json(200, { id: 'u-cab', ...JSON.parse(init.body) }); }
    return json(200, { id: 'u-cab', nom: 'Cabinet test' });
  }
  return json(200, []);
};

const { parseDialNumber, parseSmsModele, parseCabinetPatch } = await import('../api/_validate.js');
const { default: handler } = await import('../api/cabinet.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

// --- Numéro à faire sonner ---
for (const [input, expected] of [
  ['04 78 00 00 00', '+33478000000'], ['+33 4 78 00 00 00', '+33478000000'], ['0478000000', '+33478000000'],
  ['0033478000000', '+33478000000'], ['06.12.34.56.78', '+33612345678'], ['09 51 23 45 67', '+33951234567'],
]) {
  const r = parseDialNumber(input);
  ok(r.ok && r.value === expected, `accepté et normalisé : ${input} → ${expected}`);
}
ok(parseDialNumber('').ok && parseDialNumber('').value === null, 'vide → null (désactivé)');
for (const bad of ['0899 12 34 56', '+33899123456', '0800 12 34 56', '+4915112345678', '+12025550123', '+4478000000000',
  '12345', 'abc', '+33 1 2', '0123456789012', '+33078000000', '+330478000000']) {
  ok(!parseDialNumber(bad).ok, `refusé : ${bad}`);
}
ok(!parseDialNumber(12345678).ok && !parseDialNumber({}).ok, 'types non-chaîne refusés');

// --- Texte du SMS ---
ok(parseSmsModele('Bonjour, {cabinet} vous répond ici : {lien}').ok, 'SMS avec placeholders accepté');
for (const bad of ['Cliquez https://evil.example/x', 'allez sur www.exemple.com', 'cabinet-secours.fr/paiement', 'infos : promo.xyz', 'a'.repeat(501)]) {
  ok(!parseSmsModele(bad).ok, `SMS refusé : ${bad.slice(0, 40)}${bad.length > 40 ? '…' : ''}`);
}

// --- Patch complet ---
ok(!parseCabinetPatch({}).ok, 'patch vide refusé');
ok(!parseCabinetPatch({ id: 'x', email: 'a@b.fr', numero_twilio: '+33100000000' }).ok, "champs hors liste blanche (id, email, numero_twilio) → rien à modifier");
const inj = parseCabinetPatch({ nom: 'Cabinet', numero_twilio: '+33100000000', id: 'other' });
ok(inj.ok && Object.keys(inj.value).join() === 'nom', 'champs interdits ignorés, champs permis conservés');
ok(!parseCabinetPatch({ nom: '' }).ok && !parseCabinetPatch({ nom: 'x'.repeat(201) }).ok, 'nom vide ou trop long refusé');
ok(!parseCabinetPatch({ notif_email: 'pas-un-email' }).ok, 'email de notification invalide refusé');
ok(!parseCabinetPatch({ sms_relance_actif: 'oui' }).ok, 'booléen strict pour sms_relance_actif');
ok(!parseCabinetPatch({ horaires: { lundi: { ouvert: 'oui' } } }).ok, 'horaires mal formés refusés');
ok(!parseCabinetPatch({ horaires: { jourbidon: { ouvert: true } } }).ok, 'jour inconnu refusé');
ok(parseCabinetPatch({ horaires: { lundi: { ouvert: true, matin: ['09:00', '12:00'], aprem: [] } } }).ok, 'horaires valides acceptés');
ok(!parseCabinetPatch({ regles_reponse: 'x'.repeat(2001) }).ok, 'règles trop longues refusées');

// --- Endpoint : refuse AVANT toute écriture ---
function fakeRes() {
  return { code: 200, body: '', status(c) { this.code = c; return this; }, setHeader() { return this; },
    send(b) { this.body = b; return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
}
async function patch(body, token = 'tok-cab') {
  writes.length = 0;
  const res = fakeRes();
  await handler({ method: 'PATCH', body, headers: { authorization: `Bearer ${token}` } }, res);
  return { code: res.code, body: (() => { try { return JSON.parse(res.body); } catch { return null; } })(), wrote: writes.length };
}
let r = await patch({ numero_reel: '0899123456' });
ok(r.code === 400 && r.wrote === 0, 'API : numéro surtaxé → 400 et AUCUNE écriture');
r = await patch({ numero_reel: '+4915112345678' });
ok(r.code === 400 && r.wrote === 0, 'API : numéro étranger → 400 et aucune écriture');
r = await patch({ sms_modele: 'Payez ici https://evil.example' });
ok(r.code === 400 && r.wrote === 0, 'API : SMS avec lien → 400 et aucune écriture');
r = await patch({ numero_twilio: '+33100000000' });
ok(r.code === 400 && r.wrote === 0, 'API : tentative de modifier numero_twilio → refusée');
r = await patch({ numero_reel: '04 78 00 00 00', sms_relance_actif: true });
ok(r.code === 200 && r.wrote === 1, 'API : paramètres valides → 200 et une écriture');
ok(writes[0] && writes[0].numero_reel === '+33478000000', "API : le numéro est enregistré normalisé en E.164");
r = await patch({ numero_reel: '04 78 00 00 00' }, 'tok-inconnu');
ok(r.code === 401 && r.wrote === 0, 'API : sans session valide → 401');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
