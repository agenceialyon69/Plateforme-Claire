// ================================================================
// /api/erase — Droit à l'effacement (RGPD art. 17)
// ----------------------------------------------------------------
// DELETE (ou POST) authentifié. Efface UNE conversation appartenant au
// cabinet connecté, et — par cascade DB (ON DELETE CASCADE) — ses messages
// et sa demande qualifiée associés. Efface aussi l'appel manqué lié le cas
// échéant (table `appels`, non couverte par la cascade : la FK est portée par
// conversations.appel_id, pas l'inverse) — sinon le numéro du patient (from_number)
// y survivrait jusqu'à la purge automatique (jusqu'à RETENTION_DAYS).
//
// 🔐 SÉCURITÉ :
// - Auth JWT obligatoire (authenticateRequest).
// - Le filtre .eq('cabinet_id', auth.cabinet.id) garantit qu'un cabinet ne
//   peut effacer QUE ses propres données, même si un id étranger est fourni.
// - Vérifie l'existence AVANT suppression → 404 honnête si rien ne correspond
//   (ne révèle jamais l'existence d'une conversation d'un autre cabinet).
// ================================================================

import {
  supabaseAdmin,
  authenticateRequest,
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
} from './_supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.setHeader('Allow', 'DELETE, POST');
    return badRequest(res, 'Method not allowed');
  }

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    const conversationId =
      (req.query && req.query.conversationId) ||
      (req.body && req.body.conversationId);

    if (!conversationId || typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) {
      return badRequest(res, 'conversationId invalide');
    }

    // 1) Vérifie que la conversation appartient bien à ce cabinet
    //    (et récupère l'appel manqué lié, s'il existe, pour l'effacer aussi).
    const { data: convo, error: errLookup } = await supabaseAdmin
      .from('conversations')
      .select('id, appel_id')
      .eq('id', conversationId)
      .eq('cabinet_id', auth.cabinet.id)
      .single();

    if (errLookup || !convo) return notFound(res, 'Conversation introuvable');

    // 2) Supprime (cascade : messages + demande liés).
    const { error: errDelete } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('cabinet_id', auth.cabinet.id);

    if (errDelete) return serverError(res, errDelete);

    // 3) Efface l'appel manqué lié (from_number = donnée personnelle du
    //    patient). Non bloquant : la conversation est déjà effacée, on ne fait
    //    pas échouer toute la requête pour ce complément.
    if (convo.appel_id) {
      const { error: errAppel } = await supabaseAdmin
        .from('appels')
        .delete()
        .eq('id', convo.appel_id)
        .eq('cabinet_id', auth.cabinet.id);
      if (errAppel) console.error('Erreur suppression appel lié:', errAppel);
    }

    return ok(res, { erased: true, conversationId });
  } catch (err) {
    return serverError(res, err);
  }
}
