// ================================================================
// admin.js — Pilotage de la plateforme (réservé administrateur)
// ----------------------------------------------------------------
// Onglets : Prospects / Cabinets / Inviter / Santé. Toutes les données
// passent par /api/admin/[action] (service_role côté serveur, jamais
// de lecture directe Supabase ici : contact_leads est verrouillée).
// ================================================================

import { requireAuth, initSidebar, apiFetch } from '/js/auth.js';
import { escapeHtml, formatRelativeTime } from '/js/format.js';

const PROSPECT_STATUTS = [
  ['nouveau', 'Nouveau'],
  ['contacte', 'Contacté'],
  ['relance', 'Relancé'],
  ['demo_prevue', 'Démo prévue'],
  ['converti', 'Converti'],
  ['perdu', 'Perdu'],
];
const SOURCE_LABELS = {
  landing: 'Vitrine', email: 'Email', telephone: 'Téléphone',
  linkedin: 'LinkedIn', visite: 'Visite', manuel: 'Manuel', autre: 'Autre',
};

const ctx = await requireAuth();
if (ctx) {
  initSidebar(ctx.cabinet, 'admin');

  const forbiddenSlot = document.getElementById('forbiddenSlot');
  const adminArea = document.getElementById('adminArea');

  // Droits admin : le serveur est la source de vérité
  let isAdmin = false;
  try {
    const res = await apiFetch('/api/admin/me', { method: 'GET' });
    isAdmin = (await res.json()).admin === true;
  } catch (_) { isAdmin = false; }

  if (!isAdmin) {
    forbiddenSlot.style.display = '';
  } else {
    adminArea.style.display = '';
    initTabs();
    initInviteForm();
    initProspectForm();
    loadProspects();
  }
}

// ----------------------------------------------------------------
// Onglets
// ----------------------------------------------------------------
const loadedTabs = new Set(['prospects']);
function initTabs() {
  document.getElementById('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('[data-panel]').forEach(p => {
      p.style.display = p.dataset.panel === tab ? '' : 'none';
    });
    if (!loadedTabs.has(tab)) {
      loadedTabs.add(tab);
      if (tab === 'cabinets') loadCabinets();
      if (tab === 'health') loadHealth();
    }
  });
  document.getElementById('healthRefresh')?.addEventListener('click', loadHealth);
}

// ----------------------------------------------------------------
// Prospects
// ----------------------------------------------------------------
function prospectAlert(msg, type = 'error') {
  document.getElementById('prospectAlert').innerHTML =
    msg ? `<div class="alert alert-${type}">${msg}</div>` : '';
}

async function loadProspects() {
  const box = document.getElementById('prospectsList');
  box.innerHTML = '<div class="list-empty">Chargement…</div>';
  try {
    const res = await apiFetch('/api/admin/prospects', { method: 'GET' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    renderProspects(data.prospects || []);
  } catch (err) {
    box.innerHTML = `<div class="list-empty">Impossible de charger les prospects. ${escapeHtml(err.message || '')}</div>`;
  }
}

function renderProspects(rows) {
  const box = document.getElementById('prospectsList');
  if (rows.length === 0) {
    box.innerHTML = `<div class="list-empty">
      <div class="list-empty-title">Aucun prospect pour le moment</div>
      <div>Ajoute tes envois d'emails ici pour enfin mesurer ta prospection.</div></div>`;
    return;
  }
  box.innerHTML = '';
  rows.forEach(p => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.style.gridTemplateColumns = '1fr auto auto';
    row.style.alignItems = 'start';
    const options = PROSPECT_STATUTS.map(([v, l]) =>
      `<option value="${v}" ${p.statut === v ? 'selected' : ''}>${l}</option>`).join('');
    row.innerHTML = `
      <div class="list-row-main">
        <div class="list-row-name">${escapeHtml(p.nom)}${p.cabinet ? ` — ${escapeHtml(p.cabinet)}` : ''}</div>
        <div class="list-row-sub">${escapeHtml(p.email || '')}${p.telephone ? ` · ${escapeHtml(p.telephone)}` : ''}
          · ${escapeHtml(SOURCE_LABELS[p.source] || p.source || '?')}</div>
        ${p.message ? `<div class="list-row-sub" style="font-style:italic;">« ${escapeHtml(p.message)} »</div>` : ''}
        <details style="margin-top:4px;">
          <summary style="cursor:pointer; font-size:12px; color:var(--slate,#4b5563);">Notes</summary>
          <textarea class="prospect-notes" data-notes="${p.id}">${escapeHtml(p.notes || '')}</textarea>
          <button class="btn" style="font-size:12px; margin-top:4px;" data-save-notes="${p.id}">Enregistrer les notes</button>
        </details>
      </div>
      <div><select data-statut="${p.id}" style="font:inherit; font-size:13px; padding:4px 8px; border-radius:8px;">${options}</select></div>
      <div class="list-row-time">${formatRelativeTime(p.created_at)}</div>
    `;
    box.appendChild(row);
  });

  box.querySelectorAll('[data-statut]').forEach(sel => {
    sel.addEventListener('change', () => patchProspect(sel.dataset.statut, { statut: sel.value }));
  });
  box.querySelectorAll('[data-save-notes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta = box.querySelector(`[data-notes="${btn.dataset.saveNotes}"]`);
      patchProspect(btn.dataset.saveNotes, { notes: ta.value });
    });
  });
}

