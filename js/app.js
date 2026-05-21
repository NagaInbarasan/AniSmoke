/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Auth, Watchlist, Theme, Toast
   ═══════════════════════════════════════════════════════════ */

/* ── Global event delegation for auth modal (bulletproof) ── */
document.addEventListener('click', function(e) {
  const trigger = e.target.closest('[data-action="open-auth"]');
  if (trigger) {
    e.preventDefault();
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('open');
      document.body.classList.add('no-scroll');
    }
  }
});

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
   AUTH SYSTEM
   (Supabase — Google OAuth + Email/Password)
   ════════════════════════════════ */
const Auth = (() => {
  let _unsubscribe = null;

  /** Returns a normalized user object from the active Supabase session. */
  function getUser() {
    const sbUser = window.SupabaseClient?.Auth?.getUser();
    if (!sbUser) return null;
    return {
      id:       sbUser.id,
      name:     window.SupabaseClient.Auth.getUserName(),
      email:    sbUser.email,
      avatar:   window.SupabaseClient.Auth.getUserAvatar(),
      provider: sbUser.app_metadata?.provider || 'email'
    };
  }

  /** Sync header UI elements to current auth state. */
  function updateHeaderUI() {
    const u = getUser();
    document.querySelectorAll('[data-auth="guest"]').forEach(el  => el.style.display = u ? 'none' : '');
    document.querySelectorAll('[data-auth="user"]').forEach(el   => el.style.display = u ? ''     : 'none');
    document.querySelectorAll('[data-auth="avatar"]').forEach(el => { el.textContent = u?.name?.[0]?.toUpperCase() || '?'; });
    document.querySelectorAll('[data-auth="name"]').forEach(el   => { el.textContent = u ? u.name  : ''; });
    document.querySelectorAll('[data-auth="email"]').forEach(el  => { el.textContent = u ? u.email : ''; });
    // Notify pages that auth state changed (used by watchlist gate)
    window.dispatchEvent(new CustomEvent('auth-state-change', { detail: { user: u } }));
  }

  /** Sign out via Supabase. */
  async function logout() {
    try {
      await window.SupabaseClient.Auth.signOut();
      Toast.info('Signed out');
    } catch (e) {
      console.error('[Auth] Sign-out error:', e);
      Toast.error('Sign out failed — please try again');
    }
  }

  /**
   * Subscribe to Supabase auth state changes.
   * Called once from initSharedUI(). Updates header and triggers cloud sync.
   */
  function init() {
    if (_unsubscribe) _unsubscribe();

    // Defer first UI paint until session is restored from localStorage
    const sessionReady = window.SupabaseClient?.Auth?.refreshSession();
    if (sessionReady && typeof sessionReady.then === 'function') {
      sessionReady.then(() => {
        updateHeaderUI();
        const existingUser = getUser();
        if (existingUser) {
          Watchlist.syncFromCloud().catch(e => console.warn('[Auth] Initial cloud sync failed:', e));
        }
      }).catch(() => {
        updateHeaderUI(); // Still update UI even if refresh fails (show guest state)
      });
    } else {
      // Supabase not available — render guest state
      updateHeaderUI();
    }

    _unsubscribe = window.SupabaseClient?.Auth?.onAuthStateChange(async (event, session) => {
      // Auth state change handled by listeners
      updateHeaderUI();
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const user = getUser();
        if (event === 'SIGNED_IN') Toast.success(`Welcome, ${user?.name || 'back'}!`);
        try { await Watchlist.syncFromCloud(); } catch (e) { console.warn('[Auth] Cloud sync failed:', e); }
      }
    });
  }

  return { getUser, updateHeaderUI, logout, init };
})();

/* ════════════════════════════════
   WATCHLIST MANAGER
   ════════════════════════════════ */
