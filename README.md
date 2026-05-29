# Claire Platform — V1

Plateforme cabinet pour Claire, l'assistante de réception en ligne pour cabinets dentaires.

## Stack

- **Frontend** : HTML/CSS/JS vanilla (palette Fraunces + Inter Tight, cohérente avec claireassistante.fr)
- **Backend** : Vercel Serverless Functions (Node.js)
- **Base de données + Auth** : Supabase
- **Hébergement** : Vercel
- **Automatisations** : n8n (via webhook)

## Structure

```
claire-platform/
├── index.html               → Landing publique (à remplacer par ta landing actuelle)
├── login.html               → Connexion cabinet
├── cabinet.html             → Dashboard accueil
├── conversations.html       → Liste des conversations Claire ↔ patients
├── conversation.html        → Détail d'une conversation
├── demandes.html            → Demandes qualifiées à traiter
├── parametres.html          → Paramètres du cabinet
│
├── css/
│   ├── styles.css           → Styles globaux (palette commune)
│   └── dashboard.css        → Styles spécifiques dashboard
│
├── js/
│   ├── supabase-client.js   → Initialisation client Supabase
│   ├── auth.js              → Login / logout / guard
│   ├── format.js            → Helpers d'affichage partagés (dates, libellés, échappement HTML)
│   ├── pwa.js               → Enregistrement du service worker (app installable)
│   ├── demo-chat.js         → Widget de démo de la page d'accueil (→ /api/chat)
│   ├── dashboard.js         → Logique dashboard accueil
│   ├── conversations.js     → Liste + détail conversations
│   ├── demandes.js          → Gestion des demandes
│   └── parametres.js        → Gestion paramètres
│
├── icons/                   → Icônes de l'app (PWA) + favicon
├── manifest.webmanifest     → Manifest PWA (app installable)
├── sw.js                    → Service worker (cache app shell, hors-ligne)
│
├── api/
│   ├── chat.js              → Endpoint chatbot (sauvegarde dans Supabase)
│   ├── contact.js           → Formulaire de contact landing
│   ├── conversations.js     → GET liste conversations cabinet
│   ├── conversation.js      → GET détail conversation
│   ├── demandes.js          → GET / PATCH demandes
│   ├── cabinet.js           → GET / PATCH cabinet
│   └── _supabase.js         → Helper Supabase server-side
│
├── sql/
│   └── schema.sql           → Schéma complet à exécuter dans Supabase
│
├── package.json
├── vercel.json
└── .env.example             → Variables d'env à configurer
```

## Setup (étapes à suivre une fois)

### 1. Créer le projet Supabase

1. Va sur https://supabase.com → crée un nouveau projet (région : Europe West)
2. Note bien : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Dans le SQL Editor, copie/colle le contenu de `sql/schema.sql` et exécute.

### 2. Créer un compte cabinet de test

Dans Supabase → Authentication → Add user (manuel) :
- Email : `test@cabinet-demo.fr`
- Password : choisis-en un solide
- Auto Confirm User : ✅

Puis dans le SQL Editor, exécute :
```sql
insert into cabinets (id, nom, email, telephone)
values ('<UUID-de-l-utilisateur-créé>', 'Cabinet Demo Lyon', 'test@cabinet-demo.fr', '+33605800594');
```

(L'UUID se récupère dans Authentication → Users → clic sur l'utilisateur)

### 3. Configurer Vercel

1. Push ce repo sur GitHub
2. Importe le repo sur https://vercel.com
3. Dans Settings → Environment Variables, ajoute :
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (pour le chatbot Claire)
   - `N8N_WEBHOOK_URL` (optionnel, pour les notifs au dentiste)
4. Configure aussi ces deux mêmes variables dans `js/supabase-client.js` (côté navigateur) :
   - Remplace `SUPABASE_URL_HERE` et `SUPABASE_ANON_KEY_HERE` par les vraies valeurs
   - ⚠️ NE JAMAIS exposer la SERVICE_ROLE_KEY côté navigateur

### 4. Tester en local (optionnel)

```bash
npm install
vercel dev
```

Puis va sur `http://localhost:3000/login.html`.

### 5. Déployer

`git push` → Vercel déploie automatiquement.

## Sécurité

- **Row Level Security (RLS)** activé sur toutes les tables : chaque cabinet ne voit que ses propres données.
- **Auth Supabase** : sessions JWT côté navigateur, vérification côté API.
- **Service role key** : utilisée uniquement côté serveur (API routes), jamais exposée au navigateur.

## Roadmap

### V1 (livrée ici)
- ✅ Login cabinet
- ✅ Dashboard avec KPIs du jour
- ✅ Liste + détail des conversations Claire ↔ patients
- ✅ Demandes qualifiées avec actions (traité, à rappeler)
- ✅ Paramètres cabinet (horaires, infos)
- ✅ Webhook n8n pour notifs email/SMS
- ✅ Page d'accueil avec démo interactive (branchée sur `/api/chat`)
- ✅ App mobile installable (PWA : manifest + service worker)

### V2 (plus tard)
- Multi-utilisateurs par cabinet
- Statistiques avancées
- Intégration agenda (Doctolib, Julie)
- Notifications push (PWA)
