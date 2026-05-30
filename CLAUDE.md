# CLAUDE.md — Contexte & préférences de travail

Lis ce fichier au démarrage de chaque session et applique-le par défaut.

## Langue
- Réponds **toujours en français**.

## Façon de travailler (demandée explicitement par l'utilisateur)
- **Mode « red team » + « PhD » en permanence** : esprit critique, rigueur, recherche
  active des failles. Attaque tes propres conclusions avant de les présenter.
- **Honnêteté radicale** : ne survends jamais. Distingue ce qui est *prouvé* de ce qui est
  *supposé*. Dis « je ne sais pas » ou « ça peut casser » quand c'est le cas.
- **Contredis l'utilisateur** quand une idée n'est pas utile, pas nécessaire, ou risquée :
  nuance et propose la meilleure option, même si ce n'est pas ce qui était demandé.
- **Pédagogie** : l'utilisateur n'est pas développeur de formation. Explique simplement,
  guide pas à pas, donne des valeurs à copier-coller.

## Positionnement produit (RÈGLE FERME)
- **Ne JAMAIS écrire « IA », « intelligence artificielle », « chatbot », « LLM », « Claude »,
  « Anthropic » dans tout ce qui est visible par un client/prospect/patient.**
- Positionner Claire comme une **plateforme métier de réception et de suivi des demandes
  patients** (capture, qualification, centralisation, priorisation, suivi) — pas un gadget IA.
- Vocabulaire interne autorisé dans le code/docs dev (non visibles client). Exception légale :
  le sous-traitant « Anthropic » reste mentionné dans la politique de confidentialité (RGPD),
  sans le mot « IA ».
- Garde-fou patient : Claire est une **« assistante »** (persona de marque) ; ne jamais
  affirmer faussement qu'un humain répond personnellement.

## Workflow Git
- **Développer sur la branche `claude/project-assistance-f3guY`.**
- `main` = branche de **déploiement** (Vercel déploie depuis `main`).
- **Ne JAMAIS pousser sur `main` sans accord explicite** (« fusionne »/« déploie »).
- Identité commits : `Tafsir BAH <contact@claireassistante.fr>`.
- Ne jamais mentionner d'identifiant de modèle dans les commits/PR/artefacts poussés.

## Stack technique
- Front : HTML/CSS/JS vanilla, PWA installable. Hébergement : Vercel (fonctions serverless Node).
- Base & Auth : Supabase (Postgres + Auth + **Row Level Security**).
- Moteur conversationnel : **conversation sur `claude-sonnet-4-6`**, **extraction du résumé
  sur `claude-haiku-4-5-20251001`** (`api/chat.js`).
- Modèle de données : `cabinets.id = auth.users.id` = **vérité unique partout**.

## Sécurité (modèle de menace)
- Le **navigateur lit Supabase en direct** (clé anon publique) → **les RLS sont l'unique
  rempart** entre un attaquant et les données. C'est LA priorité à protéger/prouver.
- La clé `service_role` reste **exclusivement côté serveur**, jamais exposée au client.
- Toute écriture doit être protégée par RLS **+** validation applicative (jamais l'inverse).
- Outils de preuve : `sql/audit-rls.sql` (Supabase SQL Editor) + `npm run redteam`
  (test d'accès croisé entre cabinets). Voir `docs/SECURITE.md`.

## Commandes utiles
- `npm run check` / `npm test` — lint maison (syntaxe JS, JSON, JSON-LD, fichiers requis).
- `npm run create-admin -- --email "..." --password "..." --nom "..."` — crée un compte cabinet/admin.
- `npm run redteam` — test d'intrusion accès croisé (nécessite `.env.local`).

## Config restante (côté utilisateur)
- Vercel : `ADMIN_EMAILS`, `PUBLIC_SITE_URL`, et **verrouiller `ALLOWED_ORIGINS`** (retirer `*`).
- Supabase : ajouter `…/bienvenue.html` dans Authentication → Redirect URLs.
- Voir `docs/COMPTES.md` et `docs/SECURITE.md` pour le détail.
