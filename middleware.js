import { next } from '@vercel/edge';

// ================================================================
// middleware.js — Cloisonnement (Edge Middleware)
// ----------------------------------------------------------------
// 1) FICHIERS INTERNES : docs/, sql/, scripts/, tools/, .github/ et les
//    .md / package.json / vercel.json de la racine ne doivent jamais être
//    servis. Le dépôt est public et Vercel sert tout fichier statique
//    déployé : sans cette barrière, /CLAUDE.md, /AUDIT.md (liste de
//    faiblesses) ou un ancien /docs/cv.html étaient lisibles par tous.
//    Défense en profondeur avec .vercelignore (qui retire ces fichiers du
//    déploiement) : ici on répond 404 même s'ils y restaient.
// 2) ATELIER PRIVÉ : l'assistant de préparation (/agent, /agent.html,
//    /api/agent) n'existe QUE sur le sous-domaine privé AGENT_HOST.
//    Ailleurs → 404 (invisible côté client).
//
// SÉCURITÉ :
// - `matcher` liste des chemins PRÉCIS : le middleware ne s'exécute jamais
//   pour la vitrine (/, pages .html, /js, /css, /api/chat...) → aucun
//   risque de la casser ni de la ralentir.
// - Fail-closed : sans AGENT_HOST, l'atelier est fermé (404) partout.
// ================================================================

export const config = {
  matcher: [
    // atelier privé
    '/agent', '/agent.html', '/api/agent',
    // fichiers internes
    '/docs/:path*', '/sql/:path*', '/scripts/:path*', '/tools/:path*', '/.github/:path*',
    '/CLAUDE.md', '/AUDIT.md', '/README.md', '/MISE-EN-LIGNE.md',
    '/package.json', '/package-lock.json', '/vercel.json', '/.env.example',
  ],
};

const AGENT_PATHS = new Set(['/agent', '/agent.html', '/api/agent']);

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
  });
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);

  // Tout chemin intercepté qui n'est pas l'atelier est un fichier interne → 404.
  if (!AGENT_PATHS.has(pathname)) return notFound();

  const host = (request.headers.get('host') || '').toLowerCase();
  const agentHost = (process.env.AGENT_HOST || '').toLowerCase();
  if (!agentHost || host !== agentHost) return notFound();
  return next();
}
