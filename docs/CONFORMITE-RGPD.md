# Conformité RGPD — registre & mesures

État factuel de la conformité **technique** (ce qui est dans le code). Les points
juridiques (identité du responsable, durée légale, HDS) restent à la charge du
responsable de traitement — voir `docs/HDS.md`.

## Registre des sous-traitants

| Sous-traitant | Rôle | Localisation | Point d'attention |
|---|---|---|---|
| **Supabase** | Base de données, authentification | UE | Chiffrement au repos ; **non HDS** (voir HDS.md) |
| **Vercel** | Hébergement application & fonctions | Fonctions en `fra1` (Francfort) via `vercel.json` ; diffusion (CDN) mondiale | **Non HDS**. À vérifier après chaque déploiement : région du déploiement = `fra1` (avant le correctif de novembre 2026, les fonctions tournaient en `iad1`, États-Unis). Offre « Hobby » = usage non commercial : passer en offre payante avant le premier client |
| **Anthropic** | Traitement automatisé des messages du chat — **cabinets réels** | **États-Unis** | Offre **payante** : DPA à signer, vérifier l'absence d'entraînement sur les données. Transfert hors-UE → clauses contractuelles types |
| **Groq**, **Google (Gemini)** | Traitement automatisé des messages — **cabinet de DÉMO uniquement** | **États-Unis** | Offres **gratuites** : leurs conditions peuvent autoriser la réutilisation des messages. **Jamais utilisées pour un cabinet réel** (voir ci-dessous) |
| **Twilio** | Appels & SMS (débordement téléphonique) | UE/US selon numéro | Transfert possible hors-UE ; DPA Twilio |
| **Make / n8n** | Acheminement des notifications (optionnel) | Selon config | Webhook signé (`X-Claire-Secret`) |

À faire (humain) : signer/collecter les **DPA** de chaque sous-traitant et tenir
ce registre à jour.

## Politique des fournisseurs de modèle de langage (audit du 2026-11-16)

Constat : la cascade historique Groq → Gemini → Anthropic envoyait aussi les messages
de patients vers des offres **gratuites** dont les conditions peuvent autoriser la
réutilisation des données. Correctif (`api/_llm.js`, `api/chat.js`, prouvé par
`npm run test:llm` et `npm run test:chat`) :

- **Cabinet de démo** (`DEMO_CABINET_ID`, aucun vrai patient) : cascade complète.
- **Cabinets réels** : uniquement les fournisseurs listés dans `LLM_PROVIDERS_REAL`
  (défaut : `anthropic`, offre payante). **Fail-closed** : si aucun fournisseur autorisé n'est
  configuré, le chat échoue (le patient en urgence reçoit tout de même la consigne 15/112)
  au lieu de basculer en silence sur une offre gratuite.
- Si `DEMO_CABINET_ID` n'est pas défini, **tous** les cabinets sont traités comme réels.

## Minimisation (posture "prise de contact") — ON par défaut

`MINIMIZE_HEALTH_DATA=true` (défaut) : la plateforme **ne persiste pas** le
contenu médical. Concrètement :

| En mode minimisation | Stocké en base | Transmis au cabinet (webhook) |
|---|---|---|
| Contenu des messages du chat | ❌ non stocké | ✅ (détail dans le fil, transitoire) |
| Motif médical détaillé / souhait | ❌ (remplacé par « Demande de rappel ») | ✅ dans `demande` du webhook |
| Nom, téléphone, urgence, demande de rappel | ✅ | ✅ |

→ La base ne contient alors que de la **donnée de contact ordinaire**, pas de la
donnée de santé détaillée. Le détail vit chez le cabinet (responsable de
traitement, déjà habilité). **Nécessite un webhook configuré** (`NOTIFY_WEBHOOK_URL`)
pour délivrer le détail. Le cabinet de démo est exempté (démonstration).
Repasser à `false` uniquement après validation avocat/DPO.

## Cartographie & durées de conservation

| Donnée | Table | Rétention |
|---|---|---|
| Conversations (messages non stockés si minimisation) | `conversations`, `messages` | Purge auto > `RETENTION_DAYS` (défaut 24 mois) |
| Demandes (minimales si minimisation) | `demandes` | Idem (cascade) |
| Journal d'appels | `appels` | Purge auto > `RETENTION_DAYS` |
| Leads de contact | `contact_leads` | Purge auto > `RETENTION_DAYS` |
| Opt-out SMS | `sms_optout` | **Conservé** (obligation de ne plus recontacter) |

Mécanisme : `api/cron/purge` (cron quotidien Vercel, protégé par `CRON_SECRET`) →
fonction SQL `purge_old_data()` (plancher de sécurité : 30 jours).

## Droits des personnes — mise en œuvre

- **Effacement** : `/api/erase` + bouton « Supprimer (RGPD) » dans la fiche
  conversation (cascade messages + demande **+ appel manqué lié**, s'il existe —
  la table `appels` n'est pas couverte par la cascade DB, elle est effacée
  explicitement par l'endpoint). Policies RLS `DELETE` en place.
- **Opt-out SMS** : réponse « STOP » → plus aucun SMS (table `sms_optout`) ;
  « START » réactive. Mention STOP ajoutée au SMS.
- **Information** : `confidentialite.html` (finalités, sous-traitants, transfert
  hors-UE, durées, purge). ⚠️ Champs d'identité `[À COMPLÉTER]` par le responsable.

## Sécurité (résumé technique, prouvé par les tests)

- RLS stricte sur toutes les tables — `npm run redteam` (accès croisé + anonyme).
- Signature Twilio validée fail-closed — `npm run test:twilio` (10 tests).
- CSP, HSTS, anti-clickjacking — `vercel.json`.
- Secrets serveur uniquement ; `service_role` jamais exposé au client.

## Ce qui reste (humain, non code)

1. Trancher le **HDS** (`docs/HDS.md`) — bloqueur.
2. Compléter l'**identité légale** dans `confidentialite.html`.
3. Fixer la **durée légale** de conservation (aligner `RETENTION_DAYS`).
4. Collecter les **DPA** des sous-traitants.
