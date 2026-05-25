/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Error Boundary & Monitoring
   Must load FIRST (before supabase.js / app.js) so it can
   capture errors thrown during script parse and init phases.
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────── */
  const BUFFER_KEY   = 'as-error-log';
  const BUFFER_LIMIT = 50;

  // User-visible error classes: these map to brief, friendly messages
  // that are shown in the toast. Technical detail stays in the buffer.
  const USER_VISIBLE_PATTERNS = [
    { re: /network|failed to fetch|load failed|networkerror/i,   msg: 'Network error — check your connection' },
    { re: /api|graphql|anilist|consumet|anify/i,                  msg: 'API request failed — retrying soon' },
    { re: /supabase|auth|session/i,                              msg: 'Account sync issue — please refresh' },
    { re: /chunk|module|import|script/i,                         msg: 'Loading error — please refresh the page' },
  ];

  // Errors to silently swallow (third-party noise, benign browser quirks)
  const SUPPRESSED_PATTERNS = [
    /ResizeObserver loop/i,
    /Non-Error promise rejection/i,
    /Script error\./i,          // cross-origin script errors (no useful info)
    /cancelled/i,               // iOS cancels fetches on nav — not a real error
    /AbortError/i,              // intentional fetch aborts
    /serviceWorker/i,
  ];

  /* ── Rolling error buffer (sessionStorage) ──────────────── */
  function readBuffer() {
    try { return JSON.parse(sessionStorage.getItem(BUFFER_KEY) || '[]'); }
    catch { return []; }
  }

  function writeBuffer(entry) {
    try {
      const buf = readBuffer();
      buf.unshift(entry);                          // newest first
      if (buf.length > BUFFER_LIMIT) buf.length = BUFFER_LIMIT;
      sessionStorage.setItem(BUFFER_KEY, JSON.stringify(buf));
    } catch {/* sessionStorage full or blocked — silently skip */}
  }

  function buildEntry(type, message, source, lineno, colno, stack) {
    return {
      t:    Date.now(),
      type,
      msg:  message,
      src:  source  || '',
      line: lineno  || 0,
      col:  colno   || 0,
      stk:  stack   || '',
      page: location.pathname,
      ua:   navigator.userAgent.slice(0, 80),
    };
  }

  /* ── User-visible toast (deferred until Toast is ready) ─── */
  // Queued while app.js hasn't loaded yet; flushed once it does.
  const _toastQueue = [];
  let   _toastReady = false;

  function enqueueToast(msg) {
    if (_toastReady && window.Toast) {
      window.Toast.error(msg);
    } else {
      _toastQueue.push(msg);
    }
  }

  function flushToastQueue() {
    _toastReady = true;
    if (!window.Toast) return;
    // Show at most 2 queued toasts to avoid flooding the screen
    const toShow = _toastQueue.splice(0, 2);
    toShow.forEach(msg => window.Toast.error(msg));
    if (_toastQueue.length > 0) {
      // If there were more errors, show a summary toast instead
      window.Toast.warning(`${_toastQueue.length} more startup error(s) recorded`);
      _toastQueue.length = 0;
    }
  }

  /* ── Core error processor ───────────────────────────────── */
  function processError(type, message, source, lineno, colno, error) {
    const msgStr    = (message || '').toString();
    const stack     = error?.stack || '';
    const fullStr   = msgStr + ' ' + (source || '') + ' ' + stack;

    // Suppress benign / noisy errors
    for (const pat of SUPPRESSED_PATTERNS) {
      if (pat.test(fullStr)) return;
    }

    // Write to buffer (always, even for non-user-visible errors)
    writeBuffer(buildEntry(type, msgStr, source, lineno, colno, stack));

    // Forward to Sentry if loaded
    if (window.__Sentry && type === 'uncaught' && error instanceof Error) {
      try { window.__Sentry.captureException(error); } catch { /* noop */ }
    } else if (window.__Sentry) {
      try { window.__Sentry.captureMessage(msgStr, 'error'); } catch { /* noop */ }
    }

    // Determine if this error should surface to the user
    for (const { re, msg } of USER_VISIBLE_PATTERNS) {
      if (re.test(fullStr)) {
        enqueueToast(msg);
        return;          // one toast per error is enough
      }
    }

    // Generic fallback toast only during dev (localhost / 127.0.0.1)
    const isDev = /localhost|127\.0\.0\.1/.test(location.hostname);
    if (isDev && type === 'uncaught') {
      enqueueToast(`JS Error: ${msgStr.slice(0, 80)}`);
    }
  }

  /* ── Global error handlers ──────────────────────────────── */

  // Synchronous runtime errors
  const _prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    processError('uncaught', message, source, lineno, colno, error);
    if (typeof _prevOnError === 'function') {
      _prevOnError.call(this, message, source, lineno, colno, error);
    }
    return false; // don't swallow — still appears in DevTools
  };

  // Unhandled Promise rejections
  const _prevUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = function (event) {
    const reason  = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
    const stack   = reason instanceof Error ? reason.stack   : '';
    processError('promise', message, '', 0, 0, reason instanceof Error ? reason : null);
    if (typeof _prevUnhandledRejection === 'function') {
      _prevUnhandledRejection.call(this, event);
    }
  };

  /* ── Async wrapper for page-init functions ──────────────── */
  /**
   * Wraps an async page-init function so uncaught async errors are:
   *  1. Logged to the buffer
   *  2. Optionally surfaced as a toast
   *  3. Not swallowed (re-thrown for DevTools visibility in development)
   *
   * Usage:
   *   AniSmokeErrors.run(async function initPage() { ... });
   */
  function run(fn, label) {
    const name = label || fn.name || 'anonymousInit';
    return Promise.resolve()
      .then(() => fn())
      .catch(err => {
        const msg = err?.message || String(err);
        processError('init', `[${name}] ${msg}`, '', 0, 0, err instanceof Error ? err : null);
        // Re-throw in development so DevTools surfaces the stack
        if (/localhost|127\.0\.0\.1/.test(location.hostname)) throw err;
      });
  }

  /* ── Sentry lazy bootstrap ──────────────────────────────── */
  /**
   * Checks window.SENTRY_DSN at load time.
   * If present, dynamically injects the Sentry CDN bundle (v8 BrowserSDK).
   * The bundle sets window.Sentry; we alias it to window.__Sentry for safety.
   * If SENTRY_DSN is absent, silently skips — zero overhead.
   */
  function initSentry() {
    const dsn = window.SENTRY_DSN;
    if (!dsn || typeof dsn !== 'string' || !dsn.startsWith('https://')) return;

    const script    = document.createElement('script');
    script.src      = 'https://browser.sentry-cdn.com/8.6.0/bundle.min.js';
    script.crossOrigin = 'anonymous';
    script.async    = true;
    script.onload   = function () {
      try {
        window.Sentry.init({
          dsn,
          environment:   /localhost|127\.0\.0\.1/.test(location.hostname) ? 'development' : 'production',
          release:       window.AS_VERSION || '2.0.0',
          integrations:  [],            // Minimal — no heavy replay or tracing
          tracesSampleRate: 0,          // Disable performance tracing
          beforeSend(event) {
            // Redact any potential PII from breadcrumbs
            if (event.breadcrumbs?.values) {
              event.breadcrumbs.values = event.breadcrumbs.values.filter(
                b => b.category !== 'xhr' && b.category !== 'fetch'
              );
            }
            return event;
          },
        });
        window.__Sentry = window.Sentry;
        console.info('[AniSmoke] Sentry initialized');

        // Replay any errors captured before Sentry finished loading
        const buf = readBuffer();
        const recent = buf.slice(0, 5);  // last 5 only to avoid spamming
        recent.forEach(entry => {
          window.Sentry.captureMessage(`[replay] ${entry.msg}`, 'error');
        });
      } catch (e) {
        console.warn('[AniSmoke] Sentry init failed:', e);
      }
    };
    script.onerror = function () {
      console.warn('[AniSmoke] Sentry CDN failed to load — continuing without it');
    };

    // Insert before first existing script tag
    const firstScript = document.querySelector('script');
    if (firstScript) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.AniSmokeErrors = {
    /** Wrap an async page init function with error capture. */
    run,

    /** Read the full error buffer (for diagnostic UIs or console inspection). */
    getLog() { return readBuffer(); },

    /** Clear the error buffer. */
    clearLog() {
      try { sessionStorage.removeItem(BUFFER_KEY); } catch { /* noop */ }
    },

    /** Manually report an error (e.g. from catch blocks). */
    report(error, label) {
      const err = error instanceof Error ? error : new Error(String(error));
      processError('manual', err.message, label || '', 0, 0, err);
    },

    /** Force a toast message (bypasses user-visible pattern matching). */
    toast(msg) { enqueueToast(msg); },
  };

  /* ── Bootstrap ──────────────────────────────────────────── */

  // 1. Sentry (dynamic injection, noop if SENTRY_DSN not set)
  initSentry();

  // 2. Flush queued toasts once app.js has loaded Toast system.
  //    We listen for the custom 'as:toast-ready' event dispatched by
  //    app.js (see below), OR we fall back to DOMContentLoaded + rAF.
  window.addEventListener('as:toast-ready', flushToastQueue, { once: true });
  document.addEventListener('DOMContentLoaded', function onDcl() {
    // Give app.js a moment to execute (it runs immediately on DOMContentLoaded)
    requestAnimationFrame(function () {
      requestAnimationFrame(flushToastQueue);
    });
  }, { once: true });

})();
