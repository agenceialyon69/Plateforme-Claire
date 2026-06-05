// ================================================================
// tools/agent/lib/core.mjs — Cœur partagé de l'agent de préparation CLAIRE
// ----------------------------------------------------------------
// Contient :
//   1. Chargeur .env.local (zéro dépendance, calqué sur scripts/create-admin.mjs)
//   2. Lecture de la config + des données
//   3. Appel Claude (fetch + x-api-key, comme api/chat.js)
//   4. Garde-fous DÉTERMINISTES (positionnement + lien) — la machine vérifie
//   5. Boucle "red team" : générer → critiquer (note /100) → réviser → recommencer
//   6. Helpers CLI (arguments, slug, écriture des livrables)
//
// RÈGLE DE FOND : cet agent PRÉPARE des brouillons. Il N'ENVOIE JAMAIS rien.
// ================================================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // tools/agent

// ---- 1. Chargeur .env.local (identique à tes scripts) -----------
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

// ---- 2. Config + données ----------------------------------------
export function readJson(relOrAbs) {
  const p = relOrAbs.startsWith('/') ? relOrAbs : join(ROOT, relOrAbs);
  return JSON.parse(readFileSync(p, 'utf8'));
}
export function readText(relOrAbs) {
  const p = relOrAbs.startsWith('/') ? relOrAbs : join(ROOT, relOrAbs);
  return readFileSync(p, 'utf8');
}
export function loadConfig() {
  if (!existsSync(join(ROOT, 'config.json'))) {
    die('config.json introuvable → copie config.example.json en config.json et adapte-le (offre RÉELLE, profil…).');
  }
  const cfg = readJson('config.json');
  cfg.moteur = { model: 'claude-sonnet-4-6', maxIters: 2, threshold: 88, ...(cfg.moteur || {}) };
  return cfg;
}

// ---- 3. Appel Claude (même style que api/chat.js) ---------------
export async function callClaude({ system, user, model, maxTokens = 2500, temperature }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) die('ANTHROPIC_API_KEY manquante → mets-la dans .env.local (jamais dans le code, jamais commitée).');
  if (/x{4,}/i.test(key)) die('ANTHROPIC_API_KEY ressemble à un exemple ("xxxx") — mets ta vraie clé.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      ...(temperature != null ? { temperature } : {}),
      system, messages: [{ role: 'user', content: user }],
    }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`API Claude ${r.status} : ${t.slice(0, 400)}`);
  return JSON.parse(t).content?.[0]?.text || '';
}
export function extractJson(raw) {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Réponse du modèle sans JSON exploitable.');
  return JSON.parse(raw.slice(s, e + 1));
}

// ---- 4. Garde-fous DÉTERMINISTES --------------------------------
// Mots bannis dans tout texte vu par un prospect/patient (CLAUDE.md, règle ferme).
const FORBIDDEN = /\b(I\.?A\.?|intelligence artificielle|chat ?bot|robot|LLM|GPT|Claude|Anthropic|agent conversationnel)\b/i;
// Lien nu "claireassistante.fr" SANS le préfixe app. et SANS être un email (@…).
const BARE_LINK = /(?<![\w.@])claireassistante\.fr/;

export function lintClientText(text, { positioning = true } = {}) {
  const t = String(text || '');
  const problems = [];
  if (positioning) {
    const m = t.match(FORBIDDEN);
    if (m) problems.push(`Positionnement: mot interdit "${m[0]}" (jamais "IA/chatbot/robot…" côté prospect).`);
  }
  if (BARE_LINK.test(t)) problems.push('Lien: "claireassistante.fr" nu — utiliser "app.claireassistante.fr".');
  return problems;
}
export function autofix(text) {
  // Corrige le lien automatiquement (sans toucher l'email contact@claireassistante.fr).
  return String(text || '').replace(/(?<![\w.@])claireassistante\.fr/g, 'app.claireassistante.fr');
}

