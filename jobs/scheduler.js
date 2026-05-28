/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Notification Scheduler
   /jobs/scheduler.js

   Flow:
     AnimeSchedule API (getAiringSchedule)
       ↓
     nextEpisode  (first upcoming ep per anime)
       ↓
     compare watchlist  (watching-only)
       ↓
     queue notification  (24h | 1h | live — de-duped)
       ↓
     send (browser Notification API)

   Runs entirely client-side.  No server or cron required.
   Integrated with the existing AiringManager and RetryQueue.
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     CONSTANTS
     ───────────────────────────────────────────────────────── */
  const FIRED_KEY      = 'as-scheduler-fired';   // localStorage: set of fired notif tags
  const POLL_INTERVAL  = 30 * 60 * 1000;         // re-check airing data every 30 min
  const LOOK_AHEAD_SEC = 25 * 60 * 60;           // fetch schedules up to 25 h ahead

  // Alarm thresholds (seconds before episode airs)
  const ALARMS = [
    { label: '24h',  offsetSec: 24 * 60 * 60, body: (title, ep) => `${title} — Episode ${ep} airs in 24 hours!` },
    { label: '1h',   offsetSec:      60 * 60, body: (title, ep) => `${title} — Episode ${ep} airs in 1 hour!`   },
    { label: 'live', offsetSec:            0, body: (title, ep) => `${title} — Episode ${ep} is LIVE now! 🔥`   },
  ];

  /* ─────────────────────────────────────────────────────────
     FIRED-TAG STORE
     Prevents the same notification from firing twice even if
     the scheduler re-runs (page refresh, poll cycle, etc.)
     ───────────────────────────────────────────────────────── */
  const Fired = {
    _cache: null,

    _load() {
      if (this._cache) return this._cache;
      try {
        this._cache = new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'));
      } catch {
        this._cache = new Set();
      }
      return this._cache;
    },

    has(tag) {
      return this._load().has(tag);
    },

    mark(tag) {
      const set = this._load();
      set.add(tag);
      // Prune entries older than 7 days by keeping only tags that include recent epoch minutes
      // (tags encode mediaId + episode + alarmLabel, cheap to retain indefinitely at this scale)
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
      } catch {
        // Quota — purge and start fresh, acceptable trade-off
        localStorage.removeItem(FIRED_KEY);
        this._cache = new Set([tag]);
        localStorage.setItem(FIRED_KEY, JSON.stringify([tag]));
      }
    },
  };

  /* ─────────────────────────────────────────────────────────
     ACTIVE TIMERS MAP
     Keyed by notif tag so we never double-schedule.
     ───────────────────────────────────────────────────────── */
  const timers = {};  // tag → setTimeout id

  function clearAllTimers() {
    Object.keys(timers).forEach(tag => {
      clearTimeout(timers[tag]);
      delete timers[tag];
    });
  }

  /* ─────────────────────────────────────────────────────────
     NOTIFICATION DISPATCH
     ───────────────────────────────────────────────────────── */
  function dispatch(tag, title, body, icon) {
    if (window.NotificationService) {
      window.NotificationService.send(title, { body, icon, tag });
    } else {
      const isEnabled = localStorage.getItem('as-notifications-enabled') === 'true';
      if (!isEnabled) return;

      if (Fired.has(tag)) return;   // duplicate guard
      Fired.mark(tag);

      if (!('Notification' in window)) return;

      const payload = { body, icon, tag };

      if (Notification.permission === 'granted') {
        try {
          new Notification(title, payload);
        } catch (e) {
          console.warn('[Scheduler] Notification failed:', e);
          // Hand off to RetryQueue if available
          if (window.RetryQueue) window.RetryQueue.add({ title, ...payload });
        }
      } else if (Notification.permission !== 'denied') {
        if (window.RetryQueue) window.RetryQueue.add({ title, ...payload });
      }
    }
  }

  /* ─────────────────────────────────────────────────────────
     SCHEDULE ONE EPISODE
     Arms setTimeout alarms for each threshold (24h, 1h, live).
     Skips thresholds that are already past or already fired.
     ───────────────────────────────────────────────────────── */
  function scheduleEpisode(ep) {
    const nowSec  = Math.floor(Date.now() / 1000);
    const airSec  = ep.airingAt;
    const title   = ep.media?.title?.english || ep.media?.title?.romaji || 'Anime';
    const icon    = ep.media?.coverImage?.large || '';
    const episode = ep.episode;

    ALARMS.forEach(({ label, offsetSec, body }) => {
      const fireSec = airSec - offsetSec;
      const tag     = `as-sched-${ep.mediaId}-ep${episode}-${label}`;

      // Already fired this alarm for this episode?
      if (Fired.has(tag)) return;

      // Timer already armed for this tag?
      if (timers[tag] !== undefined) return;

      const delayMs = (fireSec - nowSec) * 1000;

      if (delayMs < 0) {
        // This alarm threshold has already passed — fire immediately only for 'live'
        // to surface newly-aired episodes the user may have missed (within 10 min window)
        if (label === 'live' && nowSec - airSec <= 10 * 60) {
          dispatch(tag, '📺 New Episode Aired!', body(title, episode), icon);
        }
        return;
      }

      // Arm the timer
      timers[tag] = setTimeout(() => {
        delete timers[tag];
        dispatch(tag, notifTitle(label), body(title, episode), icon);
        // After 'live' fires, trigger a schedule refresh to pick up next ep
        if (label === 'live' && typeof window.checkAiringSchedule === 'function') {
          window.checkAiringSchedule();
        }
      }, delayMs);
    });
  }

  function notifTitle(label) {
    if (label === 'live') return '📺 Episode Live Now!';
    if (label === '1h')   return '⏰ Episode in 1 Hour';
    return '🗓️ Episode Tomorrow';
  }

  /* ─────────────────────────────────────────────────────────
     EXTRACT NEXT EPISODE PER ANIME
     From the flat AiringSchedule list, select the first
     upcoming episode for each mediaId (not yet aired).
     ───────────────────────────────────────────────────────── */
  function extractNextEpisodes(schedules) {
    const nowSec = Math.floor(Date.now() / 1000);
    const byMedia = {};

    schedules.forEach(ep => {
      if (ep.airingAt <= nowSec - 10 * 60) return;  // ignore episodes aired more than 10 mins ago
      if (!byMedia[ep.mediaId] || ep.airingAt < byMedia[ep.mediaId].airingAt) {
        byMedia[ep.mediaId] = ep;
      }
    });

    return Object.values(byMedia);
  }

  /* ─────────────────────────────────────────────────────────
     MAIN RUN — fetch schedule and arm alarms
     ───────────────────────────────────────────────────────── */
  async function run() {
    try {
      if (!window.Watchlist || !window.AniSmokeAPI) return;

      // Only schedule notifications if the user has enabled them
      const isEnabled = localStorage.getItem('as-notifications-enabled') === 'true';
      if (!isEnabled) return;

      // Pull watching-status anime IDs from the watchlist
      const watchlistItems = window.Watchlist.getAll();
      const watchingIds = watchlistItems
        .filter(item => item.status === 'watching')
        .map(item => Number(item.id))
        .filter(Boolean);

      if (watchingIds.length === 0) return;

      // Extend the airing window to LOOK_AHEAD_SEC so 24h alarm is always reachable
      const nowSec = Math.floor(Date.now() / 1000);
      const start  = nowSec - (7 * 24 * 3600);
      const end    = nowSec + LOOK_AHEAD_SEC;

      // Chunk requests to avoid oversized GraphQL queries (max 20 IDs per call)
      const CHUNK = 20;
      let allSchedules = [];
      for (let i = 0; i < watchingIds.length; i += CHUNK) {
        const chunk = watchingIds.slice(i, i + CHUNK);
        // Re-use the existing API method but with extended window
        const res = await window.AniSmokeAPI.getAiringScheduleExtended(chunk, start, end);
        allSchedules = allSchedules.concat(res);
      }

      // Extract one upcoming episode per anime and arm alarms
      const nextEps = extractNextEpisodes(allSchedules);
      nextEps.forEach(scheduleEpisode);

    } catch (err) {
      console.warn('[Scheduler] run() failed:', err);
    }
  }

  /* ─────────────────────────────────────────────────────────
     POLLING LOOP
     Runs on load, then every POLL_INTERVAL minutes.
     Cleared and re-run on auth change or watchlist update.
     ───────────────────────────────────────────────────────── */
  let pollTimer = null;

  function startPolling() {
    run();  // immediate run
    pollTimer = setInterval(run, POLL_INTERVAL);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
    clearAllTimers();
  }

  /* ─────────────────────────────────────────────────────────
     EVENT HOOKS
     ───────────────────────────────────────────────────────── */
  window.addEventListener('watchlist-update', () => {
    clearAllTimers();  // clear old timers for removed anime
    run();             // re-arm for current watchlist
  });

  window.addEventListener('auth-state-change', () => {
    stopPolling();
    // Small delay to let auth session settle before re-reading watchlist
    setTimeout(startPolling, 1500);
  });

  window.addEventListener('online', () => {
    // Device came back online — re-check in case schedule fetch failed
    run();
  });

  /* ─────────────────────────────────────────────────────────
     PUBLIC INTERFACE
     ───────────────────────────────────────────────────────── */
  window.NotificationScheduler = {
    start: startPolling,
    stop:  stopPolling,
    run,                   // call manually if needed
    clearTimers: clearAllTimers,
    getFiredTags: () => [...Fired._load()],
  };

  /* ─────────────────────────────────────────────────────────
     BOOT
     Waits for DOMContentLoaded so Watchlist + AniSmokeAPI
     are guaranteed to be available.
     ───────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(startPolling, 2500));
  } else {
    setTimeout(startPolling, 2500);
  }

})();
