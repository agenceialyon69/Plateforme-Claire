// ================================================================
// dashboard.js — Logique du tableau de bord d'accueil
// ================================================================

import { requireAuth, initSidebar } from '/js/auth.js';
import { supabase } from '/js/supabase-client.js';
import { escapeHtml, labelUrgence, labelStatut, formatRelativeTime, formatToday } from '/js/format.js';

// ---------- BOOT ----------
const auth = await requireAuth();
if (!auth) throw new Error('Auth required'); // requireAuth redirige déjà

const { cabinet } = auth;

// Sidebar
initSidebar(cabinet, 'cabinet');

// Header
document.querySelector('[data-cabinet-name]').textContent = cabinet.nom;
document.getElementById('todayLine').textContent = formatToday();

// Checklist de configuration (onboarding) — calculée depuis la fiche cabinet.
renderSetupChecklist();

// Chargement en parallèle des données
await Promise.all([
  loadKpis(),
  loadPriorities(),
  loadLastConversations(),
  loadDebordement(),
]);

// ----------------------------------------------------------------
// KPIs — utilise la vue stats_cabinet
// ----------------------------------------------------------------
async function loadKpis() {
  const { data, error } = await supabase
    .from('stats_cabinet')
    .select('*')
    .eq('cabinet_id', cabinet.id)
    .single();

  if (error) {
    console.error('Erreur stats:', error);
    return;
  }
  const stats = data || {};

  document.querySelector('[data-kpi="demandes_aujourdhui"]').textContent = stats.demandes_aujourdhui ?? 0;
  document.querySelector('[data-kpi="urgences_aujourdhui"]').textContent = stats.urgences_aujourdhui ?? 0;
  document.querySelector('[data-kpi="en_attente"]').textContent = stats.en_attente ?? 0;
  document.querySelector('[data-kpi="a_rappeler"]').textContent = stats.a_rappeler ?? 0;

  // Badge sidebar "Demandes" si en attente > 0
  const badge = document.querySelector('[data-badge-demandes]');
  if (badge && (stats.en_attente ?? 0) > 0) {
    badge.textContent = stats.en_attente;
    badge.classList.remove('hidden');
  }
}

// ----------------------------------------------------------------
// Checklist de configuration : dit au cabinet ce qu'il reste à régler pour
// être 100% opérationnel (canal téléphone + chat hébergé). Masquée si complet.
// ----------------------------------------------------------------
function renderSetupChecklist() {
  const section = document.getElementById('setupSection');
  const list = document.getElementById('setupList');
  if (!section || !list) return;

  const hasHoraires = !!cabinet.horaires && Object.values(cabinet.horaires).some(d => d && d.ouvert);
  const items = [
    { ok: !!(cabinet.nom && cabinet.nom.trim() && cabinet.nom.trim().toLowerCase() !== 'cabinet'),
      label: 'Nom du cabinet renseigné', href: '/parametres.html' },
    { ok: hasHoraires, label: 'Horaires d\'ouverture définis', href: '/parametres.html' },
    { ok: !!(cabinet.notif_email && cabinet.notif_email.trim()),
      label: 'Email de notification configuré', href: '/parametres.html' },
    { ok: !!(cabinet.numero_reel && cabinet.numero_reel.trim()),
      label: 'Ligne à faire sonner (débordement) renseignée', href: '/parametres.html' },
    { ok: !!(cabinet.numero_twilio && cabinet.numero_twilio.trim()),
      label: 'Numéro Claire attribué (contactez l\'équipe si absent)', href: '/parametres.html' },
  ];

  if (items.every(i => i.ok)) return; // tout est prêt → on n'affiche rien

  list.innerHTML = items.map(i => `
    <a href="${i.href}" class="list-row" style="grid-template-columns: 28px 1fr; align-items:center; text-decoration:none;">
      <div style="font-size:18px; color:${i.ok ? 'var(--forest,#1f3d35)' : '#c9a227'};">${i.ok ? '✓' : '○'}</div>
      <div class="list-row-name" style="${i.ok ? 'color:#6b7280; text-decoration:line-through;' : ''}">${i.label}</div>
    </a>
  `).join('');
  section.style.display = '';
}