const Watchlist = (() => {
  const KEY = 'as-watchlist';
  const STATUSES = ['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'];
  
  const ICONS = {
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m7 3 14 9-14 9z"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    bookmark: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
    heart: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    heartFilled: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`
  };

  // Plain text labels — safe for <option>, toast messages, aria-labels
  const STATUS_LABELS = {
    watching:       'Watching',
    completed:      'Completed',
    on_hold:        'On Hold',
    dropped:        'Dropped',
    plan_to_watch:  'Plan to Watch',
  };
  // SVG icons — only for innerHTML contexts (buttons, overlays)
  const STATUS_ICONS = {
    watching:       ICONS.play,
    completed:      ICONS.check,
    on_hold:        ICONS.pause,
    dropped:        ICONS.close,
    plan_to_watch:  ICONS.bookmark,
  };
  // Helper: compose icon + label for button innerHTML
  function _statusHtml(status) {
    return `${STATUS_ICONS[status] || ''} ${STATUS_LABELS[status] || status}`;
  }
  const STATUS_COLORS = {
    watching:       'var(--cyan)',
    completed:      'var(--green)',
    on_hold:        'var(--yellow)',
    dropped:        'var(--red)',
    plan_to_watch:  'var(--accent-light)',
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }

  function get(animeId) {
    return load().find(e => String(e.id) === String(animeId)) || null;
  }

  function add(anime, status = 'plan_to_watch') {
    const list = load();
    const id = String(anime.id);
    if (list.find(e => e.id === id)) return update(id, { status });
    const entry = {
      id,
      title:    anime.title?.english || anime.title?.romaji || 'Unknown',
      cover:    anime.coverImage?.large || '',
      format:   anime.format || '',
      total:    anime.episodes || 0,
      year:     anime.seasonYear || '',
      score:    anime.averageScore || 0,
      status,
      progress: 0,
      addedAt:  Date.now(),
    };
    list.unshift(entry);
    save(list);
    dispatchUpdate();
    Toast.success(`Added to ${STATUS_LABELS[status]}`);
    _syncEntryToCloud(entry); // fire-and-forget cloud sync
  }

  function remove(animeId) {
    const list = load().filter(e => String(e.id) !== String(animeId));
    save(list);
    dispatchUpdate();
    Toast.info('Removed from watchlist');
    _removeEntryFromCloud(animeId); // fire-and-forget cloud sync
  }

  function update(animeId, changes) {
    const list = load().map(e => String(e.id) === String(animeId) ? { ...e, ...changes } : e);
    save(list);
    dispatchUpdate();
    const updated = list.find(e => String(e.id) === String(animeId));
    if (updated) _syncEntryToCloud(updated); // fire-and-forget cloud sync
  }

  function updateProgress(animeId, ep) {
    const entry = get(animeId);
    if (!entry) return;
    const auto = entry.total && ep >= entry.total ? 'completed' : entry.status;
    update(animeId, { progress: ep, status: auto });
  }

  function has(animeId) { return !!get(animeId); }

  function getAll(filter = null) {
    const list = load();
    return filter ? list.filter(e => e.status === filter) : list;
  }

  function getStats() {
    const list = load();
    const stats = { total: list.length };
    STATUSES.forEach(s => { stats[s] = list.filter(e => e.status === s).length; });
    stats.episodes = list.reduce((a, e) => a + (e.progress || 0), 0);
    return stats;
  }

  function dispatchUpdate() {
    window.dispatchEvent(new CustomEvent('watchlist-update'));
  }

  /** Fire-and-forget: upsert a single entry to Supabase if user is signed in. */
  function _syncEntryToCloud(entry) {
    const user = window.SupabaseClient?.Auth?.getUser();
    if (!user) return;
    window.SupabaseClient.WatchlistDB.upsert(user.id, entry)
      .catch(e => console.warn('[Watchlist] Cloud upsert failed:', e.message));
  }

  /** Fire-and-forget: remove a single entry from Supabase if user is signed in. */
  function _removeEntryFromCloud(animeId) {
    const user = window.SupabaseClient?.Auth?.getUser();
    if (!user) return;
    window.SupabaseClient.WatchlistDB.remove(user.id, animeId)
      .catch(e => console.warn('[Watchlist] Cloud remove failed:', e.message));
  }

  /**
   * Full cloud sync: fetch user's Supabase watchlist and replace localStorage.
   * Cloud wins. If cloud is empty but localStorage has entries, push them up.
   * Called by Auth.init() on SIGNED_IN and on page load with existing session.
   */
  async function syncFromCloud() {
    const user = window.SupabaseClient?.Auth?.getUser();
    if (!user) return;
    try {
      const cloudEntries = await window.SupabaseClient.WatchlistDB.fetchAll(user.id);
      if (cloudEntries.length > 0) {
        save(cloudEntries);
        dispatchUpdate();

      } else {
        // Cloud empty — push any local entries up (one-time migration)
        const localData = load();
        if (localData.length > 0) {
          await window.SupabaseClient.WatchlistDB.syncFromLocal(user.id);

        }
      }
    } catch (e) {
      console.error('[Watchlist] Cloud sync error:', e);
    }
  }

  // Build a quick-add button
  function buildAddBtn(anime) {
    const entry = get(anime.id);
    const btn = document.createElement('button');
    btn.className = 'anime-card-quick-add';
    btn.innerHTML = entry ? _statusHtml(entry.status) : `${ICONS.heart} Watchlist`;
    btn.style.color = entry ? STATUS_COLORS[entry.status] : '';
    btn.onclick = (e) => {
      e.stopPropagation();
      // Auth-gate: require sign-in to interact with the watchlist
      if (!window.SupabaseClient?.Auth?.getUser()) {
        Toast.info('Sign in to save to your watchlist');
        document.querySelector('[data-action="open-auth"]')?.click();
        return;
      }
      if (entry) {
        remove(anime.id);
        btn.innerHTML = `${ICONS.heart} Watchlist`;
        btn.style.color = '';
      } else {
        add(anime);
        btn.innerHTML = _statusHtml('plan_to_watch');
        btn.style.color = STATUS_COLORS['plan_to_watch'];
      }
    };
    return btn;
  }

  return { load, save, get, add, remove, update, updateProgress, has, getAll, getStats, syncFromCloud, buildAddBtn, STATUSES, STATUS_LABELS, STATUS_ICONS, STATUS_COLORS };
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
   HEADER SEARCH — Enhanced UX
   ════════════════════════════════ */
function initSearch(onSelect) {
  const input     = document.getElementById('headerSearchInput');
  const dropdown  = document.getElementById('searchDropdown');
  const clearBtn  = document.getElementById('searchClear');
  if (!input || !dropdown) return;

  const RECENT_KEY  = 'as-recent-searches';
  const MAX_RECENT  = 5;
  let timer, searchIdCounter = 0, kbdIndex = -1, currentResults = [];

  /* ── Recent searches helpers ── */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
  function saveRecent(q) {
    const list = [q, ...getRecent().filter(r => r !== q)].slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  }
  function clearRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch {}
    dropdown.style.display = 'none';
  }

  /* ── Show recent searches when input focused & empty ── */
  function showRecent() {
    const list = getRecent();
    if (!list.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = `
      <div class="as-search-recent-header">
        <span>Recent</span>
        <button id="clearRecentBtn">Clear all</button>
      </div>
      <div class="as-recent-chips">
        ${list.map(q => `
          <div class="as-recent-chip" data-q="${q.replace(/"/g,'&quot;')}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${q}
          </div>
        `).join('')}
      </div>`;
    dropdown.style.display = 'block';
    document.getElementById('clearRecentBtn')?.addEventListener('click', e => {
      e.stopPropagation(); clearRecent();
    });
    dropdown.querySelectorAll('.as-recent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.q;
        clearBtn.style.display = '';
        dropdown.style.display = 'none';
        triggerSearch(chip.dataset.q);
      });
    });
  }

  /* ── Score badge helper ── */
  function scoreBadge(score) {
    if (!score) return '';
    const val  = (score / 10).toFixed(1);
    const cls  = score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low';
    return `<div class="as-search-result-score ${cls}">★ ${val}</div>`;
  }

  /* ── Render rich result cards ── */
  function renderDropdown(results, q) {
    kbdIndex = -1; currentResults = results;
    dropdown.innerHTML = '';
    if (!results.length) {
      dropdown.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">No results for "${q}"</div>`;
      dropdown.style.display = 'block'; return;
    }
    results.forEach(a => {
      const title  = a.title?.english || a.title?.romaji || 'Unknown';
      const meta   = [a.format, a.seasonYear, a.episodes ? a.episodes + ' eps' : ''].filter(Boolean).join(' · ');
      const genres = (a.genres || []).slice(0, 2).map(g => `<span class="genre-chip">${g}</span>`).join('');
      const item   = document.createElement('div');
      item.className = 'as-search-result';
      item.dataset.id = a.id;
      item.innerHTML = `
        <img src="${a.coverImage?.large || ''}" alt="${title}" loading="lazy" onerror="this.style.display='none'">
        <div class="as-search-result-info">
          <div class="title">${title}</div>
          <div class="meta">${meta}</div>
          ${genres ? `<div class="genre-chips">${genres}</div>` : ''}
        </div>
        ${scoreBadge(a.averageScore)}`;
      item.addEventListener('click', () => {
        saveRecent(title);
        dropdown.style.display = 'none';
        input.value = ''; clearBtn.style.display = 'none';
        if (onSelect) onSelect(a);
        else location.href = `watch.html?id=${a.id}`;
      });
      dropdown.appendChild(item);
    });
    // View all footer
    const footer = document.createElement('a');
    footer.className = 'as-search-footer';
    footer.textContent = `See all results for "${q}" →`;
    footer.href = `browse.html?q=${encodeURIComponent(q)}`;
    footer.addEventListener('click', () => { saveRecent(q); dropdown.style.display = 'none'; });
    dropdown.appendChild(footer);
    dropdown.style.display = 'block';
  }

  /* ── Keyboard navigation ── */
  function kbdMove(dir) {
    const items = dropdown.querySelectorAll('.as-search-result');
    if (!items.length) return;
    items[kbdIndex]?.classList.remove('kbd-active');
    kbdIndex = Math.max(-1, Math.min(items.length - 1, kbdIndex + dir));
    if (kbdIndex >= 0) {
      items[kbdIndex].classList.add('kbd-active');
      items[kbdIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /* ── Trigger search ── */
  function triggerSearch(q) {
    clearTimeout(timer);
    const id = ++searchIdCounter;
    dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">Searching...</div>';
    dropdown.style.display = 'block';
    timer = setTimeout(async () => {
      if (id !== searchIdCounter) return;
      try {
        const results = await AniSmokeAPI.search(q, 8);
        if (id !== searchIdCounter) return;
        renderDropdown(results, q);
      } catch {
        if (id !== searchIdCounter) return;
        dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--red);font-size:13px">Search failed — check connection</div>';
      }
    }, 300);
  }

  /* ── Input handler ── */
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? '' : 'none';
    kbdIndex = -1;
    if (!q) { showRecent(); return; }
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    triggerSearch(q);
  });

  /* ── Focus: show recent if empty ── */
  input.addEventListener('focus', () => {
    if (!input.value.trim()) showRecent();
  });

  /* ── Clear button ── */
  clearBtn?.addEventListener('click', () => {
    input.value = ''; clearBtn.style.display = 'none';
    dropdown.style.display = 'none'; kbdIndex = -1;
    input.focus();
  });

  /* ── Click outside ── */
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target))
      dropdown.style.display = 'none';
  });

  /* ── Keyboard: arrows + enter + escape ── */
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); kbdMove(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); kbdMove(-1); return; }
    if (e.key === 'Escape')    { dropdown.style.display = 'none'; input.blur(); return; }
    if (e.key === 'Enter') {
      const active = dropdown.querySelector('.as-search-result.kbd-active');
      if (active) { active.click(); return; }
      const q = input.value.trim();
      if (q) { saveRecent(q); location.href = `browse.html?q=${encodeURIComponent(q)}`; }
    }
  });
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
  logoutBtn?.addEventListener('click', async () => { await Auth.logout(); dropdown.classList.remove('open'); });
}

