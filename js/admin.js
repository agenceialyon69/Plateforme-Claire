// ================================================================
// admin.js — Page "Inviter un cabinet" (réservée à l'administrateur)
// ================================================================

import { requireAuth, initSidebar, apiFetch } from '/js/auth.js';

const ctx = await requireAuth();
if (ctx) {
  initSidebar(ctx.cabinet, 'admin');

  const forbiddenSlot = document.getElementById('forbiddenSlot');
  const inviteCard = document.getElementById('inviteCard');
  const form = document.getElementById('inviteForm');
  const btn = document.getElementById('submitBtn');
  const btnLabel = document.getElementById('submitLabel');
  const alertSlot = document.getElementById('alertSlot');

  const showAlert = (msg, type = 'error') => {
    alertSlot.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  };
  const clearAlert = () => { alertSlot.innerHTML = ''; };

  // Vérifie les droits admin auprès du serveur (source de vérité)
  let isAdmin = false;
  try {
    const res = await apiFetch('/api/invite-cabinet', { method: 'GET' });
    isAdmin = (await res.json()).admin === true;
  } catch (_) {
    isAdmin = false;
  }

  if (!isAdmin) {
    forbiddenSlot.style.display = '';
    inviteCard.style.display = 'none';
  } else {
    forbiddenSlot.style.display = 'none';
    inviteCard.style.display = '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();

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
        const res = await apiFetch('/api/invite-cabinet', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          showAlert(data.error || 'Échec de l’invitation.');
        } else {
          showAlert(`Invitation envoyée à <strong>${data.email}</strong>. ✅`, 'success');
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
}
