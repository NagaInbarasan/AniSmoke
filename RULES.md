# 👻 AniSmoke — Project Rules & Documentation

> **AniSmoke** is a free, open-source anime discovery and streaming frontend.  
> Core mission: Help users **discover anime they'll love** and **track what they watch** — elegantly.

---

## 📁 Project Structure

```
AniSmoke/
├── index.html          # Homepage — discovery hub, spotlight, trending
├── browse.html         # Browse/search — filter by genre, year, format, sort
├── watch.html          # Detail page — anime info, trailer, streaming links
├── watchlist.html      # Watchlist manager — track status & progress
├── 404.html            # Error page — branded "not found" state
├── site.webmanifest    # PWA manifest for installable web app
├── .env                # Local environment secrets (gitignored)
├── .env.example        # Environment variables template
├── .gitignore          # Git exclusion rules
├── generate-config.js  # Node.js config compiler script (build time)
├── package.json        # Node metadata and npm scripts (build/dev)
├── vercel.json         # Vercel deployment configuration
│
├── css/
│   ├── variables.css   # Design tokens, theme system (neon / dark / light / amoled)
│   ├── base.css        # Reset, typography, layout, utilities, skeletons, HUD deco
│   └── components.css  # Sidebar, cards, buttons, modals, auth HUD, responsive
│
├── js/
│   ├── api.js          # All API calls — AniList GraphQL + Anify + Consumet
│   ├── app.js          # Auth, Watchlist, Theme, Toast, Sidebar, shared UI logic
│   ├── supabase.js     # Supabase client, authentication, & DB integration
│   ├── security.js     # Rate limiting, fetch wrapper, URL obfuscation
│   ├── config.js       # Auto-generated runtime config (gitignored)
│   └── config.example.js # Template of the runtime config
│
├── assets/
│   ├── favicon.png     # Browser tab icon
│   └── logo.png        # Brand logo & OG image for social previews
│
└── RULES.md            # ← You are here
```

---

## 🎨 Theme System

Four built-in themes, toggled via the header `🎨` button.  
Stored in `localStorage` as `ph-theme`.

| Theme    | Background | Best for |
|----------|-----------|---------|
| `dark`   | `#0d0d1a` | Default — rich purple-dark |
| `amoled` | `#000000` | OLED screens — pure black |
| `midnight`| `#07090f`| Deep blue-black, indigo accents |
| `light`  | `#f4f4f8` | Daytime / accessibility |

**Adding a new theme:**
1. Open `css/variables.css`
2. Add a new `[data-theme="yourtheme"]` block, overriding any variables
3. Add the theme to the `THEMES` array in `js/app.js` > `ThemeManager`

---

## 🌐 APIs Used

All APIs are **100% free** with **no API keys required**.

### 1. AniList GraphQL — Metadata
- **URL:** `https://graphql.anilist.co`
- **Docs:** https://anilist.gitbook.io/anilist-apiv2-docs
- **Used for:** All anime metadata — titles, covers, descriptions, genres, scores, studios, recommendations
- **Rate limit:** ~90 requests/minute per IP (very generous)
- **No auth needed** ✅

```js
// Example query
const data = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ Media(id: 1) { title { english } } }` })
});
```

### 2. Anify — Episode Lists & Stream Sources
- **URL:** `https://api.anify.tv`
- **Docs:** https://anify.tv/docs
- **Used for:** Episode lists with provider IDs, HLS stream URLs
- **Providers supported:** GogoAnime (sub+dub), Zoro/HiAnime (sub+dub), AnimeFox
- **No auth needed** ✅

```js
// Get episodes
GET https://api.anify.tv/anime/{anilistId}

// Get stream sources
GET https://api.anify.tv/sources?providerId=gogoanime&watchId=...&episode=1&id=...&subType=sub&server=gogocdn
```

### 3. Consumet API — Optional Self-Hosted Backup
- **GitHub:** https://github.com/consumet/consumet.api
- **Deploy:** Vercel, Railway, or any Node.js host (free tier works)
- **Set URL:** In `js/api.js`, set `window.ANISMOKE_CONSUMET = 'https://your-url.vercel.app'`
- **Why use it?** More reliable streams, backup when Anify is down

---

## 🔐 Auth System

AniSmoke is fully integrated with **Supabase Auth** for production-ready authentication.

### Current flow
1. User clicks Sign In → Auth modal opens
2. Enter email/password or use OAuth (Google/Discord supported by Supabase)
3. `SupabaseClient` handles session token persistence
4. Header UI updates instantly upon successful auth state change
5. Guest local watchlists are automatically migrated and synchronized to the cloud

### Local vs Production Auth
- **Guest users:** Use `localStorage` mocks silently.
- **Logged in users:** Full synchronization and JWT secured access.

### Environment Configuration & Secrets
AniSmoke uses environment variables to configure external services (like Supabase and Consumet) dynamically at build time:

1. **`.env.example`**: Documentation of the environment variables used.
2. **`.env`**: Local development environment secrets (gitignored). Copy `.env.example` to `.env` to customize settings locally.
3. **`generate-config.js`**: Node.js script that compiles environment variables (from `process.env` or local `.env` file) and outputs `js/config.js` at build time.
4. **`js/config.js`**: Generated runtime file loaded in the browser (gitignored).
5. **`js/config.example.js`**: Template demonstrating the generated configuration format.

To compile variables locally:
```bash
npm run build
```

To run a hot-reloading development server locally:
```bash
npm run dev
```

