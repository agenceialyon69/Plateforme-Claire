#!/usr/bin/env node
// ================================================================
// test-admin-access.mjs — Preuve hors-ligne que /api/admin est FERMÉ
// ----------------------------------------------------------------
// Simule Supabase (auth + REST) avec un fetch mock : aucun réseau, aucune
// clé réelle. Vérifie les frontières de sécurité de l'endpoint admin :
// sans jeton → 401 ; non-admin → 403 AVANT toute lecture de données ;
// ADMIN_EMAILS vide → personne n'est admin (fail-closed) ; /health ne
// divulgue jamais la valeur d'un secret.
//   npm run test:admin
// ================================================================

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
process.env.SUPABASE_ANON_KEY = 'fake-anon';
process.env.ADMIN_EMAILS = 'admin@example.fr';
process.env.GROQ_API_KEY = 'SECRET-VALUE-XYZ-123';

const calls = [];
const USERS = {
  'tok-admin': { id: 'u-admin', email: 'admin@example.fr' },
  'tok-cabinet': { id: 'u-cab', email: 'cabinet@example.fr' },
};

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  calls.push(url);
  const headers = new Headers(init.headers || {});
  const json = (status, body, extra = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

  if (url.includes('/auth/v1/user')) {
    const token = (headers.get('authorization') || '').replace('Bearer ', '');
    const user = USERS[token];
    return user ? json(200, user) : json(401, { message: 'invalid jwt' });
  }
  if (url.includes('/rest/v1/cabinets') && /id=eq\./.test(url)) {
    const id = decodeURIComponent(url.split('id=eq.')[1].split('&')[0]);
    return json(200, { id, nom: 'Cabinet test' });
  }
  // Toute autre lecture REST : vide (comptage head → en-tête content-range)
  return json(200, [], { 'content-range': '0-0/0' });
};

const { default: handler } = await import('../api/admin/[action].js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

function fakeRes() {
  return {
    code: 200, body: '', headers: {},
    status(c) { this.code = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    send(b) { this.body = b; return this; },
    json(b) { this.body = JSON.stringify(b); return this; },
    end() { return this; },
  };
}
async function call({ action, method = 'GET', token, body }) {
  calls.length = 0;
  const req = {
    method, query: { action }, body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res = fakeRes();
  await handler(req, res);
  let parsed = null;
  try { parsed = JSON.parse(res.body); } catch { /* corps non JSON */ }
  return { code: res.code, body: parsed, raw: res.body, calls: [...calls] };
}
const touchedData = (r) => r.calls.some(u => /contact_leads|\/demandes|\/conversations|\/appels/.test(u));

// 1. Sans jeton
let r = await call({ action: 'prospects' });
ok(r.code === 401, 'sans jeton → 401');
ok(!touchedData(r), 'sans jeton → aucune donnée lue');

// 2. Jeton invalide
r = await call({ action: 'prospects', token: 'tok-bidon' });
ok(r.code === 401, 'jeton invalide → 401');

// 3. Non-admin : toutes les actions sensibles refusées, sans lecture de données
for (const [action, method] of [['prospects', 'GET'], ['cabinets', 'GET'], ['health', 'GET'], ['invite', 'POST'], ['prospects', 'PATCH']]) {
  r = await call({ action, method, token: 'tok-cabinet', body: { id: 'x', statut: 'perdu' } });
  ok(r.code === 403, `non-admin ${method} ${action} → 403`);
  ok(!touchedData(r), `non-admin ${method} ${action} → aucune donnée lue`);
}

// 4. `me` : accessible aux deux, ne révèle que le booléen
r = await call({ action: 'me', token: 'tok-cabinet' });
ok(r.code === 200 && r.body.admin === false, 'non-admin : /me → admin:false');
r = await call({ action: 'me', token: 'tok-admin' });
ok(r.code === 200 && r.body.admin === true, 'admin : /me → admin:true');

// 5. Admin : validation d'entrée
r = await call({ action: 'inconnue', token: 'tok-admin' });
ok(r.code === 404, 'admin : action inconnue → 404');
r = await call({ action: 'prospects', method: 'PATCH', token: 'tok-admin', body: { id: 'pas-un-uuid', statut: 'perdu' } });
ok(r.code === 400, 'PATCH prospect avec id invalide → 400');
r = await call({ action: 'prospects', method: 'PATCH', token: 'tok-admin',
  body: { id: '123e4567-e89b-12d3-a456-426614174000', statut: 'statut-invente' } });
ok(r.code === 400, 'PATCH prospect avec statut inconnu → 400');
r = await call({ action: 'prospects', method: 'POST', token: 'tok-admin', body: { nom: 'Dr X', email: 'pas-un-email' } });
ok(r.code === 400, 'POST prospect avec email invalide → 400');
r = await call({ action: 'prospects', method: 'POST', token: 'tok-admin', body: { nom: '', email: 'a@b.fr' } });
ok(r.code === 400, 'POST prospect sans nom → 400');
r = await call({ action: 'prospects', method: 'DELETE', token: 'tok-admin' });
ok(r.code === 400, 'méthode non supportée sur prospects → refusée');

// 6. /health : booléens seulement, jamais la valeur d'un secret
r = await call({ action: 'health', token: 'tok-admin' });
ok(r.code === 200, 'admin : /health → 200');
ok(r.body?.config?.groq === true, '/health : présence de la clé signalée (true)');
ok(!r.raw.includes('SECRET-VALUE-XYZ-123'), '/health : la valeur du secret n\'apparaît JAMAIS');
ok(Object.values(r.body?.config || {}).every(v => typeof v === 'boolean'), '/health : config = booléens uniquement');

// 7. Fail-closed : ADMIN_EMAILS vide → même l'ancien admin est refusé
process.env.ADMIN_EMAILS = '';
r = await call({ action: 'prospects', token: 'tok-admin' });
ok(r.code === 403, 'ADMIN_EMAILS vide → personne n\'est admin (fail-closed)');
r = await call({ action: 'me', token: 'tok-admin' });
ok(r.body?.admin === false, 'ADMIN_EMAILS vide : /me → admin:false');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
