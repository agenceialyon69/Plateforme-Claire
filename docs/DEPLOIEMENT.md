# Guide de déploiement — Claire Platform

Ce guide te fait passer **de zéro à production** en suivant les étapes dans l'ordre.

---

## ÉTAPE 1 — Supabase (15 min)

### 1.1 Créer le projet

1. Va sur [supabase.com](https://supabase.com) → **New Project**
2. Région : **Europe West (Paris/Frankfurt)** — important pour la RGPD
3. Mot de passe DB : génère un mot de passe fort et garde-le en sécurité
4. Attends 1-2 min que le projet se crée

### 1.2 Exécuter le schéma SQL

1. Dans Supabase → **SQL Editor** → **New query**
2. Copie/colle **TOUT** le contenu du fichier `sql/schema.sql`
3. Clique sur **Run** (en bas à droite)
4. Tu dois voir "Success. No rows returned"

### 1.3 Récupérer les clés

Dans Supabase → **Settings** → **API**, note :
- `Project URL` → ce sera ta `SUPABASE_URL`
- `anon` `public` key → ce sera ta `SUPABASE_ANON_KEY`
- `service_role` `secret` key → ce sera ta `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **JAMAIS dans le code public**

### 1.4 Créer un cabinet de test

1. **Authentication** → **Users** → **Add user** → **Create new user**
   - Email : `test@cabinet-demo.fr`
   - Password : un mot de passe solide
   - Auto Confirm User : ✅ coché
   - Clique **Create user**
2. Récupère l'UUID de l'utilisateur (visible dans la liste, colonne ID)
3. Retourne dans **SQL Editor** et exécute (en remplaçant l'UUID) :

```sql
insert into public.cabinets (id, nom, email, telephone, ville)
values (
  'COLLE-ICI-L-UUID-DE-L-UTILISATEUR',
  'Cabinet Demo Lyon',
  'test@cabinet-demo.fr',
  '+33605800594',
  'Lyon'
);
```

---

## ÉTAPE 2 — Configuration locale (5 min)

### 2.1 Mettre les clés Supabase dans le client navigateur

Ouvre `js/supabase-client.js` et remplace :

```js
const SUPABASE_URL      = 'SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_HERE';
```

Par tes vraies valeurs (l'anon key est publique, c'est ok de la mettre ici).

### 2.2 Créer `.env.local` pour le serveur

```bash
cp .env.example .env.local
```

Puis édite `.env.local` avec :
```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
N8N_WEBHOOK_URL=  (vide pour l'instant si tu n'as pas n8n)
```

---

## ÉTAPE 3 — Test en local (optionnel, recommandé)

```bash
npm install
npm install -g vercel        # si pas déjà fait
vercel dev
```

Puis va sur `http://localhost:3000/login.html` et connecte-toi avec le compte test.

Tu dois voir le dashboard s'afficher (vide pour l'instant, c'est normal).

---

## ÉTAPE 4 — Déploiement sur Vercel (10 min)

### 4.1 Pousser sur GitHub

```bash
cd claire-platform
git init
git add .
git commit -m "Initial commit — Claire Platform V1"
git branch -M main
git remote add origin https://github.com/TON-USER/claire-platform.git
git push -u origin main
```

### 4.2 Importer dans Vercel

1. Va sur [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Sélectionne ton repo `claire-platform`
3. **Framework Preset** : laisse `Other`
4. **Build settings** : laisse vide (Vercel détecte le serverless)
5. Clique sur **Environment Variables** et ajoute :
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `N8N_WEBHOOK_URL` (optionnel)
   - `ALLOWED_ORIGINS` (origines autorisées pour `/api/chat`, `/api/contact`)
   - `DEMO_CABINET_ID` (optionnel — voir ÉTAPE 7, active la carte « reçu par le cabinet »)
6. Clique **Deploy**

### 4.3 Connecter le domaine claireassistante.fr

Si tu veux que la plateforme tourne sur `app.claireassistante.fr` (recommandé pour séparer landing/app) :

1. Vercel → **Settings** → **Domains** → **Add**
2. Tape `app.claireassistante.fr` et suis les instructions DNS
3. Chez ton registrar (OVH, Gandi…), ajoute un enregistrement CNAME :
   - Nom : `app`
   - Valeur : `cname.vercel-dns.com`

Sinon, garde l'URL `*.vercel.app` pour démarrer.

---

## ÉTAPE 5 — Connecter le chatbot existant

Sur ton site actuel `claireassistante.fr`, le chatbot appelle `/api/chat`. Pour qu'il sauvegarde dans la nouvelle base :

1. Le code JS du chat (sur claireassistante.fr) envoie déjà `cabinetId: 'demo'` — il faut remplacer `'demo'` par le **vrai UUID** du cabinet test.

Dans le fichier JS du chat de ton site landing, change :
```js
const CABINET_ID = 'demo';
```
en :
```js
const CABINET_ID = 'UUID-DU-CABINET-DEMO';
```

2. Et pointe le `fetch('/api/chat')` vers ton nouveau backend Vercel, par exemple :
```js
const response = await fetch('https://app.claireassistante.fr/api/chat', { ... });
```

✅ Le CORS cross-origin est **déjà géré** dans `api/chat.js` (et `api/contact.js`). Il suffit de renseigner la variable d'environnement `ALLOWED_ORIGINS` sur Vercel avec les domaines autorisés, par exemple :

```
ALLOWED_ORIGINS=https://claireassistante.fr,https://www.claireassistante.fr
```

Si `ALLOWED_ORIGINS` est vide ou contient `*`, toutes les origines sont acceptées (déconseillé en production).

---

## ÉTAPE 6 — Notifications n8n (optionnel, V1.1)

1. Crée un workflow n8n avec un trigger **Webhook**
2. Copie l'URL du webhook → mets-la dans `N8N_WEBHOOK_URL`
3. Dans le workflow, branche :
   - Un nœud **Email** (Gmail/SMTP) qui envoie au `notif_email` du cabinet
   - Un nœud **WhatsApp Business** (optionnel) pour les urgences élevées
4. Re-deploy Vercel pour qu'il prenne en compte la variable

---

## ÉTAPE 7 — Widget de démo de la page d'accueil

La page d'accueil (`index.html`) contient un **chat de démonstration en conditions réelles** :
le visiteur échange avec Claire via le vrai endpoint `/api/chat`, mais sur un **cabinet de démo
dédié** dont les données restent isolées de tes vrais cabinets.

### 7.1 Créer le cabinet de démo

Dans **Authentication → Users → Add user**, crée par exemple `demo@claire.fr` (Auto Confirm coché),
puis dans le **SQL Editor** :

```sql
insert into public.cabinets (id, nom, email, ville)
values ('COLLE-ICI-L-UUID-DE-DEMO', 'Cabinet Démo', 'demo@claire.fr', 'Lyon');
```

### 7.2 Renseigner l'UUID dans le widget

Ouvre `js/demo-chat.js` et remplace :

```js
const DEMO_CABINET_ID = 'DEMO_CABINET_ID_HERE';
```

par l'UUID du cabinet de démo. Tant que ce n'est pas fait, le widget reste **désactivé proprement**
(il affiche un message neutre, sans erreur).

### 7.3 (Option) Afficher « ce que reçoit le cabinet »

Pour faire apparaître, sous la démo, la fiche qualifiée telle que la reçoit un cabinet, ajoute la
variable d'environnement **`DEMO_CABINET_ID`** sur Vercel avec le **même UUID** que ci-dessus, puis
redéploie. L'endpoint `/api/demo-summary` ne sert alors **que** ce cabinet de démo (aucune donnée
réelle ne peut être exposée). Sans cette variable, la carte ne s'affiche simplement pas.

> ⚠️ Le widget appelle Claude à chaque message : ces échanges de démo consomment ton crédit
> `ANTHROPIC_API_KEY`. Le rate-limit (20 req/min/IP) est déjà en place dans `api/chat.js`.

---

## ÉTAPE 8 — Installer Claire en application (PWA)

La plateforme est une **PWA installable** : sur le téléphone de l'équipe, elle s'ajoute à l'écran
d'accueil et s'ouvre en plein écran comme une application native (`manifest.webmanifest` + `sw.js`).

- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*
- **Android (Chrome)** : menu ⋮ → *Installer l'application*

Rien à configurer : c'est actif dès que le site est servi en HTTPS (Vercel le fait par défaut).
Le service worker ne met **jamais** en cache les appels `/api/*` ni les données Supabase.

---

## Tester de bout en bout

1. Va sur ton site landing → clique sur "Tester Claire"
2. Écris : "Bonsoir, j'ai très mal à une dent depuis hier soir"
3. Réponds aux questions de Claire (nom, téléphone…)
4. Va sur `app.claireassistante.fr/login.html`, connecte-toi avec le cabinet test
5. Tu dois voir :
   - 1 conversation dans le dashboard
   - 1 demande "en_attente" avec urgence "elevee" ou "moderee"

Si tout fonctionne : **bravo, la V1 est en prod.**

---

## Problèmes fréquents

**"401 Unauthorized" sur les API**
→ Le client navigateur n'envoie pas le token. Vérifie que tu utilises `apiFetch` (qui ajoute le header Authorization) et pas un `fetch` brut.

**"Cabinet introuvable" après login**
→ Tu as créé l'user dans Supabase Auth mais pas la ligne correspondante dans `cabinets`. Re-fais l'étape 1.4.

**RLS bloque les requêtes**
→ Si tu vois des erreurs PostgREST, vérifie que les policies RLS sont bien activées (re-exécute la section RLS du schema.sql).

**Le chatbot répond mais ne sauvegarde pas**
→ Vérifie que `cabinetId` est bien envoyé dans le body de la requête `/api/chat`, et que `ANTHROPIC_API_KEY` est définie dans Vercel.
