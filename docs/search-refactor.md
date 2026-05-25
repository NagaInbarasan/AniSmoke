# Search Reliability + Data Consistency Refactor Report

## Overview
This report outlines the successful implementation of Phase 3, standardizing the search pipeline across the AniSmoke web application, removing redundant caching, and ensuring resilient ID resolution from Jikan to AniList for seamless data consistency on the watch page.

## Addressed Bugs & Features
- **Bug #2 & #3 (Pagination Consistency & ID Data Consistency)**: Fixed by resolving Jikan's `mal_id` mapped objects accurately. Added correct mapping of `pagination.has_next_page` to standard AniList `pageInfo.hasNextPage` equivalent.
- **Bug #5 (Search Redundancy)**: Addressed by centralizing all search flows.

## File Changes & Architectural Updates

### 1. `js/api.js` (Core API Extension)
- **`browse(vars)`**: Extracted the previously inline GraphQL query from `browse.html` into a centralized API method.
- **`resolveMalId(idMal)`**: Added a dedicated resolver to take a `mal_id` and return the matching AniList `id` using AniList's `idMal` query field.
- **Cache Export**: The internal `Cache` mechanism was exposed out of `AniSmokeAPI` to unify caching logic across services.

### 2. `js/services/search.js` (Service Layer Upgrade)
- **Unified Pipeline**: Refactored `SearchService.execute()` to accept complex filter objects (vars) instead of just query strings.
- **Delegate to API**: The service now delegates directly to `AniSmokeAPI.browse()` and utilizes the `AniSmokeAPI.Cache` for both AniList and fallback Jikan data. Redundant `sessionStorage` logic inside this service was removed.
- **Data Completeness**: `_searchJikan()` now returns the full API payload, enabling `SearchService` to return accurate `hasMore` state to the UI for infinite scrolling.

### 3. `browse.html` & `js/components.js` (UI Migration)
- **Migration to Service**: `browse.html` now uses `window.SearchService.execute()` rather than executing `fetch()` against GraphQL manually.
- **Source Tracking (`&source=jikan`)**:
  - `browse.html` ensures `source='jikan'` is appended to data objects when a fallback occurs.
  - `buildAnimeCard()` in `js/components.js` propagates the `source=jikan` tracking parameter onto the `watch.html?id=...` navigation links.

### 4. `js/search.js` (Header Dropdown Search)
- Appends `&source=jikan` for the `onSelect` or manual link navigation triggers when the results map to Jikan.

### 5. `watch.html` (Dynamic Resolution Engine)
- **Initialization Interceptor**: On load, `watch.html` extracts the ID and source from URL parameters. 
- **Auto-Resolve**: If `source=jikan` is present, it uses `AniSmokeAPI.resolveMalId(AID)` to dynamically substitute the Jikan ID with the AniList ID.
- **Clean State**: It then silently rewrites the URL via `history.replaceState` to hide the `source=jikan` and expose the clean, persistent AniList ID.

## Routing Flow
`User Search/Filter` -> `SearchService.execute()`
-> `AniSmokeAPI.browse()` 
-> *(If fails on search)* -> `Jikan API Fallback` 
-> Results tagged with `source='jikan'` -> Renders on UI
-> User Clicks Item -> `watch.html?id=20&source=jikan`
-> `watch.html` initialization -> `AniSmokeAPI.resolveMalId(20)`
-> Overwrites ID internally to AniList ID (e.g. 11061) -> URL cleaned
-> Standard `AniSmokeAPI.getAnime(11061)` execution.
