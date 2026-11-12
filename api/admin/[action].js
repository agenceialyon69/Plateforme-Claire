// ================================================================
// /api/admin/[action] — Centre de contrôle (réservé administrateur)
// ----------------------------------------------------------------
// UNE seule fonction serverless route les actions admin, car le plan
// Vercel Hobby limite à 12 fonctions par déploiement (même technique
// que /api/twilio/[action]). Actions :
//   GET   /api/admin/me         → { admin: true|false } (affichage UI)
//   POST  /api/admin/invite     → invite un cabinet (ex /api/invite-cabinet)
//   GET   /api/admin/cabinets   → cabinets + état de config + activité
//   GET   /api/admin/prospects  → pipeline de prospection (contact_leads)
//   POST  /api/admin/prospects  → ajoute un prospect manuellement
//   PATCH /api/admin/prospects  → met à jour statut/notes d'un prospect
//   GET   /api/admin/health     → santé du système (config + base)
//
// 🔐 SÉCURITÉ : authentification Supabase obligatoire ; tout sauf `me`
// exige un email listé dans ADMIN_EMAILS (fail-closed). Les lectures
// passent par service_role : AUCUNE policy RLS côté client n'est
// ouverte pour ça. `health` ne renvoie que des booléens de présence
// de configuration, jamais une valeur de secret.
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
} from '../_supabase.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROSPECT_STATUTS = ['nouveau', 'contacte', 'relance', 'demo_prevue', 'converti', 'perdu'];

// --- URL publique (copié de l'ex /api/invite-cabinet, même modèle de menace :
// le lien d'invitation part dans un email, donc jamais bâti sur des en-têtes
// contrôlables par le client en production). ---
function siteBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return null;
  }
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// ----------------------------------------------------------------
// POST invite — logique reprise telle quelle de l'ex invite-cabinet.js
// ----------------------------------------------------------------
async function handleInvite(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return badRequest(res, 'Méthode non supportée');
  }
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
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(emailNorm, { redirectTo });
    if (error) {
      const msg = /already|exist|registered/i.test(error.message || '')
        ? 'Un compte existe déjà pour cet email.'
        : (error.message || "Échec de l'invitation");
      return badRequest(res, msg);
    }
    const userId = data?.user?.id;
    if (!userId) return serverError(res, new Error('Invitation sans identifiant utilisateur'));

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

// ----------------------------------------------------------------
// GET cabinets — liste + état de configuration + activité récente.
// 3 requêtes groupées (pas de N+1) ; agrégation en JS, volumes faibles.
// ----------------------------------------------------------------
async function handleCabinets(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return badRequest(res, 'Méthode non supportée');
  }
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [cabs, dems, convs] = await Promise.all([
      supabaseAdmin.from('cabinets')
        .select('id, nom, email, ville, telephone, numero_twilio, numero_reel, notif_email, created_at')
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('demandes')
        .select('cabinet_id, statut, created_at')
        .gte('created_at', since)
        .limit(5000),
      supabaseAdmin.from('conversations')
        .select('cabinet_id, derniere_activite')
        .order('derniere_activite', { ascending: false })
        .limit(2000),
    ]);
    if (cabs.error) return serverError(res, cabs.error);

    const parCabinet = {};
    for (const d of dems.data || []) {
      const s = (parCabinet[d.cabinet_id] ||= { demandes_30j: 0, en_attente: 0 });
      s.demandes_30j += 1;
      if (d.statut === 'en_attente' || d.statut === 'a_rappeler') s.en_attente += 1;
    }
    const derniereActivite = {};
    for (const c of convs.data || []) {
      if (!derniereActivite[c.cabinet_id]) derniereActivite[c.cabinet_id] = c.derniere_activite;
    }

    const rows = (cabs.data || []).map(c => ({
      id: c.id,
      nom: c.nom,
      email: c.email,
      ville: c.ville,
      created_at: c.created_at,
      telephone_configure: !!c.numero_reel,
      numero_claire: !!c.numero_twilio,
      notif_configuree: !!c.notif_email,
      demandes_30j: parCabinet[c.id]?.demandes_30j || 0,
      en_attente: parCabinet[c.id]?.en_attente || 0,
      derniere_activite: derniereActivite[c.id] || null,
    }));
    return ok(res, { cabinets: rows });
  } catch (err) {
    return serverError(res, err);
  }
}

