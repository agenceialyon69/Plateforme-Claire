// ================================================================
// /api/demandes — GET liste + PATCH mise à jour
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, badRequest, notFound, serverError } from './_supabase.js';

const STATUTS_VALIDES = ['en_attente', 'a_rappeler', 'traite', 'ignore'];

export default async function handler(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    if (req.method === 'GET') {
      const { statut, limit = 100 } = req.query || {};
      let query = supabaseAdmin
        .from('demandes')
        .select('*')
        .eq('cabinet_id', auth.cabinet.id)
        .order('urgence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(Math.min(parseInt(limit, 10) || 100, 200));

      if (statut) query = query.eq('statut', statut);

      const { data, error } = await query;
      if (error) return serverError(res, error);
      return ok(res, { demandes: data || [] });
    }

    if (req.method === 'PATCH') {
      const { id, statut, note_cabinet } = req.body || {};
      if (!id) return badRequest(res, 'id requis');
      if (statut && !STATUTS_VALIDES.includes(statut)) {
        return badRequest(res, 'Statut invalide');
      }

      const patch = {};
      if (statut) {
        patch.statut = statut;
        if (statut === 'traite') patch.traite_le = new Date().toISOString();
      }
      if (note_cabinet !== undefined) patch.note_cabinet = note_cabinet;

      if (Object.keys(patch).length === 0) {
        return badRequest(res, 'Rien à mettre à jour');
      }

      const { data, error } = await supabaseAdmin
        .from('demandes')
        .update(patch)
        .eq('id', id)
        .eq('cabinet_id', auth.cabinet.id) // sécurité
        .select()
        .single();

      if (error) return serverError(res, error);
      if (!data) return notFound(res, 'Demande introuvable');
      return ok(res, { demande: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return serverError(res, err);
  }
}
