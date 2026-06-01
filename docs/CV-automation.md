<!--
  CV orienté "Automatisation / No-code / IA builder".
  RÈGLE : tout ce qui est écrit ici doit être DÉFENDABLE en entretien.
  - Les sections "Projet phare" et "Compétences" sont rédigées à partir du CODE RÉEL de Claire (vérifié).
  - Les champs 〔À COMPLÉTER〕 ne sont connus que de toi : remplis-les, ne laisse rien d'inventé.
  - Ici, le mot "IA" est AUTORISÉ et attendu (CV pour recruteurs tech) — c'est l'inverse de la
    communication client de Claire, où "IA" est proscrit.
-->

# 〔PRÉNOM NOM〕

**Concepteur d'automatisations & d'outils métier** — No-code · Automatisation · Intégration IA

📍 Lyon 〔+ mobilité : à préciser〕 · 📧 〔email pro〕 · 📱 〔téléphone〕
🔗 〔LinkedIn〕 · 💻 〔GitHub〕 · 🌐 Démo live : **app.claireassistante.fr** · Étude de cas : app.claireassistante.fr/etude-de-cas.html

---

## Profil

Technicien de formation devenu **concepteur d'outils web automatisés**. J'ai conçu, développé et
**déployé seul, de bout en bout**, une plateforme de réception et de suivi des demandes clients
(web + application installable), intégrant un moteur conversationnel, une base de données sécurisée
et l'automatisation des notifications. J'automatise les tâches répétitives — accueil, qualification,
relances — du besoin métier jusqu'à la mise en production. Rigueur issue d'un environnement
〔industriel / médical — à préciser, ex. ISO 13485〕, autonomie complète, curiosité technologique.

---

## Compétences techniques
<!-- Ci-dessous : UNIQUEMENT ce qui est réellement présent dans le projet Claire (vérifié dans le code). -->

| Domaine | Outils / technologies |
|---|---|
| **Automatisation / No-code** | Webhooks signés (Make / n8n / Zapier), orchestration d'événements, intégrations API |
| **Intégration IA / LLM** | API Anthropic (Claude), prompt engineering, extraction structurée JSON, garde-fous anti-injection |
| **Back-end / Serverless** | Node.js, fonctions serverless Vercel, conception d'API REST |
| **Base de données & Auth** | Supabase (PostgreSQL), authentification, **Row Level Security** (multi-tenant) |
| **Front-end** | HTML5 / CSS3 / JavaScript (ES6+), **PWA** (service worker, mode hors-ligne, installable) |
| **Sécurité applicative** | RLS, validation des entrées, assainissement des sorties, CORS (liste blanche), rate-limiting, RGPD |
| **Outils & méthode** | Git / GitHub, CI (GitHub Actions), déploiement continu (Vercel), SQL |

> 〔Si tu as utilisé d'autres outils dans D'AUTRES projets (Stripe, Voiceflow, Airtable, Notion…),
> ajoute-les ici — mais seulement si tu peux en parler en entretien. Ils ne sont PAS dans Claire.〕

---

## Projet phare

### Claire — Plateforme de réception & de suivi des demandes clients
*Projet personnel · conçu, développé et déployé de bout en bout · 〔période : MM/AAAA → MM/AAAA ou « en cours »〕*
🌐 Démo : app.claireassistante.fr · Étude de cas publique : /etude-de-cas.html

Plateforme web (et application installable) qui **accueille les demandes 24h/24, les qualifie
automatiquement** (motif, coordonnées, niveau d'urgence) et les **transmet à un espace professionnel
sécurisé**, avec **notification automatique** du cabinet.

- **Conçu et déployé de A à Z** : interface, API serverless, base de données, sécurité et mise en production.
- **Intégré l'API Anthropic (Claude)** en production avec une **stratégie à deux modèles** : un pour la
  conversation, un pour l'**extraction structurée** (résumé qualifié en JSON), avec validation et
  assainissement systématiques des sorties du modèle.
- **Architecture multi-tenant cloisonnée** via **Row Level Security** (PostgreSQL / Supabase) :
  chaque compte ne voit que ses propres données.
- **Sécurisé les points d'entrée publics** : CORS par liste blanche, rate-limiting par IP, validation
  stricte des entrées, défense anti-injection de prompt, secrets confinés côté serveur.
- **Automatisé les notifications** par **webhook signé** (compatible Make / n8n / Zapier) à chaque
  nouvelle demande qualifiée.
- **PWA installable** : service worker, fonctionnement hors-ligne, stratégie de cache différenciée.
- **Mis en place une CI** (GitHub Actions) et un **test de sécurité automatisé** vérifiant l'absence
  de fuite de données entre comptes (test d'accès croisé « red team »).

**Stack** : JavaScript vanilla · PWA · Node.js · Serverless (Vercel) · Supabase (PostgreSQL + Auth +
RLS) · API Anthropic · Webhook (Make / n8n) · GitHub Actions (CI).

---

## Expérience professionnelle
<!-- À COMPLÉTER avec tes vrais postes — du plus récent au plus ancien. Ne rien inventer. -->

### 〔Intitulé du poste〕 — 〔Entreprise〕, 〔Ville〕
*〔MM/AAAA – MM/AAAA〕*
- 〔Tâche / responsabilité réelle 1〕
- 〔Tâche / responsabilité réelle 2〕
- 〔Résultat concret si tu en as un (chiffre, livrable)〕

### 〔Intitulé du poste〕 — 〔Entreprise〕, 〔Ville〕
*〔MM/AAAA – MM/AAAA〕*
- 〔…〕

### 〔Intitulé du poste / intérim / stage〕 — 〔Entreprise〕, 〔Ville〕
*〔MM/AAAA – MM/AAAA〕*
- 〔…〕

---

## Formation

### 〔Diplôme / titre〕 — 〔Établissement〕, 〔Ville〕
*〔Année〕* 〔préciser si obtenu / en cours / non obtenu〕

### 〔Diplôme / certification / formation en ligne〕 — 〔Organisme〕
*〔Année〕*

---

## Langues
<!-- Sois honnête sur le niveau réel : un recruteur teste vite. -->
- **Français** : langue maternelle
- **Anglais** : 〔niveau réel — ex. « lu technique : bon ; oral : à renforcer »〕

> *Note (interne, à supprimer du CV final) : l'anglais est le levier #1 pour élargir le champ des postes
> remote en tech/IA. Une version anglaise de l'étude de cas Claire serait un plus.*

---

## Atouts
- Autonomie complète : du besoin métier à la mise en production.
- Rigueur et méthode 〔issues du secteur industriel / médical — à préciser〕.
- Capacité d'auto-apprentissage rapide (stack acquise en autodidacte sur un projet réel).
- 〔Autres soft skills réels : à compléter〕

<!--
=====================================================================
  CHECKLIST À COMPLÉTER (puis supprimer ce bloc) :
  [ ] Identité + contact + liens (LinkedIn, GitHub, portfolio)
  [ ] Période exacte du projet Claire (et : clients/tests réels ? sinon « projet personnel »)
  [ ] Expériences pro : intitulés, entreprises, dates, 2-3 tâches chacune
  [ ] Formation : diplômes, établissements, années, obtenu/en cours
  [ ] Contexte ISO 13485 / médical : quel poste précisément ?
  [ ] Niveau d'anglais réel
  [ ] Outils maîtrisés dans D'AUTRES projets (Stripe, Voiceflow…) — uniquement si défendables
  [ ] Mobilité géographique / permis / dispo
=====================================================================
-->
