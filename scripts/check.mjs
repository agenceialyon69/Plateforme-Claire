#!/usr/bin/env node
// ================================================================
// check.mjs — Contrôles légers du projet (zéro dépendance)
// ----------------------------------------------------------------
// Sert de "linter/test" : utilisé par la CI GitHub Actions ET par
// le hook de démarrage de session. Échoue (exit 1) au moindre souci.
//   - syntaxe de tous les fichiers .js / .mjs
//   - validité des fichiers JSON (package.json, vercel.json, manifest)
//   - bloc JSON-LD de la page d'accueil
//   - présence des fichiers attendus (SEO / PWA)
// ================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
let failures = 0;
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };

const IGNORE_DIRS = new Set(['node_modules', '.git', '.vercel']);
function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walkJs(p, acc);
    else if (extname(p) === '.js' || extname(p) === '.mjs') acc.push(p);
  }
  return acc;
}

// 1) Syntaxe JS/MJS ------------------------------------------------
console.log('JS — syntaxe');
const jsFiles = walkJs(root);
let jsOk = 0;
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    jsOk++;
  } catch (e) {
    fail(`${f}\n${(e.stderr || e.stdout || e.message).toString().trim()}`);
  }
}
if (jsOk === jsFiles.length) pass(`${jsOk} fichier(s) .js/.mjs`);

// 2) Validité JSON -------------------------------------------------
console.log('JSON — validité');
for (const f of ['package.json', 'vercel.json', 'manifest.webmanifest']) {
  const p = join(root, f);
  if (!existsSync(p)) { fail(`${f} manquant`); continue; }
  try { JSON.parse(readFileSync(p, 'utf8')); pass(f); }
  catch (e) { fail(`${f} : ${e.message}`); }
}

// 3) JSON-LD de la page d'accueil ---------------------------------
console.log('SEO — JSON-LD');
try {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) fail('bloc JSON-LD introuvable dans index.html');
  else { JSON.parse(m[1]); pass('JSON-LD index.html'); }
} catch (e) { fail(e.message); }

// 4) Fichiers attendus (SEO / PWA) --------------------------------
console.log('Fichiers — présence');
for (const f of ['sitemap.xml', 'robots.txt', 'sw.js', 'manifest.webmanifest', 'icons/icon-192.png']) {
  existsSync(join(root, f)) ? pass(f) : fail(`${f} manquant`);
}

// 5) Vitrine : vocabulaire interdit + affirmations non prouvées -----
// Ces pages sont lues par des prospects : pas de vocabulaire "technologique"
// (règle CLAUDE.md) ni d'affirmation absolue/fausse déjà identifiée en audit.
console.log('Vitrine — vocabulaire et affirmations');
const PUBLIC_PAGES = ['index.html', 'etude-de-cas.html', 'confidentialite.html',
  'mentions-legales.html', 'login.html', 'bienvenue.html', 'chat.html'];
const FORBIDDEN_WORDS = [/\bIA\b/, /\bchat-?bot\b/i, /\brobot\b/i, /\bLLM\b/, /intelligence artificielle/i, /\bClaude\b/];
const UNPROVEN_CLAIMS = [
  [/Aucun patient sans réponse/i, 'promesse absolue (pannes passées)'],
  [/ne se perdent plus/i, 'promesse absolue'],
  [/phase pilote auprès/i, "faux : aucun cabinet n'utilise Claire"],
  [/hébergées? en Europe|Hébergement en Europe|Données en Europe|région européenne/i, 'inexact : fonctions applicatives hors UE (iad1) tant que non migrées'],
  [/sans bandeau|aucun bandeau (requis|nécessaire)|bandeau cookies\s+n'est nécessaire/i, 'conclusion juridique non vérifiée (widget Calendly)'],
  [/appelle souvent le cabinet d'à côté/i, 'généralité non sourcée'],
  [/rel="canonical" href="https:\/\/app\./i, 'canonical doit viser claireassistante.fr (app. redirige en 307)'],
];
let todoCount = 0;
for (const page of PUBLIC_PAGES) {
  const p = join(root, page);
  if (!existsSync(p)) continue;
  const raw = readFileSync(p, 'utf8');
  todoCount += (raw.match(/\[À COMPLÉTER/g) || []).length;
  // On garde le texte visible ET le JSON-LD (lu par les moteurs de recherche)
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/g, '');
  let ok = true;
  for (const re of FORBIDDEN_WORDS) {
    const m = text.match(re);
    if (m) { fail(`${page} : mot interdit « ${m[0]} »`); ok = false; }
  }
  for (const [re, why] of UNPROVEN_CLAIMS) {
    const m = text.match(re);
    if (m) { fail(`${page} : « ${m[0]} » — ${why}`); ok = false; }
  }
  if (ok) pass(page);
}
if (todoCount > 0) console.log(`  ⚠ ${todoCount} champ(s) « [À COMPLÉTER] » restent dans les pages légales (à renseigner par l'éditeur)`);

// Bilan -----------------------------------------------------------
console.log('');
if (failures) {
  console.error(`❌ ${failures} problème(s) détecté(s).`);
  process.exit(1);
}
console.log('✅ Tous les contrôles passent.');
