# Assistant de préparation (chat privé) — `/agent`

Chat **privé**, consultable au téléphone, déployé avec la plateforme sur Vercel.
Il maîtrise le projet Claire + ton CV, et t'aide pour : **prospection, LinkedIn,
entretiens d'embauche et entretiens clients**. Il s'auto-critique en **red team**
et **n'invente jamais** (ni prix, ni référence, ni chiffre).

## Pièces livrées
- `api/agent.js` — endpoint serverless **protégé par code d'accès** + **garde-fou d'hôte**, stateless.
- `agent.html` — l'interface chat mobile (route `/agent`).
- `middleware.js` — **cloisonnement** : l'atelier n'existe que sur le sous-domaine privé.
- Variables d'env : `AGENT_ACCESS_CODE` (le code), `AGENT_HOST` (le sous-domaine privé).

## Déploiement (4 étapes)

### 1. Le code d'accès (OBLIGATOIRE)
Sans lui, l'endpoint refuse tout (503). Génère un code long et aléatoire :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 2. Créer le sous-domaine privé
Choisis un sous-domaine **non deviné** et **non lié** depuis la vitrine, par ex.
`atelier.claireassistante.fr` (évite « agent », « admin »… trop évidents).
- Vercel → ton projet → **Settings → Domains → Add** → `atelier.claireassistante.fr`.
- Suis l'instruction DNS de Vercel (un enregistrement **CNAME** chez ton registrar).

### 3. Vercel → Settings → Environment Variables (Production + Preview)
- `AGENT_ACCESS_CODE` = le code de l'étape 1.
- `AGENT_HOST` = `atelier.claireassistante.fr` (exactement l'hôte, sans `https://`).
- Vérifie que `ALLOWED_ORIGINS` contient `https://atelier.claireassistante.fr`.
- (déjà présente : `ANTHROPIC_API_KEY`.)

### 4. Déployer
Fusionne cette branche dans `main` (Vercel déploie). Puis sur ton téléphone :
**`https://atelier.claireassistante.fr/agent`** → saisis le code (mémorisé ensuite)
→ « Ajouter à l'écran d'accueil ».

> Sur `app.claireassistante.fr/agent` (la vitrine) → **404** : l'atelier y est invisible.

## Sécurité — ce qui est en place (prouvé par le code)
- **Cloisonnement double** : `middleware.js` (matcher limité à 3 chemins) **+** garde-fou
  d'hôte dans l'API → l'atelier ne répond QUE sur `AGENT_HOST` ; ailleurs 404.
- **Fail-closed** : sans `AGENT_HOST`, l'atelier est fermé partout (404).
- **Code d'accès** comparé en **temps constant** (anti timing-attack) ; 401 si faux.
- **503** si `AGENT_ACCESS_CODE` absent (pas d'endpoint ouvert par accident).
- **Rate-limit par IP** (30 req/min) ; **plafonds** de taille de message/conversation.
- **Stateless** : aucune donnée stockée côté serveur (ta stratégie ne fuit pas).
- `/api/*` en `no-store` + `noindex` ; en-têtes de sécurité globaux (HSTS, X-Frame-Options DENY…).
- Sanitization des entrées + consigne anti-détournement dans le system prompt.

> ⚠️ **Honnêteté** : aucun système n'est « à l'abri de TOUTE faille ». Ces mesures réduisent
> fortement la surface d'attaque et sont *testables* (voir plus bas), mais la sécurité est un
> processus continu, pas un état définitif. La vraie protection de ta clé API = le code d'accès
> (garde-le secret) + le cloisonnement d'hôte.

## Limites à connaître (honnêteté)
- **« Mode affûté »** (case à cocher) = double passe red team : meilleure qualité,
  mais **~2× plus lent et 2× plus cher**. Décoché par défaut.
- Le code d'accès est un **secret partagé** : protège-le. Pour changer/révoquer,
  modifie `AGENT_ACCESS_CODE` dans Vercel (toutes les sessions devront le ressaisir).
- L'historique de conversation reste **sur ton téléphone** (localStorage), pas en ligne.

## À vérifier toi-même après déploiement
```bash
# 1) Sur la VITRINE, l'atelier doit être INVISIBLE → doit répondre 404 :
curl -s -o /dev/null -w "%{http_code}\n" https://app.claireassistante.fr/agent
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.claireassistante.fr/api/agent \
  -H 'content-type: application/json' -H 'x-agent-code: x' \
  --data '{"messages":[{"role":"user","content":"test"}]}'

# 2) Sur le SOUS-DOMAINE privé, un mauvais code doit répondre 401 :
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://atelier.claireassistante.fr/api/agent \
  -H 'content-type: application/json' -H 'x-agent-code: mauvais' \
  --data '{"messages":[{"role":"user","content":"test"}]}'
```
Attendu : `404`, `404`, puis `401`. Si tu obtiens autre chose, ne t'en sers pas et préviens-moi.
