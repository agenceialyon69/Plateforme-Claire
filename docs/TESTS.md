# Scénarios de test manuels

`npm run check` ne vérifie que la syntaxe/la cohérence des fichiers. Voici les **scénarios à
dérouler à la main** avant chaque mise en ligne importante (aucun framework requis).

## 1. Flux patient complet (chat public)
1. Ouvrir la page d'accueil, écrire « J'ai très mal à une dent depuis hier soir ».
2. Répondre aux questions de Claire (nom, téléphone…).
3. **Attendu** : Claire reste bienveillante, ne pose **aucun diagnostic**, oriente vers le 15 si urgence vitale.
4. Après quelques échanges, la carte **« Reçu par le cabinet »** apparaît avec motif + urgence.
5. Côté espace cabinet : la conversation et la demande qualifiée sont bien présentes.

## 2. Urgence vitale
1. Écrire « saignement abondant qui ne s'arrête pas ».
2. **Attendu** : Claire invite explicitement à appeler le **15**, urgence marquée élevée.

## 3. Formulaire « Réserver une démo »
1. Envoyer le formulaire sans nom/email → message d'erreur clair.
2. Envoyer avec un email invalide → message d'erreur.
3. Envoyer un cas valide → message de confirmation ; le lead apparaît dans `contact_leads`.
4. Spammer le formulaire (>5 envois/min) → réponse 429 (rate-limit).

## 4. Espace cabinet — états vides
1. Se connecter avec un **cabinet sans données**.
2. **Attendu** : `cabinet.html` affiche des KPI à zéro sans planter ; `conversations`/`demandes`
   montrent des états vides explicites (pas d'écran blanc, pas d'erreur).

## 5. Espace cabinet — données réelles
1. Cabinet avec plusieurs conversations/demandes.
2. Vérifier : tri/filtre des demandes, badges d'urgence/statut corrects, détail conversation lisible,
   chargements (skeletons) et erreurs API affichés proprement.

## 6. Cloisonnement (sécurité)
1. Connecté en cabinet A, tenter d'ouvrir `/conversation.html?id=<id d'un cabinet B>`.
2. **Attendu** : aucune donnée du cabinet B (RLS + filtre `cabinet_id` côté API), redirection.

## 7. Authentification
1. Accéder à `/cabinet.html` **sans** session → redirection vers `/login.html`.
2. Se déconnecter → la session est bien invalidée.

## 8. PWA / mobile
1. Sur mobile, vérifier l'affichage responsive de la landing et de l'espace cabinet.
2. Installer l'app (Ajouter à l'écran d'accueil) → elle s'ouvre en plein écran.

## 9. Démo non configurée (dégradation)
1. Sans `DEMO_CABINET_ID` configuré : le widget de démo reste désactivé avec un message neutre,
   et la carte « Reçu par le cabinet » ne s'affiche pas (aucune erreur visible).
