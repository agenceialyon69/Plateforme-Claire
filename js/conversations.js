// ================================================================
// conversations.js — Liste de toutes les conversations
// ================================================================

import { requireAuth, initSidebar } from '/js/auth.js';
import { supabase } from '/js/supabase-client.js';
import { escapeHtml, labelUrgence, formatRelativeTime } from '/js/format.js';

const auth = await requireAuth();
if (!auth) throw new Error('Auth required');
const { cabinet } = auth;

initSidebar(cabinet, 'conversations');

let currentFilter = 'all';

// Filtres
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    loadConversations();
  });
});

loadConversations();

async function loadConversations() {
  const container = document.getElementById('convosList');
  container.innerHTML = `
    <div class="list-row" style="cursor:default;">
      <div class="skeleton" style="height: 18px; width: 60%;"></div>
      <div class="skeleton" style="height: 14px; width: 80%;"></div>
      <div class="skeleton" style="height: 14px; width: 60%;"></div>
      <div></div>
    </div>`;

  let query = supabase
    .from('conversations')
    .select('id, patient_nom, motif_resume, urgence, statut, derniere_activite')
    .eq('cabinet_id', cabinet.id)
    .order('derniere_activite', { ascending: false })
    .limit(100);

  if (currentFilter !== 'all') {
    query = query.eq('urgence', currentFilter);
  }

  const { data, error } = await query;

  container.innerHTML = '';

  if (error) {
    container.innerHTML = '<div class="list-empty">Erreur de chargement.</div>';
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-title">Aucune conversation</div>
        <div>${currentFilter === 'all' ? 'Les échanges entre Claire et vos patients apparaîtront ici.' : 'Aucune conversation avec ce filtre.'}</div>
      </div>`;
    return;
  }

  data.forEach(c => {
    const row = document.createElement('a');
    row.className = 'list-row';
    row.href = `/conversation.html?id=${c.id}`;
    row.innerHTML = `
      <div class="list-row-main">
        <div class="list-row-name">${escapeHtml(c.patient_nom || 'Patient anonyme')}</div>
        <div class="list-row-sub">${escapeHtml(c.motif_resume || 'Pas de résumé')}</div>
      </div>
      <div><span class="badge badge-urgence-${c.urgence}">${labelUrgence(c.urgence)}</span></div>
      <div class="list-row-time">${formatRelativeTime(c.derniere_activite)}</div>
      <div class="text-sm text-muted">${c.statut === 'active' ? 'En cours' : 'Clos'}</div>
    `;
    container.appendChild(row);
  });
}

