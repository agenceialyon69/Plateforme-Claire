// ================================================================
// patient-chat.js — Chat patient d'un cabinet donné (destination du SMS)
// ----------------------------------------------------------------
// Page publique atteinte via le lien du SMS de relance : /chat?c=<cabinetId>.
// Branché sur le VRAI endpoint /api/chat avec le cabinetId lu dans l'URL.
// Réutilise toute la logique serveur existante (qualification, résumé, webhook).
// ================================================================

import { escapeHtml } from '/js/format.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GREETING = "Bonjour, je suis Claire, l'assistante du cabinet. Dites-moi en quelques mots ce qui vous amène, je m'occupe du reste.";

const stream = document.getElementById('pcStream');
const form = document.getElementById('pcForm');
const input = document.getElementById('pcInput');
const sendBtn = document.getElementById('pcSend');

const cabinetId = new URLSearchParams(window.location.search).get('c');
const messages = [];
let conversationId = null;
let busy = false;

// Garde-fou : lien invalide → message clair plutôt qu'une erreur muette.
if (!cabinetId || !UUID_RE.test(cabinetId)) {
  addBubble('assistant', "Ce lien n'est pas valide. Merci de rappeler le cabinet directement.");
  if (form) form.style.display = 'none';
} else {
  addBubble('assistant', GREETING);
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 2000) { flash('Message trop long (2000 caractères max).'); return; }

  input.value = '';
  addBubble('user', text);
  messages.push({ role: 'user', content: text });

  setBusy(true);
  const typing = addTyping();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, cabinetId, conversationId }),
    });
    typing.remove();

    if (res.status === 429) {
      addBubble('assistant', "Beaucoup de messages d'un coup — patientez une minute puis réessayez.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.reply) {
      addBubble('assistant', "Désolée, je n'ai pas pu répondre à l'instant. Réessayez dans un instant.");
      return;
    }
    conversationId = data.conversationId || conversationId;
    addBubble('assistant', data.reply);
    messages.push({ role: 'assistant', content: data.reply });
  } catch {
    typing.remove();
    addBubble('assistant', 'Connexion interrompue. Vérifiez votre réseau et réessayez.');
  } finally {
    setBusy(false);
    input.focus();
  }
});

// ---------- helpers UI ----------
function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = `pc-msg pc-msg-${role === 'user' ? 'user' : 'assistant'}`;
  el.innerHTML = `<div class="pc-bubble">${escapeHtml(text)}</div>`;
  stream.appendChild(el);
  scrollToBottom();
  return el;
}
function addTyping() {
  const el = document.createElement('div');
  el.className = 'pc-msg pc-msg-assistant';
  el.innerHTML = `<div class="pc-bubble pc-typing"><span></span><span></span><span></span></div>`;
  stream.appendChild(el);
  scrollToBottom();
  return el;
}
function setBusy(state) { busy = state; input.disabled = state; sendBtn.disabled = state; }
function flash(msg) { const n = document.getElementById('pcNotice'); if (n) n.textContent = msg; }
function scrollToBottom() {
  requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
  [60, 200].forEach((d) => setTimeout(() => { stream.scrollTop = stream.scrollHeight; }, d));
}
