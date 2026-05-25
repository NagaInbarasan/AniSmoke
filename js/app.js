/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Global Entry Point, Auth & Core Coordinator
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
    document.querySelectorAll('[data-auth="user"]').forEach(el   => el.style.display = u ? 'flex' : 'none');
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
      if (window.Toast) window.Toast.info('Signed out');
    } catch (e) {
      console.error('[Auth] Sign-out error:', e);
      if (window.Toast) window.Toast.error('Sign out failed — please try again');
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
          if (window.Watchlist) window.Watchlist.syncFromCloud().catch(e => console.warn('[Auth] Initial cloud sync failed:', e));
          if (window.syncNotificationSettingsFromCloud) window.syncNotificationSettingsFromCloud().catch(e => console.warn('[Auth] Initial notif sync failed:', e));
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
        if (event === 'SIGNED_IN' && window.Toast) window.Toast.success(`Welcome, ${user?.name || 'back'}!`);
        try {
          if (window.Watchlist) await window.Watchlist.syncFromCloud();
          if (window.syncNotificationSettingsFromCloud) await window.syncNotificationSettingsFromCloud();
        } catch (e) {
          console.warn('[Auth] Cloud sync failed:', e);
        }
      }
    });
  }

  return { getUser, updateHeaderUI, logout, init };
})();

/* ════════════════════════════════
   INIT ALL SHARED UI
   ════════════════════════════════ */
function initSharedUI() {
  const steps = [
    ['ThemeManager',      () => window.ThemeManager?.init()],
    ['Auth',              () => Auth.init()],
    ['UserProfile',       () => {
      if (window.UserProfile) {
        // Pre-compute taste profile if user is already logged in
        if (window.SupabaseClient?.Auth?.getUser()) window.UserProfile.compute();
        // Recompute / invalidate on auth changes
        window.addEventListener('auth-state-change', (e) => {
          if (e.detail?.user) window.UserProfile.compute();
          else                window.UserProfile.invalidate();
        });
      }
    }],
    ['Sidebar',           () => window.initSidebar?.()],
    ['MobileMenu',        () => window.initMobileMenu?.()],
    ['Search',            () => window.initSearch?.()],
    ['UserMenu',          () => window.initUserMenu?.()],
    ['AuthModal',         () => window.initAuthModal?.()],
    ['DetailModal',       () => window.initDetailModal?.()],
    ['GlitchAnimations',  () => window.initGlitchAnimations?.()],
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

// Expose globals
window.Auth = Auth;
