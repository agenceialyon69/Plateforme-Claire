# Audit technique — Claire Platform

> Audit réalisé le 2026-05-29 sur l'ensemble du code livré (API serverless, front-end, SQL, docs).
> Objectif : vérifier la solidité du projet et le remettre au propre, **sans ajouter de fonctionnalité ni de promesse non fondée**.

## Verdict global

Le code livré est **de bonne qualité et globalement prêt pour une V1**. L'architecture
(Supabase + Vercel Functions + front vanilla) est cohérente, la sécurité est sérieusement
traitée (RLS, CORS, rate-limit, validation, échappement HTML). Aucune réécriture complète
n'était justifiée. L'audit a porté sur la **mise au propre** et la correction de points précis.

---

## Points forts confirmés

- **Row Level Security** activé sur toutes les tables ; chaque cabinet est isolé (`cabinet_id = auth.uid()`).
- **Clé `service_role`** utilisée uniquement côté serveur, jamais exposée au navigateur.
- **Endpoints publics** (`/api/chat`, `/api/contact`) protégés : CORS par liste blanche, rate-limit par IP, validation stricte (UUID, longueurs, rôles).
- **Sortie du LLM assainie** : whitelist d'urgence, troncature des champs, idempotence de la demande par conversation.
- **Message patient sauvegardé avant l'appel au modèle** → aucun message perdu en cas de panne.
- **Front-end** : échappement systématique via `escapeHtml` avant insertion `innerHTML`.
- `contact_leads` en RLS sans policy → lisible uniquement par le `service_role`.

---

## Correctifs appliqués dans cette mise au propre

| # | Constat | Correctif |
|---|---------|-----------|
| 1 | Le dépôt ne contenait qu'un **zip imbriqué** : code non éditable / non déployable. | Projet extrait à la racine du dépôt ; zip supprimé. |
| 2 | **Duplication** des helpers (`escapeHtml`, `labelUrgence`, `labelStatut`, `formatRelativeTime`…) dans 4 fichiers JS. | Centralisés dans un module partagé `js/format.js`, importé partout. Import `apiFetch` inutilisé retiré de `dashboard.js`. |
| 3 | Fonctions Postgres `set_updated_at` / `bump_conversation_activity` sans `search_path` fixé (alerte sécurité du linter Supabase). | Ajout de `security definer` + `set search_path = ''`. |
| 4 | `docs/DEPLOIEMENT.md` indiquait d'ajouter le CORS « en V1.1 » alors qu'il est **déjà implémenté**. | Doc corrigée : on documente la variable `ALLOWED_ORIGINS`. |
| 5 | `index.html` était un placeholder « remplace ce fichier ». | Page d'accueil propre décrivant les **fonctionnalités réelles** (aucun tarif, chiffre ou témoignage inventé). |
| 6 | En-tête `Strict-Transport-Security` (HSTS) absent. | Ajouté dans `vercel.json`. |

---

## Points laissés tels quels (à décider, pas des bugs)

- **Couche API authentifiée partiellement inutilisée.** Le front interroge Supabase
  directement (avec RLS) pour la lecture et les mises à jour ; les routes
  `api/conversations.js`, `api/conversation.js` (GET), `api/cabinet.js` et la partie GET/PATCH
  de `api/demandes.js` constituent une alternative serveur **non appelée** par les pages actuelles.
  Elles ne sont pas dangereuses (elles vérifient le JWT et le `cabinet_id`) et peuvent servir
  d'API publique/mobile plus tard. → **À garder ou supprimer selon la feuille de route.**
- **`patient_email`** n'est jamais renseigné par le flux de chat (Claire ne demande que nom +
  téléphone). Le champ s'affiche donc toujours vide dans le détail d'une conversation. Comportement
  cohérent avec le périmètre actuel.
- **Interface patient (widget de chat)** : non incluse ici. D'après la doc, le chatbot vit sur
  la landing `claireassistante.fr` et appelle `/api/chat`. Aucun widget n'a été inventé.
- **Rate-limit en mémoire** : best-effort par instance serverless (déjà documenté dans le code).
  Suffisant pour une V1 ; à remplacer par un store partagé (Upstash/Redis) en cas de fort trafic.

---

## Améliorations conversion & mobile (livrées)

Ajoutées sans inventer de fonctionnalité : tout s'appuie sur ce qui existait déjà.

- **Démo interactive** sur `index.html` : le visiteur échange réellement avec Claire via
  l'endpoint `/api/chat` existant, sur un **cabinet de démo isolé** (`js/demo-chat.js`).
  Dégradation propre tant que l'UUID de démo n'est pas configuré.
- **Signaux de confiance véridiques** (hébergement Europe/RGPD, cloisonnement RLS, aucun
  diagnostic) — aucun chiffre, tarif ni témoignage fabriqué.
- **PWA installable** : `manifest.webmanifest`, `sw.js` (app shell + hors-ligne, **jamais** de
  cache sur `/api/*`), icônes générées, `js/pwa.js`. La V2 « App mobile (PWA) » de la roadmap
  est ainsi couverte.
- **Carte « ce que reçoit le cabinet »** sous la démo : nouvel endpoint `/api/demo-summary`
  restreint au seul cabinet de démo (`DEMO_CABINET_ID`) — montre la fiche qualifiée en conditions
  réelles, sans jamais pouvoir exposer de données réelles.
- **Formulaire « Réserver une démo »** branché sur l'endpoint `/api/contact` (qui existait déjà
  mais n'était utilisé nulle part) → capture des leads. `js/contact-form.js`.
- **Landing complète** : sections « Comment ça marche », fonctionnalités, confiance, FAQ
  (objections, sans prix inventé), pied de page avec liens légaux.
- **SEO & partage** : balises Open Graph + Twitter Card, données structurées JSON-LD, image de
  partage `icons/og-image.png` (1200×630), `robots.txt`, `sitemap.xml`, `canonical`.
- **Pages légales** : `mentions-legales.html` et `confidentialite.html` — exactes sur la stack
  réelle (hébergement Europe, sous-traitants Supabase/Vercel/Anthropic/n8n), avec champs d'identité
  marqués `[À COMPLÉTER]` (aucune donnée légale inventée).

## Recommandations pour la suite (non réalisées)

1. Ajouter un `package-lock.json` pour figer les versions.
2. Remplacer le rate-limit mémoire par un store partagé (Upstash/Redis) si le trafic augmente.
3. Tests automatisés sur la validation des endpoints publics.
4. Notifications push via la PWA (déjà dans la roadmap V2).
