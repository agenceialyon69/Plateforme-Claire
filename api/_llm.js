// ================================================================
// _llm.js — Couche IA multi-fournisseurs (helper, non routé)
// ----------------------------------------------------------------
// Permet de faire tourner Claire sur une IA GRATUITE. Le fournisseur est
// choisi automatiquement selon la clé présente, dans cet ordre :
//   1. GROQ_API_KEY    → Groq (gratuit, rapide, gpt-oss-120b)       [recommandé]
//   2. GEMINI_API_KEY  → Google Gemini (gratuit, Gemini 3.6 Flash)
//   3. ANTHROPIC_API_KEY → Claude (payant, secours)
// Modèles surchargeables via GROQ_MODEL / GEMINI_MODEL / ANTHROPIC_MODEL.
//
// AUTO-BASCULE DE MODÈLE : les fournisseurs retirent régulièrement d'anciens
// modèles (ça a cassé le chat en prod le 31/08/2026 : Groq et Gemini avaient
// tous les deux retiré leur modèle par défaut le même jour). Pour Groq et
// Gemini, chaque appel essaie une LISTE de modèles connus (GROQ_MODEL/
// GEMINI_MODEL en premier si défini, puis une liste de secours ci-dessous) :
// si un modèle répond "n'existe plus / retiré" (404 model_not_found côté
// Groq, 404 NOT_FOUND côté Gemini), on essaie le suivant AVANT d'abandonner
// le fournisseur — pas besoin d'un déploiement pour survivre à un retrait de
// modèle isolé. Sur toute AUTRE erreur (clé invalide, quota, réseau), on
// n'insiste pas : changer de modèle ne résoudrait rien.
// Listes de secours à revoir périodiquement (aucune liste ne protège d'un
// retrait simultané de TOUS ses membres) — voir docs des fournisseurs.
//
// Interface unique : callLLM({ system, messages, max_tokens, json }) → texte.
//   messages = [{ role: 'user'|'assistant', content: '...' }]
//   json = true → demande une sortie JSON stricte (extraction).
// ================================================================

// Ordre d'essai : Groq (gratuit, rapide) → Gemini (gratuit) → Anthropic (secours).
// La cascade garantit que si un fournisseur échoue, est saturé (quota gratuit)
// ou renvoie une réponse vide, on tente automatiquement le suivant.
const PROVIDERS = [
  { name: 'groq', key: 'GROQ_API_KEY' },
  { name: 'gemini', key: 'GEMINI_API_KEY' },
  { name: 'anthropic', key: 'ANTHROPIC_API_KEY' },
];

export function llmConfigured() {
  return PROVIDERS.some(p => process.env[p.key]);
}

async function withTimeout(ms, fn) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(t);
  }
}

// Un modèle "retiré" (404 + message caractéristique) justifie d'essayer le
// suivant. Toute autre erreur (401, 429, 5xx, réseau...) ne serait pas
// résolue par un changement de modèle : on la laisse remonter tout de suite.
function isModelGone(status, bodyText) {
  return status === 404 && /model_not_found|no longer available|NOT_FOUND/i.test(bodyText || '');
}

// Modèle explicite (env) en premier s'il est défini, puis la liste de
// secours, sans doublons.
function candidateModels(envValue, fallbacks) {
  return [...new Set([envValue, ...fallbacks].filter(Boolean))];
}

// ---- Groq (API compatible OpenAI) ----
// Secours confirmés (doc Groq, migration recommandée depuis les modèles
// llama-3.x retirés) : à défaut du modèle configuré, on descend la liste.
const GROQ_FALLBACK_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

async function callGroq({ system, messages, max_tokens, json }, signal) {
  const models = candidateModels(process.env.GROQ_MODEL, GROQ_FALLBACK_MODELS);
  let lastErr;
  for (const model of models) {
    const body = {
      model,
      max_tokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    };
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    const errText = (await res.text().catch(() => '')).slice(0, 300);
    lastErr = new Error(`Groq ${res.status}: ${errText}`);
    if (!isModelGone(res.status, errText)) throw lastErr;
    console.warn(`[llm] Groq : modèle "${model}" indisponible, essai du suivant`);
  }
  throw lastErr;
}

// ---- Google Gemini ----
// Secours confirmés (doc Google) : gemini-3.6-flash est le remplacement
// annoncé de gemini-2.0-flash (retiré) ; gemini-3.5-flash reste une
// version stable publiée en parallèle.
const GEMINI_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

async function callGemini({ system, messages, max_tokens, json }, signal) {
  const models = candidateModels(process.env.GEMINI_MODEL, GEMINI_FALLBACK_MODELS);
  let lastErr;
  for (const model of models) {
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: max_tokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') || '';
    }
    const errText = (await res.text().catch(() => '')).slice(0, 300);
    lastErr = new Error(`Gemini ${res.status}: ${errText}`);
    if (!isModelGone(res.status, errText)) throw lastErr;
    console.warn(`[llm] Gemini : modèle "${model}" indisponible, essai du suivant`);
  }
  throw lastErr;
}

// ---- Anthropic (Claude) ----
async function callAnthropic({ system, messages, max_tokens }, signal) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens, ...(system ? { system } : {}), messages }),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

const IMPL = { groq: callGroq, gemini: callGemini, anthropic: callAnthropic };

export async function callLLM({ system, messages, max_tokens = 400, json = false }) {
  const active = PROVIDERS.filter(p => process.env[p.key]);
  if (active.length === 0) {
    throw new Error('Aucun fournisseur IA configuré (GROQ_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY).');
  }
  const errors = [];
  for (const p of active) {
    try {
      const text = await withTimeout(20000, (signal) =>
        IMPL[p.name]({ system, messages, max_tokens, json }, signal));
      if (text && text.trim()) return text;          // succès
      errors.push(`${p.name}: réponse vide`);         // vide → on tente le suivant
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
      console.error(`[llm] ${p.name} a échoué, bascule sur le fournisseur suivant :`, e.message);
    }
  }
  // Tous ont échoué : le message d'erreur remonte pour être journalisé (jamais exposé au patient).
  throw new Error(`Tous les fournisseurs IA ont échoué → ${errors.join(' | ')}`);
}
