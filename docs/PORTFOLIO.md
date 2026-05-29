# Portfolio — projet Claire

Ce document rassemble des éléments **prêts à copier** pour valoriser Claire dans une candidature
(CV, LinkedIn, entretien). À adapter à ton expérience réelle ; ne rien exagérer.

> Pour la version publique « vitrine », voir la page **`/etude-de-cas.html`** du site (idéale à
> partager à un recruteur). Le dépôt de code reste **privé** — partage-le en lecture à la demande.

---

## Pitch en une phrase

> Claire est une assistante de réception en ligne pour cabinets dentaires : elle accueille les
> patients 24h/24, qualifie automatiquement leur demande avec un niveau d'urgence, et la transmet au
> cabinet. Conçue, développée et déployée de bout en bout.

## Pitch en un paragraphe

> J'ai conçu, développé et mis en production Claire, une assistante conversationnelle pour cabinets
> dentaires. Elle répond aux patients à toute heure, extrait un résumé qualifié de l'échange (motif,
> coordonnées, urgence) via l'API Anthropic, et le dépose dans un espace cabinet multi-tenant
> sécurisé. Stack : front vanilla + PWA, fonctions serverless (Vercel), Supabase (Postgres + Auth +
> Row Level Security), automatisation des notifications par webhook signé. J'ai porté le produit, le
> code, la base de données, la sécurité (validation des entrées, assainissement des sorties LLM, RLS,
> RGPD) et le déploiement.

---

## Puces CV (FR)

À placer sous une rubrique « Projet personnel » ou « Réalisations ».

- Conçu et déployé **Claire**, assistante IA de réception pour cabinets dentaires (web + PWA), de
  l'idée à la mise en production.
- Intégré l'**API Anthropic (Claude)** en production : génération des réponses + **extraction
  structurée** (JSON qualifié) avec validation et assainissement des sorties du modèle.
- Construit un back **serverless** (Vercel / Node.js) avec **Supabase** (Postgres + Auth) et
  **Row Level Security** pour un cloisonnement multi-tenant strict.
- Sécurisé les endpoints publics : CORS par liste blanche, rate-limit par IP, validation stricte,
  anti-injection de prompt, secrets côté serveur uniquement.
- Automatisé les notifications cabinet via **webhook signé** (Make / n8n / Zapier) ; mis en place une
  mesure de conversion **sans cookie** et une **CI** de contrôle.

## Entrée « Projet » LinkedIn (FR)

**Titre** : Claire — Assistante IA de réception pour cabinets dentaires
**Description** :
> Produit conçu, développé et déployé de bout en bout. Une assistante conversationnelle qui accueille
> les patients 24h/24, qualifie automatiquement leur demande (motif, coordonnées, urgence) via l'API
> Claude, et la transmet à un espace cabinet multi-tenant sécurisé.
>
> Stack : JS vanilla + PWA · Vercel (serverless) · Supabase (Postgres + Auth + RLS) · API Anthropic ·
> automatisation par webhook (Make). Sécurité : validation des entrées, assainissement des sorties
> LLM, Row Level Security, RGPD (hébergement Europe, analytics sans cookie).
>
> Étude de cas : [lien vers /etude-de-cas.html]

---

## Compétences mises en avant (mots-clés recruteurs)

`Intégration LLM` · `Anthropic / Claude API` · `Node.js` · `Serverless` · `Vercel` ·
`Supabase / PostgreSQL` · `Row Level Security` · `Sécurité applicative` · `RGPD` · `PWA` ·
`Automatisation (Make / n8n)` · `Produit de bout en bout`

## Points d'amélioration honnêtes (à travailler / mentionner si pertinent)

- **Anglais** : beaucoup d'offres remote tech/IA exigent l'anglais professionnel. Prévoir une version
  EN de l'étude de cas et progresser à l'oral est le levier #1 pour élargir le champ des postes.
- **Tests automatisés** : aujourd'hui CI légère + scénarios manuels ; ajouter des tests unitaires
  renforcerait le dossier.
- **Observabilité / store de rate-limit partagé** : prévus en V2 (cf. AUDIT.md).

## Questions d'entretien à préparer (et où sont les réponses)

| Question probable | Où c'est traité dans le code |
|-------------------|------------------------------|
| Comment tu sécurises un endpoint public ? | `api/chat.js` (CORS, rate-limit, validation) |
| Comment tu fais confiance à la sortie d'un LLM ? | `tryExtractSummary` dans `api/chat.js` (whitelist, troncature, idempotence) |
| Comment tu isoles les données entre clients ? | Row Level Security (`sql/schema.sql`), clé `service_role` serveur only |
| Comment tu évites de perdre un message si l'IA tombe ? | message patient sauvegardé avant l'appel modèle |
| Comment tu déploies / mesures ? | Vercel + analytics cookieless + `npm run check` en CI |
