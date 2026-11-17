#!/usr/bin/env node
// ================================================================
// test-safety.mjs — Filet urgence vitale + téléphone + horaires (api/_safety.js)
// ----------------------------------------------------------------
// Vérifie la détection déterministe (vrais positifs ET absence de fausses
// alertes courantes), le rappel 15/112 forcé, la détection d'un numéro
// français, et le calcul du statut d'ouverture à l'heure de Paris.
//   npm run test:safety
// ================================================================
import {
  detectVitalEmergency, ensureEmergencyNotice, userHasFrenchPhone, openStatus, formatParis, normalizeText,
} from '../api/_safety.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.error(`  ✗ ${m}`); } };

// --- Urgences à DÉTECTER ---
for (const t of [
  "je n'arrive plus à respirer", "J'ai du mal à respirer depuis ce matin", 'mon fils respire mal', "j'étouffe",
  "ça saigne et ça ne s'arrête pas", "le saignement ne s'arrête plus depuis 2 heures", 'saignement abondant après extraction',
  "hémorragie après l'extraction", "elle a perdu connaissance", "il s'est évanoui", "il a fait un malaise",
  'douleur dans la poitrine', 'oppression thoracique', 'la langue gonfle', 'ma gorge enfle',
  "le visage est gonflé et j'ai de la fièvre", "la joue gonfle et ça s'étend vers l'œil",
  "je n'arrive plus à avaler", 'impossible d’avaler ma salive',
]) ok(detectVitalEmergency(t), `urgence détectée : « ${t} »`);

// --- À NE PAS déclencher ---
for (const t of [
  "j'ai mal à une dent depuis hier soir", "j'ai cassé une dent ce week-end", 'je voudrais un rendez-vous pour un détartrage',
  'quels sont vos horaires ?', 'la joue est un peu gonflée', "je n'ai pas de fièvre, la joue est un peu gonflée",
  "pas de difficulté à respirer, juste une douleur", "pas de perte de connaissance", 'sans fièvre ni gonflement',
  'mes gencives saignent un peu au brossage', 'ça saigne beaucoup quand je me brosse les dents',
  "c'est pour mon fils de 6 ans, il s'est cogné la bouche", 'ça coûte combien un détartrage ?', '',
]) ok(!detectVitalEmergency(t), `pas de fausse alerte : « ${t} »`);
ok(!detectVitalEmergency(null) && !detectVitalEmergency(undefined) && !detectVitalEmergency(42), 'entrées non texte : pas de plantage, pas d\'alerte');

// --- Rappel 15/112 forcé ---
const n = ensureEmergencyNotice('Pouvez-vous me donner votre nom ?');
ok(/\b15\b/.test(n) && /\b112\b/.test(n), 'réponse sans 15/112 → rappel ajouté');
ok(n.endsWith('Pouvez-vous me donner votre nom ?'), 'la réponse d\'origine est conservée après le rappel');
ok(ensureEmergencyNotice('Appelez le 15 tout de suite.') === 'Appelez le 15 tout de suite.', 'réponse qui mentionne déjà le 15 → inchangée');
ok(ensureEmergencyNotice('') .includes('112'), 'réponse vide → rappel seul');

// --- Numéro français ---
for (const t of ['Marie Durand 06 12 34 56 78', '+33 6 12 34 56 78', '0612345678', 'mon numéro 04.78.00.00.00', '0033478000000']) {
  ok(userHasFrenchPhone(t), `numéro détecté : « ${t} »`);
}
for (const t of ["j'ai 12 34 56 ans", 'mon code est 1234', 'le 15 mars', 'bonjour']) {
  ok(!userHasFrenchPhone(t), `pas un numéro : « ${t} »`);
}

// --- Normalisation ---
ok(normalizeText('  ÉVANOUI   Là ’ ') === "evanoui la '", 'normalisation : accents, casse, apostrophes, espaces');

// --- Statut d'ouverture (Europe/Paris, heure d'hiver UTC+1 / d'été UTC+2) ---
const H = {
  lundi: { ouvert: false, matin: [], aprem: [] },
  mardi: { ouvert: true, matin: ['09:00', '12:00'], aprem: ['14:00', '18:00'] },
};
const paris = (y, mo, d, h, mi, offset) => new Date(Date.UTC(y, mo - 1, d, h - offset, mi)); // heure locale Paris → instant
ok(openStatus(H, paris(2026, 11, 17, 10, 30, 1)) === 'ouvert', 'mardi 10h30 (hiver) → ouvert');
ok(openStatus(H, paris(2026, 11, 17, 12, 30, 1)) === 'ferme', 'mardi 12h30 (pause déjeuner) → fermé');
ok(openStatus(H, paris(2026, 11, 17, 18, 0, 1)) === 'ferme', 'mardi 18h00 pile → fermé');
ok(openStatus(H, paris(2026, 11, 17, 21, 0, 1)) === 'ferme', 'mardi 21h → fermé');
ok(openStatus(H, paris(2026, 11, 16, 10, 0, 1)) === 'ferme', 'lundi (jour fermé) → fermé');
ok(openStatus(H, paris(2026, 11, 18, 10, 0, 1)) === 'inconnu', 'mercredi non renseigné → inconnu (jamais « fermé » sur doute)');
ok(openStatus(null) === 'inconnu' && openStatus({}) === 'inconnu' && openStatus([]) === 'inconnu', 'horaires absents → inconnu');
ok(openStatus({ mardi: { ouvert: true, matin: ['9h', 'x'], aprem: [] } }, paris(2026, 11, 17, 10, 0, 1)) === 'inconnu', 'horaires mal formés → inconnu');
ok(openStatus({ mardi: { ouvert: true, matin: [], aprem: [] } }, paris(2026, 11, 17, 10, 0, 1)) === 'inconnu', 'ouvert sans créneau → inconnu');
ok(openStatus({ mardi: { ouvert: 'oui' } }, paris(2026, 11, 17, 10, 0, 1)) === 'inconnu', 'ouvert non booléen → inconnu');

ok(formatParis(paris(2026, 11, 17, 10, 30, 1)) === 'mardi 17 novembre 2026, 10h30 (heure de Paris)', 'format Paris (hiver)');
ok(formatParis(paris(2026, 7, 14, 10, 30, 2)) === 'mardi 14 juillet 2026, 10h30 (heure de Paris)', 'format Paris (été) : même heure locale malgré UTC+2');
ok(openStatus({ mardi: { ouvert: true, matin: ['09:00', '12:00'], aprem: [] } }, paris(2026, 7, 14, 10, 30, 2)) === 'ouvert', 'mardi 14 juillet 10h30 (été) → ouvert (fuseau correct)');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} test(s) OK, ${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
