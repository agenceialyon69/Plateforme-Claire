#!/usr/bin/env node
// ================================================================
// prospection.mjs — Prépare des séquences d'outreach B2B vers cabinets.
// Pour CHAQUE cabinet : objet + email d'intro + 2 relances + script d'appel,
// auto-corrigés en "red team" jusqu'au meilleur score, puis écrits en .md.
// N'ENVOIE RIEN. Tu relis dans out/prospection/ et tu envoies toi-même.
//
//   node tools/agent/prospection.mjs [--file data/cabinets.json] [--dry]
// ================================================================
import { loadConfig, readJson, refine, slug, writeOut, scoreBadge, parseArgs, die } from './lib/core.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig();
const file = args.file || 'data/cabinets.json';

let cabinets;
try { cabinets = readJson(file); }
catch { die(`${file} introuvable → copie data/cabinets.example.json en data/cabinets.json et remplis ta liste.`); }
if (!Array.isArray(cabinets) || !cabinets.length) die(`${file} doit être une liste non vide.`);

const P = cfg.profil || {};
const SYSTEM = `Tu rédiges l'outreach B2B de ${P.nom || 'Tafsir'}, créateur de CLAIRE — ${P.produit || 'une plateforme métier de réception et de suivi des demandes patients pour cabinets'} (${P.site || 'app.claireassistante.fr'}). CLAIRE accueille la demande du patient, la qualifie, récupère les coordonnées et transmet un résumé structuré au cabinet. Jamais de diagnostic ni de prix médical ; conforme RGPD.

POSITIONNEMENT (RÈGLE ABSOLUE) : n'écris JAMAIS « IA / intelligence artificielle / chatbot / robot / LLM / Claude / Anthropic ». Claire est une « assistante numérique » du cabinet, pas un gadget technologique. Honnête : ce n'est jamais un humain qui répond personnellement.
OFFRE (n'invente AUCUN chiffre au-delà de ceci) : ${P.offre || '(à définir dans config.json)'}.
POSTURE : « avis d'expert, pas vente ». Humain, respectueux, court. Tu proposes de MONTRER une démo et tu demandes leur avis. Aucune pression, aucun superlatif creux.
RÈGLES : prospection B2B → objet clair + une phrase de désinscription. JAMAIS de fausse référence ("des cabinets nous font confiance") : ${P.nom || 'Tafsir'} démarre → mise sur l'offre fondateur + l'essai gratuit + l'avis d'expert. Personnalise avec le nom du cabinet et la ville. Français impeccable.

Réponds UNIQUEMENT en JSON : {"objet":"…","email_intro":"…","relance_1":"…","relance_2":"…","script_appel":"…"}`;

const CLIENT_FIELDS = ['objet', 'email_intro', 'relance_1', 'relance_2', 'script_appel'];
const mock = (c) => ({ objet: `[DRY] Démo Claire pour ${c.nom}`, email_intro: `[DRY] Bonjour ${c.nom} à ${c.ville || ''}…`, relance_1: '[DRY] relance 1', relance_2: '[DRY] relance 2', script_appel: '[DRY] script' });

console.log(`\n📨 Prospection CLAIRE — ${cabinets.length} cabinet(s), modèle ${cfg.moteur.model}${args.dry ? ' (DRY)' : ''}.\n`);
let ok = 0;
for (const c of cabinets) {
  const taskUser = `Cabinet : ${c.nom}\nVille : ${c.ville || '(non précisée)'}\nEmail : ${c.email || '(non précisé)'}\nContexte : ${c.note || '(aucun)'}\n\nGénère la séquence d'outreach personnalisée. JSON uniquement.`;
  try {
    const { draft, critique, history } = await refine({
      kind: 'prospection cabinet', taskSystem: SYSTEM, taskUser, clientFields: CLIENT_FIELDS,
      model: cfg.moteur.model, maxIters: cfg.moteur.maxIters, threshold: cfg.moteur.threshold,
      mockDraft: mock(c), dry: args.dry,
      onStep: ({ iter, score, must_fix }) => process.stdout.write(`   ${c.nom}: passe ${iter} → ${score}/100 ${must_fix?.length ? '(corrige: ' + must_fix.length + ')' : '✓'}\n`),
    });
    const passes = history.map((h) => `${h.score}`).join(' → ') || 'dry';
    const md =
      `# ${c.nom} — ${c.ville || ''}\n` +
      `**Email :** ${c.email || '(à compléter)'}  \n**Score red team :** ${scoreBadge(critique.score)} ${critique.score}/100 (passes : ${passes})\n\n` +
      (critique.suggestions?.length ? `> 💡 ${critique.suggestions.join(' · ')}\n\n` : '') +
      `## Objet\n${draft.objet}\n\n## Email d'introduction\n${draft.email_intro}\n\n` +
      `## Relance 1 (J+3)\n${draft.relance_1}\n\n## Relance 2 (J+7)\n${draft.relance_2}\n\n` +
      `## Script d'appel\n${draft.script_appel}\n\n---\n*Brouillon préparé automatiquement. À RELIRE puis à envoyer manuellement.*\n`;
    const out = writeOut('prospection', slug(c.nom) + '.md', md);
    console.log(`✅ ${c.nom} → ${out}  ${scoreBadge(critique.score)} ${critique.score}/100\n`);
    ok++;
  } catch (e) { console.log(`⚠️  ${c.nom} — ${e.message}\n`); }
}
console.log(`\n✅ Terminé : ${ok}/${cabinets.length}. Relis le dossier "tools/agent/out/prospection/", PUIS envoie toi-même (jamais d'envoi auto).`);
