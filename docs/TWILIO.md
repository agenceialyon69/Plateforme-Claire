# Débordement téléphonique — mise en service (Twilio)

Objectif : **plus aucun appel manqué perdu.** Quand un patient appelle et que
personne ne décroche, Claire lui envoie automatiquement un SMS avec un lien pour
laisser sa demande. Le patient décrit son besoin dans le chat, Claire qualifie,
et la demande arrive dans le tableau de bord du cabinet — comme un appel pris.

```
Appel patient ──▶ Numéro Claire (Twilio)
                    │
        ┌───────────┴─────────────┐
   secrétariat décroche      personne ne décroche (20 s)
        │                          │
   appel normal            SMS auto au patient ──▶ /chat?c=<cabinet>
                                                      │
                                              Claire qualifie ──▶ Demande au cabinet
```

## 1. Base de données

Dans **Supabase → SQL Editor**, (re)exécuter `sql/schema.sql`. Il ajoute, de
façon idempotente : les colonnes téléphonie sur `cabinets`, la table `appels`
(journal des appels) et `sms_optout` (numéros STOP), avec leurs RLS.

## 2. Compte Twilio

1. Créer un compte sur twilio.com et **acheter un numéro français** (Phone
   Numbers → Buy a number) capable **Voice + SMS**.
2. Récupérer `Account SID` et `Auth Token` (Console → Account Info).
3. Définir côté Vercel (Project → Settings → Environment Variables) :
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PUBLIC_URL` = l'URL publique du site (ex. `https://app.claireassistante.fr`)
   - `PUBLIC_SITE_URL` = idem (sert au lien du SMS) si pas déjà défini.

## 3. Rattacher le numéro au cabinet

Le numéro Twilio identifie le cabinet. Le renseigner dans la fiche cabinet
(colonne `numero_twilio`, au format `+33…`) :

```sql
update public.cabinets set numero_twilio = '+33XXXXXXXXX' where id = '<cabinet-uuid>';
```

Puis, côté cabinet, dans **Paramètres → Débordement téléphonique** :
- **Ligne à faire sonner** (`numero_reel`) : le secrétariat, au format `+33…`.
  → Claire fait d'abord sonner cette ligne ; SMS seulement si non décroché.
- Laisser vide pour le **mode « appels manqués seulement »** (voir §5, option B).

## 4. Configurer les webhooks Twilio

Sur le numéro (Phone Numbers → Manage → votre numéro) :

| Événement | Méthode | URL |
|---|---|---|
| Voice — *A call comes in* | **POST** | `https://<domaine>/api/twilio/voice` |
| Messaging — *A message comes in* | **POST** | `https://<domaine>/api/twilio/sms` |

Le callback de fin d'appel (`/api/twilio/voice-status`) et le statut de
livraison SMS (`/api/twilio/sms-status`) sont appelés automatiquement par le
code — rien à configurer.

## 5. Deux façons de brancher les appels

- **Option A — Claire reçoit tous les appels (recommandé).** Le cabinet publie /
  renvoie **son** numéro vers le numéro Twilio. Claire fait sonner le
  secrétariat (`numero_reel`) puis envoie le SMS si non décroché. Capture 100 %
  des appels + statistiques complètes.
- **Option B — sans changer de numéro.** Le cabinet active chez son opérateur le
  **renvoi conditionnel** (sur occupation / non-réponse) vers le numéro Twilio.
  Laisser `numero_reel` **vide** : seuls les appels non répondus arrivent, Claire
  envoie directement le SMS. Adoption la plus simple.

## 6. Sécurité & conformité (déjà implémentées)

- **Signature Twilio vérifiée** sur chaque webhook (`X-Twilio-Signature`), en
  **fail-closed** : une requête forgée ou non signée est refusée (403). Sans
  `TWILIO_AUTH_TOKEN`, les endpoints renvoient 503.
- **Anti-doublon** : un seul SMS par appelant sur une fenêtre de 10 min.
- **Opt-out STOP** : un patient qui répond STOP n'est plus jamais recontacté
  (table `sms_optout`) ; START le ré-abonne. Mention STOP ajoutée au SMS.
- **Journalisation** : chaque appel (reçu / répondu / manqué) et l'état du SMS
  (envoyé / livré / échoué / opt-out / doublon) sont tracés dans `appels`.

## 7. Tester

1. En local (`vercel dev`), mettre `TWILIO_SKIP_SIGNATURE=true` pour simuler des
   webhooks sans signature (**jamais en production**).
2. Appeler le numéro Twilio et ne pas décrocher → vérifier la réception du SMS.
3. Ouvrir le lien du SMS → le chat `/chat?c=<cabinet>` doit répondre et créer une
   demande dans le tableau de bord.
4. Répondre STOP au SMS → vérifier qu'un nouvel appel manqué n'envoie plus de SMS.

## 8. Coûts

Twilio facture le numéro (~1 €/mois), les minutes d'appel et les SMS (~0,08 €/SMS
en France, à vérifier). Le SMS n'est envoyé que sur appel **manqué** et une seule
fois par fenêtre de 10 min → coût borné. Prévoir un **plafond de dépense** dans
la console Twilio (Billing → Usage triggers).