/* ════════════════════════════════
   AUTH MODAL
   ════════════════════════════════ */

/** Map Supabase error messages to user-friendly strings. */
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
  }

  openBtns.forEach(b => b.addEventListener('click', open));
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', e => { if (e.target === modal) close(); });

  // ── Tabs ──
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
    });
  });

  // ── Button loading state helper (CSS spinner) ──
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

  // ── Inline field validation helpers ──
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

  // ── Delegated button handler (bulletproof — works even if elements aren't found at init) ──
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

  // ── Password visibility toggles ──
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

  // ── Enter key submits forms ──
  ['loginEmail', 'loginPass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginSubmit')?.click(); });
  });
  ['regName', 'regEmail', 'regPass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('registerSubmit')?.click(); });
  });
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
  watchBtn.onclick = () => { location.href = `watch.html?id=${anime.id}`; };

  const wlBtn = document.getElementById('dWlBtn');
  const entry = Watchlist.get(anime.id);
  const heartIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
  const heartFilledIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

  wlBtn.innerHTML = entry ? `${heartFilledIcon} In Watchlist` : `${heartIcon} Add to Watchlist`;
  wlBtn.onclick = () => {
    // Auth-gate
    if (!window.SupabaseClient?.Auth?.getUser()) {
      Toast.info('Sign in to save to your watchlist');
      closeDetail();
      document.querySelector('[data-action="open-auth"]')?.click();
      return;
    }
    if (Watchlist.has(anime.id)) {
      Watchlist.remove(anime.id);
      wlBtn.innerHTML = `${heartIcon} Add to Watchlist`;
    } else {
      Watchlist.add(anime);
      wlBtn.innerHTML = `${heartFilledIcon} In Watchlist`;
    }
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

      <!-- Scan-line is a CSS ::after pseudo — nothing needed here -->

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
  const addBtn  = Watchlist.buildAddBtn(anime);
  addBtn.classList.add('anime-card-quick-add');
  overlay.appendChild(addBtn);

  // Play button wires to watch page
  card.querySelector('.anime-card-play').addEventListener('click', (e) => {
    e.stopPropagation();
    location.href = `watch.html?id=${anime.id}`;
  });

  // Card click → detail modal
  card.addEventListener('click', () => {
    if (onClick) onClick(anime); else openDetail(anime);
  });

  // Watchlist ring state
  if (Watchlist.has(anime.id)) card.classList.add('in-watchlist');
  const cardRef = new WeakRef(card);
  const updateListener = () => {
    const c = cardRef.deref();
    if (c) c.classList.toggle('in-watchlist', Watchlist.has(anime.id));
    else window.removeEventListener('watchlist-update', updateListener);
  };
  window.addEventListener('watchlist-update', updateListener);

  return card;
}

