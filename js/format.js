// ================================================================
// format.js — Helpers d'affichage partagés par toutes les pages
// (évite de dupliquer ces fonctions dans dashboard/conversations/…)
// ================================================================

// ---------- Échappement HTML (anti-XSS à l'insertion via innerHTML) ----------
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ---------- Libellés ----------
export function labelUrgence(u) {
  return { normale: 'Normal', moderee: 'Modéré', elevee: 'Urgent' }[u] || u || '–';
}

export function labelStatut(s) {
  return {
    en_attente: 'En attente',
    a_rappeler: 'À rappeler',
    traite: 'Traité',
    ignore: 'Ignoré',
  }[s] || s || '–';
}

// ---------- Dates ----------
export function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'hier';
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export function formatToday() {
  const d = new Date();
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
