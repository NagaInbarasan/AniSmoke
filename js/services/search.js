/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Search Service (AniList -> Jikan Fallback)
   ═══════════════════════════════════════════════════════════ */

(function() {
  const SearchService = {
    /**
     * Executes the search pipeline: Cache -> AniList -> Jikan -> Cache
     */
    async execute(filters, page = 1, perPage = 12) {
      const isString = typeof filters === 'string';
      const query = isString ? filters : (filters.search || '');
      const cacheKey = `as-search-pipe-${JSON.stringify(filters)}_${page}_${perPage}`;
      
      const cached = window.AniSmokeAPI.Cache?.get(cacheKey);
      if (cached) return cached;

      let results = [];
      let source = 'anilist';
      let hasMore = false;
      const vars = isString ? { search: query, page, perPage } : { ...filters, page, perPage };

      try {
        // Priority 1: AniList
        const anilistRes = await window.AniSmokeAPI.browse(vars);
        results = anilistRes.media || [];
        hasMore = anilistRes.pageInfo?.hasNextPage || false;
        
        // If AniList returns empty and we have a query, throw to trigger fallback
        if ((!results || results.length === 0) && query) {
          throw new Error('AniList returned 0 results');
        }
      } catch (err) {
        if (!query) {
           return { results: [], source, page, query, hasMore: false };
        }
        console.warn(`[SearchService] AniList failed for "${query}":`, err.message, '— Falling back to Jikan');
        source = 'jikan';
        
        try {
          // Priority 2: Jikan Fallback
          const jikanRes = await this._searchJikan(query, page);
          results = this._mapJikanToAniList(jikanRes.data || []);
          hasMore = jikanRes.pagination?.has_next_page || false;
        } catch (jikanErr) {
          console.error(`[SearchService] Jikan also failed for "${query}":`, jikanErr);
          throw new Error('All search providers failed.');
        }
      }

      // Deduplicate results
      results = this._deduplicate(results);

      const response = { results, source, query, page, hasMore };
      window.AniSmokeAPI.Cache?.set(cacheKey, response, 5); // Cache for 5 mins
      return response;
    },

    /**
     * Fetches raw data from Jikan API
     */
    async _searchJikan(query, page) {
      const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&page=${page}&sfw=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Jikan HTTP Error: ${res.status}`);
      const json = await res.json();
      return json; // return full payload for pagination metadata
    },

    /**
     * Normalizes Jikan data to match AniList's schema used by the UI
     */
    _mapJikanToAniList(jikanData) {
      return jikanData.map(item => ({
        id: item.mal_id, // We use mal_id as id for Jikan fallback
        title: {
          english: item.title_english,
          romaji: item.title
        },
        format: item.type,
        seasonYear: item.year || (item.aired && item.aired.prop && item.aired.prop.from ? item.aired.prop.from.year : null),
        episodes: item.episodes,
        genres: (item.genres || []).map(g => g.name),
        coverImage: {
          large: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || ''
        },
        averageScore: item.score ? Math.round(item.score * 10) : null // Jikan is 0-10, AniList is 0-100
      }));
    },

    /**
     * Deduplicates array of anime objects based on exact ID or Title matching
     */
    _deduplicate(results) {
      const seenIds = new Set();
      const seenTitles = new Set();
      const deduplicated = [];

      for (const item of results) {
        if (!item) continue;
        
        const id = item.id;
        const titleEn = item.title?.english?.toLowerCase();
        const titleRo = item.title?.romaji?.toLowerCase();

        if (seenIds.has(id)) continue;
        if (titleEn && seenTitles.has(titleEn)) continue;
        if (titleRo && seenTitles.has(titleRo)) continue;

        seenIds.add(id);
        if (titleEn) seenTitles.add(titleEn);
        if (titleRo) seenTitles.add(titleRo);

        deduplicated.push(item);
      }

      return deduplicated;
    }
  };

  window.SearchService = SearchService;
})();
