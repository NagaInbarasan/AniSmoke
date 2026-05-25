/* ═══════════════════════════════════════════════════════════
   ANISMOKE — UI Component Modules
   ═══════════════════════════════════════════════════════════ */

/* ════════════════════════════════
   TOAST SYSTEM
   ════════════════════════════════ */
const Toast = (() => {
  let container;
  function init() {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  }
  function show(msg, type = 'info', duration = 3500) {
    if (!container) init();
    const icons = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      info: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      warning: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5 9 14H3l9-14z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||icons.info}</span> ${msg}`;
    container.appendChild(el);
    requestAnimationFrame(() => { requestAnimationFrame(() => { el.classList.add('show'); }); });
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, duration);
  }
  return { show, success:(m)=>show(m,'success'), error:(m)=>show(m,'error'), info:(m)=>show(m,'info'), warning:(m)=>show(m,'warning') };
})();

// Signal errors.js that the Toast system is now available
window.dispatchEvent(new CustomEvent('as:toast-ready'));

/* ════════════════════════════════
   THEME SYSTEM
   ════════════════════════════════ */
const ThemeManager = (() => {
  const THEMES = [
    { id: 'neon',     label: 'Neon Pulse', color: '#131313', icon: '⚡' },
    { id: 'light',    label: 'Light',      color: '#f4f4f8', icon: '☀️' },
  ];
  let current = localStorage.getItem('as-theme') || 'neon';

  function apply(theme) {
    current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('as-theme', theme);
    // Update picker UI
    document.querySelectorAll('.theme-option').forEach(o => {
      o.classList.toggle('active', o.dataset.theme === theme);
    });
  }

  function buildPicker(container) {
    if (!container) return;
    container.innerHTML = `<div class="theme-panel-title">Appearance</div>`;
    THEMES.forEach(t => {
      const el = document.createElement('div');
      el.className = `theme-option${t.id === current ? ' active' : ''}`;
      el.dataset.theme = t.id;
      el.innerHTML = `
        <span class="theme-swatch" style="background:${t.color};border-color:${t.id===current?'var(--accent)':'transparent'}"></span>
        <span>${t.icon} ${t.label}</span>
      `;
      el.onclick = () => {
        apply(t.id);
        Toast.success(`Theme: ${t.label}`);
      };
      container.appendChild(el);
    });
  }

  function init() {
    apply(current);
    // Build all pickers on page
    document.querySelectorAll('.theme-panel').forEach(buildPicker);
    // Toggle button
    document.querySelectorAll('[data-action="theme-toggle"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = btn.nextElementSibling || btn.closest('.theme-wrap')?.querySelector('.theme-panel');
        if (panel) panel.classList.toggle('open');
      });
    });
    // Close on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.theme-panel.open').forEach(p => p.classList.remove('open'));
    });
  }

  return { init, apply, current: () => current, themes: THEMES };
})();

/* ════════════════════════════════
   MOBILE MENU
   ════════════════════════════════ */
function initMobileMenu() {
  const toggle  = document.getElementById('menuToggle');
  const menu    = document.getElementById('mobileMenu');
  const overlay = document.getElementById('mobileMenuOverlay');
  if (!toggle || !menu) return;

  function open() {
    toggle.classList.add('open');
    menu.classList.add('open');
    overlay?.classList.add('open');
    document.body.classList.add('no-scroll');
  }
  function close() {
    toggle.classList.remove('open');
    menu.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  toggle.addEventListener('click', () => menu.classList.contains('open') ? close() : open());
  overlay?.addEventListener('click', close);
  menu.querySelectorAll('.mobile-menu-link').forEach(l => l.addEventListener('click', close));
}

/* ════════════════════════════════
   SIDEBAR
   ════════════════════════════════ */
function initSidebar() {
  const sidebar = document.querySelector('.as-sidebar');
  if (!sidebar) return;

  // Restore pinned state
  if (localStorage.getItem('as-sidebar-pinned') === '1') {
    sidebar.classList.add('pinned');
  }

  // Pin toggle
  const pinBtn = sidebar.querySelector('.as-sidebar-pin');
  if (pinBtn) {
    pinBtn.addEventListener('click', () => {
      sidebar.classList.toggle('pinned');
      localStorage.setItem('as-sidebar-pinned', sidebar.classList.contains('pinned') ? '1' : '0');
    });
  }
}

/* ════════════════════════════════
   USER DROPDOWN
   ════════════════════════════════ */
function initUserMenu() {
  const btn      = document.getElementById('userMenuBtn');
  const dropdown = document.getElementById('userDropdown');
  const logoutBtn= document.getElementById('logoutBtn');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
  logoutBtn?.addEventListener('click', async () => { if (window.Auth) { await window.Auth.logout(); } dropdown.classList.remove('open'); });
}

/* ════════════════════════════════
   AUTH MODAL
   ════════════════════════════════ */
function _friendlyAuthError(e) {
  const msg = (e?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Invalid email or password';
  if (msg.includes('email not confirmed'))        return 'Please confirm your email first';
  if (msg.includes('user already registered'))    return 'An account with this email already exists';
  if (msg.includes('password should be'))         return 'Password must be at least 6 characters';
  if (msg.includes('rate limit'))                 return 'Too many attempts — please wait a moment';
  if (msg.includes('network') || msg.includes('fetch')) return 'Network error — check your connection';
  return e?.message || 'Something went wrong — please try again';
}

function initAuthModal() {
  const modal       = document.getElementById('authModal');
  const openBtns    = document.querySelectorAll('[data-action="open-auth"]');
  const closeBtn    = document.getElementById('authClose');
  const tabs        = document.querySelectorAll('.auth-tab');
  const loginForm   = document.getElementById('loginForm');
  const regForm     = document.getElementById('registerForm');

  function open()  { modal?.classList.add('open');    document.body.classList.add('no-scroll'); }
  function close() {
    modal?.classList.remove('open');
    document.body.classList.remove('no-scroll');
    ['loginEmail','loginPass','regName','regEmail','regPass'].forEach(clearFieldError);
    const regPass = document.getElementById('regPass');
    if (regPass) {
      regPass.value = '';
      regPass.dispatchEvent(new Event('input'));
    }
  }

  openBtns.forEach(b => b.addEventListener('click', open));
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', e => { if (e.target === modal) close(); });

  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      const show = target === 'login' ? loginForm : regForm;
      const hide = target === 'login' ? regForm   : loginForm;
      hide?.classList.add('hidden');
      show?.classList.remove('hidden');
      show?.classList.remove('auth-form-animate');
      requestAnimationFrame(() => show?.classList.add('auth-form-animate'));

      if (target === 'login') {
        const regPass = document.getElementById('regPass');
        if (regPass) {
          regPass.value = '';
          regPass.dispatchEvent(new Event('input'));
        }
      }
    });
  });

  // Button loading state helper (CSS spinner)
  function setLoading(btn, loading, originalText) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.classList.add('btn-loading');
    } else {
      btn.classList.remove('btn-loading');
      btn.textContent = originalText;
    }
  }

  // Inline field validation helpers
  function showFieldError(inputId, msg) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.classList.add('error');
    input.classList.remove('shake');
    requestAnimationFrame(() => requestAnimationFrame(() => input.classList.add('shake')));
    const field = input.closest('.field');
    if (!field) return;
    let errEl = field.querySelector('.field-error-msg');
    if (!errEl) { errEl = document.createElement('span'); errEl.className = 'field-error-msg'; field.appendChild(errEl); }
    errEl.textContent = msg;
    requestAnimationFrame(() => errEl.classList.add('show'));
    input.addEventListener('input', () => clearFieldError(inputId), { once: true });
  }

  function clearFieldError(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.classList.remove('error', 'shake');
    const errEl = input.closest('.field')?.querySelector('.field-error-msg');
    if (errEl) { errEl.classList.remove('show'); setTimeout(() => errEl.remove(), 250); }
  }

  // Delegated button handler (bulletproof — works even if elements aren't found at init)
  modal?.addEventListener('click', async (e) => {
    const btn = e.target.closest('#loginSubmit, #registerSubmit, #googleOAuth, #discordOAuth, #forgotPasswordBtn');
    if (!btn) return;

    if (btn.id === 'loginSubmit') {
      const email    = document.getElementById('loginEmail')?.value?.trim() || '';
      const password = document.getElementById('loginPass')?.value || '';
      if (!email)    { showFieldError('loginEmail', 'Email required');   return; }
      if (!password) { showFieldError('loginPass',  'Password required'); return; }
      const orig = btn.textContent;
      setLoading(btn, true, orig);
      try {
        await window.SupabaseClient.Auth.signInWithEmail(email, password);
        close();
      } catch (err) {
        Toast.error(_friendlyAuthError(err));
      } finally {
        setLoading(btn, false, orig);
      }
    }

    else if (btn.id === 'registerSubmit') {
      const name     = document.getElementById('regName')?.value?.trim()  || '';
      const email    = document.getElementById('regEmail')?.value?.trim() || '';
      const password = document.getElementById('regPass')?.value          || '';
      if (!name)               { showFieldError('regName',  'Display name required'); return; }
      if (!email)              { showFieldError('regEmail', 'Email required');          return; }
      if (password.length < 6) { showFieldError('regPass',  'Min. 6 characters');      return; }
      const orig = btn.textContent;
      setLoading(btn, true, orig);
      try {
        const data = await window.SupabaseClient.Auth.signUp(email, password, name);
        if (data?.session) {
          close();
          Toast.show(`Welcome to AniSmoke, ${name}!`, 'success', 5000);
        } else {
          // Show verification banner instead of closing
          const verifyBanner = document.getElementById('authVerifyBanner');
          const verifyEmail  = document.getElementById('verifyEmailAddr');
          if (verifyBanner && verifyEmail) {
            verifyEmail.textContent = email;
            regForm?.classList.add('hidden');
            loginForm?.classList.add('hidden');
            verifyBanner.classList.remove('hidden');
          } else {
            close();
            Toast.show('Account created! Check your email to confirm.', 'info', 7000);
          }
        }
      } catch (err) {
        Toast.error(_friendlyAuthError(err));
      } finally {
        setLoading(btn, false, orig);
      }
    }

    else if (btn.id === 'googleOAuth') {
      const orig = btn.textContent;
      setLoading(btn, true, orig);
      try {
        await window.SupabaseClient.Auth.signInWithGoogle();
      } catch (err) {
        Toast.error(_friendlyAuthError(err));
        setLoading(btn, false, orig);
      }
    }

    else if (btn.id === 'discordOAuth') {
      Toast.info('Discord login coming soon!');
    }

    else if (btn.id === 'forgotPasswordBtn') {
      const email = document.getElementById('loginEmail')?.value?.trim() || '';
      if (!email) { showFieldError('loginEmail', 'Enter your email first'); return; }
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await window.SupabaseClient.Auth.resetPassword(email);
        Toast.show('Password reset link sent! Check your inbox.', 'success', 6000);
      } catch (err) {
        Toast.error(_friendlyAuthError(err));
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    }
  });

  // Password visibility toggles
  modal?.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type !== 'password';
      input.type = showing ? 'password' : 'text';
      btn.style.color = showing ? '' : 'var(--cyan)';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });

  // Enter key submits forms
  ['loginEmail', 'loginPass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginSubmit')?.click(); });
  });
  ['regName', 'regEmail', 'regPass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('registerSubmit')?.click(); });
  });

  // Password strength indicator
  const regPass = document.getElementById('regPass');
  if (regPass) {
    const parentField = regPass.closest('.field');
    if (parentField && !parentField.querySelector('.pw-strength-bar')) {
      const bar = document.createElement('div');
      bar.className = 'pw-strength-bar';
      bar.innerHTML = '<div class="pw-strength-fill" id="pwStrengthFill"></div>';
      
      const txt = document.createElement('span');
      txt.className = 'pw-strength-text';
      txt.id = 'pwStrengthText';
      
      parentField.appendChild(bar);
      parentField.appendChild(txt);
      
      function checkPasswordStrength(password) {
        if (!password) return { label: '', cls: '' };
        if (password.length < 6) return { label: 'Weak', cls: 'strength-weak' };
        
        let score = 1;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        
        if (score <= 2) {
          return { label: 'Weak', cls: 'strength-weak' };
        } else if (score === 3) {
          return { label: 'Medium', cls: 'strength-medium' };
        } else if (score === 4) {
          return { label: 'Strong', cls: 'strength-strong' };
        } else {
          return { label: 'Very Strong', cls: 'strength-very-strong' };
        }
      }
      
      regPass.addEventListener('input', () => {
        const val = regPass.value;
        const fill = document.getElementById('pwStrengthFill');
        const label = document.getElementById('pwStrengthText');
        if (!fill || !label) return;
        
        if (!val) {
          fill.className = 'pw-strength-fill';
          fill.style.width = '0';
          label.textContent = '';
          label.className = 'pw-strength-text';
          return;
        }
        
        const strength = checkPasswordStrength(val);
        fill.className = `pw-strength-fill ${strength.cls}`;
        label.textContent = strength.label;
        label.className = `pw-strength-text ${strength.cls.replace('strength-', '')}`;
      });
    }
  }
}

/* ════════════════════════════════
   ANIME DETAIL MODAL
   ════════════════════════════════ */
function initDetailModal() {
  const modal    = document.getElementById('detailModal');
  const closeBtn = document.getElementById('detailClose');
  closeBtn?.addEventListener('click', closeDetail);
  modal?.addEventListener('click', e => { if (e.target === modal) closeDetail(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
}

function openDetail(anime) {
  const modal = document.getElementById('detailModal');
  if (!modal) return;
  const title  = anime.title?.english || anime.title?.romaji || 'Unknown';
  const native = anime.title?.native || '';
  const cover  = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
  const banner = anime.bannerImage || cover;
  const desc   = (anime.description || 'No description.').replace(/<[^>]*>/g, '');
  const score  = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '—';

  document.getElementById('dBanner').src = banner;
  document.getElementById('dPoster').src = cover;
  document.getElementById('dTitle').textContent   = title;
  document.getElementById('dNative').textContent  = native;
  document.getElementById('dDesc').textContent    = desc;
  document.getElementById('dStats').innerHTML = `
    <div class="dstat"><span class="dstat-val">${score}</span><span class="dstat-key">Score</span></div>
    <div class="dstat"><span class="dstat-val">${anime.episodes || '?'}</span><span class="dstat-key">Episodes</span></div>
    <div class="dstat"><span class="dstat-val">${anime.seasonYear || '—'}</span><span class="dstat-key">Year</span></div>
    <div class="dstat"><span class="dstat-val" style="font-size:12px">${anime.studios?.nodes?.[0]?.name || '—'}</span><span class="dstat-key">Studio</span></div>
  `;

  const genresEl = document.getElementById('dGenres');
  genresEl.innerHTML = '';
  (anime.genres || []).forEach(g => {
    const s = document.createElement('span');
    s.className = 'tag'; s.textContent = g;
    s.onclick = () => { closeDetail(); location.href = `browse.html?genre=${encodeURIComponent(g)}`; };
    genresEl.appendChild(s);
  });

  const watchBtn = document.getElementById('dWatchBtn');
  watchBtn.onclick = () => { location.href = `watch.html?id=${anime.id}${anime.source === 'jikan' ? '&source=jikan' : ''}`; };

  const wlBtn = document.getElementById('dWlBtn');
  const entry = window.Watchlist ? window.Watchlist.get(anime.id) : null;
  const heartIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
  const heartFilledIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

  wlBtn.innerHTML = entry ? `${heartFilledIcon} In Watchlist` : `${heartIcon} Add to Watchlist`;
  wlBtn.onclick = (e) => {
    e.stopPropagation();
    // Auth-gate
    if (!window.SupabaseClient?.Auth?.getUser()) {
      Toast.info('Sign in to save to your watchlist');
      closeDetail();
      document.querySelector('[data-action="open-auth"]')?.click();
      return;
    }
    if (window.buildStatusDropdown) window.buildStatusDropdown(anime, wlBtn);
  };

  modal.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeDetail() {
  document.getElementById('detailModal')?.classList.remove('open');
  document.body.classList.remove('no-scroll');
}

/* ════════════════════════════════
   CARD BUILDER
   ════════════════════════════════ */
function buildAnimeCard(anime, opts = {}) {
  const { showRank = false, rank = 0, onClick } = opts;
  const title  = anime.title?.english || anime.title?.romaji || 'Unknown';
  const cover  = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
  const rawScore = anime.averageScore || 0;
  // "74% MATCH" from averageScore (0–100)
  const matchStr = rawScore ? `${rawScore}% MATCH` : '';
  // Episode badge – prefer next airing, fall back to total eps
  const epLabel = anime.nextAiringEpisode
    ? `EP ${anime.nextAiringEpisode.episode - 1} NEW`
    : anime.episodes
      ? `${anime.episodes} EP`
      : '';
  // Meta line – format + year
  const metaStr = [
    anime.format?.replace(/_/g, ' '),
    anime.seasonYear
  ].filter(Boolean).join(' · ');

  const card = document.createElement('div');
  card.className = 'anime-card';

  card.innerHTML = `
    <div class="anime-card-thumb">
      <img src="${cover}" alt="${title}" loading="lazy"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 150%22><rect fill=%22%231a1a35%22 width=%22100%25%22 height=%22150%22/><text fill=%22%23444%22 x=%2250%22 y=%2280%22 text-anchor=%22middle%22 font-size=%2212%22>No Cover</text></svg>'">

      <!-- EP badge – top-left purple -->
      <div class="card-badge-tl">
        ${epLabel ? `<span class="card-ep">${epLabel}</span>` : ''}
        ${showRank  ? `<span class="card-ep" style="background:var(--cyan);color:#000">#${rank}</span>` : ''}
      </div>

      <!-- Play button – centre of image -->
      <button class="anime-card-play" aria-label="Watch ${title}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      </button>

      <!-- Persistent gradient overlay with all info -->
      <div class="anime-card-overlay">
        <div class="anime-card-overlay-title">${title}</div>
        <div class="anime-card-hud-row">
          ${matchStr ? `<span class="anime-card-match">${matchStr}</span>` : ''}
          ${metaStr  ? `<span class="anime-card-hud-meta">${metaStr}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Legacy .anime-card-info kept in DOM but hidden via CSS -->
    <div class="anime-card-info"></div>
  `;

  // Inject watchlist quick-add button into the overlay
  const overlay = card.querySelector('.anime-card-overlay');
  const addBtn  = window.Watchlist ? window.Watchlist.buildAddBtn(anime) : null;
  if (addBtn) {
    addBtn.classList.add('anime-card-quick-add');
    overlay.appendChild(addBtn);
  }

  // Play button wires to watch page
  card.querySelector('.anime-card-play').addEventListener('click', (e) => {
    e.stopPropagation();
    location.href = `watch.html?id=${anime.id}${anime.source === 'jikan' ? '&source=jikan' : ''}`;
  });

  // Card click → detail modal
  card.addEventListener('click', () => {
    if (onClick) onClick(anime); else openDetail(anime);
  });

  // Watchlist ring state
  const hasInWatchlist = window.Watchlist ? window.Watchlist.has(anime.id) : false;
  if (hasInWatchlist) card.classList.add('in-watchlist');
  
  const cardRef = new WeakRef(card);
  const updateListener = () => {
    const c = cardRef.deref();
    const isPresent = window.Watchlist ? window.Watchlist.has(anime.id) : false;
    if (c) c.classList.toggle('in-watchlist', isPresent);
    else window.removeEventListener('watchlist-update', updateListener);
  };
  window.addEventListener('watchlist-update', updateListener);

  return card;
}

/* ════════════════════════════════
   GLITCH & MICRO-INTERACTION ENGINE
   ════════════════════════════════ */
function initGlitchAnimations() {
  // Section title scroll-flicker via IntersectionObserver
  const titles = document.querySelectorAll('.section-title');
  if (titles.length && 'IntersectionObserver' in window) {
    const flickerObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.remove('is-visible', 'flicker-in');
          requestAnimationFrame(() => {
            el.classList.add('is-visible', 'flicker-in');
            el.addEventListener('animationend', () => {
              el.classList.remove('flicker-in');
            }, { once: true });
          });
          flickerObserver.unobserve(el);
        }
      });
    }, { threshold: 0.2 });
    titles.forEach(t => flickerObserver.observe(t));
  } else {
    titles.forEach(t => t.classList.add('is-visible'));
  }

  // Mirror data-text on glitch-hover elements
  document.querySelectorAll('.glitch-hover').forEach(el => {
    if (!el.dataset.text) el.dataset.text = el.textContent.trim();
  });

  // Sidebar nav links get glitch-hover automatically
  document.querySelectorAll('.as-sidebar-link, .as-nav-link').forEach(link => {
    link.classList.add('glitch-hover');
    if (!link.dataset.text) {
      const span = link.querySelector('span');
      link.dataset.text = span ? span.textContent.trim() : link.textContent.trim();
    }
  });

  // Page-exit wipe
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('http')) return;
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      const pageWrap = document.querySelector('.page-wrap');
      if (pageWrap) {
        pageWrap.style.transition = 'opacity 0.12s ease-out, transform 0.12s ease-out';
        pageWrap.style.opacity = '0.4';
        pageWrap.style.transform = 'translateX(8px)';
      }
    });
  });

  // Restore page visibility on bfcache restore
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      const pageWrap = document.querySelector('.page-wrap');
      if (pageWrap) {
        pageWrap.style.transition = 'none';
        pageWrap.style.opacity = '1';
        pageWrap.style.transform = '';
        requestAnimationFrame(() => { pageWrap.style.transition = ''; });
      }
    }
  });
}