On production hosts (Vercel, Netlify, etc.):
- Configure environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANISMOKE_CONSUMET`) in the host's dashboard.
- The build script (`npm run build`) runs automatically upon deployment to produce `js/config.js` for execution.

---

## 📋 Watchlist System

Watchlist data uses a **Hybrid State Management** approach, transitioning seamlessly from offline-first to cloud-synced.

### 1. Guest Mode (Offline)
Data is stored locally in `localStorage` under `as-watchlist`.
Full functionality (add, edit, remove, progress) works without an account.

### 2. Authenticated Mode (Cloud Sync)
When a user logs in:
1. `Watchlist.syncWithCloud()` is triggered.
2. Local items are merged/upserted into the Supabase `watchlists` table.
3. The local store is refreshed from the cloud, acting as a fast cache.
4. Any subsequent changes trigger `SupabaseClient.Database.upsertWatchlist()`.

### Status values
| Value | Meaning |
|-------|---------|
| `watching`      | Actively watching |
| `completed`     | Finished all episodes |
| `plan_to_watch` | Saved for later |
| `on_hold`       | Paused |
| `dropped`       | Abandoned |

### Watchlist API (in `js/app.js`)
```js
Watchlist.add(anime, 'plan_to_watch') // Upserts to cloud if logged in
Watchlist.remove(animeId)             // Deletes from cloud if logged in
Watchlist.update(animeId, { status: 'watching' })
Watchlist.has(animeId)                // Fast local cache check
Watchlist.getAll('watching')          // Filter by status (null = all)
```

---

## 🎬 Streaming Architecture

```
User clicks Watch
       ↓
AniList ID → Anify API
       ↓
Episode list (with provider IDs per episode)
       ↓
User selects episode + server (GogoAnime/Zoro)
       ↓
Anify /sources endpoint → HLS .m3u8 URL
       ↓
HLS.js plays stream in <video> tag
       ↓
(fallback) → Consumet self-hosted backup
```

### Adding new stream providers
In `js/api.js > getSources()`, add to `serverMap`:
```js
const serverMap = {
  gogoanime: 'gogocdn',
  zoro:      'vidcloud',
  animefox:  'vidcloud',
  crunchyroll: 'yourServer', // example
};
```
Then add a tab in `watch.html`'s server bar.

---

## 📱 Responsive Breakpoints

| Breakpoint | Layout change |
|-----------|--------------|
| `> 1100px` | Full two-column watch layout |
| `1024px`   | Nav hidden → Top header mobile menu toggle |
| `768px`    | Single column, sidebar moves to bottom tab bar |
| `480px`    | 2-column grid for cards, smaller padding |

The mobile experience utilizes a bottom tab bar for primary navigation (Home, Browse, Watchlist) and a slide-out left menu for account settings, theme toggles, and supplementary links.

---

## 🚀 Next Steps (Roadmap)

### Phase 1 — Core (done ✅)
- [x] Discovery homepage with spotlight hero
- [x] Browse with genre/year/format/sort filters
- [x] Watch page with HLS.js streaming
- [x] 4 server tabs (GogoAnime sub/dub, Zoro sub/dub)
- [x] Watchlist with 5 status types + progress tracking
- [x] 4 themes (dark/amoled/midnight/light)
- [x] Auth modal with email + Google + Discord OAuth stubs
- [x] Mobile responsive + hamburger menu

### Phase 2 — Polish (In Progress 🚧)
- [x] Real OAuth backend (Supabase Auth integration)
- [x] Cloud watchlist sync (Supabase DB)
- [ ] Episode thumbnails from Anify
- [ ] Anime schedule / airing calendar page
- [ ] Continue Watching shelf on homepage
- [ ] User profile page with stats + activity
- [ ] Comments / community (Disqus or custom)

### Phase 3 — Scale
- [ ] PWA manifest + service worker (offline capable)
- [ ] Push notifications for new episodes
- [ ] AniList OAuth — import existing user lists
- [ ] MAL OAuth — import MAL lists
- [ ] Advanced recommendations engine
- [ ] Trailer embeds (YouTube API)
- [ ] Multiple quality selection (HLS levels)
- [ ] Subtitle track selection
- [ ] Watch parties (WebRTC or PartyKit)

---

## 🛠️ Local Development

No build step needed — pure HTML/CSS/JS.

```bash
# Option 1: VS Code Live Server extension (recommended)
# Install "Live Server" → right-click index.html → Open with Live Server

# Option 2: Python simple server
cd phantom/
python3 -m http.server 3000
# Open http://localhost:3000

# Option 3: Node.js
npx serve .
```

**CORS note:** Stream sources from Anify may have CORS restrictions in the browser.  
Deploy Consumet on your own domain and proxy requests through it to avoid CORS issues.

---

## 🤝 Contribution Rules

1. **CSS changes** → edit `css/variables.css` or `css/components.css` only. Don't add `<style>` blocks to HTML pages for shared components.
2. **API changes** → only in `js/api.js`. Keep each method clean and documented.
3. **Shared logic** → only in `js/app.js`. Page-specific logic stays in `<script>` tags in that page.
4. **No external CSS frameworks** — we use our own design system.
5. **Mobile-first** — every new UI element must work at 320px width.
6. **No hardcoded IDs** — always read from URL params or state.
7. **Error states required** — every async operation needs a catch and user-visible error.

---

## 📄 License

This project is for **educational and personal use only**.  
Streaming content is sourced from third-party providers via public APIs.  
Respect copyright laws in your region.

---

*Built with ❤️ for anime fans — Powered by AniList + Anify*
