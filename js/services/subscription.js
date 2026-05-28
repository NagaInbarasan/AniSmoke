/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Subscription Manager
   Subscribe to anime → get notified of new episodes
   ═══════════════════════════════════════════════════════════ */

const SubscriptionManager = (() => {
  let subscriptions = [];
  let _popupTimer = null;
  let _popupCurrentIdx = 0;
  let _popupEpisodes = [];

  // ── Cloud Sync ────────────────────────────────────────
  async function syncFromCloud() {
    if (!window.SupabaseClient?.Auth?.getUser()) return;
    try {
      const { data, error } = await window.SupabaseClient.DB
        .from('anime_subscriptions')
        .select('*');
      if (error) throw error;
      subscriptions = data || [];
      _saveLocal();
      updateWatchPageUI();
    } catch (err) {
      console.warn('[SubscriptionManager] Cloud sync failed, using local:', err.message);
      _loadLocal();
    }
  }

  // ── Local Storage Helpers ─────────────────────────────
  function _saveLocal() {
    try {
      localStorage.setItem('as_subscriptions', JSON.stringify(subscriptions));
    } catch { /* quota exceeded */ }
  }

  function _loadLocal() {
    try {
      const raw = localStorage.getItem('as_subscriptions');
      if (raw) subscriptions = JSON.parse(raw);
    } catch { subscriptions = []; }
  }

  // ── Toggle Subscribe ──────────────────────────────────
  async function toggleSubscribe(animeId, animeData) {
    // Auto-detect from watch page context
    if (!animeId) {
      const params = new URLSearchParams(window.location.search);
      animeId = params.get('id');
    }
    if (!animeData && window.currentAnimeData) {
      animeData = window.currentAnimeData;
    }
    if (!animeId) return;

    const user = window.SupabaseClient?.Auth?.getUser();
    if (!user) {
      if (window.Toast) window.Toast.info('Sign in to subscribe to anime');
      document.querySelector('[data-action="open-auth"]')?.click();
      return;
    }

    if (isSubscribed(animeId)) {
      await unsubscribe(animeId);
    } else {
      await subscribe(animeId, animeData);
    }
  }

  // ── Subscribe ─────────────────────────────────────────
  async function subscribe(animeId, animeData) {
    const title = animeData?.title?.english || animeData?.title?.romaji || 'Unknown';
    const cover = animeData?.coverImage?.extraLarge || animeData?.coverImage?.large || '';
    const lastSeen = animeData?.nextAiringEpisode
      ? animeData.nextAiringEpisode.episode - 1
      : (animeData?.episodes || 0);

    const sub = {
      user_id: window.SupabaseClient.Auth.getUser().id,
      anime_id: String(animeId),
      title,
      cover,
      last_seen_episode: lastSeen
    };

    // Optimistic update
    subscriptions.push(sub);
    _saveLocal();
    updateWatchPageUI();

    if (window.Toast) window.Toast.success(`🔔 Subscribed to ${title}`);

    // Cloud persist
    try {
      const { error } = await window.SupabaseClient.DB
        .from('anime_subscriptions')
        .upsert(sub, { onConflict: 'user_id, anime_id' });
      if (error) throw error;
    } catch (err) {
      console.error('[Subscribe] Cloud save failed:', err);
      if (window.Toast) window.Toast.error('Failed to sync subscription');
      // Rollback
      subscriptions = subscriptions.filter(s => s.anime_id !== String(animeId));
      _saveLocal();
      updateWatchPageUI();
    }
  }

  // ── Unsubscribe ───────────────────────────────────────
  async function unsubscribe(animeId) {
    const prevSubs = [...subscriptions];
    subscriptions = subscriptions.filter(s => s.anime_id !== String(animeId));
    _saveLocal();
    updateWatchPageUI();

    if (window.Toast) window.Toast.info('🔕 Unsubscribed');

    try {
      const { error } = await window.SupabaseClient.DB
        .from('anime_subscriptions')
        .delete()
        .match({ anime_id: String(animeId) });
      if (error) throw error;
    } catch (err) {
      console.error('[Unsubscribe] Cloud delete failed:', err);
      if (window.Toast) window.Toast.error('Failed to unsubscribe');
      subscriptions = prevSubs;
      _saveLocal();
      updateWatchPageUI();
    }
  }

  // ── Query ─────────────────────────────────────────────
  function isSubscribed(animeId) {
    return subscriptions.some(s => s.anime_id === String(animeId));
  }

  function getAll() {
    return [...subscriptions];
  }

  // ── Watch Page UI Sync ────────────────────────────────
  function updateWatchPageUI() {
    const btn = document.getElementById('subscribeBtn');
    if (!btn) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    if (isSubscribed(id)) {
      btn.innerHTML = '<span class="subscribe-bell active">🔕</span> Unsubscribe';
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-ghost', 'subscribed');
    } else {
      btn.innerHTML = '<span class="subscribe-bell">🔔</span> Subscribe';
      btn.classList.remove('btn-ghost', 'subscribed');
      btn.classList.add('btn-secondary');
    }
  }

  // ── Check for New Episodes (runs on ALL pages) ────────
  async function checkForNewEpisodes() {
    if (!subscriptions.length) return [];

    const ids = subscriptions.map(s => parseInt(s.anime_id)).filter(id => !isNaN(id));
    if (!ids.length) return [];

    try {
      const query = `
        query($idIn: [Int]) {
          Page(page: 1, perPage: 50) {
            media(id_in: $idIn, type: ANIME) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              bannerImage
              nextAiringEpisode { episode airingAt }
              episodes
            }
          }
        }
      `;
      const res = await window.AniSmokeAPI.rawQuery(query, { idIn: ids });
      const mediaList = res?.data?.Page?.media || [];

      const newEpisodes = [];

      for (const media of mediaList) {
        const sub = subscriptions.find(s => s.anime_id === String(media.id));
        if (!sub) continue;

        const currentAired = media.nextAiringEpisode
          ? media.nextAiringEpisode.episode - 1
          : (media.episodes || 0);

        if (currentAired > (sub.last_seen_episode || 0)) {
          newEpisodes.push({
            id: media.id,
            title: media.title?.english || media.title?.romaji || 'Unknown',
            cover: media.coverImage?.extraLarge || media.coverImage?.large || '',
            banner: media.bannerImage || '',
            ep: currentAired,
            prevEp: sub.last_seen_episode || 0
          });
          // Update local record
          sub.last_seen_episode = currentAired;
        }
      }

      if (newEpisodes.length > 0) {
        _saveLocal();

        // Send browser notifications via NotificationService
        _sendBrowserNotifications(newEpisodes);

        // Show in-app popup
        showNewEpisodesPopup(newEpisodes);

        // Persist updated last_seen to cloud
        _updateCloudLastSeen(newEpisodes);
      }

      return newEpisodes;
    } catch (err) {
      console.error('[SubscriptionManager] Episode check failed:', err);
      return [];
    }
  }

  // ── Browser Notifications Integration ─────────────────
  function _sendBrowserNotifications(newEpisodes) {
    if (!window.NotificationService) return;

    for (const ep of newEpisodes) {
      const epCount = ep.ep - ep.prevEp;
      const body = epCount > 1
        ? `Episodes ${ep.prevEp + 1}–${ep.ep} are now available!`
        : `Episode ${ep.ep} is now available!`;

      window.NotificationService.send(`${ep.title} — New Episode`, {
        body,
        icon: ep.cover,
        tag: `as-sub-${ep.id}-ep${ep.ep}`
      });
    }
  }

  // ── Cloud Sync: update last_seen_episode ──────────────
  async function _updateCloudLastSeen(newEpisodes) {
    if (!window.SupabaseClient?.Auth?.getUser()) return;
    for (const ep of newEpisodes) {
      const sub = subscriptions.find(s => s.anime_id === String(ep.id));
      if (!sub) continue;
      try {
        await window.SupabaseClient.DB
          .from('anime_subscriptions')
          .update({ last_seen_episode: sub.last_seen_episode })
          .match({ anime_id: sub.anime_id });
      } catch { /* silent */ }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  NEW EPISODE POPUP — Glassmorphism Carousel
  // ═══════════════════════════════════════════════════════

  function showNewEpisodesPopup(newEpisodes) {
    if (!newEpisodes.length) return;
    _popupEpisodes = newEpisodes;
    _popupCurrentIdx = 0;

    // Ensure overlay exists
    let overlay = document.getElementById('subscribePopup');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'subscribe-popup-overlay';
      overlay.id = 'subscribePopup';
      document.body.appendChild(overlay);
    }

    _renderPopupSlide(overlay);
    overlay.style.display = 'flex';

    // Click outside to dismiss
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _dismissPopup();
    });

    // Auto-dismiss after 15 seconds
    clearTimeout(_popupTimer);
    _popupTimer = setTimeout(_dismissPopup, 15000);
  }

  function _renderPopupSlide(overlay) {
    const ep = _popupEpisodes[_popupCurrentIdx];
    const total = _popupEpisodes.length;
    const epCount = ep.ep - ep.prevEp;
    const epText = epCount > 1
      ? `Episodes ${ep.prevEp + 1}–${ep.ep} now available!`
      : `Episode ${ep.ep} is now available!`;

    const navHTML = total > 1 ? `
      <div class="popup-nav">
        <button class="popup-nav-btn popup-prev" ${_popupCurrentIdx === 0 ? 'disabled' : ''} onclick="SubscriptionManager._popupPrev()">‹</button>
        <span class="popup-counter">${_popupCurrentIdx + 1} / ${total}</span>
        <button class="popup-nav-btn popup-next" ${_popupCurrentIdx === total - 1 ? 'disabled' : ''} onclick="SubscriptionManager._popupNext()">›</button>
      </div>
    ` : '';

    overlay.innerHTML = `
      <div class="subscribe-popup-card">
        <div class="popup-close" onclick="SubscriptionManager._dismissPopup()" aria-label="Close">✕</div>
        <div class="popup-cover-wrap">
          <img src="${ep.banner || ep.cover}" class="popup-cover" alt="Cover" onerror="this.src='${ep.cover}'">
          <div class="popup-cover-gradient"></div>
          <div class="popup-cover-badge">
            <span class="popup-badge-icon">🔔</span>
            <span>NEW EPISODE</span>
          </div>
        </div>
        <div class="popup-info">
          <div class="popup-title">${ep.title}</div>
          <div class="popup-ep">${epText}</div>
          <div class="popup-actions">
            <button class="btn btn-primary btn-full" onclick="location.href='watch.html?id=${ep.id}'">
              ▶ Watch Now
            </button>
          </div>
          ${navHTML}
        </div>
        <div class="subscribe-progress-bar">
          <div class="progress-fill" style="animation-duration:15s"></div>
        </div>
      </div>
    `;
  }

  function _popupPrev() {
    if (_popupCurrentIdx > 0) {
      _popupCurrentIdx--;
      const overlay = document.getElementById('subscribePopup');
      if (overlay) _renderPopupSlide(overlay);
    }
  }

  function _popupNext() {
    if (_popupCurrentIdx < _popupEpisodes.length - 1) {
      _popupCurrentIdx++;
      const overlay = document.getElementById('subscribePopup');
      if (overlay) _renderPopupSlide(overlay);
    }
  }

  function _dismissPopup() {
    clearTimeout(_popupTimer);
    const overlay = document.getElementById('subscribePopup');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.opacity = '';
      }, 300);
    }
  }

  // ── Init (runs on ALL pages) ──────────────────────────
  function init() {
    _loadLocal();

    // React to auth changes
    window.addEventListener('auth-state-change', (e) => {
      if (e.detail?.user || window.SupabaseClient?.Auth?.getUser()) {
        syncFromCloud().then(() => {
          // Check for new episodes after cloud sync
          setTimeout(checkForNewEpisodes, 1500);
        });
      } else {
        subscriptions = [];
        localStorage.removeItem('as_subscriptions');
        updateWatchPageUI();
      }
    });

    // If already logged in, check for new episodes after a brief delay
    if (window.SupabaseClient?.Auth?.getUser()) {
      setTimeout(checkForNewEpisodes, 3000);
    }
  }

  // ── Public API ────────────────────────────────────────
  return {
    init,
    syncFromCloud,
    subscribe,
    unsubscribe,
    toggleSubscribe,
    isSubscribed,
    getAll,
    updateWatchPageUI,
    checkForNewEpisodes,
    // Exposed for onclick handlers in popup HTML
    _popupPrev: _popupPrev,
    _popupNext: _popupNext,
    _dismissPopup: _dismissPopup
  };
})();

window.SubscriptionManager = SubscriptionManager;

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SubscriptionManager.init());
} else {
  SubscriptionManager.init();
}
