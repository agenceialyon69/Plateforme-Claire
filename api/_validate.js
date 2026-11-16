// ================================================================
// _validate.js — Validations partagées (fonctions pures, testables hors-ligne)
// ----------------------------------------------------------------
// Utilisé par /api/cabinet (écriture des paramètres) ET par le webhook
// d'appel Twilio (défense en profondeur : même si une valeur invalide
// avait été écrite en base, on ne fait JAMAIS sonner un numéro interdit).
//
// 🔐 Pourquoi : numero_reel est composé par Twilio et facturé sur le
// compte de la plateforme ; sms_modele part depuis le numéro Twilio de la
// plateforme. Sans validation, un compte cabinet pouvait faire appeler un
// numéro surtaxé ou envoyer un SMS contenant un lien de phishing.
// ================================================================

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });

// Numéro que Twilio fera sonner : FRANCE uniquement, hors numéros spéciaux/surtaxés.
// Accepte « +33 4 78 00 00 00 », « 04 78 00 00 00 », « 0478000000 » → normalise en E.164.
export function parseDialNumber(input) {
  if (input === null || input === undefined || input === '') return ok(null);
  if (typeof input !== 'string') return err('Numéro invalide.');
  let n = input.replace(/[\s.\-()]/g, '');
  if (/^0033/.test(n)) n = '+33' + n.slice(4);
  else if (/^0\d{9}$/.test(n)) n = '+33' + n.slice(1);
  if (!/^\+33\d{9}$/.test(n)) {
    return err('Le numéro doit être un numéro français (ex. 04 78 00 00 00 ou +33478000000).');
  }
  if (n[3] === '0') return err('Numéro invalide.');
  if (n[3] === '8') return err('Les numéros commençant par 08 (spéciaux ou surtaxés) ne sont pas acceptés.');
  return ok(n);
}

// Texte du SMS de relance : pas de lien ni de nom de domaine (anti-phishing, le lien du chat
// est ajouté automatiquement par la plateforme via {lien}).
const URLISH_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|net|org|io|co|me|ly|info|xyz|link|app|site|online|top|click)\b)/i;
export function parseSmsModele(input) {
  if (input === null || input === undefined || input === '') return ok(null);
  if (typeof input !== 'string') return err('Texte du SMS invalide.');
  const t = input.trim();
  if (t.length > 500) return err('Le texte du SMS est trop long (max 500 caractères).');
  if (URLISH_RE.test(t)) {
    return err('Le texte du SMS ne doit contenir ni lien ni adresse de site : le lien du chat est ajouté automatiquement avec {lien}.');
  }
  return ok(t || null);
}

function optString(v, max, label) {
  if (v === null || v === undefined || v === '') return ok(null);
  if (typeof v !== 'string') return err(`${label} invalide.`);
  const t = v.trim();
  if (t.length > max) return err(`${label} trop long (max ${max} caractères).`);
  return ok(t || null);
}

function parseHoraires(v) {
  if (v === null || v === undefined) return ok(null);
  if (typeof v !== 'object' || Array.isArray(v)) return err('Horaires invalides.');
  for (const [k, d] of Object.entries(v)) {
    if (!DAYS.includes(k)) return err('Horaires invalides.');
    if (!d || typeof d !== 'object' || Array.isArray(d)) return err('Horaires invalides.');
    if (typeof d.ouvert !== 'boolean') return err('Horaires invalides.');
    for (const part of ['matin', 'aprem']) {
      const a = d[part];
      if (a === undefined) continue;
      if (!Array.isArray(a) || (a.length !== 0 && (a.length !== 2 || !a.every(x => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x))))) {
        return err('Horaires invalides.');
      }
    }
  }
  if (JSON.stringify(v).length > 4000) return err('Horaires trop volumineux.');
  return ok(v);
}

// Valide un PATCH de paramètres cabinet. Les champs inconnus sont ignorés (liste blanche).
export function parseCabinetPatch(body) {
  const src = body && typeof body === 'object' ? body : {};
  const patch = {};

  if (src.nom !== undefined) {
    if (typeof src.nom !== 'string' || !src.nom.trim()) return err('Le nom du cabinet est obligatoire.');
    if (src.nom.trim().length > 200) return err('Nom trop long (max 200 caractères).');
    patch.nom = src.nom.trim();
  }
  const simple = [['telephone', 50, 'Téléphone'], ['adresse', 300, 'Adresse'], ['ville', 100, 'Ville'],
    ['notif_telephone', 50, 'Téléphone de notification'], ['regles_reponse', 2000, 'Règles de réponse']];
  for (const [key, max, label] of simple) {
    if (src[key] === undefined) continue;
    const r = optString(src[key], max, label);
    if (!r.ok) return r;
    patch[key] = r.value;
  }
  if (src.notif_email !== undefined) {
    const r = optString(src.notif_email, 200, 'Email de notification');
    if (!r.ok) return r;
    if (r.value !== null && !EMAIL_RE.test(r.value)) return err('Email de notification invalide.');
    patch.notif_email = r.value;
  }
  if (src.horaires !== undefined) {
    const r = parseHoraires(src.horaires);
    if (!r.ok) return r;
    patch.horaires = r.value;
  }
  if (src.numero_reel !== undefined) {
    const r = parseDialNumber(src.numero_reel);
    if (!r.ok) return r;
    patch.numero_reel = r.value;
  }
  if (src.sms_relance_actif !== undefined) {
    if (typeof src.sms_relance_actif !== 'boolean') return err('Réglage SMS invalide.');
    patch.sms_relance_actif = src.sms_relance_actif;
  }
  if (src.sms_modele !== undefined) {
    const r = parseSmsModele(src.sms_modele);
    if (!r.ok) return r;
    patch.sms_modele = r.value;
  }
  if (Object.keys(patch).length === 0) return err('Rien à mettre à jour');
  return ok(patch);
}
