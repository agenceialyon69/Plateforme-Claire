# Mettre en service un cabinet client — de A à Z

Canal cible : **téléphone (appel manqué → SMS) + chat hébergé**. Suivre dans
l'ordre. Compter ~30 min par cabinet une fois la plateforme déployée.

## Pré-requis (une seule fois, au niveau de la plateforme)

1. **Base** : exécuter `sql/schema.sql` dans Supabase → SQL Editor (idempotent).
2. **Variables Vercel** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `PUBLIC_SITE_URL`,
   `ALLOWED_ORIGINS` (verrouillé, pas `*`), `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_PUBLIC_URL`, `CRON_SECRET`, `ADMIN_EMAILS`.
3. **Vérifier** que tout est prêt :
   ```bash
   npm run preflight     # 0 bloquant attendu
   npm test              # 36 tests hors-ligne (logique + signature)
   ```
   Ne pas brancher de client tant que `preflight` affiche un bloquant.

## Par cabinet

### 1. Acheter + configurer un numéro Twilio (Voice + SMS, FR)
- Console Twilio → Buy a number → capacités Voice **et** SMS.
- Sur le numéro → Voice → *A call comes in* : `POST https://<domaine>/api/twilio/voice`
- Messaging → *A message comes in* : `POST https://<domaine>/api/twilio/sms`

### 2. Créer le compte cabinet + rattacher le numéro (une commande)
```bash
npm run create-admin -- \
  --email "cabinet@exemple.fr" --password "MotDePasseFort" \
  --nom "Cabinet du Dr X" --ville "Lyon" \
  --twilio "+33757XXXXXX"
```
(Ou inviter par email via l'espace admin → « Inviter un cabinet », puis renseigner
`numero_twilio` en base ou via ce script.)

### 3. Le cabinet finalise ses réglages
Connexion sur `/login.html` → la **checklist « Finaliser la configuration »**
s'affiche sur l'accueil tant que tout n'est pas prêt :
- Nom du cabinet
- Horaires d'ouverture
- Email de notification
- **Ligne à faire sonner** (secrétariat) dans *Paramètres → Débordement téléphonique*
- Numéro Claire attribué (vérifié via le script ci-dessus)

Quand la checklist disparaît → le cabinet est **100 % configuré**.

### 4. Brancher les appels (choisir une option)
- **Option A (recommandée)** : le cabinet renvoie **tous** ses appels vers le
  numéro Twilio ; Claire fait sonner le secrétariat puis envoie le SMS si non
  décroché. → laisser `numero_reel` rempli.
- **Option B (sans changer de numéro)** : le cabinet active le **renvoi
  conditionnel** (non-réponse/occupation) vers le numéro Twilio. → laisser
  `numero_reel` vide.

Détails : `docs/TWILIO.md`.

### 5. Test de bout en bout (le seul geste manuel irréductible)
1. Appeler le numéro du cabinet et **ne pas décrocher** (~25 s).
2. Vérifier la réception du **SMS** sur le mobile appelant.
3. Ouvrir le lien du SMS → le chat `/chat?c=...` répond.
4. Laisser nom + demande → une **demande** apparaît dans le dashboard cabinet.
5. La carte **« Appels rattrapés »** s'incrémente.
6. Répondre **STOP** au SMS → un nouvel appel manqué ne renvoie plus de SMS.

## Conformité — avant tout patient réel
- Trancher le **HDS** (`docs/HDS.md`) — bloqueur juridique.
- Compléter l'**identité légale** dans `confidentialite.html` (`[À COMPLÉTER]`).
- Fixer `RETENTION_DAYS` (défaut 730 = 24 mois) aligné avec la durée annoncée.
- Signer un **DPA** avec le cabinet (`docs/CONFORMITE-RGPD.md`).

## En cas de souci
- Webhooks Twilio en 403 → signature : vérifier `TWILIO_AUTH_TOKEN` et
  `TWILIO_PUBLIC_URL`. En 503 → Twilio non configuré (clés absentes).
- Pas de SMS → vérifier `numero_twilio` du cabinet (E.164), `sms_relance_actif`,
  et l'absence d'opt-out (`sms_optout`) pour ce numéro.
- Purge inactive → `CRON_SECRET` défini + cron Vercel actif (`vercel.json`).
