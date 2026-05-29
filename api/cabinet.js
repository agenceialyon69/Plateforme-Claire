// ================================================================
// /api/cabinet — GET infos + PATCH paramètres
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, badRequest, serverError } from './_supabase.js';

const ALLOWED_FIELDS = [
  'nom', 'telephone', 'adresse', 'ville',
  'horaires', 'regles_reponse',
  'notif_email', 'notif_telephone',
];

export default async function handler(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('cabinets')
        .select('*')
        .eq('id', auth.cabinet.id)
        .single();
      if (error) return serverError(res, error);
      return ok(res, { cabinet: data });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = {};
      for (const k of ALLOWED_FIELDS) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (Object.keys(patch).length === 0) {
        return badRequest(res, 'Rien à mettre à jour');
      }

      // Validations basiques
      if (patch.nom && (typeof patch.nom !== 'string' || patch.nom.length > 200)) {
        return badRequest(res, 'Nom invalide');
      }
      if (patch.regles_reponse && patch.regles_reponse.length > 2000) {
        return badRequest(res, 'Règles trop longues');
      }

      const { data, error } = await supabaseAdmin
        .from('cabinets')
        .update(patch)
        .eq('id', auth.cabinet.id)
        .select()
        .single();

      if (error) return serverError(res, error);
      return ok(res, { cabinet: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return serverError(res, err);
  }
}
