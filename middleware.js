import { next } from '@vercel/edge';

// ================================================================
// middleware.js — Cloisonnement de l'atelier privé (Edge Middleware)
// ----------------------------------------------------------------
// L'assistant de préparation (/agent, /agent.html, /api/agent) ne doit
// exister QUE sur le sous-domaine privé défini par AGENT_HOST
// (ex. atelier.claireassistante.fr). Sur la vitrine client
// (app.claireassistante.fr) ou tout autre hôte → 404 : l'atelier est
// invisible et injoignable côté client.
//
// SÉCURITÉ :
// - `matcher` limite ce middleware aux SEULS chemins de l'atelier :
//   il ne s'exécute jamais pour la vitrine → aucun risque de la casser.
// - Fail-closed : si AGENT_HOST n'est pas défini, ces chemins renvoient 404.
// ================================================================

export const config = { matcher: ['/agent', '/agent.html', '/api/agent'] };

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const agentHost = (process.env.AGENT_HOST || '').toLowerCase();

  if (!agentHost || host !== agentHost) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    });
  }
  return next();
}
