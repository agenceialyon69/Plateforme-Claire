// ================================================================
// demo-chat.js — Widget de démonstration sur la page d'accueil
// ----------------------------------------------------------------
// • Branche le chat sur le VRAI endpoint /api/chat, avec un cabinet
//   de démonstration dédié (données isolées des vrais cabinets).
// • Suggestions cliquables + plein écran mobile (gestion du clavier).
// • Carte « reçu par le cabinet » alimentée par /api/demo-summary.
//
// CONFIG : renseigne l'UUID du cabinet de démo ci-dessous.
//  - crée un cabinet "Démo" dans Supabase (voir MISE-EN-LIGNE.md)
//  - colle son UUID dans DEMO_CABINET_ID
// Tant que ce n'est pas fait, le champ reste utilisable mais Claire
// invite à réserver une démo (aucune erreur technique visible).
// ================================================================

import { escapeHtml, labelUrgence } from '/js/format.js';
import { track } from '/js/track.js';

const DEMO_CABINET_ID = 'fb235b55-e53c-469b-bc12-64ab845a765f';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GREETING = "Bonjour, je suis Claire, l'assistante du cabinet 👋 Dites-moi ce qui vous amène et je m'occupe du reste.";
const NOT_CONFIGURED_REPLY = "Je suis en cours de configuration sur cette démo. Pour me voir répondre en conditions réelles, réservez une démonstration juste en dessous — j'en ai pour 10 minutes avec vous.";

const stream = document.getElementById('demoStream');
const form = document.getElementById('demoForm');
const input = document.getElementById('demoInput');
const sendBtn = document.getElementById('demoSend');
const suggestions = document.getElementById('demoSuggestions');

const configured = UUID_RE.test(DEMO_CABINET_ID);
const messages = []; // historique { role, content }
let conversationId = null;
let busy = false;

// ---------- INIT ----------
addBubble('assistant', GREETING);

// ---------- ENVOI ----------
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const text = input.value.trim();
  if (!text) return;
  if (text.length > 2000) {
    setNotice('Message trop long (2000 caractères max).');
    return;
  }

  input.value = '';
  updateSuggestionsVisibility();
  if (messages.length === 0) track('demo_started');
  addBubble('user', text);
  messages.push({ role: 'user', content: text });

  // Démo pas encore configurée : on reste poli, on invite à réserver.
  if (!configured) {
    const typing = addTyping();
    await wait(700);
    typing.remove();
    addBubble('assistant', NOT_CONFIGURED_REPLY);
    return;
  }

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

    // Révèle « ce que reçoit le cabinet » dès que Claire a qualifié la demande
    maybeRevealSummary();
  } catch (err) {
    typing.remove();
    addBubble('assistant', "Connexion interrompue. Vérifiez votre réseau et réessayez.");
  } finally {
    setBusy(false);
    input.focus();
  }
});

// ---------- SUGGESTIONS ----------
if (suggestions) {
  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-suggestion');
    if (!btn || busy) return;
    openFullscreen();
    input.value = btn.dataset.msg || '';
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
}
input?.addEventListener('input', updateSuggestionsVisibility);
updateSuggestionsVisibility();

// ---------- HELPERS CHAT ----------
function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = `demo-msg demo-msg-${role === 'user' ? 'user' : 'assistant'}`;
  el.innerHTML = `<div class="demo-bubble">${escapeHtml(text)}</div>`;
  stream.appendChild(el);
  scrollToBottom();
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'demo-msg demo-msg-assistant';
  el.innerHTML = `<div class="demo-bubble demo-typing"><span></span><span></span><span></span></div>`;
  stream.appendChild(el);
  scrollToBottom();
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

function updateSuggestionsVisibility() {
  if (!suggestions) return;
  // On masque les suggestions dès qu'un échange a eu lieu ou qu'on tape.
  const hide = input.value.trim() !== '' || messages.length > 0;
  suggestions.style.display = hide ? 'none' : 'flex';
}

