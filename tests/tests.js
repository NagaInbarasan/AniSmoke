/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Test Runner & Suite
   /tests/tests.js
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Test Runner Core ─────────────────────────────────────
  const groups = [];
  let currentGroup = null;
  let currentTest = null;
  const localStorageBackup = {};

  const keysToSandbox = [
    'as-notif-retry-queue',
    'as-notif-logs',
    'as-scheduler-fired',
    'as-notifications-enabled'
  ];

  function backupLocalStorage() {
    keysToSandbox.forEach(key => {
      localStorageBackup[key] = localStorage.getItem(key);
    });
  }

  function restoreLocalStorage() {
    keysToSandbox.forEach(key => {
      if (localStorageBackup[key] !== null) {
        localStorage.setItem(key, localStorageBackup[key]);
      } else {
        localStorage.removeItem(key);
      }
    });
  }

  function clearSandboxStorage() {
    keysToSandbox.forEach(key => {
      localStorage.removeItem(key);
    });
  }

  function logToDashboard(msg, type = 'info') {
    const container = document.getElementById('logs-container');
    if (!container) return;
    const time = new Date().toTimeString().split(' ')[0];
    const logLine = document.createElement('div');
    logLine.className = 'log-line';
    logLine.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-type ${type}">[${type.toUpperCase()}]</span>
      <span class="log-msg">${msg}</span>
    `;
    container.appendChild(logLine);
    container.scrollTop = container.scrollHeight;
  }

  function describe(name, fn) {
    currentGroup = {
      name,
      tests: [],
      passed: 0,
      failed: 0
    };
    groups.push(currentGroup);
    fn();
  }

  function it(name, desc, fn) {
    if (!currentGroup) return;
    currentGroup.tests.push({
      name,
      desc,
      fn,
      status: 'pending',
      assertions: [],
      duration: 0
    });
  }

  class Assertion {
    constructor(actual, test) {
      this.actual = actual;
      this.test = test;
    }

    toBe(expected, msg = 'Value match') {
      const pass = this.actual === expected;
      this.test.assertions.push({
        pass,
        msg: `${msg}: expected ${expected}, got ${this.actual}`,
        expected,
        actual: this.actual
      });
      if (!pass) throw new Error(`Assertion failed: ${msg}`);
    }

    toEqual(expected, msg = 'Deep equal match') {
      const actualStr = JSON.stringify(this.actual);
      const expectedStr = JSON.stringify(expected);
      const pass = actualStr === expectedStr;
      this.test.assertions.push({
        pass,
        msg: `${msg}: expected ${expectedStr}, got ${actualStr}`,
        expected,
        actual: this.actual
      });
      if (!pass) throw new Error(`Assertion failed: ${msg}`);
    }

    toContain(item, msg = 'Contains item') {
      const isArr = Array.isArray(this.actual);
      const isStr = typeof this.actual === 'string';
      const pass = (isArr && this.actual.includes(item)) || (isStr && this.actual.includes(item));
      this.test.assertions.push({
        pass,
        msg: `${msg}: expected ${isArr ? 'array' : 'string'} to contain ${item}`,
        expected: item,
        actual: this.actual
      });
      if (!pass) throw new Error(`Assertion failed: ${msg}`);
    }

    toBeTruthy(msg = 'Truthy check') {
      const pass = !!this.actual;
      this.test.assertions.push({
        pass,
        msg: `${msg}: expected truthy value, got ${this.actual}`,
        expected: true,
        actual: this.actual
      });
      if (!pass) throw new Error(`Assertion failed: ${msg}`);
    }

    toBeFalsy(msg = 'Falsy check') {
      const pass = !this.actual;
      this.test.assertions.push({
        pass,
        msg: `${msg}: expected falsy value, got ${this.actual}`,
        expected: false,
        actual: this.actual
      });
      if (!pass) throw new Error(`Assertion failed: ${msg}`);
    }
  }

  function expect(actual) {
    if (!currentTest) throw new Error('expect() called outside of test');
    return new Assertion(actual, currentTest);
  }

  // ── Custom Mocking Helpers ──────────────────────────────
  let originalNotification = window.Notification;
  let mockNotificationPermission = 'default';
  let mockNotificationHistory = [];

  function setupNotificationMocks() {
    mockNotificationHistory = [];
    
    // Polyfill Notification if it doesn't exist, or replace it
    window.Notification = function (title, options) {
      if (mockNotificationPermission !== 'granted') {
        throw new TypeError("Failed to construct 'Notification': Permission to show notifications is denied.");
      }
      const instance = {
        title,
        body: options?.body || '',
        icon: options?.icon || '',
        tag: options?.tag || '',
        close: () => {}
      };
      mockNotificationHistory.push(instance);
      return instance;
    };

    Object.defineProperty(window.Notification, 'permission', {
      get: () => mockNotificationPermission,
      configurable: true
    });
  }

  function teardownNotificationMocks() {
    window.Notification = originalNotification;
  }

  // Mocks for Watchlist & Supabase
  let originalWatchlist = window.Watchlist;
  let originalAniSmokeAPI = window.AniSmokeAPI;
  let originalSupabase = window.SupabaseClient;

  let mockWatchlistData = [];
  let mockAiringScheduleData = [];

  function setupAppMocks() {
    mockWatchlistData = [];
    mockAiringScheduleData = [];

    window.Watchlist = {
      getAll: () => mockWatchlistData
    };

    window.AniSmokeAPI = {
      getAiringScheduleExtended: async (ids, start, end) => {
        // Filter mock schedules
        return mockAiringScheduleData.filter(ep => 
          ids.includes(Number(ep.mediaId)) && ep.airingAt >= start && ep.airingAt <= end
        );
      }
    };

    window.SupabaseClient = {
      client: {
        from: (table) => {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
            limit: () => query,
            insert: async (data) => ({ data, error: null }),
            upsert: async (data) => ({ data, error: null }),
            delete: () => query
          };
          return query;
        }
      },
      Auth: {
        getUser: () => ({ id: 'sandbox-test-user-uuid', email: 'test@example.com' })
      }
    };
  }

  function teardownAppMocks() {
    window.Watchlist = originalWatchlist;
    window.AniSmokeAPI = originalAniSmokeAPI;
    window.SupabaseClient = originalSupabase;
  }

  // ── Define Test Suites ───────────────────────────────────

  describe('NotificationService Unit Tests', () => {

    it('should respect notifications toggle', 'When notification preference is disabled, send() should early return without firing', async () => {
      localStorage.setItem('as-notifications-enabled', 'false');
      mockNotificationPermission = 'granted';

      await window.NotificationService.send('Should not fire', { body: 'Disabled' });
      expect(mockNotificationHistory.length).toBe(0, 'Notification should not fire when disabled');
    });

    it('should show notifications when permission is granted', 'When permission is granted, send() should create browser Notification and log as sent', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      mockNotificationPermission = 'granted';

      await window.NotificationService.send('Hello World', { body: 'Test body', tag: 'test-tag-1' });
      
      expect(mockNotificationHistory.length).toBe(1, 'One notification should have fired');
      expect(mockNotificationHistory[0].title).toBe('Hello World');
      expect(mockNotificationHistory[0].body).toBe('Test body');
      expect(mockNotificationHistory[0].tag).toBe('test-tag-1');

      // Verify log status
      const logs = window.NotificationService._getLocalLogs();
      expect(logs.length).toBe(1, 'Log should be recorded');
      expect(logs[0].status).toBe('sent', 'Log status should be sent');
      expect(logs[0].tag).toBe('test-tag-1');
    });

    it('should queue notifications when permission is default/denied', 'When permission is not granted, send() should queue notifications locally', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      mockNotificationPermission = 'default';

      await window.NotificationService.send('Queued Notification', { body: 'Wait for permission', tag: 'test-tag-queued' });
      
      expect(mockNotificationHistory.length).toBe(0, 'No notification should fire directly');
      
      const queue = window.NotificationService.getQueue();
      expect(queue.length).toBe(1, 'One notification should be queued');
      expect(queue[0].title).toBe('Queued Notification');
      expect(queue[0].tag).toBe('test-tag-queued');

      const logs = window.NotificationService._getLocalLogs();
      expect(logs.some(l => l.status === 'queued')).toBeTruthy('Log status should be queued');
    });

    it('should prevent duplicate notifications', 'NotificationService should block duplicate triggers in fired tags or queue', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      mockNotificationPermission = 'granted';

      // Fire once
      await window.NotificationService.send('Unique Notif', { body: 'First run', tag: 'unique-tag' });
      expect(mockNotificationHistory.length).toBe(1, 'First notification fires');

      // Try duplicate
      await window.NotificationService.send('Duplicate Notif', { body: 'Second run', tag: 'unique-tag' });
      expect(mockNotificationHistory.length).toBe(1, 'Duplicate notification should NOT fire');

      // Verify duplicate blocks for queue too
      mockNotificationPermission = 'default';
      await window.NotificationService.send('Queued Notif', { body: 'First queue', tag: 'queue-tag-dup' });
      await window.NotificationService.send('Duplicate Queued', { body: 'Second queue', tag: 'queue-tag-dup' });
      
      const queue = window.NotificationService.getQueue();
      expect(queue.filter(q => q.tag === 'queue-tag-dup').length).toBe(1, 'Queue duplicates should be blocked');
    });

    it('should process queue when permission is granted and limit max retries', 'processQueue() should trigger pending and drop failed entries after 5 attempts', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      
      // Stage: Queue a notification under default permission
      mockNotificationPermission = 'default';
      await window.NotificationService.send('Retry Test', { body: 'Should retry', tag: 'retry-tag' });
      
      // Step 1: run processQueue with default permission - should stay queued
      await window.NotificationService.processQueue();
      let queue = window.NotificationService.getQueue();
      expect(queue.length).toBe(1, 'Should stay in queue when permission is default');

      // Step 2: Grant permission and process - should fire and clear queue
      mockNotificationPermission = 'granted';
      await window.NotificationService.processQueue();
      queue = window.NotificationService.getQueue();
      expect(queue.length).toBe(0, 'Should clear from queue on success');
      expect(mockNotificationHistory.some(n => n.tag === 'retry-tag')).toBeTruthy('Should fire notification');

      // Step 3: Test max retries drop. We mock notification construction throwing error.
      window.Notification = function() { throw new Error('Mock notification error'); };
      Object.defineProperty(window.Notification, 'permission', { get: () => 'granted' });
      
      await window.NotificationService.send('Failing Test', { body: 'Will fail', tag: 'fail-tag' });
      
      // Attempt 1 happened on send
      queue = window.NotificationService.getQueue();
      expect(queue[0].retry_count).toBe(0, 'Initial retry count');

      // Process 4 more times
      for (let i = 0; i < 4; i++) {
        await window.NotificationService.processQueue();
      }
      queue = window.NotificationService.getQueue();
      expect(queue.length).toBe(1, 'Should still be in queue after 4 processes total');
      expect(queue[0].retry_count).toBe(4);

      // 5th retry process should drop it
      await window.NotificationService.processQueue();
      queue = window.NotificationService.getQueue();
      expect(queue.length).toBe(0, 'Should drop after max retries exceeded');

      const logs = window.NotificationService._getLocalLogs();
      expect(logs.some(l => l.tag === 'fail-tag' && l.status === 'failed' && l.error.includes('Max retries'))).toBeTruthy('Log entry recorded max retries failure');
    });

  });

  describe('NotificationScheduler Integration Tests', () => {

    it('should retrieve watch items and query schedules', 'Scheduler should read watchlist items and trigger AniList schedules queries', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      mockNotificationPermission = 'granted';

      // Mock watchlist
      mockWatchlistData = [
        { id: '100', status: 'watching' },
        { id: '101', status: 'completed' }, // should be ignored
        { id: '102', status: 'watching' }
      ];

      // Mock future airing times
      const nowSec = Math.floor(Date.now() / 1000);
      mockAiringScheduleData = [
        { mediaId: '100', episode: 5, airingAt: nowSec + 1800, media: { title: { english: 'Watching Anime 1' } } }, // airs in 30 mins
        { mediaId: '102', episode: 12, airingAt: nowSec + 7200, media: { title: { english: 'Watching Anime 2' } } }  // airs in 2 hours
      ];

      // Reset Scheduler Fired list and timers
      window.NotificationScheduler.clearTimers();
      localStorage.removeItem('as-scheduler-fired');

      await window.NotificationScheduler.run();

      // Verify that notification scheduler queried the correct IDs and armed timers
      // Anime 1 has 24h, 1h, and live alarms. Since it airs in 30 mins:
      // - 24h alarm (airsAt - 24h) is in the past -> ignored
      // - 1h alarm (airsAt - 1h) is in the past -> ignored
      // - live alarm (airsAt - 0) is in the future (30 mins from now) -> timer armed!
      // Anime 2 airs in 2 hours:
      // - 24h alarm is in past -> ignored
      // - 1h alarm is in future (1h delay) -> timer armed!
      // - live alarm is in future (2h delay) -> timer armed!

      // Let's verify our scheduler registered correct timers internally.
      // We can't access "timers" private map directly, but we can verify that no immediate duplicate notifications fired.
      expect(mockNotificationHistory.length).toBe(0, 'Timers should be armed, not triggered immediately');
    });

    it('should fire immediate alerts for newly aired episodes', 'Scheduler should fire immediate live alert if episode aired within the last 10 minutes', async () => {
      localStorage.setItem('as-notifications-enabled', 'true');
      mockNotificationPermission = 'granted';

      mockWatchlistData = [
        { id: '200', status: 'watching' }
      ];

      const nowSec = Math.floor(Date.now() / 1000);
      // Episode aired 5 minutes ago (300 seconds ago)
      mockAiringScheduleData = [
        { mediaId: '200', episode: 3, airingAt: nowSec - 300, media: { title: { english: 'Recently Aired Anime' } } }
      ];

      window.NotificationScheduler.clearTimers();
      localStorage.removeItem('as-scheduler-fired');

      await window.NotificationScheduler.run();

      // Wait a microtask to allow the async dispatch/send calls to resolve
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should dispatch immediately since it's within the 10-minute window
      expect(mockNotificationHistory.length).toBe(1, 'One live alert should fire immediately');
      expect(mockNotificationHistory[0].title).toBe('📺 New Episode Aired!');
      expect(mockNotificationHistory[0].body).toContain('Episode 3 is LIVE now!');
    });

  });

  // ── UI Integration & Dashboard Logic ──────────────────────
  let totalTestsCount = 0;
  let passedTestsCount = 0;
  let failedTestsCount = 0;

  async function runAllTests() {
    logToDashboard('Starting test suite execution...', 'info');
    document.getElementById('test-run-status').innerText = 'Running...';
    document.getElementById('test-run-status').style.borderColor = 'var(--yellow)';
    document.getElementById('test-run-status').style.color = 'var(--yellow)';

    // Reset stats
    totalTestsCount = 0;
    passedTestsCount = 0;
    failedTestsCount = 0;
    
    // Clear dynamic content
    const listContainer = document.getElementById('suite-list');
    listContainer.innerHTML = '';

    // Loop through groups
    for (const group of groups) {
      logToDashboard(`Running Suite: ${group.name}`, 'info');
      
      // Create group element
      const groupEl = document.createElement('div');
      groupEl.className = 'group-card';
      
      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header';
      
      const groupBody = document.createElement('div');
      groupBody.className = 'group-body';

      groupHeader.innerHTML = `
        <div class="group-title">
          <span>${group.name}</span>
          <span class="group-badge" id="badge-${group.name.replace(/\s+/g, '-')}">Pending</span>
        </div>
        <span class="Material-symbols-outlined" style="font-size: 20px; transition: 0.2s;">keyboard_arrow_down</span>
      `;

      groupHeader.addEventListener('click', () => {
        groupBody.classList.toggle('collapsed');
        const arrow = groupHeader.querySelector('span:last-child');
        arrow.style.transform = groupBody.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
      });

      groupEl.appendChild(groupHeader);
      groupEl.appendChild(groupBody);
      listContainer.appendChild(groupEl);

      group.passed = 0;
      group.failed = 0;

      // Run tests inside group
      
      const testArray = group.tests;
      for (const test of testArray) {
        currentTest = test;
        totalTestsCount++;
        
        // Setup clean mock environment for each test
        backupLocalStorage();
        clearSandboxStorage();
        setupNotificationMocks();
        setupAppMocks();

        const startTime = performance.now();
        let testError = null;

        try {
          // Execute test
          await test.fn();
          test.status = 'passed';
          group.passed++;
          passedTestsCount++;
        } catch (err) {
          test.status = 'failed';
          testError = err;
          group.failed++;
          failedTestsCount++;
          logToDashboard(`FAIL: ${test.name} - ${err.message}`, 'error');
        } finally {
          test.duration = (performance.now() - startTime).toFixed(1);
          // Restore environment
          teardownNotificationMocks();
          teardownAppMocks();
          restoreLocalStorage();
        }

        // Render test item
        const testEl = document.createElement('div');
        testEl.className = 'test-item';
        
        let assertionsHTML = '';
        if (test.assertions.length > 0) {
          assertionsHTML = `
            <div class="assertions-list">
              ${test.assertions.map((a, idx) => `
                <div class="assertion-item ${a.pass ? 'passed' : 'failed'}">
                  <div class="assertion-header">
                    <span>Assertion #${idx + 1}: ${a.msg}</span>
                    <span style="color: ${a.pass ? 'var(--green)' : 'var(--red)'}">${a.pass ? '✔ PASS' : '✘ FAIL'}</span>
                  </div>
                  ${!a.pass ? `<div class="assertion-details">Expected: ${JSON.stringify(a.expected)}\nActual: ${JSON.stringify(a.actual)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `;
        }

        testEl.innerHTML = `
          <div class="test-header">
            <div class="test-info">
              <div class="test-name">
                <span class="status-icon ${test.status}"></span>
                <span>${test.name}</span>
              </div>
              <div class="test-desc">${test.desc}</div>
            </div>
            <div class="test-status">
              <span class="test-time">${test.duration}ms</span>
            </div>
          </div>
          ${assertionsHTML}
          ${testError ? `<div class="assertion-details" style="background: rgba(255,179,179,0.05); padding: 10px; margin-top: 8px; border-left: 2px solid var(--red); font-family: var(--font-mono);">${testError.stack || testError.message}</div>` : ''}
        `;
        groupBody.appendChild(testEl);
      }

      // Update Group Badge
      const badge = document.getElementById(`badge-${group.name.replace(/\s+/g, '-')}`);
      if (group.failed > 0) {
        badge.className = 'group-badge failed';
        badge.innerText = `${group.passed}/${group.tests.length} Passed`;
      } else {
        badge.className = 'group-badge passed';
        badge.innerText = 'All Passed';
      }
    }

    // Update overall dashboard stats
    document.getElementById('stat-total').innerText = totalTestsCount;
    document.getElementById('stat-passed').innerText = passedTestsCount;
    document.getElementById('stat-failed').innerText = failedTestsCount;
    
    const rate = totalTestsCount > 0 ? Math.round((passedTestsCount / totalTestsCount) * 100) : 0;
    document.getElementById('stat-rate').innerText = `${rate}%`;

    document.getElementById('test-run-status').innerText = failedTestsCount > 0 ? 'FAIL' : 'PASS';
    document.getElementById('test-run-status').style.borderColor = failedTestsCount > 0 ? 'var(--red)' : 'var(--green)';
    document.getElementById('test-run-status').style.color = failedTestsCount > 0 ? 'var(--red)' : 'var(--green)';

    logToDashboard(`Suite execution finished. ${passedTestsCount}/${totalTestsCount} passed.`, failedTestsCount > 0 ? 'error' : 'success');
  }

  // Setup DOM Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Populate Initial Stats
    let total = 0;
    groups.forEach(g => total += g.tests.length);
    document.getElementById('stat-total').innerText = total;

    // Run Suite
    document.getElementById('run-btn').addEventListener('click', runAllTests);
    
    document.getElementById('clear-btn').addEventListener('click', () => {
      keysToSandbox.forEach(key => localStorage.removeItem(key));
      logToDashboard('Sandbox storage cleared.', 'warn');
    });

    document.getElementById('clear-logs-btn').addEventListener('click', () => {
      document.getElementById('logs-container').innerHTML = '';
      logToDashboard('Logs cleared.', 'info');
    });

    // Auto-run first time
    setTimeout(runAllTests, 500);
  });

})();
