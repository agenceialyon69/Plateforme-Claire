#!/usr/bin/env node
// ================================================================
// test-llm-fallback.mjs — Test hors-ligne de la cascade IA (Groq→Gemini→Anthropic)
// ----------------------------------------------------------------
// Simule des pannes de fournisseurs avec un fetch mock — aucun réseau,
// aucune clé réelle nécessaire. Vérifie qu'après une panne, Claire bascule
// correctement et ne laisse jamais une conversation dans un état incohérent.
//   npm run test:llm
// ================================================================

process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.GROQ_MODEL; // force la liste de secours par défaut, déterministe

import { callLLM } from '../api/_llm.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

function mockResponse({ ok: okFlag, status = 200, jsonBody, textBody }) {
  return {
    ok: okFlag,
    status,
    json: async () => jsonBody,
    text: async () => textBody ?? JSON.stringify(jsonBody || {}),
  };
}

const msgs = [{ role: 'user', content: 'test' }];

// ---------- Cas 1 : Groq en panne (erreur réseau) -> bascule sur Gemini ----------
{
  const appels = [];
  globalThis.fetch = async (url) => {
    appels.push(url);
    if (url.includes('groq.com')) throw new Error('network down');
    if (url.includes('generativelanguage')) {
      return mockResponse({ ok: true, jsonBody: { candidates: [{ content: { parts: [{ text: 'Réponse Gemini' }] } }] } });
    }
    throw new Error('ne devrait pas appeler ' + url);
  };
  const text = await callLLM({ messages: msgs });
  ok(text === 'Réponse Gemini', 'Groq en panne (réseau) → bascule sur Gemini, réponse correcte');
  ok(!appels.some((u) => u.includes('anthropic')), 'Anthropic jamais appelé si Gemini a réussi');
}

// ---------- Cas 2 : Groq ET Gemini en panne -> bascule sur Anthropic ----------
{
  globalThis.fetch = async (url) => {
    if (url.includes('groq.com')) return mockResponse({ ok: false, status: 500, textBody: 'groq down' });
    if (url.includes('generativelanguage')) return mockResponse({ ok: false, status: 503, textBody: 'gemini down' });
    if (url.includes('anthropic.com')) {
      return mockResponse({ ok: true, jsonBody: { content: [{ type: 'text', text: 'Réponse Anthropic' }] } });
    }
  };
  const text = await callLLM({ messages: msgs });
  ok(text === 'Réponse Anthropic', 'Groq + Gemini en panne → bascule sur Anthropic (dernier recours)');
}

// ---------- Cas 3 : les 3 fournisseurs en panne -> erreur agrégée, jamais un plantage silencieux ----------
{
  globalThis.fetch = async () => mockResponse({ ok: false, status: 500, textBody: 'tout est en panne' });
  let erreur = null;
  try {
    await callLLM({ messages: msgs });
  } catch (e) {
    erreur = e;
  }
  ok(erreur instanceof Error, 'les 3 fournisseurs en panne → lève une erreur explicite (pas un plantage silencieux)');
  const m = erreur?.message || '';
  ok(/groq/i.test(m) && /gemini/i.test(m) && /anthropic/i.test(m), "l'erreur mentionne les 3 fournisseurs (traçable dans les logs)");
}

// ---------- Cas 4 : un fournisseur répond une chaîne vide -> traité comme un échec, bascule ----------
{
  globalThis.fetch = async (url) => {
    if (url.includes('groq.com')) return mockResponse({ ok: true, jsonBody: { choices: [{ message: { content: '' } }] } });
    if (url.includes('generativelanguage')) {
      return mockResponse({ ok: true, jsonBody: { candidates: [{ content: { parts: [{ text: 'Réponse après réponse vide' }] } }] } });
    }
  };
  const text = await callLLM({ messages: msgs });
  ok(text === 'Réponse après réponse vide', 'réponse vide traitée comme un échec → bascule sur le fournisseur suivant');
}

// ---------- Cas 5 : modèle Groq retiré (404 model_not_found) sur le 1er candidat, succès sur le 2e ----------
{
  let groqAttempts = 0;
  globalThis.fetch = async (url, opts) => {
    if (!url.includes('groq.com')) return mockResponse({ ok: false, status: 500, textBody: 'non atteint' });
    groqAttempts++;
    const body = JSON.parse(opts.body);
    if (body.model === 'openai/gpt-oss-120b') {
      return mockResponse({
        ok: false, status: 404,
        jsonBody: { error: { message: 'retired', code: 'model_not_found' } },
      });
    }
    return mockResponse({ ok: true, jsonBody: { choices: [{ message: { content: 'Réponse avec modèle de secours' } }] } });
  };
  const text = await callLLM({ messages: msgs });
  ok(text === 'Réponse avec modèle de secours', 'modèle Groq retiré → bascule automatiquement sur le modèle de secours (même fournisseur)');
  ok(groqAttempts === 2, 'exactement 2 tentatives chez Groq (modèle retiré, puis le suivant) avant de réussir');
}

