/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Security Module
   General fetch safety, rate limiting, and retry utilities
   ═══════════════════════════════════════════════════════════ */

window.AniSmokeSecurity = (() => {

  /* ── Safe Fetch Wrapper ───────────────────────────────── */

  /**
   * Enhanced fetch with enforced security defaults.
   * - Strips credentials (no cookies sent)
   * - Enforces no-referrer policy
   * - Adds configurable timeout
   * @param {string} url
   * @param {RequestInit & {timeout?: number}} options
   * @returns {Promise<Response>}
   */
  async function safeFetch(url, options = {}) {
    const opts = {
      ...options,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    };

    // Strip sensitive headers if accidentally included
    if (opts.headers) {
      const headers = new Headers(opts.headers);
      headers.delete('Authorization');
      opts.headers = headers;
    }

    const controller = new AbortController();
    const timeout = opts.timeout || 8000;
    const timer = setTimeout(() => controller.abort(), timeout);

    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    opts.signal = controller.signal;

    try {
      const res = await fetch(url, opts);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /* ── Exponential Backoff ──────────────────────────────── */

  /**
   * Calculates backoff delay based on attempt number.
   * @param {number} attempt
   * @returns {number} Delay in milliseconds
   */
  function backoff(attempt) {
    const base = Math.min(1000 * Math.pow(2, attempt), 16000);
    const jitter = Math.floor(Math.random() * 500);
    return base + jitter;
  }

  /**
   * Determines if a request should be retried based on status code.
   * @param {number} statusCode
   * @param {number} attempt
   * @returns {boolean}
   */
  function shouldRetry(statusCode, attempt) {
    if (statusCode === 429) return attempt < 3;
    if (statusCode >= 500 && statusCode < 600) return attempt < 2;
    return false;
  }

  return {
    safeFetch,
    backoff,
    shouldRetry,
  };
})();
