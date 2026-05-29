-- =================================================================
-- Claire Platform — Cabinet de DÉMONSTRATION (page d'accueil)
-- -----------------------------------------------------------------
-- Active le chat de démo + la carte « ce que reçoit le cabinet ».
-- À exécuter dans le SQL Editor de Supabase.
--
-- PRÉ-REQUIS : créer d'abord l'utilisateur d'authentification.
--   Authentication → Users → Add user
--   Email : demo@claire.fr   (coche « Auto Confirm User »)
--   (cabinets.id référence auth.users.id — d'où ce pré-requis)
-- =================================================================

-- 1) Crée la fiche cabinet à partir de l'utilisateur Auth « demo@claire.fr »
insert into public.cabinets (id, nom, email, ville, regles_reponse)
select
  u.id,
  'Cabinet Démo',
  'demo@claire.fr',
  'Lyon',
  'Cabinet de démonstration. Réponds de façon chaleureuse, claire et professionnelle. ' ||
  'Ne pose aucun diagnostic ; pour toute urgence vitale, invite à appeler le 15.'
from auth.users u
where u.email = 'demo@claire.fr'
on conflict (id) do nothing;

-- 2) Récupère l'UUID à reporter :
--      - dans js/demo-chat.js      → const DEMO_CABINET_ID = '...'
--      - dans Vercel (variable env) → DEMO_CABINET_ID = '...'
select id as demo_cabinet_id
from public.cabinets
where email = 'demo@claire.fr';
