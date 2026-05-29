// ================================================================
// /api/conversations — GET liste paginée des conversations du cabinet
// (alternative côté serveur si on veut bypass le client Supabase)
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, serverError } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    const { urgence, statut, limit = 50 } = req.query || {};

    let query = supabaseAdmin
      .from('conversations')
      .select('id, patient_nom, motif_resume, urgence, statut, derniere_activite, created_at')
      .eq('cabinet_id', auth.cabinet.id)
      .order('derniere_activite', { ascending: false })
      .limit(Math.min(parseInt(limit, 10) || 50, 200));

    if (urgence) query = query.eq('urgence', urgence);
    if (statut) query = query.eq('statut', statut);

    const { data, error } = await query;
    if (error) return serverError(res, error);

    return ok(res, { conversations: data || [] });
  } catch (err) {
    return serverError(res, err);
  }
}
