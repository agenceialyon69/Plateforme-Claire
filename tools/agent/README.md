# Agent de préparation CLAIRE

Assistant **local** qui **prépare** ton outreach et ta recherche d'emploi, s'auto-corrige
en **« red team »** (note /100), et te soumet le meilleur brouillon. Trois usages :

| Commande | Prépare… |
|---|---|
| `prospection.mjs` | objet + email + 2 relances + script d'appel, par cabinet |
| `linkedin.mjs` | posts LinkedIn (accroche, post, hashtags, 1er commentaire, créneau) |
| `emploi.mjs` | candidature adaptée à une offre (message recruteur, motivation, « pourquoi moi »…) |

## ⚠️ Les 3 règles non négociables (red team)

1. **Aucun envoi automatique.** L'agent écrit des brouillons dans `out/`. **Tu relis, tu envoies.**
   On ne candidate ni ne démarche jamais à ta place : une candidature générique grille ta réputation.
2. **LinkedIn ne se publie pas en auto** de façon fiable/légale sur un compte perso (API verrouillée,
   CGU → risque de bannissement). L'agent prépare ; tu **copies-colles** (10 s).
3. **Positionnement** : face à un **prospect**, jamais le mot « IA / chatbot / robot… » (garde-fou
   *déterministe* qui rejette la sortie). Face à un **recruteur** (`--audience recruteur`, et pour
   `emploi.mjs`), parler de tech/IA est **autorisé** car c'est un atout.

## Installation (2 min)

```bash
# 1) ta clé API (jamais commitée — elle va dans .env.local à la racine du repo)
echo 'ANTHROPIC_API_KEY=sk-ant-ta-vraie-cle' >> .env.local

# 2) ta config (offre RÉELLE, profil) et tes données
cp tools/agent/config.example.json        tools/agent/config.json
cp tools/agent/data/cabinets.example.json tools/agent/data/cabinets.json
cp tools/agent/data/sujets.example.json   tools/agent/data/sujets.json
cp tools/agent/data/offre.example.txt     tools/agent/data/offre.txt
# …puis édite config.json (⚠️ mets TES vrais prix) et remplis tes données.
```

> `config.json`, `out/` et tes vraies données sont **git-ignorés** (clé + emails de prospects = RGPD).

## Utilisation

```bash
# Tester la MÉCANIQUE sans clé ni coût (recommandé en premier) :
node tools/agent/prospection.mjs --dry
node tools/agent/linkedin.mjs --dry
node tools/agent/emploi.mjs --dry

# Pour de vrai (consomme des appels API) :
npm run agent:prospection
npm run agent:linkedin
npm run agent:emploi -- --offre tools/agent/data/offre.txt --poste "Monteur câbleur"

# Variantes :
node tools/agent/linkedin.mjs --sujet "Pourquoi un cabinet perd des patients au téléphone" --audience prospect
node tools/agent/linkedin.mjs --audience recruteur          # posts orientés recherche d'emploi
```

Les brouillons notés arrivent dans `tools/agent/out/{prospection,linkedin,emploi}/`.

## Comment marche l'auto-correction « red team »

Pour chaque livrable : **générer → critiquer (note /100 sur 6 critères) → réviser**, en boucle
jusqu'au seuil (`threshold`, défaut 88) ou `maxIters` passes (défaut 2). Réglable dans `config.json` → `moteur`.
Avant chaque critique, un **lint déterministe** corrige le lien et bloque tout mot interdit côté prospect.
Le `.md` final affiche le **score** et les **passes** (ex. `72 → 91`).

## Ce qui est prouvé vs à vérifier

- **Prouvé** (testable sans clé) : la plomberie — chargement config, boucle, garde-fous, écriture `.md`
  (`node … --dry`).
- **À vérifier par toi** (avec ta clé) : la **qualité réelle** des textes produits par le modèle.
  Lance une vraie passe sur 1 cabinet et juge le résultat avant d'industrialiser.
