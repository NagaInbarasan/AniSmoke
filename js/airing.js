/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Airing Schedule Notification Center Module
   ═══════════════════════════════════════════════════════════ */

// Global timers map for client-side schedule alarms
let activeAiringTimers = {};

function showNotification(title, options) {
  if (window.NotificationService) {
    window.NotificationService.send(title, options);
  } else {
    // Fail-safe fallback if service isn't loaded yet
    console.warn("[Airing] NotificationService not available. Falling back to basic notification.");
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, options);
    }
  }
}

// Cloud synchronization functions
async function syncNotificationSettingsToCloud(enabled) {
  const user = window.SupabaseClient?.Auth?.getUser();
  if (!user) return;
  try {
    if (window.SupabaseClient.NotificationsDB) {
      await window.SupabaseClient.NotificationsDB.updateSubscription(user.id, enabled);
    }
  } catch (e) {
    console.warn('[Airing] Failed to sync notification setting to cloud:', e.message);
  }
}

async function syncNotificationSettingsFromCloud() {
  const user = window.SupabaseClient?.Auth?.getUser();
  if (!user) return;
  try {
    if (window.SupabaseClient.NotificationsDB) {
      const data = await window.SupabaseClient.NotificationsDB.getSubscription(user.id);
      if (data) {
        localStorage.setItem('as-notifications-enabled', String(data.enabled));
        
        // Update any existing toggle buttons
        const toggle = document.querySelector('.notif-sub-toggle');
        if (toggle) {
          const hasPermission = ("Notification" in window) && Notification.permission === "granted";
          if (data.enabled && hasPermission) {
            toggle.textContent = 'Unsubscribe';
            toggle.style.borderColor = 'var(--cyan, #00eefc)';
            toggle.style.color = 'var(--cyan, #00eefc)';
          } else {
            toggle.textContent = 'Subscribe';
            toggle.style.borderColor = 'var(--primary, #bc13fe)';
            toggle.style.color = 'var(--primary, #bc13fe)';
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Airing] Failed to sync notification settings from cloud:', e.message);
  }
}

function initAiringManager() {
  const bellWrap = document.getElementById('notifBellWrap');
  const bellBtn = document.getElementById('notifBellBtn');
  const dropdown = document.getElementById('notifDropdown');
  const badge = document.getElementById('notifBadge');
  const listContainer = document.getElementById('notifList');
  
  if (!bellWrap || !bellBtn || !dropdown) return;

  // Render toggle switch in header of dropdown dynamically
  const header = dropdown.querySelector('.user-dropdown-header');
  if (header && !header.querySelector('.notif-sub-toggle')) {
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'notif-sub-toggle';
    toggleBtn.style.cssText = 'background: transparent; border: 1px solid var(--primary, #bc13fe); color: var(--primary, #bc13fe); font-size: 10px; padding: 2px 8px; cursor: pointer; font-family: var(--font-headline); text-transform: uppercase; font-weight: bold; border-radius: 2px; transition: all 0.2s;';
    
    function updateToggleUI() {
      const isSubscribed = localStorage.getItem('as-notifications-enabled') === 'true';
      const hasPermission = ("Notification" in window) && Notification.permission === "granted";
      if (isSubscribed && hasPermission) {
        toggleBtn.textContent = 'Unsubscribe';
        toggleBtn.style.borderColor = 'var(--cyan, #00eefc)';
        toggleBtn.style.color = 'var(--cyan, #00eefc)';
      } else {
        toggleBtn.textContent = 'Subscribe';
        toggleBtn.style.borderColor = 'var(--primary, #bc13fe)';
        toggleBtn.style.color = 'var(--primary, #bc13fe)';
      }
    }
    
    toggleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isCurrentlySubbed = localStorage.getItem('as-notifications-enabled') === 'true';
      
      if (isCurrentlySubbed) {
        localStorage.setItem('as-notifications-enabled', 'false');
        if (window.Toast) window.Toast.info('Unsubscribed from notifications');
        await syncNotificationSettingsToCloud(false);
      } else {
        if ("Notification" in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            localStorage.setItem('as-notifications-enabled', 'true');
            if (window.Toast) window.Toast.success('Subscribed to notifications!');
            await syncNotificationSettingsToCloud(true);
            RetryQueue.process();
          } else {
            if (window.Toast) window.Toast.error('Permission denied for notifications');
          }
        } else {
          if (window.Toast) window.Toast.error('Notifications not supported by browser');
        }
      }
      updateToggleUI();
    });
    
    header.appendChild(toggleBtn);
    updateToggleUI();
  }

  // Toggle Dropdown
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    badge.style.display = 'none';
    
    // Update check time when opening (F5 Fix)
    if (!dropdown.classList.contains('open')) {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem('as-last-notif-check', now.toString());
      checkSchedule();
    }
    
    // Close user dropdown if open
    document.getElementById('userDropdown')?.classList.remove('open');
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!bellWrap.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Check Schedule Background Task
  async function checkSchedule() {
    try {
      if (!window.Watchlist) return;
      const watchlistItems = window.Watchlist.getAll();
      
      // Only check "watching" anime to reduce API load
      const watchingIds = watchlistItems
        .filter(item => item.status === 'watching')
        .map(item => item.id);
        
      if (watchingIds.length === 0) {
        listContainer.innerHTML = '<div class="notif-empty">No shows in your watching list.</div>';
        return;
      }

      // Chunk IDs to prevent GraphQL query too large
      const MAX_CHUNK = 20;
      let allSchedules = [];
      for (let i = 0; i < watchingIds.length; i += MAX_CHUNK) {
        const chunk = watchingIds.slice(i, i + MAX_CHUNK);
        const res = await window.AniSmokeAPI.getAiringSchedule(chunk);
        allSchedules = allSchedules.concat(res);
      }

      const now = Math.floor(Date.now() / 1000);
      
      // Filter strictly to episodes that aired in the past 7 days (so we don't notify for future eps yet)
      const airedEpisodes = allSchedules.filter(ep => ep.airingAt <= now);
      
      // Sort by newest aired first
      airedEpisodes.sort((a, b) => b.airingAt - a.airingAt);

      // --- Upcoming Episode Alarms (Schedule Trigger) ---
      const upcomingEpisodes = allSchedules.filter(ep => ep.airingAt > now && ep.airingAt <= now + 86400);
      upcomingEpisodes.forEach(ep => {
        const timerKey = `ep-${ep.mediaId}-${ep.episode}`;
        if (activeAiringTimers[timerKey]) return; // already scheduled
        
        const delayMs = (ep.airingAt - now) * 1000;
        if (delayMs <= 0) return;
        
        activeAiringTimers[timerKey] = setTimeout(() => {
          showNotification("New Episode Aired!", {
            body: `${ep.media?.title?.english || ep.media?.title?.romaji || 'Anime'} - Episode ${ep.episode}`,
            icon: ep.media?.coverImage?.large,
            tag: `anismoke-ep-${ep.mediaId}-${ep.episode}`
          });
          checkSchedule();
          delete activeAiringTimers[timerKey];
        }, delayMs);
      });

      if (airedEpisodes.length === 0) {
        listContainer.innerHTML = '<div class="notif-empty">No new episodes aired recently.</div>';
        return;
      }

      // Check if we have new unread episodes
      const lastCheck = parseInt(localStorage.getItem('as-last-notif-check') || '0', 10);
      const hasNew = airedEpisodes.some(ep => ep.airingAt > lastCheck);
      
      if (hasNew) {
        badge.style.display = 'block';
        const newest = airedEpisodes[0];
        showNotification("New Episode Aired!", {
          body: `${newest.media?.title?.english || newest.media?.title?.romaji} - Episode ${newest.episode}`,
          icon: newest.media?.coverImage?.large,
          tag: `anismoke-ep-${newest.mediaId}-${newest.episode}`
        });
      }

      // Render Dropdown List
      listContainer.innerHTML = '';
      airedEpisodes.forEach(ep => {
        const title = ep.media?.title?.english || ep.media?.title?.romaji || 'Anime';
        const cover = ep.media?.coverImage?.large || '';
        
        // Time ago
        const diffSeconds = now - ep.airingAt;
        const days = Math.floor(diffSeconds / 86400);
        const hours = Math.floor(diffSeconds / 3600);
        const mins = Math.floor(diffSeconds / 60);
        
        let timeStr = 'Just now';
        if (days > 0) timeStr = `${days}d ago`;
        else if (hours > 0) timeStr = `${hours}h ago`;
        else if (mins > 0) timeStr = `${mins}m ago`;

        const isUnread = ep.airingAt > lastCheck;
        
        const item = document.createElement('div');
        item.className = 'notif-item' + (isUnread ? ' unread' : '');
        item.innerHTML = `
          <img src="${cover}" alt="cover" class="notif-item-img" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 50%22><rect fill=%22%231a1a35%22 width=%22100%25%22 height=%22100%25%22/><text fill=%22%23444%22 x=%2218%22 y=%2228%22 text-anchor=%22middle%22 font-size=%228%22>?</text></svg>'">
          <div class="notif-item-info">
            <div class="notif-item-title">${title}</div>
            <div class="notif-item-ep">Episode ${ep.episode}</div>
            <div class="notif-item-time">${timeStr}</div>
          </div>
        `;
        item.onclick = () => {
          location.href = `watch.html?id=${ep.mediaId}`;
        };
        listContainer.appendChild(item);
      });

    } catch (e) {
      console.warn("AiringManager failed to check schedule:", e);
    }
  }

  // ── Auth-aware schedule check ─────────────────────────────
  // Instead of a hard-coded 2 s timeout (which may fire before
  // the Supabase session is restored on slow networks), we listen
  // for the auth-state-change event fired by app.js after session
  // settlement.  A 3 s fallback covers the case where the user is
  // already logged in and the event already fired before this code
  // registered its listener.
  let scheduleCheckDone = false;

  function initialScheduleCheck() {
    if (scheduleCheckDone) return;
    scheduleCheckDone = true;
    checkSchedule();
  }

  window.addEventListener('auth-state-change', function onFirstAuth(e) {
    if (e.detail?.user) {
      window.removeEventListener('auth-state-change', onFirstAuth);
      initialScheduleCheck();
    }
  });

  // Fallback: if auth already settled (fast session restore)
  setTimeout(() => {
    if (window.Auth?.getUser()) initialScheduleCheck();
  }, 3000);

  // Event triggers (Watchlist Update and Auth State Change)
  window.addEventListener('watchlist-update', () => {
    checkSchedule();
  });

  window.addEventListener('auth-state-change', (e) => {
    // Clear scheduled timers to prevent leaks
    Object.keys(activeAiringTimers).forEach(key => {
      clearTimeout(activeAiringTimers[key]);
    });
    activeAiringTimers = {};
    
    // Refresh schedule on any auth change (sign-in, sign-out)
    checkSchedule();
  });
}

// Initialize AiringManager on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initAiringManager);

// Expose globals
window.initAiringManager = initAiringManager;
window.syncNotificationSettingsFromCloud = syncNotificationSettingsFromCloud;
window.syncNotificationSettingsToCloud = syncNotificationSettingsToCloud;
