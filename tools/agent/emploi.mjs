#!/usr/bin/env node
// ================================================================
// emploi.mjs — Prépare un dossier de candidature ADAPTÉ à une offre.
// À partir de ton CV (config.json → cv) + le texte d'une offre que tu colles :
//   message d'approche au recruteur, lettre/email de motivation, "pourquoi moi",
//   questions intelligentes à poser, et un rappel de suivi. Auto-corrigé red team.
//
// N'ENVOIE RIEN et NE POSTULE NULLE PART tout seul. Tu relis et tu envoies.
//
//   node tools/agent/emploi.mjs --offre data/offre.txt [--poste "Monteur câbleur"] [--dry]
// ================================================================
import { loadConfig, readText, refine, slug, writeOut, scoreBadge, parseArgs, die } from './lib/core.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig();
const P = cfg.profil || {};

const offreFile = args.offre || 'data/offre.txt';
let offre;
try { offre = readText(offreFile).trim(); }
catch { die(`${offreFile} introuvable → colle le texte de l'offre dans data/offre.txt (ou --offre <fichier>).`); }
if (!offre) die(`${offreFile} est vide → colle le texte de l'offre dedans.`);

const SYSTEM = `Tu prépares la candidature de ${P.nom || 'Tafsir'}. PROFIL RÉEL (ne JAMAIS inventer de compétence ou d'expérience hors de ceci) :
${cfg.cv || P.cv || '(CV manquant dans config.json)'}

MISSION : à partir de l'OFFRE fournie, produire des documents PERSONNALISÉS qui montrent l'adéquation profil↔poste. Reprends les mots-clés réels de l'offre (utile pour les filtres ATS). Concret, sobre, crédible, zéro flagornerie, zéro mensonge. Français impeccable.
HONNÊTETÉ : si le profil ne couvre pas une exigence, ne mens pas — mets en avant ce qui est transférable. Mentionner la plateforme Claire (conçue et déployée par lui) est un ATOUT crédibilité/autonomie : autorisé ici (audience recruteur).

Réponds UNIQUEMENT en JSON : {"adequation":"2 phrases: pourquoi ce profil colle","message_recruteur":"court message LinkedIn/email d'approche","email_motivation":"email de motivation complet","pourquoi_moi":["3 puces fortes"],"questions_a_poser":["2-3 questions pertinentes en entretien"],"drapeaux":["points de vigilance/exigences non couvertes, pour TOI seulement"]}`;

const taskUser = `Poste visé : ${args.poste || '(déduis-le de l\'offre)'}\n\n--- OFFRE ---\n${offre}\n\nPrépare le dossier de candidature. JSON uniquement.`;
const CLIENT_FIELDS = ['message_recruteur', 'email_motivation']; // vus par le recruteur → lint lien (positionnement non strict)
const mock = { adequation: '[DRY]', message_recruteur: '[DRY] message', email_motivation: '[DRY] email', pourquoi_moi: ['[DRY]'], questions_a_poser: ['[DRY]'], drapeaux: ['[DRY]'] };

console.log(`\n💼 Candidature — offre "${offreFile}", modèle ${cfg.moteur.model}${args.dry ? ' (DRY)' : ''}.\n`);
try {
  const { draft, critique, history } = await refine({
    kind: 'candidature emploi', taskSystem: SYSTEM, taskUser, clientFields: CLIENT_FIELDS,
    model: cfg.moteur.model, maxIters: cfg.moteur.maxIters, threshold: cfg.moteur.threshold,
    enforcePositioning: false, // audience recruteur : parler de tech/IA est un atout
    mockDraft: mock, dry: args.dry,
    onStep: ({ iter, score, must_fix }) => process.stdout.write(`   passe ${iter} → ${score}/100 ${must_fix?.length ? '(corrige: ' + must_fix.length + ')' : '✓'}\n`),
  });
  const passes = history.map((h) => `${h.score}`).join(' → ') || 'dry';
  const md =
    `# Candidature — ${args.poste || 'poste'}\n` +
    `**Score red team :** ${scoreBadge(critique.score)} ${critique.score}/100 (passes : ${passes})\n\n` +
    `## Adéquation\n${draft.adequation}\n\n## Pourquoi moi\n${(draft.pourquoi_moi || []).map((x) => '- ' + x).join('\n')}\n\n` +
    `## Message d'approche (recruteur)\n${draft.message_recruteur}\n\n## Email de motivation\n${draft.email_motivation}\n\n` +
    `## Questions à poser en entretien\n${(draft.questions_a_poser || []).map((x) => '- ' + x).join('\n')}\n\n` +
    `## ⚠️ Points de vigilance (pour toi)\n${(draft.drapeaux || []).map((x) => '- ' + x).join('\n')}\n\n---\n*Brouillon. RELIS, ajuste, et envoie toi-même.*\n`;
  const out = writeOut('emploi', slug(args.poste || 'candidature') + '.md', md);
  console.log(`\n✅ Préparé → ${out}  ${scoreBadge(critique.score)} ${critique.score}/100`);
  console.log(`   Relis-le, puis envoie toi-même. Jamais d'envoi/de candidature auto.`);
} catch (e) { die(e.message); }
