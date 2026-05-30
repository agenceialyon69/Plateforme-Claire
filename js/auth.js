// ================================================================
// auth.js — login, logout, et "guard" pour pages protégées
// ================================================================

import { supabase, getSession, getUser } from './supabase-client.js';

// ----------------------------------------------------------------
// LOGIN (utilisé sur login.html)
// ----------------------------------------------------------------
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------
// LOGOUT (utilisé partout dans la sidebar)
// ----------------------------------------------------------------
export async function logout() {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

// ----------------------------------------------------------------
// GUARD — à appeler en haut de chaque page protégée.
// Redirige vers /login.html si non connecté.
// Retourne { session, cabinet } si connecté.
// ----------------------------------------------------------------
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }

  // Récupère les infos du cabinet associé
  const { data: cabinet, error } = await supabase
    .from('cabinets')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !cabinet) {
    // L'utilisateur existe dans auth.users mais pas dans cabinets
    // Cas rare : compte mal initialisé, on déconnecte
    console.error('Cabinet introuvable pour cet utilisateur', error);
    await logout();
    return null;
  }

  return { session, cabinet, user: session.user };
}

// ----------------------------------------------------------------
// Si déjà connecté, redirige vers le dashboard
// (à utiliser sur login.html)
// ----------------------------------------------------------------
export async function redirectIfAuthed() {
  const session = await getSession();
  if (session) {
    window.location.href = '/cabinet.html';
  }
}

// ----------------------------------------------------------------
// Initialise la sidebar : utilisateur affiché + lien actif + logout
// ----------------------------------------------------------------
export function initSidebar(cabinet, activePage) {
  // Marque le lien actif
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.dataset.page === activePage) {
      link.classList.add('active');
    }
  });

  // Affiche le nom du cabinet
  const nameEl = document.querySelector('[data-sidebar-name]');
  const mailEl = document.querySelector('[data-sidebar-mail]');
  const avatarEl = document.querySelector('[data-sidebar-avatar]');
  if (nameEl) nameEl.textContent = cabinet.nom;
  if (mailEl) mailEl.textContent = cabinet.email;
  if (avatarEl) avatarEl.textContent = (cabinet.nom || 'C').charAt(0).toUpperCase();

  // Branche le bouton logout
  const logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Ajoute le lien "Inviter un cabinet" si l'utilisateur est administrateur
  maybeAddAdminLink(activePage);
}

// ----------------------------------------------------------------
// maybeAddAdminLink — révèle l'outil d'invitation dans la sidebar
// uniquement si l'utilisateur connecté est administrateur (ADMIN_EMAILS).
// La vérification fait autorité côté serveur ; ici on se contente d'afficher.
// ----------------------------------------------------------------
async function maybeAddAdminLink(activePage) {
  try {
    const res = await apiFetch('/api/invite-cabinet', { method: 'GET' });
    const { admin } = await res.json();
    if (!admin) return;

    const nav = document.querySelector('.sidebar-nav');
    if (!nav || nav.querySelector('[data-page="admin"]')) return;

    const section = document.createElement('div');
    section.className = 'sidebar-nav-section';
    section.style.marginTop = '16px';
    section.textContent = 'Administration';

    const link = document.createElement('a');
    link.href = '/admin.html';
    link.className = 'sidebar-link' + (activePage === 'admin' ? ' active' : '');
    link.dataset.page = 'admin';
    link.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
      '<path d="M19 8v6M22 11h-6"/></svg> Inviter un cabinet';

    nav.appendChild(section);
    nav.appendChild(link);
  } catch (_) {
    /* silencieux : si l'appel échoue, on n'affiche simplement rien */
  }
}

// ----------------------------------------------------------------
// Helper pour faire des appels API authentifiés
// ----------------------------------------------------------------
export async function apiFetch(path, options = {}) {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  return res;
}