// ---------- Cas 6 : erreur non liée au modèle (401) -> ne perd pas de temps à essayer d'autres modèles ----------
{
  let groqAttempts = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('groq.com')) {
      groqAttempts++;
      return mockResponse({ ok: false, status: 401, textBody: JSON.stringify({ error: { message: 'invalid api key' } }) });
    }
    if (url.includes('generativelanguage')) {
      return mockResponse({ ok: true, jsonBody: { candidates: [{ content: { parts: [{ text: 'Réponse Gemini après clé Groq invalide' }] } }] } });
    }
  };
  const text = await callLLM({ messages: msgs });
  ok(text === 'Réponse Gemini après clé Groq invalide', 'clé Groq invalide (401) → bascule direct sur Gemini');
  ok(groqAttempts === 1, "n'essaie qu'UNE fois chez Groq sur une erreur d'authentification (pas un problème de modèle)");
}

// ---------- Cas 11 : liste blanche de fournisseurs (cabinets RÉELS) ----------
{
  const called = [];
  const ALL = () => async (url) => {
    called.push(url);
    if (url.includes('anthropic.com')) return mockResponse({ ok: true, jsonBody: { content: [{ type: 'text', text: 'Réponse payante' }] } });
    if (url.includes('groq.com')) return mockResponse({ ok: true, jsonBody: { choices: [{ message: { content: 'gratuit groq' } }] } });
    return mockResponse({ ok: true, jsonBody: { candidates: [{ content: { parts: [{ text: 'gratuit gemini' }] } }] } });
  };
  globalThis.fetch = ALL();
  const text = await callLLM({ messages: msgs, providers: ['anthropic'] });
  ok(text === 'Réponse payante', 'liste blanche [anthropic] → seul le fournisseur payant répond');
  ok(called.length === 1 && called[0].includes('anthropic.com'), "liste blanche : Groq et Gemini ne sont JAMAIS appelés (aucune donnée envoyée aux offres gratuites)");

  // Fail-closed : seules les offres gratuites sont configurées → on échoue SANS rien envoyer
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  called.length = 0;
  let erreur = null;
  try { await callLLM({ messages: msgs, providers: ['anthropic'] }); } catch (e) { erreur = e; }
  ok(erreur && /autorisé/.test(erreur.message), 'cabinet réel sans fournisseur payant configuré → erreur explicite (fail-closed)');
  ok(called.length === 0, 'fail-closed : AUCUN appel réseau, donc aucune fuite vers Groq/Gemini');
  // Sans liste blanche (démo), la cascade gratuite reste disponible
  const demo = await callLLM({ messages: msgs });
  ok(demo === 'gratuit groq', 'sans liste blanche (cabinet de démo) → cascade gratuite inchangée');
  process.env.ANTHROPIC_API_KEY = saved;
}

// ---------- Cas 12 : borne de temps globale ----------
{
  let appels = 0;
  globalThis.fetch = async () => { appels++; return mockResponse({ ok: true, jsonBody: { choices: [{ message: { content: 'x' } }] } }); };
  let erreur = null;
  try { await callLLM({ messages: msgs, budgetMs: 1000 }); } catch (e) { erreur = e; }
  ok(erreur && /budget de temps/.test(erreur.message) && appels === 0, 'budget de temps épuisé → arrêt net, aucun appel inutile');
}

// ---------- Cas 13 : clé Gemini dans l'en-tête, pas dans l'URL ----------
{
  let vu = null;
  globalThis.fetch = async (url, init) => {
    if (url.includes('generativelanguage')) {
      vu = { url, headers: init.headers };
      return mockResponse({ ok: true, jsonBody: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
    }
    return mockResponse({ ok: false, status: 500, textBody: 'groq down' });
  };
  await callLLM({ messages: msgs });
  ok(vu && !/key=/.test(vu.url) && vu.headers['x-goog-api-key'] === 'test-gemini-key', 'clé Gemini transmise par en-tête, absente de l\'URL (journaux)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
if (fail > 0) process.exit(1);
