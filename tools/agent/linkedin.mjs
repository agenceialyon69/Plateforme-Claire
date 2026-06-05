#!/usr/bin/env node
// ================================================================
// linkedin.mjs — Prépare des posts LinkedIn (accroche + post + hashtags +
// 1er commentaire + meilleur créneau), auto-corrigés en "red team".
//
// ⚠️ HONNÊTETÉ : LinkedIn n'autorise PAS la publication automatique fiable
//    sur un compte perso (API verrouillée + CGU). Cet outil PRÉPARE des posts
//    prêts à coller. Tu publies en 10 s par un copier-coller.
//
// Audience : "prospect" (positionnement strict, jamais "IA") ou
//            "recruteur" (recherche d'emploi : parler d'IA/tech est un ATOUT).
//
//   node tools/agent/linkedin.mjs [--file data/sujets.json] [--audience prospect|recruteur] [--dry]
//   node tools/agent/linkedin.mjs --sujet "Pourquoi un cabinet perd des patients au téléphone" [--audience prospect]
// ================================================================
import { loadConfig, readJson, refine, slug, writeOut, scoreBadge, parseArgs, die } from './lib/core.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig();
const P = cfg.profil || {};

let sujets;
if (args.sujet) sujets = [{ titre: String(args.sujet), audience: args.audience }];
else {
  const file = args.file || 'data/sujets.json';
  try { sujets = readJson(file); }
  catch { die(`${file} introuvable → copie data/sujets.example.json en data/sujets.json (ou utilise --sujet "...").`); }
}
if (!Array.isArray(sujets) || !sujets.length) die('Aucun sujet à traiter.');

function systemFor(audience) {
  const recruteur = audience === 'recruteur';
  return `Tu écris un post LinkedIn pour ${P.nom || 'Tafsir'}${recruteur ? ', en RECHERCHE D\'EMPLOI (technicien électrotechnicien / monteur câbleur). Profil : ' + (P.cv || '') : ', créateur de CLAIRE — ' + (P.produit || 'plateforme de réception des demandes patients') + ' (' + (P.site || 'app.claireassistante.fr') + ')'}.

STYLE LINKEDIN : accroche forte en 1re ligne (le "hook"), phrases courtes, aération, une histoire ou un constat concret, UN seul appel à l'action. Pas de jargon, pas d'emojis à outrance (2-3 max), pas de "fil 🧵". Authentique et crédible.
${recruteur
  ? 'POSITIONNEMENT : tu peux parler de technologie, d\'automatisation et même d\'IA — face à des recruteurs, avoir conçu une plateforme est un ATOUT à valoriser. Reste honnête et concret (ce que tu as fait, appris, livré).'
  : 'POSITIONNEMENT (RÈGLE ABSOLUE) : n\'écris JAMAIS « IA / intelligence artificielle / chatbot / robot / LLM / Claude / Anthropic ». Claire est une « assistante numérique » / une plateforme métier. Aucune fausse référence ni preuve sociale inventée.'}

Réponds UNIQUEMENT en JSON : {"accroche":"…","post":"…","hashtags":["#…"],"premier_commentaire":"…","meilleur_creneau":"ex: mardi 8h-9h"}`;
}

const CLIENT_FIELDS = ['accroche', 'post', 'premier_commentaire'];
const mock = (s) => ({ accroche: `[DRY] ${s.titre}`, post: '[DRY] corps du post', hashtags: ['#dry'], premier_commentaire: '[DRY]', meilleur_creneau: 'mardi 8h' });

console.log(`\n📝 Posts LinkedIn — ${sujets.length} sujet(s), modèle ${cfg.moteur.model}${args.dry ? ' (DRY)' : ''}.\n`);
let ok = 0;
for (const s of sujets) {
  const audience = s.audience || args.audience || 'prospect';
  const taskUser = `Sujet : ${s.titre}\nAngle / intention : ${s.angle || '(libre, choisis le meilleur angle)'}\nAudience : ${audience}\n\nÉcris le post. JSON uniquement.`;
  try {
    const { draft, critique, history } = await refine({
      kind: `post LinkedIn (${audience})`, taskSystem: systemFor(audience), taskUser, clientFields: CLIENT_FIELDS,
      model: cfg.moteur.model, maxIters: cfg.moteur.maxIters, threshold: cfg.moteur.threshold,
      enforcePositioning: audience !== 'recruteur',
      mockDraft: mock(s), dry: args.dry,
      onStep: ({ iter, score, must_fix }) => process.stdout.write(`   "${s.titre.slice(0, 40)}…": passe ${iter} → ${score}/100 ${must_fix?.length ? '(corrige: ' + must_fix.length + ')' : '✓'}\n`),
    });
    const passes = history.map((h) => `${h.score}`).join(' → ') || 'dry';
    const md =
      `# Post LinkedIn — ${s.titre}\n` +
      `**Audience :** ${audience}  ·  **Score red team :** ${scoreBadge(critique.score)} ${critique.score}/100 (passes : ${passes})  ·  **Créneau conseillé :** ${draft.meilleur_creneau || '—'}\n\n` +
      (critique.suggestions?.length ? `> 💡 ${critique.suggestions.join(' · ')}\n\n` : '') +
      `## À copier-coller\n${draft.accroche}\n\n${draft.post}\n\n${(draft.hashtags || []).join(' ')}\n\n` +
      `## Premier commentaire (à poster juste après)\n${draft.premier_commentaire}\n\n---\n*Brouillon. LinkedIn ne permet pas de publier de façon fiable/légale en auto : copie-colle toi-même.*\n`;
    const out = writeOut('linkedin', slug(s.titre).slice(0, 50) + '.md', md);
    console.log(`✅ ${s.titre.slice(0, 50)} → ${out}  ${scoreBadge(critique.score)} ${critique.score}/100\n`);
    ok++;
  } catch (e) { console.log(`⚠️  ${s.titre} — ${e.message}\n`); }
}
console.log(`\n✅ Terminé : ${ok}/${sujets.length}. Dossier "tools/agent/out/linkedin/". Tu publies par copier-coller.`);
