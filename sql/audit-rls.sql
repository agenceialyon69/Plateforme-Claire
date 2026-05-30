-- =================================================================
-- audit-rls.sql — RED TEAM : radiographie de la sécurité RLS en prod
-- -----------------------------------------------------------------
-- À COLLER dans Supabase → SQL Editor → Run.
-- Ne modifie RIEN (lecture seule). Donne en 30 s l'état réel des
-- protections Row Level Security de ta base.
--
-- Pourquoi c'est critique : ton dashboard interroge Supabase
-- DIRECTEMENT depuis le navigateur avec la clé `anon` (publique).
-- Les RLS sont donc le SEUL rempart entre un attaquant et toutes
-- les données. Ce script vérifie qu'elles sont réellement actives.
-- =================================================================


-- -----------------------------------------------------------------
-- [1] RLS activée sur chaque table ?  (rls_enabled doit être TRUE partout)
-- -----------------------------------------------------------------
select
  c.relname                as "table",
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;


-- -----------------------------------------------------------------
-- [2] 🚨 TABLES SANS RLS  (résultat attendu : AUCUNE LIGNE)
--     Toute ligne ici = trou béant : lisible/modifiable par n'importe qui.
-- -----------------------------------------------------------------
select c.relname as "TABLE_SANS_RLS_DANGER"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false;


-- -----------------------------------------------------------------
-- [3] Détail de TOUTES les policies (lecture ET écriture)
--     cmd = SELECT / INSERT / UPDATE / DELETE / ALL
--     qual      = condition de lecture (USING)
--     with_check = condition d'écriture (WITH CHECK)
-- -----------------------------------------------------------------
select
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_condition,
  with_check  as write_condition
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- -----------------------------------------------------------------
-- [4] Tables RLS activée MAIS sans aucune policy
--     → accès totalement bloqué côté client (OK si voulu, ex: contact_leads).
--     Vérifie que c'est INTENTIONNEL pour chaque ligne retournée.
-- -----------------------------------------------------------------
select c.relname as "table_rls_sans_policy"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  );


-- -----------------------------------------------------------------
-- [5] Vues : security_invoker doit être TRUE (sinon la vue contourne le RLS)
--     stats_cabinet DOIT afficher security_invoker = true.
-- -----------------------------------------------------------------
select
  c.relname as "view",
  coalesce(
    (select o from unnest(c.reloptions) as o where o like 'security_invoker=%'),
    'security_invoker=false (⚠️ DEFAULT)'
  ) as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
order by c.relname;


-- -----------------------------------------------------------------
-- [6] Droits accordés à anon / authenticated (table par table)
--     Repère un GRANT trop large (ex: anon avec INSERT/UPDATE/DELETE).
-- -----------------------------------------------------------------
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;


-- =================================================================
-- ✅ ÉTAT ATTENDU (référence — ce à quoi le résultat DOIT ressembler)
-- -----------------------------------------------------------------
--  TABLE          | RLS  | POLICIES ATTENDUES
--  ---------------+------+-----------------------------------------
--  cabinets       | TRUE | SELECT self (auth.uid()=id),
--                 |      | UPDATE self (auth.uid()=id)
--  conversations  | TRUE | SELECT own (cabinet_id=auth.uid())
--  messages       | TRUE | SELECT own (via EXISTS sur conversations)
--  demandes       | TRUE | SELECT own + UPDATE own (cabinet_id=auth.uid())
--  contact_leads  | TRUE | AUCUNE policy  → verrouillée (service_role only)
--
--  ➜ [2] doit être VIDE.
--  ➜ [4] ne doit contenir QUE contact_leads.
--  ➜ stats_cabinet doit être security_invoker=true.
--  ➜ anon ne doit JAMAIS avoir INSERT/UPDATE/DELETE.
--
--  Toute déviation = à corriger AVANT le moindre pilote client.
-- =================================================================
