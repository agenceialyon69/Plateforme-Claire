#!/usr/bin/env node
// ================================================================
// test-chat.mjs — Banc de test hors-ligne du cœur du produit (api/chat.js)
// ----------------------------------------------------------------
// Aucun réseau, aucune clé réelle : le vrai code de api/chat.js s'exécute avec
//   - une base Supabase SIMULÉE en mémoire (même protocole REST que supabase-js),
//   - des fournisseurs de modèle de langage SIMULÉS (Anthropic, Groq),
//   - un webhook de notification simulé.
// Scénarios de l'audit du 2026-11-16 : demande perdue, urgence figée, filet
// 15/112, plafonds anti-inondation, politique de fournisseurs, prompt daté.
//   npm run test:chat
// ================================================================
import { randomUUID } from 'node:crypto';

const DEMO = 'fb235b55-e53c-469b-bc12-64ab845a765f';
process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
process.env.SUPABASE_ANON_KEY = 'fake-anon';
process.env.DEMO_CABINET_ID = DEMO;
process.env.GROQ_API_KEY = 'fake-groq';
process.env.ANTHROPIC_API_KEY = 'fake-anthropic';
process.env.NOTIFY_WEBHOOK_URL = 'https://hooks.example/notify';
delete process.env.LLM_PROVIDERS_REAL;
delete process.env.MINIMIZE_HEALTH_DATA;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.GEMINI_API_KEY;
const ALLOWED_ORIGIN = 'https://claireassistante.fr';
process.env.ALLOWED_ORIGINS = ALLOWED_ORIGIN;

