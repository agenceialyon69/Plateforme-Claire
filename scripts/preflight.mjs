#!/usr/bin/env node
// ================================================================
// preflight.mjs — Vérifie qu'un déploiement est prêt pour un client
// ----------------------------------------------------------------
// À lancer avec les VRAIES variables d'environnement de production
// (ou un .env.local complet) :  npm run preflight
//
// Contrôle : variables d'env requises/recommandées, cohérence (CORS non '*'),
// et — si les identifiants Supabase sont présents — la présence réelle des
// tables, vues et colonnes du schéma. NE MODIFIE RIEN, n'affiche aucun secret.
// Sort en erreur (exit 1) si un point BLOQUANT manque.
// ================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
let blockers = 0, warnings = 0;
const okLine = (m) => console.log(`  ${C.g}✓${C.x} ${m}`);
const block = (m) => { blockers++; console.log(`  ${C.r}✗ BLOQUANT${C.x} ${m}`); };
const warn = (m) => { warnings++; console.log(`  ${C.y}! ${C.x}${m}`); };

const set = (k) => !!(process.env[k] && process.env[k].trim() && !/^(x{3,}|<|changeme|tochange)/i.test(process.env[k].trim()));

console.log(`\n${C.b}Preflight — déploiement Claire${C.x}\n`);

// --- 1. Variables requises (bloquantes) ---
console.log('Variables requises');
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY']) {
  set(k) ? okLine(k) : block(`${k} manquante`);
}
// PUBLIC_SITE_URL requis pour les liens SMS + validation Twilio + invitations
set('PUBLIC_SITE_URL') ? okLine('PUBLIC_SITE_URL') : block('PUBLIC_SITE_URL manquante (liens SMS, invitations)');

// CORS : présent ET pas '*'
const origins = (process.env.ALLOWED_ORIGINS || '').trim();
if (!origins) block("ALLOWED_ORIGINS manquante (CORS des endpoints publics)");
else if (origins.includes('*')) block("ALLOWED_ORIGINS contient '*' — à verrouiller en production");
else okLine('ALLOWED_ORIGINS verrouillé');

// --- 2. Débordement téléphonique (recommandé pour ce canal) ---
console.log('\nDébordement téléphonique (canal choisi)');
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']) {
  set(k) ? okLine(k) : warn(`${k} absente → débordement inactif (les webhooks renverront 503)`);
}
set('TWILIO_PUBLIC_URL') ? okLine('TWILIO_PUBLIC_URL') : warn('TWILIO_PUBLIC_URL absente → validation signature via en-têtes proxy (moins robuste)');
if (process.env.TWILIO_SKIP_SIGNATURE === 'true') block("TWILIO_SKIP_SIGNATURE='true' — INTERDIT en production");

// --- 3. Conformité / hygiène (recommandé) ---
console.log('\nConformité & hygiène');
set('CRON_SECRET') ? okLine('CRON_SECRET (purge protégée)') : warn('CRON_SECRET absente → la purge automatique ne s\'exécutera pas');
set('TURNSTILE_SECRET_KEY') ? okLine('TURNSTILE_SECRET_KEY (anti-bot démo)') : warn('TURNSTILE_SECRET_KEY absente → anti-bot démo inactif');
set('ADMIN_EMAILS') ? okLine('ADMIN_EMAILS') : warn('ADMIN_EMAILS absente → aucun compte ne peut inviter de cabinet');

// --- 4. Schéma en base (si identifiants Supabase présents) ---
console.log('\nSchéma en base');
if (set('SUPABASE_URL') && set('SUPABASE_SERVICE_ROLE_KEY')) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Existence des tables/vues : un select limit 0 échoue si l'objet manque.
    for (const t of ['cabinets', 'conversations', 'messages', 'demandes', 'appels', 'sms_optout', 'contact_leads', 'stats_debordement', 'stats_cabinet']) {
      const { error } = await db.from(t).select('*').limit(0);
      error ? block(`objet '${t}' absent ou inaccessible (${(error.message || '').slice(0, 60)})`) : okLine(`objet '${t}'`);
    }
    // Colonnes clés du débordement
    const colCab = await db.from('cabinets').select('numero_twilio, numero_reel, sms_relance_actif').limit(0);
    colCab.error ? block("colonnes téléphonie manquantes sur 'cabinets' (rejoue sql/schema.sql)") : okLine("colonnes téléphonie sur 'cabinets'");
    const colConv = await db.from('conversations').select('appel_id').limit(0);
    colConv.error ? block("colonne 'conversations.appel_id' manquante (rejoue sql/schema.sql)") : okLine("colonne 'conversations.appel_id'");
  } catch (e) {
    warn(`vérification schéma impossible (${String(e.message || e).slice(0, 80)})`);
  }
} else {
  warn('identifiants Supabase absents → vérification du schéma ignorée');
}

// --- Verdict ---
console.log(`\n${C.b}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.x}`);
console.log(`${C.b}Verdict :${C.x} ${blockers === 0 ? C.g + '0 bloquant' : C.r + blockers + ' bloquant(s)'}${C.x}, ${warnings} avertissement(s).`);
if (blockers === 0) {
  console.log(`${C.g}${C.b}✅ Prêt à configurer un client (canal téléphone + chat hébergé).${C.x}\n`);
  process.exit(0);
} else {
  console.log(`${C.r}${C.b}🚫 Corrige les points BLOQUANTS avant de brancher un client.${C.x}\n`);
  process.exit(1);
}
