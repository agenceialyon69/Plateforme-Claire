// ================================================================
// demo-chat.js — Widget de démonstration sur la page d'accueil
// ----------------------------------------------------------------
// Branche le chat sur le VRAI endpoint /api/chat, avec un cabinet
// de démonstration dédié (données isolées des vrais cabinets).
//
// CONFIG : renseigne l'UUID du cabinet de démo ci-dessous.
//  - crée un cabinet "Démo" dans Supabase (voir docs/DEPLOIEMENT.md)
//  - colle son UUID dans DEMO_CABINET_ID
// Tant que ce n'est pas fait, le widget affiche un message neutre
// et reste désactivé (aucune erreur visible).
// ================================================================

import { escapeHtml } from '/js/format.js';

const DEMO_CABINET_ID = 'DEMO_CABINET_ID_HERE';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GREETING = "Bonjour, je suis Claire, l'assistante du cabinet 👋 Dites-moi ce qui vous amène et je m'occupe du reste.";

const stream = document.getElementById('demoStream');
const form = document.getElementById('demoForm');
const input = document.getElementById('demoInput');
const sendBtn = document.getElementById('demoSend');

const configured = UUID_RE.test(DEMO_CABINET_ID);
const messages = []; // historique { role, content }
let conversationId = null;
let busy = false;

// ---------- INIT ----------
addBubble('assistant', GREETING);
if (!configured) {
  setNotice('Démo en cours de configuration — réservez une démonstration pour échanger avec Claire.');
  input.disabled = true;
  sendBtn.disabled = true;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy || !configured) return;
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 2000) {
    setNotice('Message trop long (2000 caractères max).');
    return;
  }

  input.value = '';
  addBubble('user', text);
  messages.push({ role: 'user', content: text });

  setBusy(true);
  const typing = addTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, cabinetId: DEMO_CABINET_ID, conversationId }),
    });

    typing.remove();

    if (res.status === 429) {
      setNotice('Beaucoup de messages d\'un coup — patientez une minute puis réessayez.');
      setBusy(false);
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.reply) {
      addBubble('assistant', "Désolée, je n'ai pas pu répondre à l'instant. Réessayez dans un instant.");
      setBusy(false);
      return;
    }

    conversationId = data.conversationId || conversationId;
    addBubble('assistant', data.reply);
    messages.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    typing.remove();
    addBubble('assistant', "Connexion interrompue. Vérifiez votre réseau et réessayez.");
  } finally {
    setBusy(false);
  }
});

// ---------- HELPERS ----------
function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = `demo-msg demo-msg-${role === 'user' ? 'user' : 'assistant'}`;
  el.innerHTML = `<div class="demo-bubble">${escapeHtml(text)}</div>`;
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'demo-msg demo-msg-assistant';
  el.innerHTML = `<div class="demo-bubble demo-typing"><span></span><span></span><span></span></div>`;
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;
  return el;
}

function setBusy(state) {
  busy = state;
  input.disabled = state;
  sendBtn.disabled = state;
}

function setNotice(msg) {
  const el = document.getElementById('demoNotice');
  if (el) el.textContent = msg;
}
