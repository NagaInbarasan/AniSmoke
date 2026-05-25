/* ═══════════════════════════════════════════════════════════
   ANISMOKE — Search & Autocomplete Modules
   ═══════════════════════════════════════════════════════════ */

/* ════════════════════════════════
   HEADER SEARCH — Enhanced UX
   ════════════════════════════════ */
function initSearch(onSelect) {
  const input     = document.getElementById('headerSearchInput');
  const dropdown  = document.getElementById('searchDropdown');
  const clearBtn  = document.getElementById('searchClear');
  if (!input || !dropdown) return;

  const RECENT_KEY  = 'as-recent-searches';
  const MAX_RECENT  = 5;
  let kbdIndex = -1, currentResults = [];

  /* ── Recent searches helpers ── */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  }
  function saveRecent(q) {
    if (!q) return;
    let r = getRecent().filter(x => x !== q);
    r.unshift(q);
    if (r.length > MAX_RECENT) r = r.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  }
  function clearRecent() {
    localStorage.removeItem(RECENT_KEY);
    showRecent();
  }

  /* ── Reverse Image Search (Trace.moe) ── */
  const cameraBtn = document.getElementById('searchCameraBtn');
  const uploadInput = document.getElementById('traceUploadInput');
  if (cameraBtn && uploadInput) {
    cameraBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--cyan);font-size:13px">Scanning image with Trace.moe...</div>';
      dropdown.style.display = 'block';
      try {
        const results = await window.AniSmokeAPI.traceImageSearch(file);
        if (results && results.length > 0) {
          const best = results[0];
          // Trace.moe returns an anilist ID directly!
          if (best.anilist) {
            dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--primary);font-size:13px">Match found! Redirecting...</div>';
            location.href = `watch.html?id=${best.anilist}`;
          } else {
            dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">No exact anime match found for this image.</div>';
          }
        } else {
          dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">No match found.</div>';
        }
      } catch (err) {
        dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--red);font-size:13px">Image upload failed.</div>';
      }
      uploadInput.value = ''; // reset
    });
  }

  /* ── Show recent searches when input focused & empty ── */
  function showRecent() {
    const list = getRecent();
    if (!list.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = `
      <div class="as-search-recent-header">
        <span>Recent</span>
        <button id="clearRecentBtn">Clear all</button>
      </div>
      <div class="as-recent-chips">
        ${list.map(q => `
          <div class="as-recent-chip" data-q="${q.replace(/"/g,'&quot;')}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${q}
          </div>
        `).join('')}
      </div>`;
    dropdown.style.display = 'block';
    document.getElementById('clearRecentBtn')?.addEventListener('click', e => {
      e.stopPropagation(); clearRecent();
    });
    dropdown.querySelectorAll('.as-recent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.q;
        clearBtn.style.display = '';
        dropdown.style.display = 'none';
        triggerSearch(chip.dataset.q);
      });
    });
  }

  /* ── Score badge helper ── */
  function scoreBadge(score) {
    if (!score) return '';
    const val  = (score / 10).toFixed(1);
    const cls  = score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low';
    return `<div class="as-search-result-score ${cls}">★ ${val}</div>`;
  }

  /* ── Highlight matched query text in a title string ── */
  function highlightQuery(text, q) {
    if (!q || !text) return text;
    // Escape special regex chars in query
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-hl">$1</mark>');
    } catch { return text; }
  }

  /* ── Build a single result item DOM node ── */
  function buildResultItem(a, q) {
    const rawTitle = a.title?.english || a.title?.romaji || 'Unknown';
    const title    = highlightQuery(rawTitle, q);
    const meta     = [a.format?.replace(/_/g,' '), a.seasonYear, a.episodes ? a.episodes + ' eps' : ''].filter(Boolean).join(' · ');
    const genres   = (a.genres || []).slice(0, 2).map(g => `<span class="genre-chip">${g}</span>`).join('');
    const item     = document.createElement('div');
    item.className = 'as-search-result';
    item.dataset.id = a.id;
    item.innerHTML = `
      <img src="${a.coverImage?.large || ''}" alt="${rawTitle}" loading="lazy" onerror="this.style.display='none'">
      <div class="as-search-result-info">
        <div class="title">${title}</div>
        <div class="meta">${meta}</div>
        ${genres ? `<div class="genre-chips">${genres}</div>` : ''}
      </div>
      ${scoreBadge(a.averageScore)}`;
    item.addEventListener('click', () => {
      saveRecent(rawTitle);
      dropdown.style.display = 'none';
      input.value = ''; clearBtn.style.display = 'none';
      if (onSelect) onSelect(a);
      else location.href = `watch.html?id=${a.id}${a.source === 'jikan' ? '&source=jikan' : ''}`;
    });
    return item;
  }

  /* ── Inject a section label into the dropdown ── */
  function appendSectionLabel(labelText) {
    const label = document.createElement('div');
    label.className = 'as-search-section-label';
    label.textContent = labelText;
    dropdown.appendChild(label);
  }

  /* ── Render grouped, scored result cards ── */
  function renderDropdown(scored, q, exactMatch = null, exactRelations = []) {
    kbdIndex = -1;
    currentResults = scored;
    dropdown.innerHTML = '';

    if (!scored.length) {
      dropdown.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">No results for "${q}"</div>`;
      dropdown.style.display = 'block'; return;
    }

    const profile = typeof UserProfile !== 'undefined' ? UserProfile.get() : null;

    // ── Netflix-Style Exact Match Section ─────────────────────
    if (exactMatch) {
      appendSectionLabel('Top Result');
      dropdown.appendChild(buildResultItem(exactMatch, q));

      if (exactRelations.length) {
        const title = exactMatch.title?.english || exactMatch.title?.romaji || 'Franchise';
        appendSectionLabel(`Explore titles related to: ${title}`);
        
        // Remove exactMatch from relations if it somehow got in
        const relNodes = exactRelations
          .map(e => e.node)
          .filter(node => node && node.id !== exactMatch.id);
        
        // Render up to 5 relations
        relNodes.slice(0, 5).forEach(a => dropdown.appendChild(buildResultItem(a, q)));
      }
      
      // Filter the exact match and relations out of the remaining results
      const skipIds = new Set([exactMatch.id, ...exactRelations.map(e => e.node?.id)]);
      scored = scored.filter(a => !skipIds.has(a.id));
      
      if (scored.length > 0) {
        appendSectionLabel('More Results');
        scored.slice(0, 4).forEach(a => dropdown.appendChild(buildResultItem(a, q)));
      }

    } else {
      // ── Standard Fallback Logic ──────────────────────────────
      const best     = scored.slice(0, 3);
      const rest     = scored.slice(3);

      const because  = [];
      const popular  = [];

      rest.forEach(a => {
        if (profile && typeof SearchScorer !== 'undefined' &&
            SearchScorer.classify(a, q, profile) === 'because') {
          because.push(a);
        } else {
          popular.push(a);
        }
      });

      if (best.length) {
        appendSectionLabel('Best Match');
        best.forEach(a => dropdown.appendChild(buildResultItem(a, q)));
      }

      if (because.length && profile?.topGenres?.length) {
        appendSectionLabel(`Because You Watch ${profile.topGenres[0]}`);
        because.slice(0, 3).forEach(a => dropdown.appendChild(buildResultItem(a, q)));
      }

      const popularToShow = because.length ? popular : rest;
      if (popularToShow.length) {
        appendSectionLabel(profile ? 'Popular Right Now' : 'More Results');
        popularToShow.slice(0, 3).forEach(a => dropdown.appendChild(buildResultItem(a, q)));
      }
    }

    // ── View all footer ────────────────────────────────────────
    const footer = document.createElement('a');
    footer.className = 'as-search-footer';
    footer.textContent = `See all results for "${q}" →`;
    footer.href = `browse.html?q=${encodeURIComponent(q)}`;
    footer.addEventListener('click', () => { saveRecent(q); dropdown.style.display = 'none'; });
    dropdown.appendChild(footer);
    dropdown.style.display = 'block';
  }

  /* ── Keyboard navigation ── */
  function kbdMove(dir) {
    const items = dropdown.querySelectorAll('.as-search-result');
    if (!items.length) return;
    items[kbdIndex]?.classList.remove('kbd-active');
    kbdIndex = Math.max(-1, Math.min(items.length - 1, kbdIndex + dir));
    if (kbdIndex >= 0) {
      items[kbdIndex].classList.add('kbd-active');
      items[kbdIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /* ── useSearch Hook Integration ── */
  const searchHook = window.useSearch({
    debounceMs: 300,
    onLoading: (append) => {
      if (!append) {
        dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">Searching...</div>';
        dropdown.style.display = 'block';
      } else {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'search-pagination-loading';
        loadingDiv.style.cssText = 'padding:14px;text-align:center;color:var(--text-muted);font-size:13px';
        loadingDiv.textContent = 'Loading more...';
        dropdown.appendChild(loadingDiv);
      }
    },
    onError: (err) => {
      console.error('Search error:', err);
      dropdown.innerHTML = '<div style="padding:14px;text-align:center;color:var(--red);font-size:13px">Search failed — check connection</div>';
    },
    onResults: async (results, { query, page, source, append, hasMore }) => {
      if (!query || query.length < 2) {
         showRecent();
         return;
      }

      if (results.length === 0 && !append) {
         dropdown.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:13px">No results for "${query}"</div>`;
         dropdown.style.display = 'block';
         return;
      }

      if (source === 'jikan') {
         results.forEach(r => r.source = 'jikan');
      }

      // If appending (pagination)
      if (append) {
        const loadingNode = document.getElementById('search-pagination-loading');
        if (loadingNode) loadingNode.remove();

        const footer = dropdown.querySelector('.as-search-footer');
        if (footer) footer.remove();

        results.forEach(a => {
           if (!dropdown.querySelector(`[data-id="${a.id}"]`)) {
             dropdown.appendChild(buildResultItem(a, query));
           }
        });
        
        // Re-append view all footer
        if (hasMore) {
          const newFooter = document.createElement('a');
          newFooter.className = 'as-search-footer';
          newFooter.textContent = `See all results for "${query}" →`;
          newFooter.href = `browse.html?q=${encodeURIComponent(query)}`;
          newFooter.addEventListener('click', () => { saveRecent(query); dropdown.style.display = 'none'; });
          dropdown.appendChild(newFooter);
        }
        return;
      }

      // --- Fresh Search (page 1) ---
      const profile = typeof UserProfile !== 'undefined' ? UserProfile.get() : null;
      let scored  = typeof SearchScorer !== 'undefined'
        ? SearchScorer.rankResults(results, query, profile)
        : results;
        
      let exactMatch = null;
      let exactRelations = [];
      
      if (scored.length > 0 && typeof SearchScorer !== 'undefined') {
        const topScore = SearchScorer.score(scored[0], query);
        if (topScore >= 500 && source !== 'jikan') {
          exactMatch = scored[0];
          renderDropdown(scored, query, exactMatch, []);
          
          try {
             exactRelations = await window.AniSmokeAPI.getRelationsOnly(exactMatch.id);
             if (searchHook.getCurrentQuery() !== query) return;
             exactRelations = exactRelations.filter(e => 
               ['PREQUEL','SEQUEL','SIDE_STORY','MOVIE','ALTERNATIVE','SPIN_OFF'].includes(e.relationType)
             );
          } catch(e) {}
        }
      }

      renderDropdown(scored, query, exactMatch, exactRelations);
    }
  });

  /* ── Scroll handler for Pagination ── */
  dropdown.addEventListener('scroll', () => {
    if (dropdown.scrollHeight - dropdown.scrollTop - dropdown.clientHeight < 50) {
      if (searchHook.hasMore() && !searchHook.isLoading()) {
        searchHook.nextPage();
      }
    }
  });

  /* ── Input handler ── */
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? '' : 'none';
    kbdIndex = -1;
    if (!q) { showRecent(); return; }
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    searchHook.search(q);
  });

  /* ── Focus: show recent if empty ── */
  input.addEventListener('focus', () => {
    if (!input.value.trim()) showRecent();
  });

  /* ── Clear button ── */
  clearBtn?.addEventListener('click', () => {
    input.value = ''; clearBtn.style.display = 'none';
    dropdown.style.display = 'none'; kbdIndex = -1;
    input.focus();
  });

  /* ── Click outside ── */
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target))
      dropdown.style.display = 'none';
  });

  /* ── Keyboard: arrows + enter + escape ── */
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); kbdMove(1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); kbdMove(-1); return; }
    if (e.key === 'Escape')    { dropdown.style.display = 'none'; input.blur(); return; }
    if (e.key === 'Enter') {
      const active = dropdown.querySelector('.as-search-result.kbd-active');
      if (active) { active.click(); return; }
      const q = input.value.trim();
      if (q) { saveRecent(q); location.href = `browse.html?q=${encodeURIComponent(q)}`; }
    }
  });
}

// Expose global
window.initSearch = initSearch;
