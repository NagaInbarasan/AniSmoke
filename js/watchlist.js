/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Watchlist, UserTaste, & SearchScorer Modules
   ═══════════════════════════════════════════════════════════ */

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
      genres:   anime.genres || [],
      status,
      progress: 0,
      addedAt:  Date.now(),
      lastWatched: Date.now(),
    };
    list.unshift(entry);
    save(list);
    dispatchUpdate();
    if (window.Toast) window.Toast.success(`Added to ${STATUS_LABELS[status]}`);
    _syncEntryToCloud(entry); // fire-and-forget cloud sync
  }

  function remove(animeId) {
    const list = load().filter(e => String(e.id) !== String(animeId));
    save(list);
    dispatchUpdate();
    if (window.Toast) window.Toast.info('Removed from watchlist');
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
    update(animeId, { progress: ep, status: auto, lastWatched: Date.now() });
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
        if (window.Toast) window.Toast.info('Sign in to save to your watchlist');
        document.querySelector('[data-action="open-auth"]')?.click();
        return;
      }
      if (window.buildStatusDropdown) window.buildStatusDropdown(anime, btn);
    };
    return btn;
  }

  return { load, save, get, add, remove, update, updateProgress, has, getAll, getStats, syncFromCloud, buildAddBtn, STATUSES, STATUS_LABELS, STATUS_ICONS, STATUS_COLORS };
})();

/* ════════════════════════════════
   USER GENRE PROFILE ENGINE
   Computes user's taste fingerprint from watchlist.
   Cached in sessionStorage with 10-minute TTL.
   ════════════════════════════════ */
const UserProfile = (() => {
  const CACHE_KEY = 'as-user-genre-profile';

  /** Build a profile from the current watchlist contents. */
  function compute() {
    const list = Watchlist.getAll();
    if (!list.length) return null;

    // Tally genre frequency across all watchlist entries
    const freq = {};
    list.forEach(entry => {
      (entry.genres || []).forEach(g => {
        freq[g] = (freq[g] || 0) + 1;
      });
    });

    // Sort by frequency descending
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

    const profile = {
      topGenres:    sorted.slice(0, 3).map(([g]) => g),  // top 3 for display
      allGenres:    sorted.map(([g]) => g),               // all genres for scoring
      genreFreq:    freq,
      watchlistIds: [...new Set(list.map(e => String(e.id)))], // stored as Array, rehydrated as Set
      updatedAt:    Date.now(),
    };

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    } catch { /* storage full – skip cache */ }

    // Return with watchlistIds as a real Set for O(1) lookups
    return { ...profile, watchlistIds: new Set(profile.watchlistIds) };
  }

  /** Return cached profile (rehydrated) or recompute if stale/missing. */
  function get() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Treat as fresh for 10 minutes
        if (Date.now() - parsed.updatedAt < 600_000) {
          return { ...parsed, watchlistIds: new Set(parsed.watchlistIds || []) };
        }
      }
    } catch { /* parse error – fall through */ }
    return compute();
  }

  /** Invalidate cache (called on watchlist changes). */
  function invalidate() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  }

  // Keep cache fresh whenever the watchlist changes
  window.addEventListener('watchlist-update', invalidate);

  return { compute, get, invalidate };
})();

/* ════════════════════════════════
   SEARCH RELEVANCE SCORER
   Composite scoring engine that re-ranks AniList
   results using title matching, genre overlap,
   watchlist relation signals, and popularity.
   ════════════════════════════════ */
const SearchScorer = (() => {

  /**
   * Score a single anime against a query + user profile.
   */
  function score(anime, query, profile) {
    if (!anime || !query) return 0;
    let pts = 0;
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    // ── Title Signals ──────────────────────────────────────
    const en     = (anime.title?.english || '').toLowerCase();
    const romaji = (anime.title?.romaji  || '').toLowerCase();
    const native = (anime.title?.native  || '').toLowerCase();

    const titlesForExact   = [en, romaji, native].filter(Boolean).map(t => t.trim());
    const titlesForPartial = [en, romaji].filter(Boolean).filter(t => t.length > 2);

    if (titlesForExact.some(t => t === q)) {
      pts += 1000; // EXACT MATCH: Overwhelming boost
    } else {
      const hasExactToken = titlesForPartial.some(t => {
        try {
          return new RegExp(`\\b${q.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(t);
        } catch(e) { return false; }
      });

      if (hasExactToken) {
        pts += 300; // EXACT WORD MATCH
      } else if (titlesForPartial.some(t => t.startsWith(q))) {
        pts += 80;
      } else if (titlesForPartial.some(t => t.includes(q))) {
        pts += 70;
      } else {
        const words = q.split(' ').filter(w => w.length > 2);
        let wordHits = 0;
        words.forEach(w => {
          if (titlesForPartial.some(t => t.includes(w))) wordHits++;
        });
        if (wordHits > 0) {
          pts += wordHits * 15;
        }
      }
    }

    // ── Franchise Grouping Boost ───────────────────────────
    if (anime._isFranchiseChild) {
      pts += 85; // Massive boost to group sequels directly under the main hit
    }

    // ── Genre Overlap (Proportional Personalization) ───────
    if (profile && Array.isArray(anime.genres)) {
      anime.genres.forEach(g => {
        const freq = profile.genreFreq[g] || 0;
        // Award 2 points per watchlist occurrence of this genre, capped at 25 pts per genre
        pts += Math.min(25, freq * 2);
      });
    }

    // ── Watchlist Relation Signal ───────────────────────────
    if (profile?.watchlistIds instanceof Set && profile.watchlistIds.has(String(anime.id))) {
      pts += 30;
    }

    // ── Popularity (log-normalized, 0–15) ──────────────────
    if (anime.popularity > 0) {
      pts += Math.min(15, Math.round(Math.log10(anime.popularity + 1) * 3));
    }

    return pts;
  }

  /**
   * Re-rank an array of anime by composite score (descending).
   */
  function rankResults(results, query, profile) {
    if (!Array.isArray(results) || !results.length) return results;
    return results
      .map(a => ({ ...a, _score: score(a, query, profile) }))
      .sort((a, b) => b._score - a._score);
  }

  /**
   * Classify a result into dropdown sections.
   */
  function classify(scoredAnime, query, profile) {
    // If it shares the user's #1 absolute favorite genre, feature it in "Because You Watch..."
    if (profile?.topGenres?.length > 0) {
      if ((scoredAnime.genres || []).includes(profile.topGenres[0])) {
        return 'because';
      }
    }
    return 'popular';
  }

  return { score, rankResults, classify };
})();

// Expose globals
window.Watchlist = Watchlist;
window.UserProfile = UserProfile;
window.SearchScorer = SearchScorer;
