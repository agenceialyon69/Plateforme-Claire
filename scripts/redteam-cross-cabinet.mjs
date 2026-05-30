#!/usr/bin/env node
// ================================================================
// redteam-cross-cabinet.mjs — TEST D'INTRUSION : accès croisé cabinets
// ----------------------------------------------------------------
// Simule un attaquant : il se connecte comme un VRAI client (clé anon
// publique, exactement comme le navigateur) et tente de lire/modifier
// les données d'un AUTRE cabinet. Si une seule attaque réussit, ta RLS
// fuit et le script échoue (exit 1).
//
// Déroulé :
//   1. SETUP (service_role) : crée 2 cabinets de test (A et B), chacun
//      avec une conversation + un message + une demande.
//   2. ATTAQUE (clé anon) : connecté en tant que A, tente d'atteindre B.
//   3. TEARDOWN : supprime les 2 cabinets de test (sauf --keep).
//
// PRÉ-REQUIS (dans .env.local ou variables d'env) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (setup/teardown)
//   SUPABASE_ANON_KEY                         (l'attaque ; défaut = clé publique connue)
//
// USAGE :
//   node scripts/redteam-cross-cabinet.mjs [--keep]
// ================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---- Chargeur .env.local (zéro dépendance) ----------------------
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Clé anon publique (par défaut : celle du repo, car publique de toute façon)
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_6nC41beInFoY3LbjypWVRw_6Mv3cDx_';

const KEEP = process.argv.includes('--keep');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (dans .env.local).\n');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Jolis logs + comptage des verdicts -------------------------
const stamp = Date.now();
let passed = 0;
let failed = 0;
const C = { green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };

// "blocked" = l'attaque DOIT échouer (pas de données, ou erreur RLS).
function expectBlocked(label, { rows, error }) {
  const leaked = Array.isArray(rows) && rows.length > 0;
  if (leaked) {
    failed++;
    console.log(`  ${C.red}✗ FUITE${C.reset}  ${label}`);
    console.log(`         ${C.dim}→ ${rows.length} ligne(s) exposée(s) ! ${JSON.stringify(rows[0]).slice(0, 120)}${C.reset}`);
  } else {
    passed++;
    const why = error ? `bloqué (erreur RLS: ${String(error.message).slice(0, 60)})` : 'bloqué (0 ligne)';
    console.log(`  ${C.green}✓ OK${C.reset}    ${label}  ${C.dim}— ${why}${C.reset}`);
  }
}

// "writeBlocked" = l'écriture croisée NE DOIT modifier aucune ligne.
function expectWriteBlocked(label, { data, error }) {
  const wrote = Array.isArray(data) ? data.length > 0 : !!data;
  if (wrote) {
    failed++;
    console.log(`  ${C.red}✗ FUITE${C.reset}  ${label}`);
    console.log(`         ${C.dim}→ écriture acceptée sur des données d'un autre cabinet !${C.reset}`);
  } else {
    passed++;
    const why = error ? `refusé (${String(error.message).slice(0, 60)})` : 'refusé (0 ligne modifiée)';
    console.log(`  ${C.green}✓ OK${C.reset}    ${label}  ${C.dim}— ${why}${C.reset}`);
  }
}

// ---- Crée un cabinet de test complet (user + fiche + données) ----
async function seedCabinet(tag) {
  const email = `redteam-${tag}-${stamp}@claire-test.local`;
  const password = `Rt!${stamp}${tag}xZ`;

  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (e1) throw new Error(`createUser ${tag}: ${e1.message}`);
  const userId = created.user.id;

  const { error: e2 } = await admin.from('cabinets').insert({
    id: userId, nom: `RedTeam ${tag.toUpperCase()}`, email, ville: 'Test',
  });
  if (e2) throw new Error(`cabinet ${tag}: ${e2.message}`);

  const { data: convo, error: e3 } = await admin.from('conversations')
    .insert({ cabinet_id: userId, statut: 'active', urgence: 'normale', patient_nom: `Patient-${tag}` })
    .select('id').single();
  if (e3) throw new Error(`conversation ${tag}: ${e3.message}`);

  await admin.from('messages').insert({
    conversation_id: convo.id, role: 'user', contenu: `SECRET-${tag}-message`,
  });

  const { data: dem, error: e4 } = await admin.from('demandes').insert({
    conversation_id: convo.id, cabinet_id: userId,
    patient_nom: `Patient-${tag}`, patient_telephone: '+33600000000',
    motif: `SECRET-${tag}-motif`, urgence: 'normale', statut: 'en_attente',
  }).select('id').single();
  if (e4) throw new Error(`demande ${tag}: ${e4.message}`);

  return { email, password, userId, conversationId: convo.id, demandeId: dem.id };
}

