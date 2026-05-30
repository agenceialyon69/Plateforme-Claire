// ================================================================
// Client Supabase côté navigateur
// ----------------------------------------------------------------
// ⚠️ IMPORTANT : remplace les deux valeurs ci-dessous par celles
// de TON projet Supabase (Settings → API).
// L'anon key est PUBLIQUE — c'est normal qu'elle soit dans le code.
// Ne JAMAIS mettre la service_role key ici.
// ================================================================

export const SUPABASE_URL      = 'https://fikjpaiqjiazxowxvrvo.supabase.co';       // projet plateforme dédié
export const SUPABASE_ANON_KEY = 'sb_publishable_6nC41beInFoY3LbjypWVRw_6Mv3cDx_';  // clé publique (publishable)

// Import Supabase via CDN ESM
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Helper : récupère la session courante (ou null)
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

// Helper : récupère l'utilisateur courant (ou null)
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
