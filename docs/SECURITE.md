# Sécurité — note red team & outils de vérification

Modèle de menace : le navigateur interroge Supabase **en direct** avec la clé `anon`
(publique). Les **RLS sont donc l'unique rempart** entre un attaquant et toutes les
données. Tout le reste découle de là.

## ✅ Confirmé solide (revue de code)

- `cabinets.id = auth.users.id` traité comme vérité unique **partout** (schéma, API, front, invitation).
- Toutes les API authentifiées filtrent par `auth.cabinet.id` (pas d'accès croisé via `/api/*`).
- `chat.js` revérifie que `conversationId` appartient au `cabinetId` avant d'écrire.
- Extraction LLM bien bornée : whitelist `urgence`, troncature des champs, `motif` obligatoire.
- `contact_leads` totalement verrouillée (RLS sans policy → service_role uniquement).

## ⚠️ Risques réels à garder en tête

1. **`cabinetId` est public** (embarqué dans le widget de chat). Quelqu'un qui le récupère
   peut spammer de fausses demandes / déclencher le webhook d'un cabinet ciblé. UUID v4 non
   énumérable, donc ciblé et non massif. → Mitiger via captcha (Turnstile) ou rate-limit par cabinet.
2. **Rate-limit en mémoire = par instance serverless** (`chat.js`, `contact.js`). Se réinitialise
   et ne tient pas contre un attaquant distribué. → Store partagé (Upstash) ou WAF/Turnstile.
3. **CORS ≠ anti-abus** : verrouiller `ALLOWED_ORIGINS` bloque les autres sites, mais pas un
   `curl` scripté. Utile, mais ne pas s'y fier seul.

## 🔧 Outils de vérification (à lancer avant tout pilote)

### 1. Audit de l'état RLS réel en prod
Copie `sql/audit-rls.sql` dans **Supabase → SQL Editor → Run**. Lecture seule.
Vérifie : `[2]` vide, `[4]` ne contient que `contact_leads`, `stats_cabinet` en `security_invoker=true`,
et `anon` sans INSERT/UPDATE/DELETE. (État attendu détaillé en bas du fichier SQL.)

### 2. Test d'intrusion accès croisé (2 cabinets)
Prouve qu'un cabinet ne peut ni lire ni modifier les données d'un autre.

```bash
# Pré-requis dans .env.local : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run redteam
```

Le script crée 2 cabinets de test, se connecte comme un client hostile (clé anon),
tente 12 attaques de lecture/écriture croisée, puis nettoie. `exit 0` = RLS étanche,
`exit 1` = fuite détectée. Option `--keep` pour conserver les comptes de test.

## 🎯 Liste de durcissement (par impact)

1. ✅ Lancer `audit-rls.sql` + `npm run redteam` → preuve d'étanchéité.
2. Anti-abus du chat public (Turnstile ou rate-limit par cabinet).
3. Verrouiller `ALLOWED_ORIGINS` (retirer `*`).
4. S'assurer que le webhook (n8n/Make) **rejette** les appels sans `X-Claire-Secret`
   et que `NOTIFY_WEBHOOK_SECRET` est défini côté Vercel.
