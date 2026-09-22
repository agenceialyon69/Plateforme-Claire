// ================================================================
// conversation.js — Détail d'une conversation
// ================================================================

import { requireAuth, initSidebar, apiFetch } from '/js/auth.js';
import { supabase } from '/js/supabase-client.js';
import { escapeHtml, labelUrgence, labelStatut, labelResultat, formatDate, formatTime } from '/js/format.js';

// Résultats de clôture proposés (preuve de valeur business — voir docs/AUDIT.md)
const RESULTATS = ['rdv_pris', 'rappel_effectue', 'patient_non_joignable', 'pas_de_besoin', 'abandonnee'];

const auth = await requireAuth();
if (!auth) throw new Error('Auth required');
const { cabinet } = auth;
initSidebar(cabinet, 'conversations');

// Récupération de l'ID
const params = new URLSearchParams(window.location.search);
const conversationId = params.get('id');

if (!conversationId) {
  window.location.href = '/conversations.html';
}

await loadConversation();

async function loadConversation() {
  // 1) Conversation + messages
  const { data: convo, error: errConvo } = await supabase
    .from('conversations')
    .select('id, patient_nom, patient_telephone, patient_email, urgence, statut, motif_resume, created_at, cabinet_id')
    .eq('id', conversationId)
    .single();

  if (errConvo || !convo) {
    alert('Conversation introuvable.');
    window.location.href = '/conversations.html';
    return;
  }

  // Sécurité supplémentaire côté client (la RLS bloque déjà côté DB)
  if (convo.cabinet_id !== cabinet.id) {
    window.location.href = '/conversations.html';
    return;
  }

  // Header
  document.getElementById('patientName').textContent = convo.patient_nom || 'Patient anonyme';
  document.getElementById('patientSub').textContent =
    `Conversation démarrée le ${formatDate(convo.created_at)}`;
  document.getElementById('urgenceBadge').innerHTML =
    `<span class="badge badge-urgence-${convo.urgence}">${labelUrgence(convo.urgence)}</span>`;

  // 2) Messages
  const { data: messages, error: errMsg } = await supabase
    .from('messages')
    .select('id, role, contenu, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const stream = document.getElementById('messagesStream');
  stream.innerHTML = '';

  if (errMsg || !messages || messages.length === 0) {
    stream.innerHTML = '<div class="list-empty"><div>Aucun message dans cette conversation.</div></div>';
  } else {
    messages.forEach(m => {
      if (m.role === 'system') return;
      const msgEl = document.createElement('div');
      msgEl.className = `convo-message from-${m.role === 'user' ? 'user' : 'assistant'}`;
      msgEl.innerHTML = `
        <div class="convo-msg-meta">${m.role === 'user' ? 'Patient' : 'Claire'} · ${formatTime(m.created_at)}</div>
        <div class="convo-msg-bubble">${escapeHtml(m.contenu)}</div>
      `;
      stream.appendChild(msgEl);
    });
    stream.scrollTop = stream.scrollHeight;
  }

  // 3) Contact
  document.getElementById('contactBox').innerHTML = `
    <div class="summary-row">
      <div class="summary-label">Nom</div>
      <div class="summary-value">${escapeHtml(convo.patient_nom || '–')}</div>
    </div>
    <div class="summary-row">
      <div class="summary-label">Téléphone</div>
      <div class="summary-value">${escapeHtml(convo.patient_telephone || '–')}</div>
    </div>
    <div class="summary-row">
      <div class="summary-label">Email</div>
      <div class="summary-value">${escapeHtml(convo.patient_email || '–')}</div>
    </div>
  `;

  // Droit à l'effacement (RGPD art. 17) : le cabinet peut supprimer
  // définitivement cette conversation (messages + demande liés effacés en
  // cascade). Action irréversible → double confirmation.
  renderEraseButton();

  // 4) Demande liée (résumé qualifié)
  const { data: demandes } = await supabase
    .from('demandes')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1);

  const demande = demandes && demandes[0];
  const summaryBox = document.getElementById('summaryBox');

  if (!demande) {
    summaryBox.innerHTML = `<p class="text-sm text-slate">Pas encore de demande qualifiée pour cette conversation.</p>`;
    document.getElementById('actionBar').innerHTML = '';
  } else {
    summaryBox.innerHTML = `
      <div class="summary-row">
        <div class="summary-label">Motif</div>
        <div class="summary-value">${escapeHtml(demande.motif || '–')}</div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Souhait</div>
        <div class="summary-value">${escapeHtml(demande.souhait || '–')}</div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Urgence</div>
        <div class="summary-value"><span class="badge badge-urgence-${demande.urgence}">${labelUrgence(demande.urgence)}</span></div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Statut</div>
        <div class="summary-value"><span class="badge badge-statut-${demande.statut}">${labelStatut(demande.statut)}</span></div>
      </div>
      ${demande.resultat ? `
        <div class="summary-row">
          <div class="summary-label">Résultat</div>
          <div class="summary-value"><span class="badge badge-resultat">${labelResultat(demande.resultat)}</span></div>
        </div>` : ''}
      ${demande.note_cabinet ? `
        <div class="summary-row">
          <div class="summary-label">Note cabinet</div>
          <div class="summary-value">${escapeHtml(demande.note_cabinet)}</div>
        </div>` : ''}
    `;

    // Boutons d'action selon le statut
    const actionBar = document.getElementById('actionBar');
    actionBar.innerHTML = '';
    if (demande.statut !== 'traite') {
      if (demande.statut !== 'a_rappeler') {
        actionBar.appendChild(makeActionBtn('À rappeler', 'btn-ghost', () => updateStatut(demande.id, 'a_rappeler')));
      }
      if (demande.statut !== 'en_attente_patient') {
        actionBar.appendChild(makeActionBtn('En attente du patient', 'btn-ghost', () => updateStatut(demande.id, 'en_attente_patient')));
      }
      if (demande.statut !== 'ignore') {
        actionBar.appendChild(makeActionBtn('Ignorer', 'btn-danger', () => updateStatut(demande.id, 'ignore')));
      }

      // Clôturer avec un résultat final (preuve concrète de valeur pour le cabinet)
      const clotureLabel = document.createElement('div');
      clotureLabel.className = 'text-sm text-slate';
      clotureLabel.style.cssText = 'width:100%; margin-top:10px;';
      clotureLabel.textContent = 'Clôturer avec un résultat :';
      actionBar.appendChild(clotureLabel);

      RESULTATS.forEach((valeur) => {
        actionBar.appendChild(makeActionBtn(labelResultat(valeur), 'btn-primary', () => updateStatut(demande.id, 'traite', valeur)));
      });
    }
  }
}

