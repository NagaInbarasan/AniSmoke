/* ═══════════════════════════════════════════════════════════
   ANISMOKE — API Layer (Legal Discovery Only)
   AniList GraphQL — zero API keys required
   ═══════════════════════════════════════════════════════════ */

// Read Consumet API URL from environment configuration with fallback
window.ANISMOKE_CONSUMET = window.ENV?.ANISMOKE_CONSUMET || window.ANISMOKE_CONSUMET || '';

const AniSmokeAPI = (() => {
  const ANILIST = 'https://graphql.anilist.co';

  /* ── Media fragment (shared fields for all queries) ───── */
  const MEDIA_FRAGMENT = `
    id title { romaji english native }
    coverImage { large extraLarge }
    bannerImage
    description(asHtml: false)
    genres episodes averageScore popularity
    format status season seasonYear
    nextAiringEpisode { episode airingAt }
    studios(isMain: true) { nodes { name } }
    duration source countryOfOrigin
  `;

  /* ── Detail fragment (extra fields for anime detail page) */
  const DETAIL_FRAGMENT = `
    ${MEDIA_FRAGMENT}
    trailer { id site thumbnail }
    externalLinks { url site type language icon color }
    streamingEpisodes { title thumbnail url site }
    staff(perPage: 8, sort: RELEVANCE) {
      edges { role node { name { full } image { medium } } }
    }
    recommendations(perPage: 12, sort: RATING_DESC) {
      nodes {
        mediaRecommendation { ${MEDIA_FRAGMENT} }
      }
    }
    characters(perPage: 12, sort: ROLE) {
      edges { role node { name { full } image { medium } } }
    }
    relations {
      edges {
        relationType
        node { id title { romaji english } coverImage { large } format seasonYear }
      }
    }
  `;

  /* ── AniList GraphQL helper ───────────────────────────── */
  async function gql(query, variables = {}) {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const { data, errors } = await res.json();
    if (errors) console.warn('AniList GQL errors:', errors);
    return data;
  }

  /* ── Session cache utility ────────────────────────────── */
  const Cache = {
    set(key, data, ttlMinutes = 15) {
      try {
        sessionStorage.setItem(key, JSON.stringify({
          data,
          expires: Date.now() + ttlMinutes * 60000
        }));
      } catch { /* storage full */ }
    },
    get(key) {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const { data, expires } = JSON.parse(raw);
        if (Date.now() > expires) { sessionStorage.removeItem(key); return null; }
        return data;
      } catch { return null; }
    },
    clear(prefix) {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
      }
    }
  };

  /* ── Stale-while-revalidate wrapper ───────────────────── */
  function swr(cacheKey, fetchFn, ttl = 15) {
    const cached = Cache.get(cacheKey);
    if (cached) {
      fetchFn().then(fresh => { if (fresh) Cache.set(cacheKey, fresh, ttl); }).catch(() => {});
      return Promise.resolve(cached);
    }
    return fetchFn().then(result => {
      if (result) Cache.set(cacheKey, result, ttl);
      return result;
    });
  }

  /* ── Platform icon/color mapping for "Where to Watch" ── */
  const PLATFORM_META = {
    'Crunchyroll':  { icon: '🟠', color: '#F47521' },
    'Netflix':      { icon: '🔴', color: '#E50914' },
    'Hulu':         { icon: '🟢', color: '#1CE783' },
    'Amazon':       { icon: '🔵', color: '#00A8E1' },
    'HIDIVE':       { icon: '🔵', color: '#00BAEF' },
    'Funimation':   { icon: '🟣', color: '#5B0BB5' },
    'YouTube':      { icon: '▶️', color: '#FF0000' },
    'Disney Plus':  { icon: '🔵', color: '#113CCF' },
    'Tubi TV':      { icon: '🟠', color: '#FA382F' },
    'VRV':          { icon: '🟡', color: '#FDD835' },
    'Bilibili TV':  { icon: '🔵', color: '#00A1D6' },
    'iQIYI':        { icon: '🟢', color: '#00BE06' },
    'Ani-One':      { icon: '🔴', color: '#E60012' },
    'AnimeLab':     { icon: '🟡', color: '#FFCC00' },
  };

  /* ─────────────────────────────────────────────────────────
     PUBLIC API
     ───────────────────────────────────────────────────────── */
  return {

    /* ── Trending ─────────────────────────────────────────── */
    getTrending(page = 1, perPage = 20) {
      return swr(`as-trending-${page}`, () =>
        gql(`query ($page:Int,$pp:Int) {
          Page(page:$page,perPage:$pp) {
            media(type:ANIME,sort:TRENDING_DESC,status_in:[RELEASING,FINISHED]) { ${MEDIA_FRAGMENT} }
          }
        }`, { page, pp: perPage }).then(d => d?.Page?.media || [])
      , 10);
    },

    /* ── Popular ──────────────────────────────────────────── */
    getPopular(page = 1, perPage = 20) {
      return swr(`as-popular-${page}`, () =>
        gql(`query ($page:Int,$pp:Int) {
          Page(page:$page,perPage:$pp) {
            media(type:ANIME,sort:POPULARITY_DESC) { ${MEDIA_FRAGMENT} }
          }
        }`, { page, pp: perPage }).then(d => d?.Page?.media || [])
      , 10);
    },

    /* ── Top Rated ────────────────────────────────────────── */
    getTopRated(perPage = 10) {
      return swr(`as-toprated`, () =>
        gql(`query ($pp:Int) {
          Page(perPage:$pp) {
            media(type:ANIME,sort:SCORE_DESC,format_in:[TV,MOVIE]) { ${MEDIA_FRAGMENT} }
          }
        }`, { pp: perPage }).then(d => d?.Page?.media || [])
      , 30);
    },

    /* ── Season ───────────────────────────────────────────── */
    getSeason(season, year, perPage = 16) {
      return swr(`as-season-${season}-${year}`, () =>
        gql(`query ($s:MediaSeason,$y:Int,$pp:Int) {
          Page(perPage:$pp) {
            media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC) { ${MEDIA_FRAGMENT} }
          }
        }`, { s: season, y: year, pp: perPage }).then(d => d?.Page?.media || [])
      , 15);
    },

    /* ── By Genre ─────────────────────────────────────────── */
    getByGenre(genre, page = 1, perPage = 20) {
      return gql(`query ($g:String,$page:Int,$pp:Int) {
        Page(page:$page,perPage:$pp) {
          media(type:ANIME,genre:$g,sort:POPULARITY_DESC) { ${MEDIA_FRAGMENT} }
        }
      }`, { g: genre, page, pp: perPage }).then(d => d?.Page?.media || []);
    },

    /* ── Search ───────────────────────────────────────────── */
    search(query, perPage = 10) {
      return swr(`as-search-${query}`, () =>
        gql(`query ($q:String,$pp:Int) {
          Page(perPage:$pp) {
            media(search:$q,type:ANIME) { ${MEDIA_FRAGMENT} }
          }
        }`, { q: query, pp: perPage }).then(d => d?.Page?.media || [])
      , 5);
    },

    /* ── Single anime detail (with trailer + external links) */
    getAnime(id) {
      return swr(`as-anime-${id}`, () =>
        gql(`query ($id:Int) {
          Media(id:$id,type:ANIME) { ${DETAIL_FRAGMENT} }
        }`, { id: parseInt(id) }).then(d => d?.Media)
      , 30);
    },

    /* ── Extract "Where to Watch" from anime data ────────── */
    getWatchLinks(anime) {
      if (!anime) return [];
      const links = [];
      const seen = new Set();

      // From externalLinks (official platform pages)
      if (anime.externalLinks) {
        for (const link of anime.externalLinks) {
          if (link.type !== 'STREAMING' && link.type !== 'INFO') continue;
          const name = link.site || 'Unknown';
          if (seen.has(name)) continue;
          seen.add(name);
          const meta = PLATFORM_META[name] || { icon: '🔗', color: '#888' };
          links.push({
            name,
            url: link.url,
            icon: link.icon || meta.icon,
            color: link.color || meta.color,
            type: link.type,
            language: link.language,
          });
        }
      }

      // From streamingEpisodes (direct episode links, usually Crunchyroll/Funimation)
      if (anime.streamingEpisodes?.length && !seen.has('Crunchyroll')) {
        const ep = anime.streamingEpisodes[0];
        if (ep?.site && ep?.url) {
          links.push({
            name: ep.site,
            url: ep.url,
            icon: PLATFORM_META[ep.site]?.icon || '📺',
            color: PLATFORM_META[ep.site]?.color || '#888',
            type: 'STREAMING',
          });
        }
      }

      return links;
    },

    /* ── Get YouTube trailer embed URL ────────────────────── */
    getTrailerUrl(anime) {
      if (!anime?.trailer?.id) return null;
      if (anime.trailer.site === 'youtube') {
        return `https://www.youtube.com/embed/${anime.trailer.id}`;
      }
      if (anime.trailer.site === 'dailymotion') {
        return `https://www.dailymotion.com/embed/video/${anime.trailer.id}`;
      }
      return null;
    },

    /* ── Current season helper ────────────────────────────── */
    currentSeason() {
      const month = new Date().getMonth();
      const seasons = ['WINTER','WINTER','SPRING','SPRING','SPRING','SUMMER','SUMMER','SUMMER','FALL','FALL','FALL','WINTER'];
      return { season: seasons[month], year: new Date().getFullYear() };
    },

    /* ── Prefetch anime detail ────────────────────────────── */
    prefetch(anilistId) {
      if (!Cache.get(`as-anime-${anilistId}`)) {
        requestIdleCallback?.(() => this.getAnime(anilistId).catch(() => {}))
          || setTimeout(() => this.getAnime(anilistId).catch(() => {}), 1000);
      }
    },
  };
})();

window.AniSmokeAPI = AniSmokeAPI;