function scrollToBottom() {
  requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
  [60, 180, 360].forEach((d) => setTimeout(() => { stream.scrollTop = stream.scrollHeight; }, d));
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- « Ce que reçoit le cabinet » ----------
let summaryShown = false;
let summaryPolling = false;
async function maybeRevealSummary() {
  if (summaryShown || summaryPolling || !conversationId || messages.length < 4) return;
  summaryPolling = true;
  try {
    for (let attempt = 0; attempt < 4 && !summaryShown; attempt++) {
      try {
        const res = await fetch(`/api/demo-summary?conversationId=${encodeURIComponent(conversationId)}`);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.enabled === false) break;
          if (data.demande) { renderSummary(data.demande); summaryShown = true; break; }
        }
      } catch { /* on retente */ }
      if (!summaryShown) await wait(1800);
    }
  } finally {
    summaryPolling = false;
  }
}

function renderSummary(d) {
  const card = document.getElementById('demoSummary');
  if (!card) return;
  const row = (label, value) => value
    ? `<div class="ds-row"><span class="ds-label">${label}</span><span class="ds-value">${escapeHtml(value)}</span></div>`
    : '';
  card.innerHTML = `
    <div class="ds-head">
      <span class="ds-badge">Reçu par le cabinet</span>
      <span class="badge badge-urgence-${escapeHtml(d.urgence || 'normale')}">${labelUrgence(d.urgence)}</span>
    </div>
    ${row('Patient', d.patient_nom)}
    ${row('Téléphone', d.patient_telephone)}
    ${row('Motif', d.motif)}
    ${row('Souhait', d.souhait)}
  `;
  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  track('demo_qualified', { urgence: d.urgence || 'normale' });
}

// ================================================================
// PLEIN ÉCRAN MOBILE — corrige l'ouverture du clavier sur téléphone
// ================================================================
const chatWrapper = document.getElementById('chatWrapper');
const backBtn = document.getElementById('chatBackBtn');
const MOBILE_BREAKPOINT = 680;

function isMobile() {
  return window.matchMedia(`(max-width:${MOBILE_BREAKPOINT}px)`).matches;
}

// Ajuste la hauteur du chat à la zone réellement visible (au-dessus du clavier)
function syncFullscreenHeight() {
  if (!chatWrapper || !chatWrapper.classList.contains('chat-fullscreen')) return;
  if (window.visualViewport) {
    const vv = window.visualViewport;
    chatWrapper.style.height = vv.height + 'px';
    chatWrapper.style.top = (vv.offsetTop || 0) + 'px';
  } else {
    chatWrapper.style.height = window.innerHeight + 'px';
  }
  scrollToBottom();
}

let savedScrollY = 0;

function openFullscreen() {
  if (!chatWrapper || !isMobile() || chatWrapper.classList.contains('chat-fullscreen')) return;
  // Mémorise la position de la page pour la restaurer à la fermeture (évite le saut)
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  chatWrapper.classList.add('chat-fullscreen');
  document.body.classList.add('chat-open');
  document.body.style.top = `-${savedScrollY}px`;
  syncFullscreenHeight();
  [120, 300, 500].forEach((d) => setTimeout(syncFullscreenHeight, d));
}

function closeFullscreen() {
  if (!chatWrapper || !chatWrapper.classList.contains('chat-fullscreen')) return;
  chatWrapper.classList.remove('chat-fullscreen');
  document.body.classList.remove('chat-open');
  document.body.style.top = '';
  chatWrapper.style.height = '';
  chatWrapper.style.top = '';
  // Restaure la position exacte où l'utilisateur était sur la page
  window.scrollTo(0, savedScrollY);
  if (input) input.blur();
}

// On passe en plein écran dès que l'utilisateur entre dans la conversation (mobile)
input?.addEventListener('focus', () => {
  openFullscreen();
  [120, 350].forEach((d) => setTimeout(syncFullscreenHeight, d));
});

backBtn?.addEventListener('click', closeFullscreen);

window.addEventListener('resize', () => { if (!isMobile()) closeFullscreen(); });

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncFullscreenHeight);
  window.visualViewport.addEventListener('scroll', syncFullscreenHeight);
}