// ----------------------------------------------------------------
// Bouton "Supprimer (RGPD)" — appelé dans loadConversation.
function renderEraseButton() {
  const box = document.getElementById('contactBox');
  if (!box || document.getElementById('eraseConvoBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'eraseConvoBtn';
  btn.className = 'btn btn-danger btn-sm';
  btn.style.marginTop = '16px';
  btn.textContent = 'Supprimer définitivement (RGPD)';
  btn.addEventListener('click', async () => {
    const sure = window.confirm(
      "Supprimer DÉFINITIVEMENT cette conversation, ses messages et la demande liée ?\n\nCette action est irréversible (droit à l'effacement RGPD)."
    );
    if (!sure) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    try {
      const res = await apiFetch('/api/erase', {
        method: 'DELETE',
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error('erase failed');
      window.location.href = '/conversations.html';
    } catch (e) {
      console.error(e);
      alert('La suppression a échoué. Réessayez.');
      btn.disabled = false;
      btn.textContent = 'Supprimer définitivement (RGPD)';
    }
  });
  box.appendChild(btn);
}

// ----------------------------------------------------------------
function makeActionBtn(label, klass, onClick) {
  const btn = document.createElement('button');
  btn.className = `btn ${klass} btn-sm`;
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span>';
    try { await onClick(); } catch (e) { console.error(e); }
  });
  return btn;
}

async function updateStatut(demandeId, statut, resultat) {
  const patch = { statut };
  if (statut === 'traite') {
    patch.traite_le = new Date().toISOString();
    if (resultat) patch.resultat = resultat;
  }

  const { error } = await supabase
    .from('demandes')
    .update(patch)
    .eq('id', demandeId);

  if (error) {
    alert('Erreur lors de la mise à jour.');
    console.error(error);
    return;
  }
  // Recharge la vue
  await loadConversation();
}

