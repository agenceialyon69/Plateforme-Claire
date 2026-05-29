// ================================================================
// contact-form.js — Formulaire « Réserver une démo » de l'accueil
// Branché sur l'endpoint existant /api/contact (table contact_leads).
// ================================================================

const form = document.getElementById('contactForm');
const slot = document.getElementById('contactAlert');
const btn = document.getElementById('contactSubmit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  slot.innerHTML = '';

  const payload = {
    nom: form.nom.value.trim(),
    cabinet: form.cabinet.value.trim(),
    email: form.email.value.trim(),
    telephone: form.telephone.value.trim(),
    message: form.message.value.trim(),
  };

  if (!payload.nom || !payload.email) {
    return showAlert('error', 'Merci d\'indiquer au moins votre nom et votre email.');
  }
  if (!EMAIL_RE.test(payload.email)) {
    return showAlert('error', 'Cet email ne semble pas valide.');
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      showAlert('error', 'Trop de demandes envoyées. Réessayez dans une minute.');
    } else if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAlert('error', data.error || 'Envoi impossible pour le moment. Réessayez.');
    } else {
      form.reset();
      showAlert('success', 'Merci ! Votre demande est bien reçue, nous revenons vers vous très vite.');
    }
  } catch {
    showAlert('error', 'Connexion interrompue. Vérifiez votre réseau et réessayez.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

function showAlert(type, msg) {
  slot.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}">${msg}</div>`;
}
