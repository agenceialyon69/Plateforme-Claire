// ================================================================
// /api/cabinet — GET infos + PATCH paramètres
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, badRequest, serverError } from './_supabase.js';
import { parseCabinetPatch } from './_validate.js';

// Seul point d'écriture des paramètres cabinet : la validation (liste blanche, numéro
// français hors 08, SMS sans lien...) est dans _validate.js. Le navigateur n'a PAS le
// droit d'écrire directement dans `cabinets` (voir sql/schema.sql, migration « E1 »).

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
      const parsed = parseCabinetPatch(req.body);
      if (!parsed.ok) return badRequest(res, parsed.error);
      const patch = parsed.value;

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
