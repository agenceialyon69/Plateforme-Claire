# 🚀 Mettre Claire en ligne — checklist 15 min

Tout le code est déjà prêt. Voici les **seules** actions qui dépendent de toi pour passer en prod.
Coche au fur et à mesure.

---

## 1. Récupérer le code (rien à copier à la main)

Le code est déjà sur GitHub, branche `claude/project-assistance-f3guY`. Deux façons de l'utiliser :

- **Le plus simple** : sur GitHub, ouvre la Pull Request, clique **Merge** → le code arrive sur `main`.
- **En local** (si tu utilises ton ordinateur) :
  ```bash
  git pull
  git checkout claude/project-assistance-f3guY
  ```

> ⚠️ Ne recopie jamais les fichiers à la main : tout est versionné dans Git.

---

## 2. Base de données — cabinet de démo (5 min)

1. Supabase → **Authentication → Users → Add user** : `demo@claire.fr` (coche *Auto Confirm User*).
2. Supabase → **SQL Editor** : ouvre/colle le contenu de **`sql/demo-cabinet.sql`**, exécute.
3. Note l'**UUID** affiché (`demo_cabinet_id`).

## 3. Activer la démo (2 min)

1. Dans `js/demo-chat.js`, remplace `DEMO_CABINET_ID_HERE` par l'UUID de l'étape 2.
2. Sur Vercel → **Settings → Environment Variables** : ajoute `DEMO_CABINET_ID` = le même UUID.

## 4. Pages légales (5 min)

Dans `mentions-legales.html` et `confidentialite.html`, remplace tous les `[À COMPLÉTER]`
(raison sociale, SIREN, adresse, email de contact, durée de conservation…).

## 5. Mesure de conversion (1 min)

Vercel → projet → onglet **Analytics** → **Enable**. (Sans cookie, aucun bandeau nécessaire.)

## 6. Déployer

Si le projet est relié à GitHub, le **merge de la PR déclenche le déploiement** automatiquement.
Sinon, Vercel → **Deployments → Redeploy**.

---

## ✅ Vérifier que tout marche

1. Ouvre la page d'accueil → écris « *J'ai mal à une dent depuis hier* » à Claire.
2. Après quelques échanges, la carte **« Reçu par le cabinet »** doit apparaître.
3. Envoie le formulaire **« Réserver une démo »** → message de confirmation.
4. Connecte-toi à l'espace cabinet → la conversation et la demande de démo sont là.

Si les 4 points passent : **tu es en ligne. 🎉**