// ----------------------------------------------------------------
// Débordement téléphonique : appels manqués → demandes récupérées (30 j)
// Lecture directe via la vue stats_debordement (RLS security_invoker).
// Tolérant : si la vue n'existe pas encore (migration non jouée) ou tout est
// à zéro, on masque simplement la section — jamais d'erreur affichée.
// ----------------------------------------------------------------
async function loadDebordement() {
  const section = document.getElementById('debordSection');
  if (!section) return;
  try {
    const { data, error } = await supabase
      .from('stats_debordement')
      .select('appels_manques_30j, sms_envoyes_30j, demandes_recuperees_30j')
      .eq('cabinet_id', cabinet.id)
      .single();
    if (error || !data) return; // vue absente ou pas de droits → on n'affiche rien

    const manques = data.appels_manques_30j ?? 0;
    const sms = data.sms_envoyes_30j ?? 0;
    const recup = data.demandes_recuperees_30j ?? 0;

    // Rien à montrer tant qu'aucun appel manqué n'a été enregistré.
    if (manques === 0 && sms === 0 && recup === 0) return;

    section.querySelector('[data-debord="appels_manques_30j"]').textContent = manques;
    section.querySelector('[data-debord="sms_envoyes_30j"]').textContent = sms;
    section.querySelector('[data-debord="demandes_recuperees_30j"]').textContent = recup;
    section.style.display = '';
  } catch (_) {
    /* silencieux : la section reste masquée */
  }
}

// ----------------------------------------------------------------
// LISTE : demandes prioritaires (en_attente + urgences élevées)
// ----------------------------------------------------------------
async function loadPriorities() {
  const { data, error } = await supabase
    .from('demandes')
    .select('id, patient_nom, motif, urgence, statut, created_at, conversation_id')
    .eq('cabinet_id', cabinet.id)
    .in('statut', ['en_attente', 'a_rappeler'])
    .order('urgence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  const container = document.getElementById('prioriteList');
  container.innerHTML = '';

  if (error) {
    container.innerHTML = '<div class="list-empty">Impossible de charger les demandes.</div>';
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-title">Tout est à jour ✨</div>
        <div>Aucune demande en attente pour le moment.</div>
      </div>`;
    return;
  }

  data.forEach(d => {
    const row = document.createElement('a');
    row.className = 'list-row';
    row.href = `/conversation.html?id=${d.conversation_id}`;
    row.innerHTML = `
      <div class="list-row-main">
        <div class="list-row-name">${escapeHtml(d.patient_nom || 'Patient anonyme')}</div>
        <div class="list-row-sub">${escapeHtml(d.motif || '–')}</div>
      </div>
      <div><span class="badge badge-urgence-${d.urgence}">${labelUrgence(d.urgence)}</span></div>
      <div class="list-row-time">${formatRelativeTime(d.created_at)}</div>
      <div><span class="badge badge-statut-${d.statut}">${labelStatut(d.statut)}</span></div>
    `;
    container.appendChild(row);
  });
}

// ----------------------------------------------------------------
// LISTE : dernières conversations
// ----------------------------------------------------------------
async function loadLastConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, patient_nom, motif_resume, urgence, derniere_activite, statut')
    .eq('cabinet_id', cabinet.id)
    .order('derniere_activite', { ascending: false })
    .limit(5);

  const container = document.getElementById('convosList');
  container.innerHTML = '';

  if (error) {
    container.innerHTML = '<div class="list-empty">Impossible de charger les conversations.</div>';
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-title">Aucune conversation pour le moment</div>
        <div>Les échanges entre Claire et vos patients apparaîtront ici.</div>
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
        <div class="list-row-sub">${escapeHtml(c.motif_resume || 'Pas de résumé disponible')}</div>
      </div>
      <div><span class="badge badge-urgence-${c.urgence}">${labelUrgence(c.urgence)}</span></div>
      <div class="list-row-time">${formatRelativeTime(c.derniere_activite)}</div>
      <div class="text-sm text-muted">${c.statut === 'active' ? 'En cours' : 'Clos'}</div>
    `;
    container.appendChild(row);
  });
}
