# 🚀 AniSmoke — Deployment Guide & Checklist

This document details the configuration requirements, optimization steps, and pre-flight checks for deploying the AniSmoke platform to **Vercel**.

---

## 📦 Zero-Build Deployment

AniSmoke is built as a pure client-side static application. There is no build compiler step, bundler, or Node.js runtime required to run the production site.

* **Build Command:** None (or `echo 'AniSmoke ready'`)
* **Output Directory:** `.` (root directory)
* **Framework:** Vanilla HTML / CSS / JS (Zero Bundler)

---

## 🌐 Vercel Routing & Configuration (`vercel.json`)

To ensure custom headers, security parameters, caching, and custom 404 fallbacks are set up correctly, verify the `vercel.json` configuration file:

```json
{
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self' https:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; media-src 'self' https: blob:; connect-src 'self' https:; frame-src https:;"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "no-referrer"
        }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}
```

---

## ⚡ Performance & Cache Strategy

1. **App Shell Assets:**
   Cached-First via Service Worker `sw.js` (managed by cache key `anismoke-shell-v9`).
2. **API Data (AniList, Jikan):**
   * Network-First, then fallback to local memory SWR or sessionStorage.
   * `sessionStorage` TTL set to 15 minutes for popular lists and 5 minutes for search queries to prevent heavy endpoint polling.
3. **Image Optimization:**
   All cover artwork fetched from AniList/MyAnimeList is marked with `loading="lazy"` to defer image loading until the element is scrolled into view.

---

## 📈 Monitoring & Analytics

* **Error Tracking:** Lazy-loaded Sentry SDK dynamically initialized via `js/errors.js` if `SENTRY_DSN` is present in the environmental build context.
* **Offline Status:** Intercepted by Service Worker and broadcasted to clients to show warning toasts if connection drops.
