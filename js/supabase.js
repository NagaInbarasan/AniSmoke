/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Supabase Integration Layer
   Auth (Google OAuth + Email/Password) + Cloud Watchlist Sync
   ═══════════════════════════════════════════════════════════ */

const SupabaseClient = (() => {
  // ── Configuration ──
  const DEFAULT_SUPABASE_URL  = 'https://getbnyrvktbzlermocfj.supabase.co';
  const DEFAULT_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdldGJueXJ2a3Riemxlcm1vY2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjE2MzAsImV4cCI6MjA5Mzc5NzYzMH0.xW2wrnvByVS6Cnb7nU8DFn0w4MFQGqZvx-DHw1Cj4Jw';

  const SUPABASE_URL  = window.ENV?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const SUPABASE_ANON = window.ENV?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON;

  let _client = null;
  let _session = null;
  let _authListeners = [];

  // ── Init ──
  function init() {
    if (_client) return _client;
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[SupabaseClient] SDK not loaded. Include the Supabase CDN script before supabase.js');
      return null;
    }
    _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,   // needed for OAuth redirect
        storage: window.localStorage,
        storageKey: 'as-auth-token',
        flowType: 'pkce'            // secure PKCE flow for OAuth
      }
    });

    // Listen for auth state changes
    _client.auth.onAuthStateChange((event, session) => {
      _session = session;
      _authListeners.forEach(cb => {
        try { cb(event, session); } catch(e) { console.error('[Auth] listener error:', e); }
      });
    });

    // Seed initial session — notify listeners so UI updates
    _client.auth.getSession().then(({ data }) => {
      _session = data.session;
      if (_session) {
        _authListeners.forEach(cb => {
          try { cb('INITIAL_SESSION', _session); } catch(e) { console.error('[Auth] listener error:', e); }
        });
      }
    });

    console.log('[SupabaseClient] Initialized');
    return _client;
  }

  // ═══════════════════════════════════════════
  //  AUTH MODULE
  // ═══════════════════════════════════════════
  const Auth = {
    /** Google OAuth popup */
    async signInWithGoogle() {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: { prompt: 'select_account' }
        }
      });
      if (error) throw error;
      return data;
    },

    /** Email + Password sign in */
    async signInWithEmail(email, password) {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    /** Register with email + password + display name */
    async signUp(email, password, name) {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name || email.split('@')[0] }
        }
      });
      if (error) throw error;
      return data;
    },

    /** Sign out */
    async signOut() {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { error } = await client.auth.signOut();
      if (error) throw error;
      _session = null;
    },

    /** Get current session (synchronous, from cache) */
    getSession() {
      return _session;
    },

    /** Get current user object */
    getUser() {
      return _session?.user || null;
    },

    /** Get user display name */
    getUserName() {
      const user = this.getUser();
      if (!user) return null;
      return user.user_metadata?.display_name
          || user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'User';
    },

    /** Get user avatar URL */
    getUserAvatar() {
      const user = this.getUser();
      if (!user) return null;
      return user.user_metadata?.avatar_url
          || user.user_metadata?.picture
          || null;
    },

    /** Register a callback for auth state changes */
    onAuthStateChange(callback) {
      _authListeners.push(callback);
      // Return unsubscribe function
      return () => {
        _authListeners = _authListeners.filter(cb => cb !== callback);
      };
    },

    /** Refresh session from Supabase (async) */
    async refreshSession() {
      const client = init();
      if (!client) return null;
      const { data } = await client.auth.getSession();
      _session = data.session;
      return _session;
    },

    /** Send password reset email */
    async resetPassword(email) {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html'
      });
      if (error) throw error;
    }
  };

  // ═══════════════════════════════════════════
  //  WATCHLIST DATABASE MODULE
  // ═══════════════════════════════════════════
  const WatchlistDB = {
    /** Fetch all watchlist entries for a user */
    async fetchAll(userId) {
      const client = init();
      if (!client) return [];
      const { data, error } = await client
        .from('watchlists')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });
      if (error) {
        console.error('[WatchlistDB] fetchAll error:', error);
        return [];
      }
      return (data || []).map(row => _dbRowToEntry(row));
    },

    /** Upsert (insert or update) a watchlist entry */
    async upsert(userId, entry) {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const row = {
        user_id:        userId,
        anime_id:       String(entry.id),
        title:          entry.title || '',
        cover:          entry.cover || '',
        format:         entry.format || '',
        total_episodes: entry.total || 0,
        year:           entry.year || 0,
        score:          entry.score || 0,
        status:         entry.status || 'plan_to_watch',
        progress:       entry.progress || 0
      };
      const { data, error } = await client
        .from('watchlists')
        .upsert(row, { onConflict: 'user_id,anime_id' })
        .select()
        .single();
      if (error) throw error;
      return data ? _dbRowToEntry(data) : null;
    },

    /** Remove a watchlist entry */
    async remove(userId, animeId) {
      const client = init();
      if (!client) throw new Error('Supabase not initialized');
      const { error } = await client
        .from('watchlists')
        .delete()
        .eq('user_id', userId)
        .eq('anime_id', String(animeId));
      if (error) throw error;
    },

    /** One-time migration: push localStorage watchlist → Supabase */
    async syncFromLocal(userId) {
      const localKey = 'as-watchlist';
      const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
      if (!localData.length) return 0;

      let synced = 0;
      for (const entry of localData) {
        try {
          await this.upsert(userId, entry);
          synced++;
        } catch (e) {
          // Duplicate or validation error — skip silently
          console.warn('[WatchlistDB] sync skip:', entry.id, e.message);
        }
      }
      console.log(`[WatchlistDB] Synced ${synced}/${localData.length} entries from localStorage`);
      return synced;
    }
  };

  // ── Helpers ──

  /** Convert a database row to the app's watchlist entry format */
  function _dbRowToEntry(row) {
    return {
      id:       row.anime_id,
      title:    row.title,
      cover:    row.cover,
      format:   row.format,
      total:    row.total_episodes,
      year:     row.year,
      score:    row.score,
      status:   row.status,
      progress: row.progress,
      addedAt:  new Date(row.added_at).getTime()
    };
  }

  // ── Public API ──
  return {
    init,
    Auth,
    WatchlistDB,
    get client() { return _client; },
    get ready()  { return !!_client; }
  };
})();

// Expose on window for cross-script access (const is not a window property)
window.SupabaseClient = SupabaseClient;

// Auto-initialize when script loads
document.addEventListener('DOMContentLoaded', () => {
  SupabaseClient.init();
});
