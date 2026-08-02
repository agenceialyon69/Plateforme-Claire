// ================================================================
// /api/invite-cabinet — Inviter un nouveau cabinet (réservé admin)
// ----------------------------------------------------------------
//   GET  → { admin: true|false }  (pour afficher/masquer l'outil côté UI)
//   POST → envoie un email d'invitation au cabinet + crée sa fiche.
//          Le cabinet définira lui-même son mot de passe via le lien
//          reçu par email (page /bienvenue.html). Aucun mot de passe
//          ne transite par nous → parcours sécurisé et professionnel.
//
// Sécurité : seul un utilisateur dont l'email est listé dans la variable
// d'environnement ADMIN_EMAILS peut inviter.
// ================================================================

import {
  supabaseAdmin,
  authenticateRequest,
  isAdminUser,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
} from './_supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Détermine l'URL publique du site pour construire le lien de retour.
// SÉCURITÉ : le lien de retour arrive dans un email d'invitation avec un token
// magique. S'il était bâti sur des en-têtes contrôlables par le client
// (Origin, X-Forwarded-Host, Host), un attaquant pourrait forger un lien
// pointant vers son propre domaine. On exige donc PUBLIC_SITE_URL comme
// source de vérité. Les en-têtes ne servent QUE de repli hors production.
function siteBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  // En production, refuser tout repli sur les en-têtes (voir ci-dessus).
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return null;
  }

  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  const admin = isAdminUser(auth.user);

  // GET → le client demande juste s'il a les droits admin
  if (req.method === 'GET') {
    return ok(res, { admin });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return badRequest(res, 'Méthode non supportée');
  }

  // À partir d'ici, action sensible : admin obligatoire
  if (!admin) return forbidden(res, "Accès réservé à l'administrateur");

  const { email, nom, telephone, ville } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) return badRequest(res, 'Email invalide');
  if (!nom || !String(nom).trim()) return badRequest(res, 'Nom du cabinet requis');

  const emailNorm = String(email).trim().toLowerCase();
  const base = siteBaseUrl(req);
  if (!base) {
    return serverError(res, new Error('PUBLIC_SITE_URL non configurée : invitation refusée en production'));
  }
  const redirectTo = `${base}/bienvenue.html`;

  try {
    // 1) Envoie l'email d'invitation (crée aussi l'utilisateur Auth, sans mot de passe)
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailNorm, {
      redirectTo,
    });

    if (error) {
      // Cas le plus courant : l'utilisateur existe déjà
      const msg = /already|exist|registered/i.test(error.message || '')
        ? 'Un compte existe déjà pour cet email.'
        : (error.message || "Échec de l'invitation");
      return badRequest(res, msg);
    }

    const userId = data?.user?.id;
    if (!userId) return serverError(res, new Error('Invitation sans identifiant utilisateur'));

    // 2) Crée la fiche cabinet associée (id = auth.users.id)
    const { error: cabErr } = await supabaseAdmin
      .from('cabinets')
      .upsert(
        {
          id: userId,
          nom: String(nom).trim(),
          email: emailNorm,
          telephone: telephone ? String(telephone).trim() : null,
          ville: ville ? String(ville).trim() : 'Lyon',
        },
        { onConflict: 'id' }
      );

    if (cabErr) return serverError(res, cabErr);

    return ok(res, { invited: true, email: emailNorm });
  } catch (err) {
    return serverError(res, err);
  }
}