// ---- MAIN -------------------------------------------------------
(async () => {
  console.log(`\n${C.bold}🔴 RED TEAM — Test d'accès croisé entre cabinets${C.reset}`);
  console.log(`${C.dim}Cible : ${SUPABASE_URL}${C.reset}\n`);

  let A, B;
  try {
    console.log('⚙️  Setup des cabinets de test A et B…');
    A = await seedCabinet('a');
    B = await seedCabinet('b');
    console.log(`   ${C.dim}A=${A.userId}  B=${B.userId}${C.reset}\n`);

    // --- L'attaquant : client anon, connecté en tant que cabinet A ---
    const attacker = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signErr } = await attacker.auth.signInWithPassword({
      email: A.email, password: A.password,
    });
    if (signErr) throw new Error(`Connexion attaquant échouée: ${signErr.message}`);

    console.log(`${C.bold}Scénario : connecté en tant que Cabinet A, je cible Cabinet B.${C.reset}\n`);

    // 1) Lire la fiche cabinet de B
    expectBlocked('Lire la fiche du Cabinet B',
      await q(attacker.from('cabinets').select('*').eq('id', B.userId)));

    // 2) Lister TOUS les cabinets (doit ne voir que A)
    {
      const r = await q(attacker.from('cabinets').select('id'));
      const onlyA = (r.rows || []).every(x => x.id === A.userId);
      const rowsB = (r.rows || []).filter(x => x.id !== A.userId);
      expectBlocked('Énumérer tous les cabinets (fuite si B apparaît)', { rows: rowsB, error: r.error });
      if (onlyA && r.rows?.length === 1) console.log(`         ${C.dim}→ ne voit bien que son propre cabinet${C.reset}`);
    }

    // 3) Lire les demandes de B (par cabinet_id)
    expectBlocked('Lire les demandes du Cabinet B',
      await q(attacker.from('demandes').select('*').eq('cabinet_id', B.userId)));

    // 4) Lire LA demande précise de B (par id)
    expectBlocked('Lire la demande de B par son id',
      await q(attacker.from('demandes').select('*').eq('id', B.demandeId)));

    // 5) Lister toutes les demandes (filtrer celles qui ne sont pas à A)
    {
      const r = await q(attacker.from('demandes').select('id, cabinet_id'));
      const foreign = (r.rows || []).filter(x => x.cabinet_id !== A.userId);
      expectBlocked('Énumérer toutes les demandes (fuite si B apparaît)', { rows: foreign, error: r.error });
    }

    // 6) Lire les conversations de B
    expectBlocked('Lire les conversations du Cabinet B',
      await q(attacker.from('conversations').select('*').eq('cabinet_id', B.userId)));

    // 7) Lire les messages de B (table sans cabinet_id → RLS par jointure)
    expectBlocked('Lire les messages de la conversation de B',
      await q(attacker.from('messages').select('*').eq('conversation_id', B.conversationId)));

    // 8) Lire les contact_leads (doit être totalement verrouillé)
    expectBlocked('Lire les contact_leads (table verrouillée)',
      await q(attacker.from('contact_leads').select('*')));

    console.log('');

    // 9) MODIFIER la fiche cabinet de B
    expectWriteBlocked('Modifier la fiche du Cabinet B',
      await qd(attacker.from('cabinets').update({ nom: 'HACKED' }).eq('id', B.userId).select()));

    // 10) MODIFIER le statut d'une demande de B
    expectWriteBlocked('Modifier une demande du Cabinet B',
      await qd(attacker.from('demandes').update({ statut: 'traite' }).eq('id', B.demandeId).select()));

    // 11) INSÉRER une demande au nom de B (aucune policy INSERT → refus)
    expectWriteBlocked('Injecter une fausse demande dans le Cabinet B',
      await qd(attacker.from('demandes').insert({
        conversation_id: B.conversationId, cabinet_id: B.userId,
        motif: 'INJECTED', urgence: 'elevee', statut: 'en_attente',
      }).select()));

    // 12) INSÉRER une conversation au nom de B
    expectWriteBlocked('Créer une conversation dans le Cabinet B',
      await qd(attacker.from('conversations').insert({
        cabinet_id: B.userId, statut: 'active', urgence: 'normale',
      }).select()));

    await attacker.auth.signOut();
  } catch (err) {
    console.error(`\n❌ Erreur durant le test : ${err.message}\n`);
    failed++;
  } finally {
    if (!KEEP && A && B) {
      console.log(`\n🧹 Teardown des cabinets de test…`);
      for (const c of [A, B]) {
        if (c?.userId) await admin.auth.admin.deleteUser(c.userId).catch(() => {});
      }
    } else if (KEEP) {
      console.log(`\n${C.dim}--keep : cabinets de test conservés (A=${A?.email}, B=${B?.email}).${C.reset}`);
    }
  }

  // ---- Verdict ----
  console.log(`\n${C.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}VERDICT :${C.reset} ${C.green}${passed} bloquée(s)${C.reset} / ${failed > 0 ? C.red : C.dim}${failed} fuite(s)${C.reset}`);
  if (failed === 0) {
    console.log(`${C.green}${C.bold}✅ RLS étanche : aucun accès croisé possible.${C.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${C.red}${C.bold}🚨 FUITE DÉTECTÉE : corrige les RLS avant tout pilote.${C.reset}\n`);
    process.exit(1);
  }
})();

// Helpers : normalisent { rows, error } / { data, error }
async function q(builder) {
  const { data, error } = await builder;
  return { rows: data, error };
}
async function qd(builder) {
  const { data, error } = await builder;
  return { data, error };
}
