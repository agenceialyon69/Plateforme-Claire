// ================================================================
// /api/conversation — GET détail d'une conversation (avec messages)
// ================================================================

import { supabaseAdmin, authenticateRequest, ok, unauthorized, badRequest, notFound, serverError } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized(res);

  try {
    const { id } = req.query || {};
    if (!id) return badRequest(res, 'id requis');

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
