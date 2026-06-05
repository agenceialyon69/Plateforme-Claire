# Assistant de préparation (chat privé) — `/agent`

Chat **privé**, consultable au téléphone, déployé avec la plateforme sur Vercel.
Il maîtrise le projet Claire + ton CV, et t'aide pour : **prospection, LinkedIn,
entretiens d'embauche et entretiens clients**. Il s'auto-critique en **red team**
et **n'invente jamais** (ni prix, ni référence, ni chiffre).

## Pièces livrées
- `api/agent.js` — endpoint serverless **protégé par code d'accès**, stateless (rien stocké).
- `agent.html` — l'interface chat mobile (route propre : `/agent`).
- Variable d'env `AGENT_ACCESS_CODE` — le code qui protège l'accès.

## Déploiement (3 étapes)

### 1. Le code d'accès (OBLIGATOIRE)
Sans lui, l'endpoint refuse tout (503) — c'est volontaire : un chat ouvert = ta clé
API exposée au monde entier. Génère un code long et aléatoire, par ex. :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 2. Vercel → Settings → Environment Variables
Ajoute (Production + Preview) :
- `AGENT_ACCESS_CODE` = le code généré à l'étape 1.
- (déjà présentes : `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`.)

> Pour que le navigateur soit autorisé, `ALLOWED_ORIGINS` doit inclure ton domaine,
> ex. `https://app.claireassistante.fr`. (Même origine que la page : pas de souci CORS.)

### 3. Déployer
Fusionne cette branche dans `main` (Vercel déploie). Puis ouvre
**`https://app.claireassistante.fr/agent`** sur ton téléphone, saisis le code
(mémorisé ensuite), et « Ajouter à l'écran d'accueil » pour l'avoir comme une app.

## Sécurité — ce qui est en place (prouvé par le code)
- **Code d'accès** comparé en **temps constant** (anti timing-attack) ; 401 si faux.
- **503** si `AGENT_ACCESS_CODE` n'est pas défini (pas d'endpoint ouvert par accident).
- **Rate-limit par IP** (30 req/min) ; **plafonds** de taille de message/conversation.
- **Stateless** : aucune donnée stockée côté serveur (ta stratégie ne fuit pas).
- `/api/*` déjà en `no-store` + `noindex` (cf. `vercel.json`).
- Sanitization des entrées + consigne anti-détournement dans le system prompt.

## Limites à connaître (honnêteté)
- **« Mode affûté »** (case à cocher) = double passe red team : meilleure qualité,
  mais **~2× plus lent et 2× plus cher**. Décoché par défaut.
- Le code d'accès est un **secret partagé** : protège-le. Pour changer/révoquer,
  modifie `AGENT_ACCESS_CODE` dans Vercel (toutes les sessions devront le ressaisir).
- L'historique de conversation reste **sur ton téléphone** (localStorage), pas en ligne.

## À vérifier toi-même après déploiement
```bash
# Doit répondre 401 (code refusé) — preuve que la protection est active :
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.claireassistante.fr/api/agent \
  -H 'content-type: application/json' -H 'x-agent-code: mauvais' \
  --data '{"messages":[{"role":"user","content":"test"}]}'
```
