// ================================================================
// parametres.js — Gestion des paramètres du cabinet
// ================================================================

import { requireAuth, initSidebar } from '/js/auth.js';
import { supabase } from '/js/supabase-client.js';

const auth = await requireAuth();
if (!auth) throw new Error('Auth required');
let { cabinet } = auth;
initSidebar(cabinet, 'parametres');

const JOURS = [
  ['lundi', 'Lundi'],
  ['mardi', 'Mardi'],
  ['mercredi', 'Mercredi'],
  ['jeudi', 'Jeudi'],
  ['vendredi', 'Vendredi'],
  ['samedi', 'Samedi'],
  ['dimanche', 'Dimanche'],
];

// ----- BOOT -----
fillForms();
renderHoraires();

// ----- INFOS CABINET -----
document.getElementById('infosForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {
    nom: document.getElementById('nom').value.trim(),
    telephone: document.getElementById('telephone').value.trim() || null,
    adresse: document.getElementById('adresse').value.trim() || null,
    ville: document.getElementById('ville').value.trim() || null,
  };
  await saveCabinet(patch, 'Informations enregistrées.', e.submitter);
});

// ----- HORAIRES -----
document.getElementById('horairesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const horaires = {};
  JOURS.forEach(([key]) => {
    const ouvert = document.querySelector(`[name="ouvert_${key}"]`).checked;
    const matinDeb = document.querySelector(`[name="matin_deb_${key}"]`).value || null;
    const matinFin = document.querySelector(`[name="matin_fin_${key}"]`).value || null;
    const apremDeb = document.querySelector(`[name="aprem_deb_${key}"]`).value || null;
    const apremFin = document.querySelector(`[name="aprem_fin_${key}"]`).value || null;
    horaires[key] = {
      ouvert,
      matin: ouvert && matinDeb && matinFin ? [matinDeb, matinFin] : [],
      aprem: ouvert && apremDeb && apremFin ? [apremDeb, apremFin] : [],
    };
  });
  await saveCabinet({ horaires }, 'Horaires enregistrés.', e.submitter);
});

// ----- RÈGLES -----
document.getElementById('reglesForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = document.getElementById('regles_reponse').value.trim();
  if (val.length > 2000) {
    showAlert('Le texte est trop long (max 2000 caractères).', 'error');
    return;
  }
  await saveCabinet({ regles_reponse: val || null }, 'Règles enregistrées.', e.submitter);
});

// ----- DÉBORDEMENT TÉLÉPHONIQUE -----
document.getElementById('debordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const numeroReel = document.getElementById('numero_reel').value.trim();
  // Validation E.164 souple : + suivi de 7 à 15 chiffres (espaces tolérés à la saisie).
  const compact = numeroReel.replace(/[\s.]/g, '');
  if (compact && !/^\+[1-9]\d{6,15}$/.test(compact)) {
    showAlert('Le numéro doit être au format international, ex. +33478000000.', 'error');
    return;
  }
  const modele = document.getElementById('sms_modele').value.trim();
  if (modele.length > 500) {
    showAlert('Le texte du SMS est trop long (max 500 caractères).', 'error');
    return;
  }
  const patch = {
    numero_reel: compact || null,
    sms_relance_actif: document.getElementById('sms_relance_actif').checked,
    sms_modele: modele || null,
  };
  await saveCabinet(patch, 'Débordement téléphonique enregistré.', e.submitter);
});

// ----- NOTIFICATIONS -----
document.getElementById('notifForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {
    notif_email: document.getElementById('notif_email').value.trim() || null,
    notif_telephone: document.getElementById('notif_telephone').value.trim() || null,
  };
  await saveCabinet(patch, 'Notifications enregistrées.', e.submitter);
});

// ----- HELPERS -----
function fillForms() {
  document.getElementById('nom').value = cabinet.nom || '';
  document.getElementById('telephone').value = cabinet.telephone || '';
  document.getElementById('adresse').value = cabinet.adresse || '';
  document.getElementById('ville').value = cabinet.ville || '';
  document.getElementById('regles_reponse').value = cabinet.regles_reponse || '';
  document.getElementById('notif_email').value = cabinet.notif_email || cabinet.email || '';
  document.getElementById('notif_telephone').value = cabinet.notif_telephone || '';

  // Débordement téléphonique
  const numReel = document.getElementById('numero_reel');
  if (numReel) numReel.value = cabinet.numero_reel || '';
  const smsActif = document.getElementById('sms_relance_actif');
  if (smsActif) smsActif.checked = cabinet.sms_relance_actif !== false; // défaut : activé
  const smsModele = document.getElementById('sms_modele');
  if (smsModele) smsModele.value = cabinet.sms_modele || '';
  const numTwilio = document.getElementById('numero_twilio_ro');
  if (numTwilio) numTwilio.value = cabinet.numero_twilio || '';
}

function renderHoraires() {
  const container = document.getElementById('horairesContainer');
  const h = cabinet.horaires || {};

  let html = `
    <div class="horaires-grid">
      <div class="header">Jour</div>
      <div class="header">Ouvert ?</div>
      <div class="header">Matin</div>
      <div class="header">Après-midi</div>
  `;
  JOURS.forEach(([key, label]) => {
    const day = h[key] || { ouvert: false, matin: [], aprem: [] };
    const [matinDeb, matinFin] = day.matin || [];
    const [apremDeb, apremFin] = day.aprem || [];
    html += `
      <div class="day-label">${label}</div>
      <div>
        <label class="text-sm" style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" name="ouvert_${key}" ${day.ouvert ? 'checked' : ''} />
          <span>${day.ouvert ? 'Ouvert' : 'Fermé'}</span>
        </label>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <input type="time" name="matin_deb_${key}" value="${matinDeb || ''}" />
        <span class="text-xs text-muted">→</span>
        <input type="time" name="matin_fin_${key}" value="${matinFin || ''}" />
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <input type="time" name="aprem_deb_${key}" value="${apremDeb || ''}" />
        <span class="text-xs text-muted">→</span>
        <input type="time" name="aprem_fin_${key}" value="${apremFin || ''}" />
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;

  // Toggle label "Ouvert/Fermé" dynamique
  JOURS.forEach(([key]) => {
    const cb = document.querySelector(`[name="ouvert_${key}"]`);
    cb.addEventListener('change', () => {
      cb.nextElementSibling.textContent = cb.checked ? 'Ouvert' : 'Fermé';
    });
  });
}

async function saveCabinet(patch, successMsg, submitBtn = null) {
  // Protection double-clic + feedback loading
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalLabel = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="loader"></span>';
  }

  const { data, error } = await supabase
    .from('cabinets')
    .update(patch)
    .eq('id', cabinet.id)
    .select()
    .single();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtn.dataset.originalLabel;
  }

  if (error) {
    console.error(error);
    showAlert('Erreur lors de l\'enregistrement.', 'error');
    return;
  }
  cabinet = { ...cabinet, ...data };
  showAlert(successMsg, 'success');
}

function showAlert(message, type = 'info') {
  const slot = document.getElementById('alertSlot');
  slot.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info')}">${message}</div>`;
  setTimeout(() => { slot.innerHTML = ''; }, 4000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
