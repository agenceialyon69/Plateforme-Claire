# Conformité RGPD — registre & mesures

État factuel de la conformité **technique** (ce qui est dans le code). Les points
juridiques (identité du responsable, durée légale, HDS) restent à la charge du
responsable de traitement — voir `docs/HDS.md`.

## Registre des sous-traitants

| Sous-traitant | Rôle | Localisation | Point d'attention |
|---|---|---|---|
| **Supabase** | Base de données, authentification | UE | Chiffrement au repos ; **non HDS** (voir HDS.md) |
| **Vercel** | Hébergement application & fonctions | UE/Mondial (edge) | **Non HDS** |
| **Anthropic** | Traitement automatisé des messages du chat | **États-Unis** | Transfert hors-UE → clauses contractuelles types |
| **Twilio** | Appels & SMS (débordement téléphonique) | UE/US selon numéro | Transfert possible hors-UE ; DPA Twilio |
| **Make / n8n** | Acheminement des notifications (optionnel) | Selon config | Webhook signé (`X-Claire-Secret`) |

À faire (humain) : signer/collecter les **DPA** de chaque sous-traitant et tenir
ce registre à jour.

## Cartographie & durées de conservation

| Donnée | Table | Rétention |
|---|---|---|
| Conversations, messages | `conversations`, `messages` | Purge auto > `RETENTION_DAYS` (défaut 24 mois) |
| Demandes qualifiées | `demandes` | Idem (cascade) |
| Journal d'appels | `appels` | Purge auto > `RETENTION_DAYS` |
| Leads de contact | `contact_leads` | Purge auto > `RETENTION_DAYS` |
| Opt-out SMS | `sms_optout` | **Conservé** (obligation de ne plus recontacter) |

Mécanisme : `api/cron/purge` (cron quotidien Vercel, protégé par `CRON_SECRET`) →
fonction SQL `purge_old_data()` (plancher de sécurité : 30 jours).

## Droits des personnes — mise en œuvre

- **Effacement** : `/api/erase` + bouton « Supprimer (RGPD) » dans la fiche
  conversation (cascade messages + demande). Policies RLS `DELETE` en place.
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
