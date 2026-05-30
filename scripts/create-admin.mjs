#!/usr/bin/env node
// ================================================================
// create-admin.mjs — Crée (ou met à jour) un compte cabinet/admin
// ----------------------------------------------------------------
// Crée en UNE commande :
//   1. l'utilisateur d'authentification Supabase (email + mot de passe,
//      confirmé automatiquement) ;
//   2. sa fiche dans la table `cabinets`.
// Évite ainsi le piège du "compte mal initialisé".
//
// PRÉ-REQUIS : un fichier .env.local (ou des variables d'environnement)
// contenant SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
//
// UTILISATION :
//   node scripts/create-admin.mjs --email "vous@exemple.fr" \
//        --password "VotreMotDePasse" --nom "Cabinet Démo" [--ville Lyon] [--tel "+33..."]
//
//   (ou via variables : ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOM, ADMIN_VILLE, ADMIN_TEL)
// ================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---- Petit chargeur .env.local (zéro dépendance) ----------------
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const txt = readFileSync(file, 'utf8');
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

// ---- Lecture des arguments --------------------------------------
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const email = (arg('email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = arg('password') || process.env.ADMIN_PASSWORD || '';
const nom = arg('nom') || process.env.ADMIN_NOM || 'Cabinet';
const ville = arg('ville') || process.env.ADMIN_VILLE || 'Lyon';
const telephone = arg('tel') || process.env.ADMIN_TEL || null;

// ---- Validations ------------------------------------------------
const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };

if (!SUPABASE_URL || !SERVICE_KEY) {
  die('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquants (mets-les dans .env.local).');
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  die('Email invalide. Utilise --email "vous@exemple.fr"');
}
if (!password || password.length < 8) {
  die('Mot de passe trop court (8 caractères minimum). Utilise --password "..."');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- Trouve un utilisateur existant par email (pagination) ------
async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (found) return found;
    if (data.users.length < 200) break; // dernière page
  }
  return null;
}

// ---- Exécution --------------------------------------------------
(async () => {
  console.log(`\n🔧 Création du compte pour : ${email}`);

  // 1) Utilisateur Auth
  let userId;
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    if (/already|exist|registered/i.test(createErr.message || '')) {
      console.log('   ℹ️  L’utilisateur existe déjà — mise à jour du mot de passe.');
      const existing = await findUserByEmail(email);
      if (!existing) die('Utilisateur déclaré existant mais introuvable.');
      userId = existing.id;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) die(`Échec mise à jour du mot de passe : ${updErr.message}`);
    } else {
      die(`Échec création utilisateur : ${createErr.message}`);
    }
  } else {
    userId = created.user.id;
    console.log('   ✓ Utilisateur Auth créé.');
  }

  // 2) Fiche cabinet
  const { error: cabErr } = await supabase
    .from('cabinets')
    .upsert({ id: userId, nom, email, ville, telephone }, { onConflict: 'id' });
  if (cabErr) die(`Échec création de la fiche cabinet : ${cabErr.message}`);
  console.log('   ✓ Fiche cabinet enregistrée.');

  console.log('\n✅ Terminé ! Vous pouvez vous connecter sur /login.html');
  console.log(`   Identifiant : ${email}`);
  console.log(`   Mot de passe : (celui que vous venez de définir)\n`);
})().catch((err) => {
  console.error('\n❌ Erreur inattendue :', err.message || err, '\n');
  process.exit(1);
});