async function patchProspect(id, patch) {
  prospectAlert('');
  try {
    const res = await apiFetch('/api/admin/prospects', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Échec de la mise à jour');
    prospectAlert('Prospect mis à jour. ✅', 'success');
  } catch (err) {
    prospectAlert(escapeHtml(err.message || 'Erreur'));
  }
}

function initProspectForm() {
  const form = document.getElementById('prospectForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    prospectAlert('');
    const payload = {
      nom: document.getElementById('pNom').value.trim(),
      cabinet: document.getElementById('pCabinet').value.trim(),
      email: document.getElementById('pEmail').value.trim(),
      telephone: document.getElementById('pTel').value.trim(),
      source: document.getElementById('pSource').value,
      notes: document.getElementById('pNotes').value.trim(),
    };
    if (!payload.nom || !payload.email) {
      prospectAlert('Nom et email sont obligatoires.');
      return;
    }
    const btn = document.getElementById('prospectSubmit');
    btn.disabled = true;
    try {
      const res = await apiFetch('/api/admin/prospects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'ajout");
      form.reset();
      document.getElementById('addProspectBox').open = false;
      await loadProspects();
      prospectAlert('Prospect ajouté. ✅', 'success');
    } catch (err) {
      prospectAlert(escapeHtml(err.message || 'Erreur'));
    } finally {
      btn.disabled = false;
    }
  });
}

// ----------------------------------------------------------------
// Cabinets
// ----------------------------------------------------------------
async function loadCabinets() {
  const box = document.getElementById('cabinetsList');
  box.innerHTML = '<div class="list-empty">Chargement…</div>';
  try {
    const res = await apiFetch('/api/admin/cabinets', { method: 'GET' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    const rows = data.cabinets || [];
    if (rows.length === 0) {
      box.innerHTML = '<div class="list-empty">Aucun cabinet.</div>';
      return;
    }
    box.innerHTML = '';
    rows.forEach(c => {
      const cfg = [
        c.numero_claire ? '✓ n° Claire' : '○ n° Claire',
        c.telephone_configure ? '✓ débordement' : '○ débordement',
        c.notif_configuree ? '✓ notif' : '○ notif',
      ].join(' · ');
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.gridTemplateColumns = '1fr auto auto';
      row.innerHTML = `
        <div class="list-row-main">
          <div class="list-row-name">${escapeHtml(c.nom || '(sans nom)')}${c.ville ? ` — ${escapeHtml(c.ville)}` : ''}</div>
          <div class="list-row-sub">${escapeHtml(c.email || '')} · ${cfg}</div>
        </div>
        <div class="list-row-sub">${c.demandes_30j} demande(s) / 30 j${c.en_attente ? ` · <strong>${c.en_attente} en attente</strong>` : ''}</div>
        <div class="list-row-time">${c.derniere_activite ? formatRelativeTime(c.derniere_activite) : 'jamais'}</div>
      `;
      box.appendChild(row);
    });
  } catch (err) {
    box.innerHTML = `<div class="list-empty">Impossible de charger les cabinets. ${escapeHtml(err.message || '')}</div>`;
  }
}

// ----------------------------------------------------------------
// Santé du système
// ----------------------------------------------------------------
const HEALTH_LABELS = {
  groq: 'Fournisseur principal (Groq)',
  gemini: 'Fournisseur secondaire (Gemini)',
  anthropic: 'Fournisseur de secours',
  twilio: 'Téléphonie (Twilio)',
  cron_secret: 'Tâche quotidienne (CRON_SECRET)',
  auto_reveil_supabase: 'Auto-réveil base (SUPABASE_ACCESS_TOKEN)',
  webhook_notification: 'Webhook de notification',
  admin_emails: 'ADMIN_EMAILS',
  site_url: 'PUBLIC_SITE_URL',
};

async function loadHealth() {
  const box = document.getElementById('healthBody');
  box.innerHTML = '<div class="list-empty">Chargement…</div>';
  try {
    const res = await apiFetch('/api/admin/health', { method: 'GET' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    const dbLine = data.db?.ok
      ? `<div class="health-item"><span>Base de données</span><strong style="color:#1f7a4d;">joignable ✓</strong></div>`
      : `<div class="health-item"><span>Base de données</span><strong style="color:#b4231f;">INJOIGNABLE — ${escapeHtml(data.db?.erreur || '')}</strong></div>`;

    const cfgLines = Object.entries(data.config || {}).map(([k, v]) => `
      <div class="health-item"><span>${escapeHtml(HEALTH_LABELS[k] || k)}</span>
        <strong style="color:${v ? '#1f7a4d' : '#b4231f'};">${v ? 'configuré' : 'ABSENT'}</strong></div>`).join('');

    const act = data.activite_7j;
    const actLines = act ? `
      <div class="health-item"><span>Cabinets (total)</span><strong>${act.cabinets_total}</strong></div>
      <div class="health-item"><span>Demandes (7 j)</span><strong>${act.demandes ?? '?'}</strong></div>
      <div class="health-item"><span>Appels (7 j)</span><strong>${act.appels ?? '?'}</strong></div>` : '';

    box.innerHTML = `<div class="health-grid">${dbLine}${cfgLines}${actLines}</div>`;
  } catch (err) {
    box.innerHTML = `<div class="list-empty">Impossible de vérifier la santé. ${escapeHtml(err.message || '')}</div>`;
  }
}

// ----------------------------------------------------------------
// Invitation (logique existante, URL déplacée vers /api/admin/invite)
// ----------------------------------------------------------------
function initInviteForm() {
  const form = document.getElementById('inviteForm');
  const btn = document.getElementById('submitBtn');
  const btnLabel = document.getElementById('submitLabel');
  const alertSlot = document.getElementById('alertSlot');

  const showAlert = (msg, type = 'error') => {
    alertSlot.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertSlot.innerHTML = '';

    const payload = {
      nom: document.getElementById('nom').value.trim(),
      email: document.getElementById('email').value.trim(),
      telephone: document.getElementById('telephone').value.trim(),
      ville: document.getElementById('ville').value.trim(),
    };
    if (!payload.nom || !payload.email) {
      showAlert('Le nom du cabinet et l’email sont obligatoires.');
      return;
    }

    btn.disabled = true;
    btnLabel.innerHTML = '<span class="loader"></span>';
    try {
      const res = await apiFetch('/api/admin/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showAlert(data.error || 'Échec de l’invitation.');
      } else {
        showAlert(`Invitation envoyée à <strong>${escapeHtml(data.email)}</strong>. ✅`, 'success');
        form.reset();
      }
    } catch (err) {
      console.error(err);
      showAlert('Connexion impossible. Réessayez dans un instant.');
    } finally {
      btn.disabled = false;
      btnLabel.textContent = 'Envoyer l’invitation';
    }
  });
}
