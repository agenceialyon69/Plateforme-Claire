// ================================================================
// demandes.js — Liste des demandes qualifiées
// ================================================================

import { requireAuth, initSidebar } from '/js/auth.js';
import { supabase } from '/js/supabase-client.js';
import { escapeHtml, labelUrgence, labelStatut, formatRelativeTime } from '/js/format.js';

const auth = await requireAuth();
if (!auth) throw new Error('Auth required');
const { cabinet } = auth;
initSidebar(cabinet, 'demandes');

let currentFilter = 'en_attente';

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    loadDemandes();
  });
});

loadDemandes();

async function loadDemandes() {
  const container = document.getElementById('demandesList');
  container.innerHTML = `
    <div class="list-row" style="cursor:default;">
      <div class="skeleton" style="height: 18px; width: 60%;"></div>
      <div class="skeleton" style="height: 14px; width: 80%;"></div>
      <div class="skeleton" style="height: 14px; width: 60%;"></div>
      <div></div>
    </div>`;

  let query = supabase
    .from('demandes')
    .select('id, conversation_id, patient_nom, patient_telephone, motif, urgence, statut, created_at')
    .eq('cabinet_id', cabinet.id)
    .order('urgence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (currentFilter !== 'all') {
    query = query.eq('statut', currentFilter);
  }

  const { data, error } = await query;

  container.innerHTML = '';

  if (error) {
    container.innerHTML = '<div class="list-empty">Erreur de chargement.</div>';
    return;
  }

  if (!data || data.length === 0) {
    const messages = {
      en_attente: 'Aucune demande en attente. Tout est à jour ✨',
      a_rappeler: 'Aucune demande à rappeler.',
      traite: 'Aucune demande traitée pour le moment.',
      all: 'Aucune demande pour le moment.',
    };
    container.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-title">Rien ici</div>
        <div>${messages[currentFilter]}</div>
      </div>`;
    return;
  }

  data.forEach(d => {
    const row = document.createElement('a');
    row.className = 'list-row';
    row.href = `/conversation.html?id=${d.conversation_id}`;
    row.innerHTML = `
      <div class="list-row-main">
        <div class="list-row-name">${escapeHtml(d.patient_nom || 'Patient anonyme')}${d.patient_telephone ? ` · <span class="text-sm text-slate">${escapeHtml(d.patient_telephone)}</span>` : ''}</div>
        <div class="list-row-sub">${escapeHtml(d.motif || '–')}</div>
      </div>
      <div><span class="badge badge-urgence-${d.urgence}">${labelUrgence(d.urgence)}</span></div>
      <div class="list-row-time">${formatRelativeTime(d.created_at)}</div>
      <div><span class="badge badge-statut-${d.statut}">${labelStatut(d.statut)}</span></div>
    `;
    container.appendChild(row);
  });
}