/* ── Status Dropdown Builder ── */
function buildStatusDropdown(anime, anchorBtn) {
  // Remove any existing status dropdown
  const existing = document.getElementById('statusDropdown');
  if (existing) {
    const isSame = existing._anchor === anchorBtn;
    existing.remove();
    document.removeEventListener('click', window._closeDropdownHandler);
    if (isSame) return;
  }

  // Create the dropdown container
  const dropdown = document.createElement('div');
  dropdown.id = 'statusDropdown';
  dropdown.className = 'card-status-dropdown';
  dropdown._anchor = anchorBtn;

  const entry = window.Watchlist ? window.Watchlist.get(anime.id) : null;
  const statuses = window.Watchlist ? window.Watchlist.STATUSES : [];
  const labels = window.Watchlist ? window.Watchlist.STATUS_LABELS : {};
  const icons = window.Watchlist ? window.Watchlist.STATUS_ICONS : {};
  const colors = window.Watchlist ? window.Watchlist.STATUS_COLORS : {};

  statuses.forEach(status => {
    const option = document.createElement('div');
    option.className = 'card-status-option';
    if (entry && entry.status === status) {
      option.classList.add('active');
    }
    option.style.setProperty('--accent-color', colors[status] || 'var(--primary)');
    option.innerHTML = `
      <span class="status-icon">${icons[status] || ''}</span>
      <span class="status-label">${labels[status]}</span>
    `;

    option.onclick = async (e) => {
      e.stopPropagation();
      const user = window.SupabaseClient?.Auth?.getUser();
      if (!user) {
        Toast.info('Sign in to save to your watchlist');
        document.querySelector('[data-action="open-auth"]')?.click();
        dropdown.remove();
        return;
      }
      
      // Update watchlist
      if (window.Watchlist) {
        if (entry) {
          await window.Watchlist.update(anime.id, { status });
        } else {
          await window.Watchlist.add(anime, status);
        }
      }

      // Update UI on the anchor button
      if (anchorBtn) {
        const heartIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        const heartFilledIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        if (anchorBtn.id === 'dWlBtn') {
          anchorBtn.innerHTML = `${heartFilledIcon} In Watchlist`;
        } else {
          anchorBtn.innerHTML = `${icons[status] || ''} ${labels[status]}`;
          anchorBtn.style.color = colors[status] || '';
        }
      }

      dropdown.remove();
      document.removeEventListener('click', window._closeDropdownHandler);
    };

    dropdown.appendChild(option);
  });

  // If already in watchlist, add a "Remove" option at the bottom
  if (entry) {
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    dropdown.appendChild(divider);

    const removeOption = document.createElement('div');
    removeOption.className = 'card-status-option remove-option';
    removeOption.style.setProperty('--accent-color', 'var(--red)');
    removeOption.innerHTML = `
      <span class="status-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
      <span class="status-label">Remove</span>
    `;
    removeOption.onclick = async (e) => {
      e.stopPropagation();
      if (window.Watchlist) await window.Watchlist.remove(anime.id);

      if (anchorBtn) {
        const heartIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
        if (anchorBtn.id === 'dWlBtn') {
          anchorBtn.innerHTML = `${heartIcon} Add to Watchlist`;
        } else {
          anchorBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> Watchlist`;
          anchorBtn.style.color = '';
        }
      }

      dropdown.remove();
      document.removeEventListener('click', window._closeDropdownHandler);
    };
    dropdown.appendChild(removeOption);
  }

  // Position calculation
  document.body.appendChild(dropdown);
  const rect = anchorBtn.getBoundingClientRect();
  const dropdownHeight = dropdown.offsetHeight;
  const dropdownWidth = dropdown.offsetWidth;

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  let top, left;
  
  if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
    top = rect.top + window.scrollY - dropdownHeight - 4;
    dropdown.classList.add('dropdown-above');
  } else {
    top = rect.bottom + window.scrollY + 4;
  }

  left = rect.left + window.scrollX + (rect.width - dropdownWidth) / 2;
  if (left < 10) left = 10;
  if (left + dropdownWidth > window.innerWidth - 10) {
    left = window.innerWidth - dropdownWidth - 10;
  }

  dropdown.style.top = `${top}px`;
  dropdown.style.left = `${left}px`;

  // Close dropdown on click outside
  window._closeDropdownHandler = function(e) {
    if (!dropdown.contains(e.target) && e.target !== anchorBtn && !anchorBtn.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', window._closeDropdownHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', window._closeDropdownHandler);
  }, 0);
}

// Expose globals
window.Toast = Toast;
window.ThemeManager = ThemeManager;
window.initMobileMenu = initMobileMenu;
window.initSidebar = initSidebar;
window.initUserMenu = initUserMenu;
window._friendlyAuthError = _friendlyAuthError;
window.initAuthModal = initAuthModal;
window.initDetailModal = initDetailModal;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.buildAnimeCard = buildAnimeCard;
window.initGlitchAnimations = initGlitchAnimations;
window.buildStatusDropdown = buildStatusDropdown;
