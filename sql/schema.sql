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
  using (auth.uid() = id);

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
-- FIN DU SCHÉMA
-- =================================================================
