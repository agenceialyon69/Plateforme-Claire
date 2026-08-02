-- =================================================================
-- Claire Platform — Schéma de base de données Supabase
-- À exécuter dans le SQL Editor de ton projet Supabase
-- =================================================================

-- Extensions nécessaires
create extension if not exists "uuid-ossp";

-- =================================================================
-- TABLE : cabinets
-- Un cabinet = un compte. L'id correspond à auth.users.id (Supabase Auth).
-- =================================================================
create table if not exists public.cabinets (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  email text unique not null,
  telephone text,
  adresse text,
  ville text default 'Lyon',
  horaires jsonb default '{
    "lundi":     {"ouvert": true,  "matin": ["09:00","12:00"], "aprem": ["14:00","19:00"]},
    "mardi":     {"ouvert": true,  "matin": ["09:00","12:00"], "aprem": ["14:00","19:00"]},
    "mercredi":  {"ouvert": true,  "matin": ["09:00","12:00"], "aprem": ["14:00","19:00"]},
    "jeudi":     {"ouvert": true,  "matin": ["09:00","12:00"], "aprem": ["14:00","19:00"]},
    "vendredi":  {"ouvert": true,  "matin": ["09:00","12:00"], "aprem": ["14:00","18:00"]},
    "samedi":    {"ouvert": false, "matin": [], "aprem": []},
    "dimanche":  {"ouvert": false, "matin": [], "aprem": []}
  }'::jsonb,
  regles_reponse text default '',
  notif_email text,
  notif_telephone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =================================================================
-- TABLE : conversations
-- Une conversation = un fil d'échange entre Claire et un patient
-- =================================================================
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  patient_nom text,
  patient_telephone text,
  patient_email text,
  statut text not null default 'active' check (statut in ('active','close','archive')),
  urgence text not null default 'normale' check (urgence in ('normale','moderee','elevee')),
  motif_resume text,
  derniere_activite timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists conversations_cabinet_id_idx on public.conversations(cabinet_id);
create index if not exists conversations_derniere_activite_idx on public.conversations(derniere_activite desc);

-- =================================================================
-- TABLE : messages
-- Chaque message d'une conversation (côté patient ou côté Claire)
-- =================================================================
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  contenu text not null,
  created_at timestamptz default now()
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id, created_at);

-- =================================================================
-- TABLE : demandes
-- Le résumé qualifié qu'on envoie au cabinet (vue actionnable)
-- =================================================================
create table if not exists public.demandes (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  patient_nom text,
  patient_telephone text,
  motif text not null,
  souhait text,
  urgence text not null default 'normale' check (urgence in ('normale','moderee','elevee')),
  statut text not null default 'en_attente' check (statut in ('en_attente','a_rappeler','traite','ignore')),
  note_cabinet text,
  traite_le timestamptz,
  created_at timestamptz default now()
);

create index if not exists demandes_cabinet_id_idx on public.demandes(cabinet_id);
create index if not exists demandes_statut_idx on public.demandes(cabinet_id, statut);
create index if not exists demandes_created_at_idx on public.demandes(created_at desc);

-- =================================================================
-- TABLE : contact_leads
-- Demandes de démo via la landing publique (pas liées à un cabinet)
-- =================================================================
create table if not exists public.contact_leads (
  id uuid primary key default uuid_generate_v4(),
  nom text not null,
  cabinet text,
  email text not null,
  telephone text,
  message text,
  source text default 'landing',
  created_at timestamptz default now()
);

-- =================================================================
-- TRIGGERS : maintenir updated_at automatiquement
-- =================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cabinets_updated_at on public.cabinets;
create trigger trg_cabinets_updated_at
  before update on public.cabinets
  for each row execute function public.set_updated_at();

-- Met à jour conversations.derniere_activite quand un message est ajouté
create or replace function public.bump_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
    set derniere_activite = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_messages_bump_activity on public.messages;
create trigger trg_messages_bump_activity
  after insert on public.messages
  for each row execute function public.bump_conversation_activity();

-- =================================================================
-- ROW LEVEL SECURITY
-- Chaque cabinet ne voit QUE ses propres données.
-- =================================================================

-- cabinets
alter table public.cabinets enable row level security;

drop policy if exists "cabinet_select_self" on public.cabinets;
create policy "cabinet_select_self"
  on public.cabinets for select
  using (auth.uid() = id);

drop policy if exists "cabinet_update_self" on public.cabinets;
create policy "cabinet_update_self"
  on public.cabinets for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- conversations
alter table public.conversations enable row level security;

drop policy if exists "conv_select_own" on public.conversations;
create policy "conv_select_own"
  on public.conversations for select
  using (cabinet_id = auth.uid());

