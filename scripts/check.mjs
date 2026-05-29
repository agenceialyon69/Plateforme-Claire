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

// Bilan -----------------------------------------------------------
console.log('');
if (failures) {
  console.error(`❌ ${failures} problème(s) détecté(s).`);
  process.exit(1);
}
console.log('✅ Tous les contrôles passent.');
