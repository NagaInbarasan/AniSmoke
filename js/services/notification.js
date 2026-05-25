/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Notification Service
   /js/services/notification.js
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const QUEUE_KEY = 'as-notif-retry-queue';
  const LOGS_KEY = 'as-notif-logs';
  const FIRED_KEY = 'as-scheduler-fired';
  const MAX_RETRIES = 5;

  const NotificationService = {
    // ── Local Storage Helpers ──
    _getLocalQueue() {
      try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      } catch {
        return [];
      }
    },

    _saveLocalQueue(queue) {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch (e) {
        console.error('[NotificationService] Failed to save local queue:', e);
      }
    },

    _getLocalLogs() {
      try {
        return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
      } catch {
        return [];
      }
    },

    _saveLocalLogs(logs) {
      try {
        // Limit local logs to latest 100 entries to prevent quota overflow
        const trimmed = logs.slice(-100);
        localStorage.setItem(LOGS_KEY, JSON.stringify(trimmed));
      } catch (e) {
        console.error('[NotificationService] Failed to save local logs:', e);
      }
    },

    _getFiredSet() {
      try {
        return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]'));
      } catch {
        return new Set();
      }
    },

    _markFired(tag) {
      try {
        const fired = this._getFiredSet();
        fired.add(tag);
        localStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
      } catch (e) {
        console.warn('[NotificationService] Failed to mark tag fired:', e);
      }
    },

    // ── Supabase Helpers ──
    _getSupabaseClient() {
      return window.SupabaseClient?.client || null;
    },

    _getCurrentUser() {
      return window.SupabaseClient?.Auth?.getUser() || null;
    },

    // ── Core Log & Queue Operations ──
    async _log(title, body, tag, status, errorMsg = null) {
      console.log(`[NotificationService] Logging: [${status}] ${title} (Tag: ${tag})${errorMsg ? ' - Error: ' + errorMsg : ''}`);

      const logEntry = {
        title,
        body,
        tag,
        status,
        error: errorMsg,
        created_at: new Date().toISOString()
      };

      // 1. Local logging
      const localLogs = this._getLocalLogs();
      localLogs.push(logEntry);
      this._saveLocalLogs(localLogs);

      // 2. Cloud logging (if logged in)
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();
      if (user && client) {
        try {
          await client.from('notification_logs').insert({
            user_id: user.id,
            title,
            body,
            tag,
            status,
            error: errorMsg
          });
        } catch (e) {
          console.warn('[NotificationService] Failed to send log to Supabase:', e.message);
        }
      }
    },

    // ── Public Send API ──
    async send(title, options = {}) {
      const isSubscribed = localStorage.getItem('as-notifications-enabled') === 'true';
      if (!isSubscribed) return;

      const tag = options.tag || `as-notif-${Date.now()}`;
      const body = options.body || '';
      const icon = options.icon || '';

      // ── Prevent Duplicate Schedules / Notifications ──
      // Check local fired cache first
      if (this._getFiredSet().has(tag)) {
        console.log(`[NotificationService] Duplicate detected in local fired cache (Tag: ${tag}). Skipping.`);
        return;
      }

      // Check local queue first
      const localQueue = this._getLocalQueue();
      if (localQueue.some(item => item.tag === tag)) {
        console.log(`[NotificationService] Duplicate detected in local queue (Tag: ${tag}). Skipping.`);
        return;
      }

      // Check Supabase DB for duplicate sent logs or queue (if online & logged in)
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();
      if (user && client && navigator.onLine) {
        try {
          // Check if already queued
          const { data: queueData } = await client
            .from('notification_queue')
            .select('tag')
            .eq('user_id', user.id)
            .eq('tag', tag)
            .maybeSingle();

          if (queueData) {
            console.log(`[NotificationService] Duplicate detected in Supabase queue (Tag: ${tag}). Skipping.`);
            return;
          }

          // Check if already sent successfully
          const { data: logData } = await client
            .from('notification_logs')
            .select('tag')
            .eq('user_id', user.id)
            .eq('tag', tag)
            .eq('status', 'sent')
            .limit(1);

          if (logData && logData.length > 0) {
            console.log(`[NotificationService] Duplicate detected in Supabase logs (Tag: ${tag}). Skipping.`);
            this._markFired(tag); // Sync local fired store
            return;
          }
        } catch (e) {
          console.warn('[NotificationService] Supabase duplicate check failed, using local fallback:', e.message);
        }
      }

      // ── Fail-safe no-op check ──
      if (!('Notification' in window)) {
        await this._log(title, body, tag, 'failed', 'Notification API not supported by browser');
        return;
      }

      // ── Permission Check ──
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon,
            tag
          });
          this._markFired(tag);
          await this._log(title, body, tag, 'sent');
        } catch (e) {
          console.warn('[NotificationService] Display failed, queueing for retry:', e);
          await this._log(title, body, tag, 'failed', `Display Error: ${e.message}`);
          await this.queue({ title, body, icon, tag });
        }
      } else {
        // Queue it when permission is 'default' or 'denied' (allowing retry when permission changes)
        console.log(`[NotificationService] Permission is '${Notification.permission}'. Queueing notification (Tag: ${tag}).`);
        await this.queue({ title, body, icon, tag });
      }
    },

    // ── Queue Management ──
    async queue(item) {
      const queue = this._getLocalQueue();
      if (queue.some(q => q.tag === item.tag)) return;

      const newItem = {
        title: item.title,
        body: item.body || '',
        icon: item.icon || '',
        tag: item.tag,
        retry_count: item.retry_count || 0,
        last_attempt_at: item.last_attempt_at || new Date().toISOString(),
        created_at: item.created_at || new Date().toISOString()
      };

      queue.push(newItem);
      this._saveLocalQueue(queue);
      await this._log(newItem.title, newItem.body, newItem.tag, 'queued');

      // Sync to cloud if available
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();
      if (user && client && navigator.onLine) {
        try {
          await client.from('notification_queue').upsert({
            user_id: user.id,
            title: newItem.title,
            body: newItem.body,
            tag: newItem.tag,
            icon: newItem.icon,
            retry_count: newItem.retry_count,
            last_attempt_at: newItem.last_attempt_at,
            created_at: newItem.created_at
          }, { onConflict: 'user_id,tag' });
        } catch (e) {
          console.warn('[NotificationService] Cloud queue sync failed:', e.message);
        }
      }
    },

    async processQueue() {
      const isSubscribed = localStorage.getItem('as-notifications-enabled') === 'true';
      if (!isSubscribed) return;

      if (!('Notification' in window) || Notification.permission !== 'granted') {
        console.log(`[NotificationService] processQueue skipped: Permission is '${window.Notification ? Notification.permission : 'unsupported'}'.`);
        return;
      }

      const queue = this._getLocalQueue();
      if (queue.length === 0) return;

      console.log(`[NotificationService] Processing queue (${queue.length} items)...`);
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();

      const remaining = [];

      for (const item of queue) {
        try {
          // Increment retry counter
          item.retry_count = (item.retry_count || 0) + 1;
          item.last_attempt_at = new Date().toISOString();

          // Try to trigger notification (Fail-safe wrapped)
          new Notification(item.title, {
            body: item.body,
            icon: item.icon,
            tag: item.tag
          });

          // Success: Log and clear from DB
          this._markFired(item.tag);
          await this._log(item.title, item.body, item.tag, 'sent');

          if (user && client && navigator.onLine) {
            try {
              await client
                .from('notification_queue')
                .delete()
                .eq('user_id', user.id)
                .eq('tag', item.tag);
            } catch (dbErr) {
              console.warn('[NotificationService] Failed to clear item from cloud queue:', dbErr.message);
            }
          }
        } catch (e) {
          console.warn(`[NotificationService] Retry failed for tag: ${item.tag}. Retries: ${item.retry_count}/${MAX_RETRIES}`, e);

          if (item.retry_count >= MAX_RETRIES) {
            // Discard and log failure
            await this._log(item.title, item.body, item.tag, 'failed', `Max retries (${MAX_RETRIES}) exceeded: ${e.message}`);
            
            if (user && client && navigator.onLine) {
              try {
                await client
                  .from('notification_queue')
                  .delete()
                  .eq('user_id', user.id)
                  .eq('tag', item.tag);
              } catch (dbErr) {
                console.warn('[NotificationService] Failed to clear expired item from cloud queue:', dbErr.message);
              }
            }
          } else {
            // Re-queue with incremented attempt
            remaining.push(item);
            await this._log(item.title, item.body, item.tag, 'queued', `Attempt ${item.retry_count} failed: ${e.message}`);

            if (user && client && navigator.onLine) {
              try {
                await client.from('notification_queue').upsert({
                  user_id: user.id,
                  title: item.title,
                  body: item.body,
                  tag: item.tag,
                  icon: item.icon,
                  retry_count: item.retry_count,
                  last_attempt_at: item.last_attempt_at
                }, { onConflict: 'user_id,tag' });
              } catch (dbErr) {
                console.warn('[NotificationService] Failed to update retry count in cloud queue:', dbErr.message);
              }
            }
          }
        }
      }

      this._saveLocalQueue(remaining);
    },

    // ── Restore Queue on Login/Refresh ──
    async restore() {
      console.log('[NotificationService] Restoring notification queue...');
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();

      if (!user || !client || !navigator.onLine) {
        // offline or guest: keep local queue as is
        return;
      }

      try {
        // 1. Sync local queue items that aren't on the cloud yet
        const localQueue = this._getLocalQueue();
        if (localQueue.length > 0) {
          for (const item of localQueue) {
            await client.from('notification_queue').upsert({
              user_id: user.id,
              title: item.title,
              body: item.body,
              tag: item.tag,
              icon: item.icon,
              retry_count: item.retry_count,
              last_attempt_at: item.last_attempt_at,
              created_at: item.created_at
            }, { onConflict: 'user_id,tag' });
          }
        }

        // 2. Pull all queued items from cloud
        const { data: cloudQueue, error } = await client
          .from('notification_queue')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        // 3. Rebuild local queue from cloud data
        const mergedQueue = (cloudQueue || []).map(row => ({
          title: row.title,
          body: row.body,
          icon: row.icon,
          tag: row.tag,
          retry_count: row.retry_count,
          last_attempt_at: row.last_attempt_at,
          created_at: row.created_at
        }));

        this._saveLocalQueue(mergedQueue);
        console.log(`[NotificationService] Successfully restored ${mergedQueue.length} items from cloud queue.`);

        // 4. Try to process the queue immediately (if permissions allowed)
        if (Notification.permission === 'granted') {
          await this.processQueue();
        }
      } catch (e) {
        console.warn('[NotificationService] Restore failed:', e.message);
      }
    },

    getQueue() {
      return this._getLocalQueue();
    },

    clearQueue() {
      this._saveLocalQueue([]);
      const user = this._getCurrentUser();
      const client = this._getSupabaseClient();
      if (user && client && navigator.onLine) {
        client.from('notification_queue').delete().eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.warn('[NotificationService] Cloud queue clear failed:', error.message);
          });
      }
    }
  };

  // Expose on window for global access
  window.NotificationService = NotificationService;

  // ── Polyfill/Wrapper for window.RetryQueue ──
  window.RetryQueue = {
    get() {
      return NotificationService.getQueue();
    },
    add(item) {
      NotificationService.queue(item);
    },
    clear() {
      NotificationService.clearQueue();
    },
    process() {
      NotificationService.processQueue();
    }
  };

  // Listen to browser online status & auth updates to restore/process the queue
  window.addEventListener('online', () => {
    NotificationService.processQueue();
  });

  window.addEventListener('auth-state-change', (e) => {
    if (e.detail?.user) {
      NotificationService.restore();
    }
  });

  // Check queue immediately if permission is already granted
  document.addEventListener('DOMContentLoaded', () => {
    if (("Notification" in window) && Notification.permission === 'granted') {
      NotificationService.processQueue();
    }
  });
})();