-- messages
alter table public.messages enable row level security;

drop policy if exists "msg_select_own" on public.messages;
create policy "msg_select_own"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.cabinet_id = auth.uid()
    )
  );

-- demandes
alter table public.demandes enable row level security;

drop policy if exists "dem_select_own" on public.demandes;
create policy "dem_select_own"
  on public.demandes for select
  using (cabinet_id = auth.uid());

drop policy if exists "dem_update_own" on public.demandes;
create policy "dem_update_own"
  on public.demandes for update
  using (cabinet_id = auth.uid())
  with check (cabinet_id = auth.uid());

-- =================================================================
-- DROIT À L'EFFACEMENT (RGPD art. 17)
-- La politique de confidentialité promet la suppression sur demande.
-- On donne au cabinet le pouvoir d'effacer SES propres données, scopé par
-- cabinet_id = auth.uid(). Supprimer une conversation efface en cascade ses
-- messages ET sa demande (ON DELETE CASCADE défini plus haut).
-- L'endpoint serveur /api/erase s'appuie sur ces policies (ou le service_role
-- pour le cabinet de démo). Aucune policy INSERT n'est ajoutée : les écritures
-- restent réservées au service_role.
-- =================================================================
drop policy if exists "conv_delete_own" on public.conversations;
create policy "conv_delete_own"
  on public.conversations for delete
  using (cabinet_id = auth.uid());

drop policy if exists "dem_delete_own" on public.demandes;
create policy "dem_delete_own"
  on public.demandes for delete
  using (cabinet_id = auth.uid());

-- contact_leads : seul le service role peut lire (pas accessible côté client)
alter table public.contact_leads enable row level security;
-- (aucune policy = aucun accès via anon/auth, seul service_role bypasses RLS)

-- =================================================================
-- VUE : stats_cabinet
-- Pré-calcule les KPI du jour pour le dashboard.
-- SECURITY INVOKER = la vue respecte les policies RLS du caller,
-- donc un cabinet ne voit QUE ses propres stats.
-- =================================================================
create or replace view public.stats_cabinet
with (security_invoker = true) as
select
  c.id as cabinet_id,
  count(d.*) filter (where d.created_at::date = current_date) as demandes_aujourdhui,
  count(d.*) filter (where d.created_at::date = current_date and d.urgence = 'elevee') as urgences_aujourdhui,
  count(d.*) filter (where d.statut = 'en_attente') as en_attente,
  count(d.*) filter (where d.statut = 'a_rappeler') as a_rappeler,
  count(d.*) filter (where d.created_at >= now() - interval '7 days') as demandes_7j,
  count(d.*) filter (where d.created_at >= now() - interval '30 days') as demandes_30j
from public.cabinets c
left join public.demandes d on d.cabinet_id = c.id
group by c.id;

grant select on public.stats_cabinet to authenticated;

-- =================================================================
-- DÉBORDEMENT TÉLÉPHONIQUE (appel manqué → SMS → chat Claire)
-- Ajouté de façon idempotente : peut être ré-exécuté sans risque.
-- =================================================================

-- Colonnes cabinet nécessaires au débordement
alter table public.cabinets add column if not exists numero_twilio text;      -- numéro Twilio du cabinet (reçoit appels/SMS, expéditeur SMS)
alter table public.cabinets add column if not exists numero_reel text;        -- vrai numéro à appeler (secrétariat) — vide = mode "seulement appels manqués"
alter table public.cabinets add column if not exists sms_relance_actif boolean not null default true;
alter table public.cabinets add column if not exists sms_modele text;         -- gabarit SMS perso ({cabinet} et {lien} remplacés)

-- Lookup rapide du cabinet par son numéro Twilio (utilisé à chaque appel entrant)
create unique index if not exists cabinets_numero_twilio_idx
  on public.cabinets(numero_twilio) where numero_twilio is not null;

-- =================================================================
-- TABLE : appels — journal des appels entrants (répondus ET manqués)
-- Rend visible ce que le débordement rattrape, même si le patient
-- ne va jamais jusqu'au chat. C'est la preuve de valeur du produit.
-- =================================================================
create table if not exists public.appels (
  id uuid primary key default uuid_generate_v4(),
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  call_sid text,
  from_number text,
  to_number text,
  statut text not null default 'recu' check (statut in ('recu','repondu','manque')),
  sms_statut text not null default 'non_envoye'
    check (sms_statut in ('non_envoye','envoye','livre','echoue','opt_out','doublon','desactive')),
  sms_sid text,
  created_at timestamptz default now()
);

