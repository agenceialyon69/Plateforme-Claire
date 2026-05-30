# Comptes & connexion — guide rapide

La connexion à l'espace cabinet se fait par **email + mot de passe** (Supabase Auth).
Un compte = une ligne dans la table `cabinets` (dont l'`id` = l'`id` de l'utilisateur Auth).

## 1. Créer votre compte admin (à faire une fois)

Le plus simple : le script tout-en-un (crée l'utilisateur Auth **et** sa fiche cabinet).

```bash
# 1. Renseignez vos clés Supabase dans .env.local
cp .env.example .env.local
#    → remplissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (Settings → API)

# 2. Installez les dépendances puis lancez le script
npm install
npm run create-admin -- --email "contact@claireassistante.fr" \
  --password "VotreMotDePasseSolide" --nom "Claire — Admin"
```

Vous pouvez ensuite vous connecter sur `/login.html`.

> Variante 100 % manuelle (sans script) : Supabase → Authentication → **Add user**
> (cochez « Auto Confirm User »), puis exécutez `sql/demo-cabinet.sql` adapté à votre email.

## 2. Inviter de nouveaux cabinets (parcours pro)

1. Ajoutez votre email dans la variable d'environnement **`ADMIN_EMAILS`** (Vercel
   → Settings → Environment Variables), ex. `contact@claireassistante.fr`. Redéployez.
2. Renseignez **`PUBLIC_SITE_URL`** (ex. `https://app.claireassistante.fr`).
3. Dans Supabase → **Authentication → URL Configuration → Redirect URLs**, ajoutez
   `https://app.claireassistante.fr/bienvenue.html`.
4. Connectez-vous : un lien **« Inviter un cabinet »** apparaît dans la barre latérale
   (visible uniquement pour les emails listés dans `ADMIN_EMAILS`).
5. Saisissez le nom + l'email du cabinet → il reçoit un email pour **définir son propre
   mot de passe** (page `/bienvenue.html`). Aucun mot de passe ne transite par vous.

> Astuce : pour des emails d'invitation fiables et à votre marque, configurez un SMTP
> dans Supabase → Authentication → Emails (sinon l'envoi par défaut est limité en volume).
