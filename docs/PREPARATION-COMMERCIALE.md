# Préparation commerciale — état des lieux et points bloquants (18/11/2026)

> Ce document résume ce que disent les **sources officielles** (liens ci-dessous) et ce qui reste
> à décider. Ce n'est **pas un avis juridique**. Tout point marqué « à vérifier » doit l'être.

## 1. Mentions légales — les 6 champs « À COMPLÉTER »

Les champs sont dans `mentions-legales.html` (5) et `confidentialite.html` (1). Ce sont des
**faits propres à l'éditeur** : ils ne peuvent pas être déduits ni inventés.

Pour un **entrepreneur individuel / micro-entrepreneur**, la loi (LCEN, art. 1-1) demande :

| Champ du site | Quoi mettre (entrepreneur individuel) |
|---|---|
| Raison sociale (mentions + confidentialité) | Prénom NOM + mention « entrepreneur individuel » ou « EI » |
| Forme juridique | Entreprise individuelle (micro-entreprise si option choisie) |
| SIREN / SIRET | Numéro reçu à l'immatriculation (guichet des formalités des entreprises) |
| Adresse | Adresse de domiciliation de l'entreprise (la loi dit « domicile ») |
| Directeur de la publication | L'entrepreneur lui-même (nom et prénom) |

Pour une **société** (SAS, SARL…) : dénomination, forme, capital, siège, représentant légal.

À savoir (sources officielles) :
- Ne pas publier ces mentions est puni (jusqu'à 75 000 € pour une entreprise individuelle).
- Le droit à l'anonymat existe seulement pour un site **non professionnel** : pas le cas ici.
- Un entrepreneur individuel n'a aucune formalité de capital ni d'annonce légale, seulement
  l'immatriculation et le choix de la domiciliation.
- Un ressortissant hors UE doit avoir un titre de séjour qui **autorise l'exercice d'une activité
  non salariée** : **à vérifier sur la carte** (mention) ou auprès de la préfecture.

**Bloquant tant que : l'entreprise n'est pas immatriculée.** Sans SIREN, impossible de remplir
honnêtement ces champs, et vendre sans être immatriculé n'est pas possible.

### 1 bis. Obtenir un SIREN (entreprise individuelle / micro-entreprise)

Sources officielles (Service-Public Entreprendre, INPI, économie.gouv.fr) :

1. **Vérifier d'abord le titre de séjour.** Un étranger hors UE résidant en France doit avoir un titre qui
   **autorise une activité non salariée**. Selon les sources consultées : les titres « vie privée et
   familiale » (au-delà de la première année), « carte de résident » et « résident longue durée UE » le
   permettent ; les titres « étudiant » et « salarié » **ne suffisent pas** (changement de statut vers
   « entrepreneur / profession libérale » nécessaire, avec un dossier de viabilité). L'inscription en ligne
   peut aboutir même si le titre ne le permet pas, et le problème apparaît au renouvellement.
   **À vérifier sur la carte, ou en préfecture, AVANT de s'immatriculer.**
2. **Cumul avec un emploi salarié** (économie.gouv.fr) : possible si le contrat n'a pas de clause
   d'exclusivité, si l'activité ne concurrence pas l'employeur, et si elle est exercée hors heures de travail.
3. **Immatriculation** : en ligne sur le guichet des formalités des entreprises (INPI), **gratuite** pour
   une micro-entreprise libérale/commerciale. Pièces : pièce d'identité, justificatif de domiciliation,
   déclaration sur l'honneur de non-condamnation, attestation de filiation. Un récépissé « en attente
   d'immatriculation » est délivré, puis le SIREN.
4. **Adresse** : obligatoire et **rendue publique** (registre national des entreprises). Possibilités :
   domicile, domiciliation, coworking. L'anonymisation des données personnelles est possible depuis le
   guichet unique (INPI, depuis le 22/08/2025) — à vérifier.

## 2. Données de santé (HDS) — ce que disent les sources

Source : Agence du Numérique en Santé (ANS), FAQ mise à jour en 2026.

- L'obligation de certificat HDS vise toute entité qui **héberge des données de santé recueillies
  à l'occasion de soins, pour le compte des professionnels de santé**. Les conditions sont cumulatives.
- **La pseudonymisation ne supprime pas l'obligation.**
- La co-responsabilité de traitement ne supprime pas non plus l'obligation.
- L'ANS précise que chaque projet doit s'interroger **au cas par cas**.

**Ce que je ne peux pas trancher :** si le mode actuel de Claire (sans conservation des messages
ni du motif médical, mais avec nom, téléphone, niveau d'urgence et lien avec un cabinet dentaire)
entre ou non dans ce champ. Je n'ai pas de réponse officielle pour ce cas précis. **Ne jamais
affirmer « conforme HDS » ni « hors HDS » sans avis écrit.**

Pistes **gratuites ou peu coûteuses** pour obtenir un avis (à vérifier) :
- Question écrite à l'ANS (esante.gouv.fr) et/ou à la CNIL, en décrivant précisément quelles données sont stockées.
- Consultation d'avocat gratuite : points-justice, mairie, ou maison de justice et du droit de Lyon.
- Demander à un cabinet pilote ce que son propre DPO/informaticien exige.

## 3. Moteur conversationnel et coût

- Cabinets réels : fournisseurs de `LLM_PROVIDERS_REAL` uniquement (défaut `anthropic`, payant).
  Sans clé valide, le chat des vrais cabinets échoue volontairement (fail-closed).
- **Contournement honnête sans payer :** un **pilote en mode démonstration** (cabinet de démo,
  données fictives, cascade gratuite tolérée) permet de montrer le produit sans vrais patients.
  À annoncer clairement au cabinet. Le vrai déploiement attend une clé payante.

## 4. Check-list « prêt à vendre »

- [ ] Entreprise immatriculée (SIREN) — titre de séjour compatible (à vérifier)
- [ ] 6 champs légaux remplis avec les vraies informations
- [ ] Migration E1 appliquée dans Supabase (confirmation requise de l'utilisateur)
- [ ] Avis écrit sur HDS obtenu (ANS / CNIL / avocat)
- [ ] Pilote en démonstration proposé tant que la clé payante n'existe pas
- [ ] `npm run redteam` repassé après E1 (nécessite `.env.local`)

## Sources officielles consultées
- ANS, FAQ HDS : https://esante.gouv.fr/faq (pages « HDS — Certification Hébergeur de Données de Santé »)
- Service-Public Entreprendre, mentions obligatoires : https://entreprendre.service-public.gouv.fr/vosdroits/F37351
- Service-Public Entreprendre, étranger créant une entreprise : https://entreprendre.service-public.gouv.fr/vosdroits/F22494
- Bpifrance Création, mentions légales : https://bpifrance-creation.fr/encyclopedie/vendre-ligne/obligations-juridiques-reglementaires/mentions-legales-dun-site