create index if not exists appels_cabinet_id_idx on public.appels(cabinet_id, created_at desc);
-- Sert au garde-fou anti-spam (un seul SMS par appelant sur une fenêtre courte)
create index if not exists appels_cooldown_idx on public.appels(cabinet_id, from_number, created_at desc);

-- =================================================================
-- TABLE : sms_optout — numéros ayant répondu STOP (conformité)
-- Verrouillée côté client (service_role uniquement), comme contact_leads.
-- =================================================================
create table if not exists public.sms_optout (
  cabinet_id uuid not null references public.cabinets(id) on delete cascade,
  numero text not null,
  created_at timestamptz default now(),
  primary key (cabinet_id, numero)
);

-- RLS : le cabinet lit SON journal d'appels ; sms_optout reste privé (service_role).
alter table public.appels enable row level security;
drop policy if exists "appels_select_own" on public.appels;
create policy "appels_select_own"
  on public.appels for select
  using (cabinet_id = auth.uid());

drop policy if exists "appels_delete_own" on public.appels;
create policy "appels_delete_own"
  on public.appels for delete
  using (cabinet_id = auth.uid());

alter table public.sms_optout enable row level security;
-- (aucune policy = aucun accès via anon/auth, seul service_role bypasse RLS)

-- =================================================================
-- LIEN appel → conversation (mesure honnête de la récupération)
-- Un appel manqué est "récupéré" quand le patient revient via le lien SMS et
-- qu'une conversation naît. On stampe l'id de l'appel sur la conversation créée
-- (fait par /api/chat, après vérification que l'appel appartient au cabinet).
-- =================================================================
alter table public.conversations
  add column if not exists appel_id uuid references public.appels(id) on delete set null;
create index if not exists conversations_appel_id_idx
  on public.conversations(appel_id) where appel_id is not null;

-- =================================================================
-- VUE : stats_debordement — KPI du débordement téléphonique (30 j)
-- Sous-requêtes scalaires (PAS de jointure) pour éviter toute inflation de
-- comptage par produit cartésien. security_invoker = respecte les RLS du caller.
-- =================================================================
create or replace view public.stats_debordement
with (security_invoker = true) as
select
  c.id as cabinet_id,
  (select count(*) from public.appels a
     where a.cabinet_id = c.id and a.statut = 'manque'
       and a.created_at >= now() - interval '30 days') as appels_manques_30j,
  (select count(*) from public.appels a
     where a.cabinet_id = c.id and a.sms_statut in ('envoye','livre')
       and a.created_at >= now() - interval '30 days') as sms_envoyes_30j,
  (select count(distinct conv.id) from public.conversations conv
     where conv.cabinet_id = c.id and conv.appel_id is not null
       and conv.created_at >= now() - interval '30 days') as conversations_recuperees_30j,
  (select count(distinct d.conversation_id) from public.demandes d
     join public.conversations conv2 on conv2.id = d.conversation_id
     where d.cabinet_id = c.id and conv2.appel_id is not null
       and d.created_at >= now() - interval '30 days') as demandes_recuperees_30j
from public.cabinets c;

grant select on public.stats_debordement to authenticated;

-- =================================================================
-- PURGE / RÉTENTION (RGPD art. 5 — minimisation & durée limitée)
-- Supprime les données au-delà de `retention_days`. Appelée quotidiennement
-- par le cron sécurisé /api/cron/purge (voir vercel.json + CRON_SECRET).
--   • SECURITY DEFINER + search_path figé (comme les autres fonctions).
--   • Garde-fou : plancher à 30 jours → une mauvaise config ne peut PAS tout
--     effacer.
--   • sms_optout est CONSERVÉ (obligation légale de ne plus recontacter).
--   • Droits d'exécution retirés à anon/authenticated (service_role only).
-- =================================================================
create or replace function public.purge_old_data(retention_days integer default 730)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(retention_days, 730), 30));
  n_conv int; n_leads int; n_appels int;
begin
  delete from public.conversations where created_at < cutoff;   -- cascade: messages + demandes
  get diagnostics n_conv = row_count;
  delete from public.contact_leads where created_at < cutoff;
  get diagnostics n_leads = row_count;
  delete from public.appels where created_at < cutoff;
  get diagnostics n_appels = row_count;
  return jsonb_build_object(
    'cutoff', cutoff,
    'conversations_supprimees', n_conv,
    'contact_leads_supprimes', n_leads,
    'appels_supprimes', n_appels
  );
end;
$$;

revoke all on function public.purge_old_data(integer) from public;
revoke all on function public.purge_old_data(integer) from anon;
revoke all on function public.purge_old_data(integer) from authenticated;

-- =================================================================
-- FIN DU SCHÉMA
-- =================================================================
