// ================================================================
// /api/conversation — GET détail d'une conversation (avec messages)
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, badRequest, notFound, serverError } from './_supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    const { id } = req.query || {};
    // Valide le format AVANT toute requête : un id non-UUID provoquait un 500
    // Postgres (type uuid invalide) au lieu d'un 400 propre.
    if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
      return badRequest(res, 'id invalide');
    }

    const { data: convo, error: errConvo } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('cabinet_id', auth.cabinet.id)
      .single();

    if (errConvo || !convo) return notFound(res, 'Conversation introuvable');

    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('id, role, contenu, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    const { data: demandes } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false });

    return ok(res, {
      conversation: convo,
      messages: messages || [],
      demandes: demandes || [],
    });
  } catch (err) {
    return serverError(res, err);
  }
}