// ---------------- Base simulée (protocole REST de Supabase) ----------------
const db = { cabinets: [], conversations: [], messages: [], demandes: [], appels: [] };
const webhooks = [];
const llmCalls = [];
const llm = { reply: 'Je comprends, pouvez-vous me donner votre nom et un numéro ?', extraction: null, fail: false };

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function matches(row, searchParams) {
  for (const [k, v] of searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    let m;
    if ((m = /^eq\.(.*)$/.exec(v))) { if (String(row[k]) !== m[1]) return false; }
    else if ((m = /^gte\.(.*)$/.exec(v))) { if (!(String(row[k]) >= m[1])) return false; }
    else if ((m = /^lte\.(.*)$/.exec(v))) { if (!(String(row[k]) <= m[1])) return false; }
  }
  return true;
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});

  if (url.startsWith('https://hooks.example')) {
    webhooks.push(JSON.parse(init.body));
    return json(200, { ok: true });
  }

  if (url.includes('api.anthropic.com') || url.includes('api.groq.com')) {
    const provider = url.includes('anthropic') ? 'anthropic' : 'groq';
    const body = JSON.parse(init.body);
    const text = JSON.stringify(body);
    const kind = text.includes('CONVERSATION :') ? 'extraction' : 'chat';
    llmCalls.push({ provider, kind });
    if (llm.fail) return json(500, { error: 'down' });
    const out = kind === 'extraction' ? JSON.stringify(llm.extraction ?? { complet: false }) : llm.reply;
    return provider === 'anthropic'
      ? json(200, { content: [{ type: 'text', text: out }] })
      : json(200, { choices: [{ message: { content: out } }] });
  }

  if (url.includes('/rest/v1/')) {
    const u = new URL(url);
    const table = u.pathname.split('/rest/v1/')[1];
    const rows = db[table];
    if (!rows) return json(404, { message: `table inconnue ${table}` });
    const single = /vnd\.pgrst\.object/.test(headers.get('accept') || '');
    const prefer = headers.get('prefer') || '';

    if (method === 'GET' || method === 'HEAD') {
      const found = rows.filter(r => matches(r, u.searchParams));
      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-range': found.length ? `0-${found.length - 1}/${found.length}` : '*/0' } });
      }
      if (single) {
        return found.length === 1 ? json(200, found[0])
          : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${found.length} rows` });
      }
      return json(200, found);
    }
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      const created = (Array.isArray(body) ? body : [body]).map(b => {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...b };
        if (table === 'conversations') {
          row.statut ??= 'active'; row.urgence ??= 'normale'; row.nb_echanges ??= 0; row.derniere_activite ??= row.created_at;
        }
        rows.push(row);
        return row;
      });
      if (prefer.includes('return=representation')) return json(201, single ? created[0] : created);
      return new Response(null, { status: 201 });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(init.body);
      const found = rows.filter(r => matches(r, u.searchParams));
      found.forEach(r => Object.assign(r, body));
      if (prefer.includes('return=representation')) return json(200, single ? found[0] : found);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 204 });
  }
  throw new Error(`appel réseau inattendu : ${url}`);
};

const { default: handler } = await import('../api/chat.js');
const { buildSystemPrompt } = await import('../api/_prompt.js');

// ---------------- Outils de test ----------------
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

function fakeRes() {
  return { code: 200, body: '', headers: {}, status(c) { this.code = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; }, send(b) { this.body = b; return this; },
    json(b) { this.body = JSON.stringify(b); return this; }, end() { return this; } };
}
let ipN = 0;
async function chat(body) {
  const req = {
    method: 'POST', body: JSON.parse(JSON.stringify(body)), socket: {},
    headers: { origin: ALLOWED_ORIGIN, 'x-forwarded-for': `10.${Math.floor(++ipN / 60000)}.${Math.floor(ipN / 250) % 240}.${ipN % 250 + 1}` },
  };
  const res = fakeRes();
  await handler(req, res);
  let data = null; try { data = JSON.parse(res.body); } catch { /* corps non JSON */ }
  return { code: res.code, data };
}
function newCabinet(extra = {}) {
  const id = randomUUID();
  db.cabinets.push({ id, nom: 'Cabinet Test', ville: 'Lyon', adresse: null, telephone: null, horaires: null,
    regles_reponse: null, notif_email: 'c@x.fr', notif_telephone: null, ...extra });
  return id;
}
function reset() {
  webhooks.length = 0; llmCalls.length = 0;
  llm.reply = 'Je comprends, pouvez-vous me donner votre nom et un numéro ?'; llm.extraction = null; llm.fail = false;
  process.env.ANTHROPIC_API_KEY = 'fake-anthropic';
}
const demandesOf = (cab) => db.demandes.filter(d => d.cabinet_id === cab);
const user = (content) => ({ role: 'user', content });
const EXTRACTION = (over = {}) => ({ complet: true, patient_nom: 'Jean Dupont', patient_telephone: '0612345678',
  motif: 'Mal de dent depuis hier', souhait: 'RDV rapide', urgence: 'moderee', ...over });

// ================= A. Capture du contact =================
console.log('A. Capture de la demande');
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION();
  const r = await chat({ cabinetId: cab, messages: [user("Bonjour j'ai mal à une dent, Jean Dupont 06 12 34 56 78")] });
  ok(r.code === 200 && r.data.reply, 'un seul message contenant un numéro → réponse 200');
  ok(llmCalls.some(c => c.kind === 'extraction'), 'numéro détecté → extraction tentée dès le 1er message (plus de demande perdue)');
  const d = demandesOf(cab);
  ok(d.length === 1, 'une demande créée');
  ok(d[0]?.motif === 'Demande de rappel', 'minimisation : le motif médical n\'est PAS stocké en base');
  ok(d[0]?.patient_telephone === '0612345678', 'le contact est stocké');
  ok(d[0]?.urgence === 'moderee', "l'urgence du modèle est conservée hors urgence vitale");
  ok(webhooks.some(w => w.event === 'nouvelle_demande' && w.demande.motif === 'Mal de dent depuis hier'),
    'le cabinet reçoit le détail réel par le webhook (pass-through conservé)');
  ok(db.messages.filter(m => m.conversation_id === db.conversations.find(c => c.cabinet_id === cab).id).length === 0,
    'minimisation : aucun message patient stocké');
  const conv = db.conversations.find(c => c.cabinet_id === cab);
  ok(conv.nb_echanges === 1, 'compteur d\'échanges incrémenté même en minimisation');
  ok(!!conv.derniere_activite, 'dernière activité mise à jour même sans message stocké');
}
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION();
  await chat({ cabinetId: cab, messages: [user('Bonjour, je voudrais un rendez-vous')] });
  ok(!llmCalls.some(c => c.kind === 'extraction') && demandesOf(cab).length === 0, 'sans numéro et au 1er message : pas d\'extraction prématurée');
}
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION();
  const first = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  const cid = first.data.conversationId;
  const hist = [user('Bonjour'), { role: 'assistant', content: first.data.reply }, user("J'ai mal"),
    { role: 'assistant', content: 'Depuis quand ?' }, user('Depuis hier')];
  await chat({ cabinetId: cab, conversationId: cid, messages: hist });
  ok(demandesOf(cab).length === 1, 'sans numéro, à partir de 4 messages → extraction (comportement historique conservé)');
}

// ================= B. Urgence vitale =================
console.log('B. Urgence vitale');
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION({ urgence: 'normale' });
  const r = await chat({ cabinetId: cab, messages: [user("Je n'arrive plus à respirer, Marie 06 12 34 56 78")] });
  ok(/\b15\b/.test(r.data.reply) && /\b112\b/.test(r.data.reply), 'réponse du modèle SANS 15/112 → rappel ajouté de force');
  ok(demandesOf(cab)[0]?.urgence === 'elevee', 'urgence vitale → demande « élevée » même si le modèle dit « normale »');
}
{
  reset();
  const cab = newCabinet();
  llm.reply = 'Appelez le 15 immédiatement. Quel est votre nom ?';
  const r = await chat({ cabinetId: cab, messages: [user("j'étouffe")] });
  ok(r.data.reply === 'Appelez le 15 immédiatement. Quel est votre nom ?', 'le modèle mentionne déjà le 15 → réponse inchangée (pas de doublon)');
}
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION({ urgence: 'moderee' });
  const r1 = await chat({ cabinetId: cab, messages: [user('Mal de dent, Jean 06 12 34 56 78')] });
  const cid = r1.data.conversationId;
  const base = [user('Mal de dent, Jean 06 12 34 56 78'), { role: 'assistant', content: r1.data.reply }];
  ok(demandesOf(cab)[0].urgence === 'moderee', 'départ : demande « modérée »');
  webhooks.length = 0;
  const r2 = await chat({ cabinetId: cab, conversationId: cid, messages: [...base, user('Mon visage gonfle et j\'ai de la fièvre')] });
  ok(demandesOf(cab)[0].urgence === 'elevee', 'signe vital signalé APRÈS la création → la demande monte à « élevée »');
  ok(db.conversations.find(c => c.id === cid).urgence === 'elevee', 'la conversation aussi');
  ok(webhooks.some(w => w.event === 'urgence_relevee' && w.conversation_id === cid), 'le cabinet est alerté (urgence_relevee)');
  ok(/\b15\b/.test(r2.data.reply), 'et le patient reçoit la consigne 15/112');
  llm.extraction = EXTRACTION({ urgence: 'normale' });
  await chat({ cabinetId: cab, conversationId: cid, messages: [...base, user("Mon visage gonfle et j'ai de la fièvre"),
    { role: 'assistant', content: r2.data.reply }, user('merci beaucoup')] });
  ok(demandesOf(cab)[0].urgence === 'elevee', "l'urgence ne redescend JAMAIS");
}
{
  reset();
  const cab = newCabinet();
  llm.fail = true;
  const r = await chat({ cabinetId: cab, messages: [user("Il a perdu connaissance")] });
  ok(r.code === 200 && /\b15\b/.test(r.data.reply) && /\b112\b/.test(r.data.reply), 'urgence + modèle en panne → consigne 15/112 quand même (jamais une simple erreur)');
  const r2 = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  ok(r2.code === 502, 'sans urgence, modèle en panne → 502 (comportement inchangé)');
}

// ================= C. Plafonds anti-abus =================
console.log('C. Plafonds anti-abus');
function seedConvos(cab, n) {
  for (let i = 0; i < n; i++) db.conversations.push({ id: randomUUID(), cabinet_id: cab, statut: 'active', urgence: 'normale',
    nb_echanges: 0, created_at: new Date(Date.now() - 60_000).toISOString() });
}
{
  reset();
  const cab = newCabinet();
  seedConvos(cab, 39);
  const before = db.conversations.length;
  const r = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  ok(r.code === 200 && db.conversations.length === before + 1, '39 conversations dans l\'heure → la 40e est acceptée');
  const appelsAvant = llmCalls.length;
  const r2 = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  ok(r2.code === 429 && db.conversations.length === before + 1, 'au plafond (40/heure) → 429 et AUCUNE conversation créée');
  ok(llmCalls.length === appelsAvant, 'plafond atteint avant tout appel au modèle : aucun appel facturable');
}
{
  reset();
  seedConvos(DEMO, 0);
  db.cabinets.push({ id: DEMO, nom: 'Cabinet Démo', ville: 'Lyon', adresse: null, telephone: null, horaires: null, regles_reponse: null });
  seedConvos(DEMO, 119);
  const r = await chat({ cabinetId: DEMO, messages: [user('Bonjour')] });
  ok(r.code === 200, 'démo : 119 conversations dans l\'heure → la 120e passe (plafond démo = 120)');
  const r2 = await chat({ cabinetId: DEMO, messages: [user('Bonjour')] });
  ok(r2.code === 429, 'démo : plafond de 120/heure atteint → 429');
}
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION();
  let throttled = 0;
  for (let i = 0; i < 55; i++) {
    const r = await chat({ cabinetId: cab, messages: [user(`Je suis la victime ${i}, 06 12 34 56 ${String(i).padStart(2, '0')}`)] });
    if (r.code === 429) throttled++;
  }
  ok(demandesOf(cab).length <= 40, `inondation de fausses demandes (55 requêtes forgées) → au plus 40 créées (créées : ${demandesOf(cab).length})`);
  ok(throttled >= 15, `et le reste est refusé (${throttled} refus 429)`);
}
{
  reset();
  const cab = newCabinet();
  const first = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  const cid = first.data.conversationId;
  db.conversations.find(c => c.id === cid).nb_echanges = 50;
  const callsBefore = llmCalls.length;
  const r = await chat({ cabinetId: cab, conversationId: cid, messages: [user('Bonjour'), { role: 'assistant', content: first.data.reply }, user('encore')] });
  ok(/transmets votre demande/.test(r.data.reply) && llmCalls.length === callsBefore, 'conversation à 50 échanges → clôture polie SANS appel au modèle (plafond de coût effectif en minimisation)');
}

// ================= D. Politique de fournisseurs =================
console.log('D. Fournisseurs de modèle');
{
  reset();
  const cab = newCabinet();
  llm.extraction = EXTRACTION();
  await chat({ cabinetId: cab, messages: [user('Bonjour, Jean 06 12 34 56 78')] });
  ok(llmCalls.length >= 2 && llmCalls.every(c => c.provider === 'anthropic'), `cabinet RÉEL : chat ET extraction uniquement chez le fournisseur payant (${[...new Set(llmCalls.map(c => c.provider))].join(',')})`);
}
{
  reset();
  db.conversations = db.conversations.filter(c => c.cabinet_id !== DEMO); // isolation : repart de zéro
  db.cabinets.find(c => c.id === DEMO) || db.cabinets.push({ id: DEMO, nom: 'Cabinet Démo', ville: 'Lyon', horaires: null });
  await chat({ cabinetId: DEMO, messages: [user('Bonjour')] });
  ok(llmCalls.length >= 1 && llmCalls[0].provider === 'groq', 'cabinet de DÉMO : cascade gratuite (Groq en premier)');
}
{
  reset();
  delete process.env.ANTHROPIC_API_KEY;
  const cab = newCabinet();
  const r = await chat({ cabinetId: cab, messages: [user('Bonjour')] });
  ok(r.code === 502 && llmCalls.length === 0, 'cabinet réel sans fournisseur payant configuré → 502 et AUCUN message envoyé à Groq (fail-closed)');
  reset();
}

// ================= E. Prompt daté =================
console.log('E. Prompt');
{
  const H = { mardi: { ouvert: true, matin: ['09:00', '12:00'], aprem: ['14:00', '18:00'] } };
  const at = (h, m) => new Date(Date.UTC(2026, 10, 17, h - 1, m)); // mardi 17 nov. 2026, heure de Paris (UTC+1)
  const soir = buildSystemPrompt({ nom: 'Cabinet X', horaires: H }, { now: at(21, 0) });
  ok(soir.includes('mardi 17 novembre 2026, 21h00') && soir.includes('FERMÉ'), 'prompt : date/heure réelles et statut FERMÉ le soir');
  const matin = buildSystemPrompt({ nom: 'Cabinet X', horaires: H }, { now: at(10, 30) });
  ok(matin.includes('OUVERT') && !matin.includes('actuellement FERMÉ'), 'prompt : statut OUVERT en journée');
  const sans = buildSystemPrompt({ nom: 'Cabinet X', horaires: null }, { now: at(21, 0) });
  ok(sans.includes('mardi 17 novembre 2026') && !sans.includes('actuellement FERMÉ') && !sans.includes('actuellement OUVERT'), 'sans horaires : la date est donnée, jamais de « fermé » inventé');
  ok(soir.includes('ne promets JAMAIS une heure de rappel'), 'prompt : interdiction de promettre une heure de rappel');
  ok(buildSystemPrompt({ nom: 'x'.repeat(500) }, { now: at(10, 0) }).split('x'.repeat(201)).length === 1, 'prompt : nom du cabinet tronqué à 200 caractères');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
