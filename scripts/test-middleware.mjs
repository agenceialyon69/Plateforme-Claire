#!/usr/bin/env node
// ================================================================
// test-middleware.mjs — Preuve hors-ligne du cloisonnement (middleware.js)
// ----------------------------------------------------------------
//   - les fichiers internes répondent 404 (docs, sql, .md, vercel.json...)
//   - l'atelier privé reste fermé hors AGENT_HOST (et sans AGENT_HOST)
//   - la vitrine n'est JAMAIS interceptée (matcher précis, pas de joker global)
//   - .vercelignore n'exclut rien de ce dont le site a besoin
//   npm run test:middleware
// ================================================================

import { readFileSync } from 'node:fs';

process.env.AGENT_HOST = 'atelier.exemple.fr';
const { default: middleware, config } = await import('../middleware.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };
const req = (path, host = 'claireassistante.fr') =>
  new Request(`https://${host}${path}`, { headers: { host } });
const status = (r) => (r && r.status) || 0;

// 1. Fichiers internes → 404
for (const p of ['/docs/cv.html', '/docs/SECURITE.md', '/sql/schema.sql', '/scripts/check.mjs', '/tools/agent/config.example.json',
  '/.github/workflows/keepalive.yml', '/CLAUDE.md', '/AUDIT.md', '/README.md', '/MISE-EN-LIGNE.md',
  '/package.json', '/package-lock.json', '/vercel.json', '/.env.example']) {
  ok(status(middleware(req(p))) === 404, `fichier interne ${p} → 404`);
}

// 2. Atelier privé
ok(status(middleware(req('/agent'))) === 404, '/agent sur la vitrine → 404');
ok(status(middleware(req('/api/agent'))) === 404, '/api/agent sur la vitrine → 404');
ok(status(middleware(req('/agent', 'atelier.exemple.fr'))) !== 404, '/agent sur AGENT_HOST → laissé passer');
delete process.env.AGENT_HOST;
ok(status(middleware(req('/agent', 'atelier.exemple.fr'))) === 404, 'sans AGENT_HOST → atelier fermé (fail-closed)');

// 3. Le matcher ne couvre PAS la vitrine
const matcher = config.matcher;
const bad = matcher.filter(m => m === '/' || m === '/:path*' || m.includes('(.*)') || m === '/api/:path*');
ok(bad.length === 0, `aucun joker global dans le matcher (${bad.join(', ') || 'ok'})`);
for (const required of ['/docs/:path*', '/sql/:path*', '/CLAUDE.md', '/AUDIT.md', '/vercel.json', '/agent', '/api/agent']) {
  ok(matcher.includes(required), `matcher contient ${required}`);
}

// 4. .vercelignore : exclut l'interne, jamais le nécessaire
const lines = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
for (const must of ['docs/', 'sql/', 'scripts/', 'tools/', '.github/', '*.md']) {
  ok(lines.includes(must), `.vercelignore exclut ${must}`);
}
const FORBIDDEN_TO_IGNORE = ['package.json', 'package-lock.json', 'api/', 'js/', 'css/', 'icons/', 'middleware.js', 'sw.js',
  '*.html', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', '*', '*.js', '*.json'];
for (const bad of FORBIDDEN_TO_IGNORE) {
  ok(!lines.includes(bad), `.vercelignore n'exclut PAS ${bad} (nécessaire au site)`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
