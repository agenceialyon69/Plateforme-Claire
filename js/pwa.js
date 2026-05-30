// ================================================================
// pwa.js — Service worker + installation « one-tap » de l'app
// ----------------------------------------------------------------
// • Enregistre le service worker (app installable, mode hors-ligne).
// • Affiche un bouton « Installer l'application » :
//     - Android/Chrome/Edge : installation native en 1 clic (beforeinstallprompt)
//     - iPhone/iPad (Safari) : ouvre une fiche d'instructions élégante
// • Se masque automatiquement si l'app est déjà installée.
// ================================================================

(function () {
  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker non enregistré :', err);
      });
    });
  }

  // ---------- Détection plateforme / état ----------
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // Déjà installée → rien à proposer.
  if (isStandalone) return;

  const ua = window.navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);

  let deferredPrompt = null;

  // ---------- Styles injectés (autonomes, aucune dépendance) ----------
  const css = `
    .pwa-install-btn {
      position: fixed; right: 16px; bottom: 16px; z-index: 9000;
      display: inline-flex; align-items: center; gap: 9px;
      padding: 13px 20px; border-radius: 999px;
      background: #1f3d35; color: #f5f0e8;
      font-family: 'Inter Tight', -apple-system, sans-serif;
      font-size: 14.5px; font-weight: 600; cursor: pointer;
      border: none; box-shadow: 0 10px 30px rgba(31,61,53,0.32);
      transition: transform .18s ease, box-shadow .18s ease, opacity .25s ease;
      opacity: 0; transform: translateY(12px); pointer-events: none;
    }
    .pwa-install-btn.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .pwa-install-btn:hover { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(31,61,53,0.4); }
    .pwa-install-btn svg { width: 18px; height: 18px; flex-shrink: 0; }

    .pwa-sheet-backdrop {
      position: fixed; inset: 0; z-index: 9100;
      background: rgba(21,41,31,0.55); backdrop-filter: blur(4px);
      display: flex; align-items: flex-end; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity .25s ease;
    }
    .pwa-sheet-backdrop.show { opacity: 1; pointer-events: auto; }
    .pwa-sheet {
      width: 100%; max-width: 460px;
      background: #fff; color: #1a1a1a;
      border-radius: 22px 22px 0 0; padding: 26px 24px calc(26px + env(safe-area-inset-bottom));
      box-shadow: 0 -10px 40px rgba(0,0,0,0.2);
      transform: translateY(100%); transition: transform .3s cubic-bezier(.2,.8,.2,1);
      font-family: 'Inter Tight', -apple-system, sans-serif;
    }
    .pwa-sheet-backdrop.show .pwa-sheet { transform: translateY(0); }
    @media (min-width: 520px) {
      .pwa-sheet-backdrop { align-items: center; }
      .pwa-sheet { border-radius: 22px; }
    }
    .pwa-sheet-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .pwa-sheet-logo {
      width: 44px; height: 44px; border-radius: 12px; background: #1f3d35;
      display: flex; align-items: center; justify-content: center;
      color: #f5f0e8; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 22px; flex-shrink: 0;
    }
    .pwa-sheet h3 { font-family: 'Fraunces', Georgia, serif; font-size: 21px; font-weight: 600; color: #1f3d35; }
    .pwa-sheet p.sub { font-size: 14px; color: #4a4a4a; margin: 2px 0 18px; }
    .pwa-step { display: flex; align-items: flex-start; gap: 13px; margin-bottom: 15px; }
    .pwa-step-num {
      width: 27px; height: 27px; border-radius: 50%; background: #ede5d3; color: #b07d3e;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;
    }
    .pwa-step p { font-size: 14.5px; line-height: 1.5; color: #1a1a1a; }
    .pwa-step b { color: #1f3d35; }
    .pwa-ios-share { display: inline-flex; vertical-align: -4px; width: 18px; height: 18px; color: #007aff; }
    .pwa-sheet-close {
      width: 100%; margin-top: 8px; padding: 13px; border: none; border-radius: 999px;
      background: #f5f0e8; color: #1f3d35; font-weight: 600; font-size: 14.5px; cursor: pointer;
      font-family: inherit;
    }
    .pwa-sheet-close:hover { background: #ede5d3; }
    @media (prefers-reduced-motion: reduce) {
      .pwa-install-btn, .pwa-sheet, .pwa-sheet-backdrop { transition: none; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Bouton flottant ----------
  const downloadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pwa-install-btn';
  btn.setAttribute('aria-label', "Installer l'application Claire");
  btn.innerHTML = downloadIcon + "<span>Installer l'app</span>";
  document.body.appendChild(btn);

  function showBtn() { requestAnimationFrame(() => btn.classList.add('show')); }
  function hideBtn() { btn.classList.remove('show'); }

  // ---------- Fiche d'instructions iOS ----------
  function buildIOSSheet() {
    const backdrop = document.createElement('div');
    backdrop.className = 'pwa-sheet-backdrop';
    const shareIcon = '<svg class="pwa-ios-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L8 8m4-4l4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>';
    backdrop.innerHTML = `
      <div class="pwa-sheet" role="dialog" aria-modal="true" aria-label="Installer l'application Claire">
        <div class="pwa-sheet-head">
          <div class="pwa-sheet-logo">C</div>
          <div>
            <h3>Installer Claire</h3>
          </div>
        </div>
        <p class="sub">Ajoutez Claire à votre écran d'accueil pour l'ouvrir comme une vraie application, en plein écran.</p>
        <div class="pwa-step">
          <span class="pwa-step-num">1</span>
          <p>Appuyez sur le bouton <b>Partager</b> ${shareIcon} en bas de Safari.</p>
        </div>
        <div class="pwa-step">
          <span class="pwa-step-num">2</span>
          <p>Faites défiler et choisissez <b>« Sur l'écran d'accueil »</b>.</p>
        </div>
        <div class="pwa-step">
          <span class="pwa-step-num">3</span>
          <p>Appuyez sur <b>« Ajouter »</b> en haut à droite. C'est fait !</p>
        </div>
        <button type="button" class="pwa-sheet-close">J'ai compris</button>
      </div>
    `;
    document.body.appendChild(backdrop);
    const close = () => backdrop.classList.remove('show');
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.pwa-sheet-close').addEventListener('click', close);
    return { backdrop, open: () => requestAnimationFrame(() => backdrop.classList.add('show')) };
  }
  let iosSheet = null;

  // ---------- Logique selon plateforme ----------
  // Android / Chrome / Edge : prompt natif
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBtn();
  });

  window.addEventListener('appinstalled', () => {
    hideBtn();
    deferredPrompt = null;
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') hideBtn();
      deferredPrompt = null;
      return;
    }
    if (isIOS) {
      if (!iosSheet) iosSheet = buildIOSSheet();
      iosSheet.open();
    }
  });

  // iOS ne déclenche pas beforeinstallprompt → on montre le bouton directement
  if (isIOS) {
    window.addEventListener('load', () => setTimeout(showBtn, 1200));
  }
})();
