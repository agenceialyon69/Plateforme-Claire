// ================================================================
// _safety.js — Filet de sécurité DÉTERMINISTE (fonctions pures, testables)
// ----------------------------------------------------------------
// Pourquoi : la consigne « appelez le 15 / 112 » reposait uniquement sur le
// modèle de langage. La cascade de fournisseurs peut répondre avec 3 modèles
// différents dont le comportement n'est pas garanti identique. Ce module ajoute
// un filet qui ne dépend d'aucun modèle :
//   - détecte les signes d'urgence vitale dans les messages du patient ;
//   - garantit que la réponse renvoyée mentionne le 15/112 ;
//   - sert à classer la demande « élevée » et à alerter le cabinet.
// Les faux positifs sont acceptables (un rappel du 15 ne nuit à personne) ;
// les faux négatifs sont ce qu'on cherche à réduire.
// ================================================================

// Minuscules, sans accents, apostrophes unifiées, espaces compactés.
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Vrai si le motif n'est PAS précédé d'une négation proche (« pas de fièvre », « sans... »).
function matchNotNegated(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (!/(pas d[e']|pas de |aucun[e]? |sans |nulle? |plus de |jamais d[e']?)\s*$/.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

const BREATHING = /(n'?arrive (plus|pas) a respirer|du mal a respirer|difficultes? (a|pour) respirer|respire (mal|plus|difficilement)|j'?etouffe|etouffement|suffoque|souffle coupe|gene respiratoire)/;
const SWALLOW = /(n'?arrive (plus|pas) a avaler|impossible d'?avaler|difficultes? (a|pour) avaler)/;
const BLEED = /(hemorragie|(saign\w*)[^.!?]{0,45}(ne s'?arrete (pas|plus)|n'?arrete (pas|plus)|abondan\w*|depuis (plus de )?\d+ ?(h|heures?|min))|(ne s'?arrete (pas|plus)|n'?arrete (pas|plus))[^.!?]{0,30}saign\w*)/;
const CONSCIOUSNESS = /(perdu connaissance|perte de connaissance|evanoui|inconscient|pas reveille|ne reagit (plus|pas)|fait un malaise|convulsion)/;
const CHEST = /(douleurs? (dans |a )?(la )?poitrine|douleurs? thoracique|oppression (dans la )?(poitrine|thoracique)|serrement (dans la )?poitrine)/;
const SWELL_THROAT = /((gonfl|enfl)\w*[^.!?]{0,35}(gorge|langue|cou)\b|(gorge|langue|cou)\b[^.!?]{0,25}(gonfl|enfl)\w*)/;
const SWELL_FACE = /((gonfl|enfl)\w*[^.!?]{0,35}(visage|figure|joue|oeil|yeux|paupiere)|(visage|figure|joue)\b[^.!?]{0,25}(gonfl|enfl)\w*)/;
const FEVER = /(fievre|febrile|frissons|39 ?(°|degres)|40 ?(°|degres))/;
const SPREADING = /(s'?etend|se propage|descend|gagne)/;

// true si UN message du patient laisse penser à une urgence vitale.
export function detectVitalEmergency(text) {
  const t = normalizeText(text);
  if (!t) return false;
  if (matchNotNegated(t, BREATHING)) return true;
  if (matchNotNegated(t, SWALLOW)) return true;
  if (matchNotNegated(t, BLEED)) return true;
  if (matchNotNegated(t, CONSCIOUSNESS)) return true;
  if (matchNotNegated(t, CHEST)) return true;
  if (matchNotNegated(t, SWELL_THROAT)) return true;
  // Gonflement du visage : urgence s'il s'accompagne de fièvre OU s'étend.
  if (matchNotNegated(t, SWELL_FACE) && (matchNotNegated(t, FEVER) || SPREADING.test(t))) return true;
  return false;
}

export const EMERGENCY_NOTICE =
  "Si c'est une urgence vitale (difficulté à respirer ou à avaler, saignement qui ne s'arrête pas, gonflement du visage ou de la gorge, perte de connaissance), appelez le 15 ou le 112 tout de suite, sans attendre le cabinet.";

// Garantit que la réponse mentionne le 15/112 quand une urgence est détectée.
export function ensureEmergencyNotice(reply) {
  const r = String(reply ?? '').trim();
  if (/\b(15|112)\b/.test(r)) return r;
  return r ? `${EMERGENCY_NOTICE}\n\n${r}` : EMERGENCY_NOTICE;
}

// Un numéro de téléphone français dans le texte (06 12 34 56 78, +33 6 12…, 0612345678).
const PHONE_FR = /(?:\+33|0033|\b0)\s?[1-9](?:[\s.\-]?\d{2}){4}\b/;
export function userHasFrenchPhone(text) {
  return PHONE_FR.test(String(text ?? ''));
}

// ---------------- Date / heure / statut d'ouverture (Europe/Paris) ----------------
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function parisParts(date) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday').toLowerCase(), day: get('day'), month: get('month'), year: get('year'),
    hour: get('hour'), minute: get('minute'),
  };
}

export function formatParis(date = new Date()) {
  const p = parisParts(date);
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}h${p.minute} (heure de Paris)`;
}

function toMinutes(v) {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 'ouvert' | 'ferme' | 'inconnu' — 'inconnu' dès que les horaires sont absents ou ambigus
// (on ne dit JAMAIS « fermé » au patient sur une information douteuse).
export function openStatus(horaires, date = new Date()) {
  if (!horaires || typeof horaires !== 'object' || Array.isArray(horaires)) return 'inconnu';
  const p = parisParts(date);
  if (!JOURS.includes(p.weekday)) return 'inconnu';
  const d = horaires[p.weekday];
  if (!d || typeof d !== 'object') return 'inconnu';
  if (d.ouvert === false) return 'ferme';
  if (d.ouvert !== true) return 'inconnu';
  const now = Number(p.hour) * 60 + Number(p.minute);
  let hasInterval = false;
  for (const part of [d.matin, d.aprem]) {
    if (!Array.isArray(part) || part.length !== 2) continue;
    const a = toMinutes(part[0]), b = toMinutes(part[1]);
    if (a === null || b === null || b <= a) return 'inconnu';
    hasInterval = true;
    if (now >= a && now < b) return 'ouvert';
  }
  return hasInterval ? 'ferme' : 'inconnu';
}
