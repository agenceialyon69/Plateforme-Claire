# HDS — le point à trancher avant tout cabinet pilote

> Ce document n'est PAS un avis juridique. Il prépare, en 5 minutes de lecture,
> la question à poser à un avocat spécialisé santé/numérique pour que la
> consultation soit efficace. C'est le **seul vrai bloqueur** du projet : il peut
> changer l'hébergeur, donc à trancher **avant** de démarcher des cabinets.

## Le problème en une phrase

Claire collecte, pour le compte de professionnels de santé, des informations
susceptibles d'être des **données de santé à caractère personnel**. En France,
l'hébergement de telles données par un tiers relève de la **certification HDS**
(Hébergeur de Données de Santé, art. L1111-8 du Code de la santé publique).
**Supabase et Vercel ne sont pas certifiés HDS.**

## Cartographie des données collectées

| Donnée | Où | Sensibilité |
|---|---|---|
| Nom, téléphone du patient | `conversations`, `demandes` | Donnée personnelle |
| Motif de la demande (« rage de dents », « couronne cassée »…) | `demandes.motif`, `messages` | **Potentiellement donnée de santé (art. 9 RGPD)** |
| Niveau d'urgence | `demandes.urgence` | Idem, par déduction |
| Numéro appelant + horodatage | `appels` | Donnée personnelle |
| Contenu des SMS | transit Twilio | Idem motif |

Le point sensible : **motif + urgence rattachés à une personne identifiée**, pour
un cabinet dentaire, constituent très probablement de la donnée de santé.

## La question exacte pour l'avocat

1. Les données collectées par Claire (motif + urgence + identité, pour un cabinet
   dentaire) sont-elles des « données de santé » imposant un **hébergement HDS** ?
2. Si oui, l'obligation pèse-t-elle sur **nous** (sous-traitant / éditeur) ou sur
   le cabinet (responsable de traitement) — et comment la contractualiser (DPA) ?
3. Une **réduction de périmètre** (ne stocker que « demande de rappel » sans motif
   médical détaillé) suffirait-elle à sortir du champ HDS ?
4. Quelles mentions/consentements ajouter côté patient (chat + SMS) ?

## Les options (à arbitrer avec l'avocat)

- **A. Migrer vers un hébergeur certifié HDS** (ex. OVHcloud, Scaleway, Clever
  Cloud — offres « Healthcare/HDS »). Impact technique : la base Postgres et les
  fonctions serverless changent d'hébergeur. Le code (Express-like/serverless,
  SQL, front) est **largement portable** ; le chantier est l'infra, pas la logique.
- **B. Réduire le périmètre des données** pour sortir du champ (ne pas persister le
  motif médical détaillé ; ne garder qu'un « rappel souhaité » + contact). Moins
  de valeur produit, mais déblocage rapide.
- **C. Rester en l'état** uniquement si l'avocat confirme par écrit que ce n'est
  pas requis dans ce cas précis — devient alors un **argument de vente**.

## Mitigations déjà en place (réduisent le risque, ne remplacent pas la décision)

- **Minimisation & rétention** : purge automatique quotidienne au-delà de la durée
  configurée (`api/cron/purge` + `purge_old_data`, défaut 24 mois).
- **Cloisonnement** : Row Level Security stricte, prouvée par `npm run redteam`
  (accès croisé + anonyme).
- **Chiffrement au repos** assuré par Supabase ; secrets côté serveur uniquement.
- **Droit à l'effacement** immédiat (`/api/erase` + bouton dans la fiche).
- **Sous-traitants documentés** (`docs/CONFORMITE-RGPD.md`), transfert hors-UE
  (Anthropic) déclaré dans `confidentialite.html`.

## Ce qu'il reste (côté humain, pas code)

1. Consultation avocat (les 4 questions ci-dessus).
2. Selon la réponse : migrer (option A) ou réduire le périmètre (option B).
3. Signer un **DPA** (accord de sous-traitance) avec chaque cabinet.
4. Compléter l'identité légale dans `confidentialite.html` (`[À COMPLÉTER]`).