/* ════════════════════════════════
   GLITCH & MICRO-INTERACTION ENGINE
   ════════════════════════════════ */
function initGlitchAnimations() {
  // ── 1. Section title scroll-flicker via IntersectionObserver ──
  const titles = document.querySelectorAll('.section-title');
  if (titles.length && 'IntersectionObserver' in window) {
    const flickerObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          // Remove any previous state so re-entering re-triggers
          el.classList.remove('is-visible', 'flicker-in');
          // Tiny rAF delay so removing+adding in same frame registers
          requestAnimationFrame(() => {
            el.classList.add('is-visible', 'flicker-in');
            // Clean up flicker class after animation ends so CSS
            // transition (is-visible) holds the final state cleanly
            el.addEventListener('animationend', () => {
              el.classList.remove('flicker-in');
            }, { once: true });
          });
          flickerObserver.unobserve(el);   // fire only once per element
        }
      });
    }, { threshold: 0.2 });
    titles.forEach(t => flickerObserver.observe(t));
  } else {
    // Fallback: just make them visible immediately
    titles.forEach(t => t.classList.add('is-visible'));
  }

  // ── 2. Mirror data-text on glitch-hover elements ──
  // The CSS ::before/::after use attr(data-text) for chromatic split.
  // Auto-set data-text from textContent for any .glitch-hover that
  // doesn't already have it.
  document.querySelectorAll('.glitch-hover').forEach(el => {
    if (!el.dataset.text) el.dataset.text = el.textContent.trim();
  });

  // ── 3. Sidebar nav links get glitch-hover automatically ──
  document.querySelectorAll('.as-sidebar-link, .as-nav-link').forEach(link => {
    link.classList.add('glitch-hover');
    if (!link.dataset.text) {
      const span = link.querySelector('span');
      link.dataset.text = span ? span.textContent.trim() : link.textContent.trim();
    }
  });

  // ── 4. Page-exit wipe: cosmetic fade on internal link click ──
  // Does NOT block navigation — just adds a quick visual hint.
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
      // Let the browser navigate naturally — no e.preventDefault()
    });
  });

  // ── 5. Restore page visibility on bfcache restore (browser back/forward) ──
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      const pageWrap = document.querySelector('.page-wrap');
      if (pageWrap) {
        pageWrap.style.transition = 'none';
        pageWrap.style.opacity = '1';
        pageWrap.style.transform = '';
        // Re-enable transition after reset
        requestAnimationFrame(() => { pageWrap.style.transition = ''; });
      }
    }
  });
}

/* ════════════════════════════════
   SIDEBAR — Pin / Persist
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
   INIT ALL SHARED UI
   ════════════════════════════════ */
function initSharedUI() {
  const steps = [
    ['ThemeManager',      () => ThemeManager.init()],
    ['Auth',              () => Auth.init()],
    ['Sidebar',           () => initSidebar()],
    ['MobileMenu',        () => initMobileMenu()],
    ['Search',            () => initSearch()],
    ['UserMenu',          () => initUserMenu()],
    ['AuthModal',         () => initAuthModal()],
    ['DetailModal',       () => initDetailModal()],
    ['GlitchAnimations',  () => initGlitchAnimations()],
  ];
  for (const [name, fn] of steps) {
    try { fn(); }
    catch (e) { console.error(`[initSharedUI] ${name} failed:`, e); }
  }
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSharedUI);
} else {
  initSharedUI();
}

window.Toast      = Toast;
window.ThemeManager = ThemeManager;
window.Auth       = Auth;
window.Watchlist  = Watchlist;
window.buildAnimeCard = buildAnimeCard;
window.openDetail = openDetail;
window.closeDetail = closeDetail;