// ---- 5. Boucle red team : générer → critiquer → réviser ---------
const CRITIC_SYSTEM = `Tu es un relecteur "red team" impitoyable et honnête. Tu NOTES un livrable d'outreach pour CLAIRE (plateforme métier de réception et de suivi des demandes patients). Sois sévère : ton rôle est de trouver ce qui FAIT PERDRE en conversion ou en crédibilité.

GRILLE /100 :
- Positionnement (25) : AUCUNE mention "IA / intelligence artificielle / chatbot / robot / LLM / Claude / Anthropic". Claire = "assistante numérique" / "plateforme de réception des demandes". Toute violation = score global < 50 d'office.
- Honnêteté (20) : aucune fausse preuve sociale ("des cabinets nous font confiance"), aucun chiffre/prix non fourni par l'auteur, aucune promesse intenable. Distingue prouvé / supposé.
- Personnalisation (15) : nom + ville + contexte réellement exploités (pas du publipostage générique).
- Clarté & concision (15) : court, UNE idée par message, UN seul appel à l'action clair.
- Crédibilité & français (15) : zéro faute, ton sobre et humain, zéro superlatif creux.
- Délivrabilité (10) : objet non "spam", pas de mots déclencheurs, mention de désinscription présente quand c'est de la prospection.

Réponds UNIQUEMENT en JSON :
{"score": <0-100>, "par_critere": {"positionnement":n,"honnetete":n,"personnalisation":n,"clarte":n,"credibilite":n,"delivrabilite":n}, "must_fix": ["défaut bloquant…"], "suggestions": ["amélioration…"]}`;

function criticUser(kind, draft) {
  return `Type de livrable : ${kind}.\nÉvalue ce brouillon (JSON) sans complaisance :\n\n${JSON.stringify(draft, null, 2)}`;
}
function reviseUser(originalUser, draft, critique) {
  return `${originalUser}\n\n--- VERSION PRÉCÉDENTE (à améliorer) ---\n${JSON.stringify(draft, null, 2)}\n\n--- CRITIQUE RED TEAM À CORRIGER EN PRIORITÉ ---\nDéfauts bloquants: ${JSON.stringify(critique.must_fix || [])}\nSuggestions: ${JSON.stringify(critique.suggestions || [])}\n\nRéécris une version CORRIGÉE et MEILLEURE. Même format JSON, rien d'autre.`;
}

/**
 * Boucle d'amélioration. `clientFields` = champs vus par le prospect (lintés durement).
 * Renvoie { draft, critique, history } — le MEILLEUR brouillon obtenu.
 */
export async function refine({ kind, taskSystem, taskUser, clientFields, model, maxIters, threshold, mockDraft, dry, onStep, enforcePositioning = true }) {
  if (dry) {
    onStep?.({ iter: 0, score: 92, must_fix: [] });
    return { draft: mockDraft, critique: { score: 92, par_critere: {}, must_fix: [], suggestions: ['(mode --dry : aucun appel API)'] }, history: [] };
  }

  let draft = extractJson(await callClaude({ system: taskSystem, user: taskUser, model }));
  let critique = null;
  const history = [];

  for (let i = 0; i <= maxIters; i++) {
    // (a) corrections déterministes AVANT la critique
    for (const f of clientFields) if (f in draft) draft[f] = autofix(draft[f]);
    const hard = clientFields.flatMap((f) => lintClientText(draft[f], { positioning: enforcePositioning }).map((p) => `[${f}] ${p}`));

    // (b) critique notée par le modèle
    critique = extractJson(await callClaude({ system: CRITIC_SYSTEM, user: criticUser(kind, draft), model }));
    if (hard.length) {
      critique.score = Math.min(Number(critique.score) || 0, 45);
      critique.must_fix = [...hard, ...(critique.must_fix || [])];
    }
    history.push({ iter: i, score: critique.score, must_fix: critique.must_fix });
    onStep?.({ iter: i, score: critique.score, must_fix: critique.must_fix });

    // (c) stop si on a atteint le seuil sans défaut bloquant, ou si plus d'itérations
    const clean = (!critique.must_fix || critique.must_fix.length === 0);
    if (i === maxIters || (critique.score >= threshold && clean)) break;

    // (d) révision
    draft = extractJson(await callClaude({ system: taskSystem, user: reviseUser(taskUser, draft, critique), model }));
  }
  return { draft, critique, history };
}

// ---- 6. Helpers CLI ---------------------------------------------
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}
export const slug = (s) => String(s || 'sans-nom').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export function writeOut(subdir, filename, content) {
  const dir = join(ROOT, 'out', subdir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, content, 'utf8');
  return path.replace(process.cwd() + '/', '');
}

export function die(msg) { console.error('❌ ' + msg); process.exit(1); }
export function scoreBadge(s) { return s >= 90 ? '🟢' : s >= 75 ? '🟡' : '🔴'; }
