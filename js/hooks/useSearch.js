/* ═══════════════════════════════════════════════════════════
   ANISMOKE — useSearch Hook (Vanilla JS Implementation)
   ═══════════════════════════════════════════════════════════ */

(function() {
  function useSearch({ debounceMs = 300, onResults, onLoading, onError }) {
    let timer = null;
    let currentQuery = '';
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;
    let searchIdCounter = 0;

    const executeSearch = async (query, page = 1, append = false) => {
      const id = ++searchIdCounter;
      isLoading = true;
      if (onLoading) onLoading(append);

      try {
        const { results, source } = await window.SearchService.execute(query, page, 12);
        
        if (id !== searchIdCounter) return; // Stale request

        isLoading = false;
        hasMore = results.length > 0; // If we got results, assume there might be more
        
        if (onResults) onResults(results, { query, page, source, append, hasMore });

      } catch (err) {
        if (id !== searchIdCounter) return;
        isLoading = false;
        if (onError) onError(err);
      }
    };

    return {
      search: (query) => {
        clearTimeout(timer);
        currentQuery = query;
        currentPage = 1;
        hasMore = true;
        
        if (!query.trim() || query.length < 2) {
           // Clear results immediately if query is too short
           ++searchIdCounter;
           if (onResults) onResults([], { query, page: 1, source: null, append: false, hasMore: false });
           return;
        }

        timer = setTimeout(() => {
          executeSearch(query, 1, false);
        }, debounceMs);
      },

      nextPage: () => {
        if (isLoading || !hasMore || !currentQuery) return;
        currentPage++;
        executeSearch(currentQuery, currentPage, true);
      },

      isLoading: () => isLoading,
      hasMore: () => hasMore,
      getCurrentQuery: () => currentQuery
    };
  }

  window.useSearch = useSearch;
})();
