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
