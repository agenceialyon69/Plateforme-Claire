# Activer le hook de démarrage de session (optionnel, dev only)

> ⚠️ **Sans impact sur le déploiement.** Ce hook ne sert qu'aux futures sessions
> **Claude Code on the web** : il installe les dépendances pour que `npm run check`
> tourne. Ta mise en ligne Vercel n'en dépend pas.
>
> Un assistant IA ne peut pas créer lui-même un hook qui s'exécute au démarrage
> (protection anti-persistance). Ces 2 fichiers sont donc à déposer **toi-même**.

## 1. `.claude/hooks/session-start.sh`

```bash
#!/bin/bash
set -euo pipefail
# Hook de démarrage (Claude Code on the web) — installe les dépendances
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
```

Puis rends-le exécutable :

```bash
chmod +x .claude/hooks/session-start.sh
```

## 2. `.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" } ] }
    ]
  }
}
```

## 3. Commit

```bash
git add .claude && git commit -m "Ajoute le hook de démarrage de session" && git push
```

Une fois mergé sur `main`, **toutes les futures sessions web** l'utiliseront.

---

**Mode synchrone** (celui ci-dessus) : la session attend la fin de `npm install` avant de
démarrer. Pros : dépendances garanties prêtes. Cons : démarrage un peu plus lent. Pour passer
en asynchrone (démarrage immédiat, installation en tâche de fond), remplace le corps du script par :

```bash
echo '{"async": true, "asyncTimeout": 300000}'
cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
```