// ----------------------------------------------------------------
// prospects — GET liste / POST création manuelle / PATCH statut+notes
// ----------------------------------------------------------------
async function handleProspects(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('contact_leads')
        .select('id, nom, cabinet, email, telephone, message, source, statut, notes, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return serverError(res, error);
      return ok(res, { prospects: data || [] });
    }

    if (req.method === 'POST') {
      const { nom, cabinet, email, telephone, notes, source } = req.body || {};
      if (!nom || typeof nom !== 'string' || !nom.trim()) return badRequest(res, 'Nom requis');
      if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) return badRequest(res, 'Email invalide');
      for (const [k, v] of [['cabinet', cabinet], ['telephone', telephone], ['notes', notes], ['source', source]]) {
        if (v !== undefined && v !== null && typeof v !== 'string') return badRequest(res, `Champ ${k} invalide`);
      }
      const { data, error } = await supabaseAdmin
        .from('contact_leads')
        .insert({
          nom: nom.trim().slice(0, 200),
          cabinet: cabinet?.trim().slice(0, 200) || null,
          email: email.trim().toLowerCase().slice(0, 200),
          telephone: telephone?.trim().slice(0, 50) || null,
          notes: notes?.trim().slice(0, 2000) || null,
          source: (source?.trim().slice(0, 50)) || 'manuel',
          statut: 'nouveau',
        })
        .select('id')
        .single();
      if (error) return serverError(res, error);
      return ok(res, { created: true, id: data.id });
    }

    if (req.method === 'PATCH') {
      const { id, statut, notes } = req.body || {};
      if (!id || !UUID_RE.test(String(id))) return badRequest(res, 'Identifiant invalide');
      const patch = {};
      if (statut !== undefined) {
        if (!PROSPECT_STATUTS.includes(statut)) return badRequest(res, 'Statut invalide');
        patch.statut = statut;
      }
      if (notes !== undefined) {
        if (notes !== null && typeof notes !== 'string') return badRequest(res, 'Notes invalides');
        patch.notes = notes ? String(notes).trim().slice(0, 2000) : null;
      }
      if (Object.keys(patch).length === 0) return badRequest(res, 'Rien à modifier');

      const { error } = await supabaseAdmin.from('contact_leads').update(patch).eq('id', id);
      if (error) return serverError(res, error);
      return ok(res, { updated: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return badRequest(res, 'Méthode non supportée');
  } catch (err) {
    return serverError(res, err);
  }
}

// ----------------------------------------------------------------
// GET health — base joignable + présence de configuration + volumes.
// Booléens uniquement : ne renvoie JAMAIS la valeur d'un secret.
// ----------------------------------------------------------------
async function handleHealth(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return badRequest(res, 'Méthode non supportée');
  }
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const out = {
    db: { ok: false },
    config: {
      groq: !!process.env.GROQ_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      cron_secret: !!process.env.CRON_SECRET,
      auto_reveil_supabase: !!process.env.SUPABASE_ACCESS_TOKEN,
      webhook_notification: !!(process.env.NOTIFY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL),
      admin_emails: !!process.env.ADMIN_EMAILS,
      site_url: !!process.env.PUBLIC_SITE_URL,
    },
    activite_7j: null,
  };
  try {
    const [cabs, dems, appels] = await Promise.all([
      supabaseAdmin.from('cabinets').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('demandes').select('id', { count: 'exact', head: true }).gte('created_at', since7),
      supabaseAdmin.from('appels').select('id', { count: 'exact', head: true }).gte('created_at', since7),
    ]);
    if (cabs.error) throw cabs.error;
    out.db.ok = true;
    out.activite_7j = {
      cabinets_total: cabs.count ?? 0,
      demandes: dems.error ? null : (dems.count ?? 0),
      appels: appels.error ? null : (appels.count ?? 0),
    };
  } catch (err) {
    out.db.ok = false;
    out.db.erreur = String(err?.message || err).slice(0, 200);
  }
  return ok(res, out);
}

// ----------------------------------------------------------------
// Routage
// ----------------------------------------------------------------
export default async function handler(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  const admin = isAdminUser(auth.user);
  const action = req.query && req.query.action;

  // `me` : seul endpoint accessible authentifié non-admin (pour masquer l'UI)
  if (action === 'me') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return badRequest(res, 'Méthode non supportée');
    }
    return ok(res, { admin });
  }

  if (!admin) return forbidden(res, "Accès réservé à l'administrateur");

  switch (action) {
    case 'invite': return handleInvite(req, res);
    case 'cabinets': return handleCabinets(req, res);
    case 'prospects': return handleProspects(req, res);
    case 'health': return handleHealth(req, res);
    default:
      return res.status(404).json({ error: 'Action inconnue' });
  }
}
