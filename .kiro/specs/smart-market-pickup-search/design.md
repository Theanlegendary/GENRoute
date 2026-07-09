# Design Document: Smart Market Pickup Search

## Overview

This design reworks the existing Cambodia Branch & Route Search application to add a unified smart search workflow. A delivery coordinator types a market name **or** a free-text address into a single search box — there is no mode toggle. Every query is resolved through one pipeline (local database match → fuzzy match → geocoding fallback, with a cache in between), and once coordinates are resolved, the system calculates the **Nearby_Branch_List**: every Pickup_Branch from the authoritative PickupBranches dataset within a maximum radius (30 km by default) of the resolved location, sorted nearest-first. The closest branch is highlighted as the primary/nearest entry, but the coordinator always sees the full ranked list.

When a query is resolved via the Geocoding_Service (rather than a local match), the system additionally performs a reverse-geocoding lookup on the resolved coordinates to determine the Province, District, and Ward/Commune for that point, and includes that as `address_detail` in the response.

### Critical Data Source Rule

Two datasets are involved, and they serve strictly different purposes:

- **PickupBranches.xlsx — AUTHORITATIVE branch registry.** ~597 records, each with a Delivery Store code in the format `"BANA001 - Chamnaom"`, plus province (KH), district (EN + KH), latitude, and longitude. **This is the ONLY valid source of branch identifiers shown to users.** It is converted once to `data/pickup_branches.json` and loaded at startup.
- **routes.json — market location database ONLY.** ~600 market entries used *exclusively* to resolve a market name (or free-text address, via the same pipeline) to coordinates. Its `branch_id` field (e.g., `MON02`, `SIE01`, `KAN`, `PNP05`) is **legacy/incorrect data and MUST NEVER be displayed or returned as a branch assignment.**

Every Nearby_Branch_List entry displays: **branch name + correct pickup branch ID (`"BANA001 - Chamnaom"`) + distance in km**. The legacy `branch_id` from `routes.json` never appears in the API response or the UI.

### Scope of Rework

There is no `Market_Mode` concept and no toggle. The single `/api/smart-find` endpoint is reworked to:
1. Resolve the query (market name or free-text address, indistinguishably) via `routes.json` (fuzzy + Khmer normalization), then the geocoding cache, then external geocoding — in that order, first hit wins.
2. Find **every** pickup branch from the authoritative PickupBranches dataset within `max_dist` (default 30 km) of the resolved coordinates, sorted ascending by distance, with the first entry flagged as the Nearest_Pickup_Branch.
3. When coordinates came from live geocoding, additionally reverse-geocode those coordinates into an `address_detail` (Province/District/Ward, EN+KH where available), degrading gracefully (omitting `address_detail`) if that lookup fails or times out.
4. Return a response whose branch identifiers come solely from PickupBranches, and whose `nearby_branches` array — not a single nearest branch — is the primary result shape.

## Architecture

### System Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Frontend (public/)                              │
│  ┌──────────────┐  ┌────────────────────┐  ┌────────────────────────┐    │
│  │ Unified      │  │  Map: blue pin +   │  │  Nearby Branch List /  │    │
│  │ Search Box   │──│  red pins (nearest │  │  Detail Card (address  │    │
│  │ (no toggle)  │  │  highlighted) +    │  │   detail when present) │    │
│  │              │  │  dashed line       │  │                        │    │
│  └──────┬───────┘  └─────────▲──────────┘  └───────────▲────────────┘    │
│         │ GET /api/smart-find │ JSON response            │               │
│         │ GET /api/search     │                          │               │
└─────────┼─────────────────────┼──────────────────────────┼───────────────┘
          ▼                     │                          │
┌──────────────────────────────────────────────────────────────────────────┐
│                        Server (server.js)                                │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │     GET /api/smart-find  (unified pipeline, single code path)     │    │
│  └──────┬─────────────────────────────────────────────────────────┬─┘    │
│         │                                                          │      │
│  ┌──────▼────────┐  ┌──────────────┐  ┌──────────────────────┐ ┌──▼───┐  │
│  │ Search_Engine │  │ Geocoding_   │  │ Pickup_Branch_Finder │ │Addr. │  │
│  │ local match   │──│ Service +    │──│ findNearbyPickup     │ │Detail│  │
│  │ (Fuse.js +    │  │ cache +      │  │ Branches() → ALL     │ │Lookup│  │
│  │  Khmer norm)  │  │ rate limit   │  │ branches ≤ max_dist, │ │(rev. │  │
│  │               │  │              │  │ sorted, is_nearest   │ │geo)  │  │
│  └──────┬────────┘  └──────┬───────┘  └──────────┬───────────┘ └──┬───┘  │
│         │                  │                     │                │      │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌─────────▼────────────┐   │      │
│  │ routes.json │  │ geocoding_      │  │ pickup_branches.json │   │      │
│  │ (markets → │  │ cache.json      │  │ (AUTHORITATIVE,      │   │      │
│  │  coords)    │  │                 │  │  ~597 branches)      │   │      │
│  └─────────────┘  └────────▲────────┘  └──────────────────────┘   │      │
└──────────────────────────┼────────────────────────────────────────┼──────┘
                           │ (cache miss → fallback, rate-limited)  │ (only when
                           ▼                                        │  coords_source
                  ┌──────────────────────┐                         │  === "geocoding")
                  │  Nominatim/OSM API   │◀────────────────────────┘
                  │  /search (forward) + │
                  │  /reverse (address)  │
                  └──────────────────────┘
```

### Data Flow for Smart Find

1. User enters a market name **or** a free-text address into the single search box — the same box, the same button, no mode selector.
2. Frontend sends `GET /api/smart-find?q=<query>&max_dist=<km>`.
3. Server validates `q` (reject empty/whitespace-only/missing with 400).
4. **Location resolution (Search_Engine)** — ordered stages, first hit wins, identical regardless of what the query text looks like:
   - **Stage A — local_db**: Normalize (Khmer NFC + decomposed vowel correction), exact/substring then fuzzy match (Fuse.js) against `routes.json`. On match, extract location name + lat + lng. If any of those required fields is missing on the matched record, **fail the request** with an incomplete-data error (do not silently fall through).
   - **Stage B — cache**: If no local match, check the geocoding cache by normalized query.
   - **Stage C — geocoding**: On cache miss, call Nominatim (Cambodia-biased, rate-limited). On success, cache the result (including partial coordinates) and use it.
5. **Nearby branches (Pickup_Branch_Finder)**: Call `findNearbyPickupBranches(lat, lng, branches, maxDist = 30)`. Compute Haversine distance from resolved coordinates to every pickup branch in `pickup_branches.json`, keep every branch whose distance is `<= maxDist`, sort ascending by distance, and flag the first entry (`is_nearest: true`) as the Nearest_Pickup_Branch. All other entries get `is_nearest: false`.
6. **Address detail (only if `coords_source === "geocoding"`)**: Call Nominatim's reverse-geocoding endpoint with the resolved coordinates. On success, build `address_detail` (Province/District/Ward, EN+KH where available). On failure or timeout, omit `address_detail` entirely — the rest of the response still succeeds.
7. **Response**: `{ query, resolved_location, coords, coords_source, nearby_branches: [...], address_detail? }` — `coords_source` accurately reflects the stage that produced the coordinates (`local_db` | `cache` | `geocoding`), and `address_detail` is present only when `coords_source === "geocoding"` and the reverse lookup succeeded.
8. Frontend renders one blue circle marker + label at the resolved location, a red marker + red-text label for every entry in `nearby_branches`, visually distinguishes the nearest one, draws a dashed line from the blue marker to the nearest red marker only, and fits the viewport to all of them.

### Unified Results List (frontend)

`GET /api/search` (existing endpoint, searching `routes.json`/markets) and the new `/api/smart-find` result are presented together in **one** clickable results list — there is no separate "market mode" list and "address mode" result. Every entry in that list, whether it is a Market_Location match from `/api/search` or the resolved smart-find location, is clickable, and clicking any of them triggers the identical "fly to + compute Nearby_Branch_List" behavior (Requirement 11.4): the click handler calls the same nearby-branch computation with that entry's coordinates that a direct search would have used.

### Coordinate Source Accuracy

`coords_source` is set at the exact point coordinates are obtained and never overwritten downstream:
- `local_db` — resolved from `routes.json`.
- `cache` — retrieved from `geocoding_cache.json`.
- `geocoding` — resolved via a live Nominatim call.

`address_detail` is derived strictly from `coords_source === "geocoding"` — it is never attempted for `local_db` or `cache` results (Req 10.5), and its absence never fails the overall request (Req 10.4).

## Components and Interfaces

### 1. Pickup Branch Loader (authoritative registry)

**Purpose**: Load `data/pickup_branches.json` (pre-converted from `PickupBranches.xlsx`) at startup as the sole source of branch identifiers. *(Unchanged by this rework.)*

**Conversion** (`scripts/convert-pickup-branches.js`, already present): parses the `Delivery Store` cell `"BANA001 - Chamnaom"` into `store_code` (`BANA001`) and `store_name` (`Chamnaom`), preserving the full original string. Records with non-numeric latitude/longitude are dropped during conversion.

**Runtime interface**:
```javascript
function loadPickupBranches(filePath) -> PickupBranch[]
```

Loading rules (Req 1.3, 1.5):
- File **missing or malformed** → log an error and continue with an **empty** branch list. Only if the error-logging or empty-list initialization itself throws does the system fail completely.
- File **valid but zero records** → continue **normally, no error logged**; zero branches is valid data.

**Branch ID for display** — the `Correct_Branch_ID` returned to clients is the full `"BANA001 - Chamnaom"` string, reconstructed as `` `${store_code} - ${store_name}` `` (or the preserved raw value). The legacy `routes.json` `branch_id` is never involved.

### 2. Location Resolver (Search_Engine) — unified, no mode branching

**Purpose**: Resolve a query string to `{ resolvedLocation, lat, lng, source }`, using the **same** pipeline no matter whether the query text looks like a market name or a free-text address. There is no `Market_Mode` parameter anywhere in this interface.

**Interface**:
```javascript
async function resolveLocation(query, options = {}) -> {
  resolvedLocation: string,
  lat: number,
  lng: number,
  source: 'local_db' | 'cache' | 'geocoding'
} | { error: string, code: number }
```

Behavior:
- Normalizes the query with `normalizeKhmer` (NFC + decomposed vowel correction + zero-width-space removal).
- Searches `routes.json` across `market`, `market_kh`, `village`, `village_kh`, `commune`, `commune_kh`, `district`, `district_kh`, `province`, `province_kh`. **The `branch_id` field is excluded from search and from output.**
- On a matched record, if `market`/`latitude`/`longitude` is missing, returns an incomplete-data error (Req 2.2).
- Falls through local → cache → geocoding as described above, unconditionally — the same three stages run for every query regardless of its shape (Req 2.8).

### 3. Fuzzy Search Module (Fuse.js)

*(Unchanged by this rework.)*

**Purpose**: Approximate matching when exact/substring matching fails.

**Library**: `fuse.js` (^7.0.0) — weighted multi-field search, no native dependencies.

**Configuration**:
```javascript
new Fuse(routes, {
  keys: ['market', 'market_kh', 'village', 'village_kh',
         'commune', 'commune_kh', 'district', 'district_kh',
         'province', 'province_kh'],
  threshold: 0.4,          // Fuse score 0 = perfect; ~0.4 ≈ 0.6 similarity
  includeScore: true,
  ignoreLocation: true
});
```

Rules:
- Results ranked by similarity (ascending Fuse score = descending similarity), best match chosen (Req 5.3, 5.4).
- If **no** candidate meets the threshold, return **no result** and do **NOT** fall back to a below-threshold match (Req 5.6). Resolution then proceeds to cache/geocoding.

### 4. Geocoding Service (Nominatim) + Rate Limiting

**Service**: Nominatim (OpenStreetMap) — free, no key, supports Khmer. Used for both **forward** geocoding (query → coordinates) and, new in this rework, **reverse** geocoding (coordinates → address).

**Forward request** *(unchanged)*:
```
GET https://nominatim.openstreetmap.org/search
  ?q=<query>&format=json&countrycodes=kh
  &viewbox=102.3,10.4,107.6,14.7&bounded=1&limit=1
```

**Reverse request** *(new)*:
```
GET https://nominatim.openstreetmap.org/reverse
  ?lat=<lat>&lon=<lng>&format=json&accept-language=km,en&addressdetails=1
```

**Rate limiting**: serialized queue enforcing ≥1 s between outbound requests (Nominatim policy), applied to both forward and reverse calls. A required `User-Agent` header is sent.

**Timeout**: 8 s per forward request; the reverse request uses a shorter timeout (e.g. 5 s) since it is a best-effort enhancement, not a blocking part of location resolution (Req 10.4). Forward: unreachable / timeout / HTTP 429 → error response suggesting retry later (Req 2.7). Reverse: any failure/timeout is swallowed — `address_detail` is simply omitted (Req 10.4).

**Partial extraction**: If only latitude or only longitude can be extracted from a forward geocode, the partial result is still cached (Req 6.1).

### 5. Geocoding Cache

*(Unchanged by this rework.)* Caches forward-geocoding results only; reverse-geocoding (`address_detail`) is not cached, since it is only computed for `geocoding`-sourced results and is a best-effort enrichment rather than the coordinate resolution itself.

**Purpose**: Avoid redundant external calls; persist across restarts.

**Interface**:
```javascript
loadCache(path) -> Map            // corrupted/missing → new empty cache (Req 6.4)
cacheGet(normalizedQuery) -> entry | undefined
cachePut(normalizedQuery, entry)  // write-through to disk after each success (Req 6.3)
```

- Keyed by **normalized query text**.
- Stores resolved coordinates (possibly partial), display name.
- Loaded at startup; each successful geocode persisted immediately.

### 6. Nearby Pickup Branch Finder (Pickup_Branch_Finder) — reworked

**Purpose**: Find **every** authoritative pickup branch within range of given coordinates, ranked nearest-first — not just the single nearest. This function replaces the old `findNearestPickupBranch`.

**Interface**:
```javascript
function findNearbyPickupBranches(lat, lng, branches, maxDist = 30)
  -> Array<{ ...branch, distance_km, is_nearest }>
```

**Algorithm**: brute-force Haversine over all branches (~597; sub-millisecond).
1. Compute `distance_km` for every branch.
2. Keep only branches with `distance_km <= maxDist` (default **30 km**, not `Infinity` — Req 3.3).
3. Sort the kept branches ascending by `distance_km`.
4. Set `is_nearest: true` on the first (globally minimum-distance) entry and `is_nearest: false` on every other entry.
5. Return the full sorted array (may be empty if nothing qualifies — caller returns a 404-style error, Req 3.8).

The `maxDist` filter is applied **before** sorting so no out-of-range branch can ever appear or be selected as nearest (Req 3.7). Callers needing only the primary/highlighted branch use `result[0]` (guaranteed to be the Nearest_Pickup_Branch when the array is non-empty).

### 7. Address Detail Lookup (new component, reverse geocoding)

**Purpose**: When a query resolves via live geocoding, enrich the response with a human-readable Province/District/Ward breakdown of the resolved point.

**Interface**:
```javascript
async function lookupAddressDetail(lat, lng) -> {
  province: { en?: string, kh?: string },
  district: { en?: string, kh?: string },
  ward: { en?: string, kh?: string }
} | null
```

Behavior:
- Only invoked when `coords_source === "geocoding"` (never for `local_db` or `cache` — Req 10.1, 10.5).
- Calls `GET https://nominatim.openstreetmap.org/reverse?lat=<lat>&lon=<lng>&format=json&accept-language=km,en&addressdetails=1`.
- Extracts province from `address.state`/`address.city` (Phnom Penh capital case), district from `address.city_district`/`address.county`, and ward/commune from `address.suburb`/`address.village`/`address.quarter`. Nominatim's `accept-language=km,en` typically returns the localized (Khmer) `display_name`/address parts alongside an English fallback field where available; the lookup extracts both when present.
- If a field's Khmer name is not present in the response, the constructed detail includes only the English value for that field and simply omits the Khmer key — it never fails the lookup because of a missing translation (Req 10.3).
- On any failure (network error, non-200, timeout, malformed JSON), returns `null` rather than throwing. The caller treats `null` as "omit `address_detail`" and still returns the rest of the smart-find response successfully (Req 10.4).

### 8. Reworked `GET /api/smart-find`

**Request**: `q` (required, non-blank), `max_dist` (optional, km, default 30).

**Success response** (see Data Models). **Error responses**: `400` for blank/missing `q`; `404` for unresolved location or no branch in range; `422` for incomplete matched market record; `503` for geocoding unreachable/rate-limited. A reverse-geocoding failure is **not** an error response — it only results in the omission of `address_detail`.

### 9. Frontend Visualization (Map_UI)

- **Blue circle marker + label** at the resolved search location, identically whether it came from `local_db`, `cache`, or `geocoding` (Req 7.1, 7.2).
- **Red marker + red-text label** for every entry in `nearby_branches` (Req 7.3), popup shows `Correct_Branch_ID`, province, district, and distance (Req 7.7).
- The **nearest** entry's marker (`is_nearest: true`) is visually distinguished from the rest (e.g. larger icon / highlighted border) (Req 7.4).
- **Dashed polyline** connecting the blue marker to the nearest (highlighted) red marker **only** — no lines to the other nearby branches (Req 7.5).
- **Viewport** fits the blue marker and **all** red markers with padding (Req 7.6).
- **Unified results list**: markets from `/api/search` and the resolved smart-find location appear together in one clickable list (Req 11.2, 11.3); clicking any entry re-runs the fly-to + Nearby_Branch_List flow for that entry's coordinates (Req 11.4, 11.5).
- **Result/detail card** in the sidebar: resolved location name/address (title), the full Nearby_Branch_List with the Nearest_Pickup_Branch highlighted at the top, `Correct_Branch_ID` prominently on each entry, province, district (EN + KH), coordinates, distance labeled `Distance: 12.34 km`, an "Open in Google Maps" link (new tab) for the nearest branch, "Back to list", and — only when present — the `address_detail` (Province/District/Ward, EN + KH) (Req 4.*, 9.*, 10.6).
- Distance is formatted to **two decimals + " km"** (Req 4.3). The legacy `routes.json` `branch_id` is never rendered (Req 4.2).

## Data Models

### PickupBranch (authoritative — `data/pickup_branches.json`)

*(Unchanged.)*

```json
{
  "store_code": "BANA001",
  "store_name": "Chamnaom",
  "branch_id": "BANA001 - Chamnaom",
  "province_kh": "បាត់ដំបង",
  "district_en": "Banan",
  "district_kh": "បាណន់",
  "latitude": 13.0254,
  "longitude": 103.1234
}
```

`branch_id` here is the **Correct_Branch_ID** — the only identifier shown to users. (`store_code`/`store_name` are retained for reference and can reconstruct it.)

### Market_Location (read-only source — `routes.json`)

*(Unchanged.)* Used only for coordinate resolution. `branch_id` present in this file is **legacy and ignored**:
```json
{
  "id": 1,
  "branch_id": "MON02",          // LEGACY — never displayed/returned
  "latitude": 12.112367,
  "longitude": 106.886155,
  "province": "Mondul Kiri", "province_kh": "មណ្ឌលគិរី",
  "district": "Kaev Seima", "district_kh": "កែវសីមា",
  "commune": "", "commune_kh": "",
  "village": "", "village_kh": "",
  "market": "Kaev Seima Market", "market_kh": "ផ្សារកែវសីមា",
  "google_maps_url": "https://www.google.com/maps?q=12.112367,106.886155"
}
```

### Geocoding cache entry (`geocoding_cache.json`)

*(Unchanged.)*

```json
{
  "<normalized_query>": {
    "lat": 11.5564,           // may be null if only lng extracted (partial)
    "lng": 104.9282,          // may be null if only lat extracted (partial)
    "display_name": "Phsar Thmei, Phnom Penh",
    "cached_at": "2024-01-15T10:30:00Z"
  }
}
```

### Nearby branch entry (element of `nearby_branches[]`)

```json
{
  "branch_id": "TAKS002 - Angk Ta Saom",
  "store_code": "TAKS002",
  "store_name": "Angk Ta Saom",
  "province_kh": "តាកែវ",
  "district_en": "Bati",
  "district_kh": "បាទី",
  "latitude": 11.0131,
  "longitude": 104.6732,
  "distance_km": 2.14,
  "is_nearest": true
}
```

### Smart-Find success response (reworked schema)

```json
{
  "query": "Angk Ta Saom",
  "resolved_location": "Angk Ta Saom",
  "coords": { "lat": 11.0131, "lng": 104.6732 },
  "coords_source": "local_db",
  "nearby_branches": [
    {
      "branch_id": "TAKS002 - Angk Ta Saom",
      "store_code": "TAKS002",
      "store_name": "Angk Ta Saom",
      "province_kh": "តាកែវ",
      "district_en": "Bati",
      "district_kh": "បាទី",
      "latitude": 11.0131,
      "longitude": 104.6732,
      "distance_km": 0.00,
      "is_nearest": true
    },
    {
      "branch_id": "TAKS005 - Tram Kak",
      "store_code": "TAKS005",
      "store_name": "Tram Kak",
      "province_kh": "តាកែវ",
      "district_en": "Tram Kak",
      "district_kh": "ត្រាំកក់",
      "latitude": 10.98,
      "longitude": 104.71,
      "distance_km": 6.42,
      "is_nearest": false
    }
  ]
}
```

When `coords_source` is `"geocoding"`, the response additionally includes `address_detail`:

```json
{
  "query": "St. 271, Phnom Penh",
  "resolved_location": "Street 271, Phnom Penh",
  "coords": { "lat": 11.5490, "lng": 104.9130 },
  "coords_source": "geocoding",
  "nearby_branches": [ /* ... same shape as above ... */ ],
  "address_detail": {
    "province": { "en": "Phnom Penh", "kh": "ភ្នំពេញ" },
    "district": { "en": "Chamkarmon", "kh": "ចំការមន" },
    "ward": { "en": "Tonle Bassac" }
  }
}
```

`address_detail` is present **only** when `coords_source === "geocoding"` and the reverse-geocode lookup succeeded; it is omitted entirely (not `null`) on failure/timeout or when `coords_source` is `local_db`/`cache`. No legacy `routes.json` `branch_id` appears anywhere in the response (Req 8.4).

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `data/pickup_branches.json` | Create | Authoritative branches converted from `PickupBranches.xlsx` |
| `scripts/convert-pickup-branches.js` | Present | Excel→JSON conversion (parses `"CODE - Name"`) |
| `server.js` | Modify | Load pickup branches; add resolver, fuzzy, geocoding+cache, `findNearbyPickupBranches`, reverse-geocoding address lookup; rework `/api/smart-find` to the new list-based response schema; remove any `Market_Mode`/toggle-related code paths |
| `data/geocoding_cache.json` | Create | Empty cache `{}` |
| `public/app.js` | Modify | Remove the mode toggle; unify the `/api/search` and `/api/smart-find` results into one clickable list; render blue marker + label, red markers + labels for every `nearby_branches` entry with the nearest visually distinguished, single dashed line to the nearest only, viewport fit to all markers, and (when present) the `address_detail` card |
| `public/index.html` | Modify | Remove mode-toggle markup; detail card fields for the Nearby_Branch_List and `address_detail` |
| `public/style.css` | Modify | Remove `.mode-filter-bar`/`.market-mode-container`/`.switch-organic` toggle styles; blue-marker + nearest-highlight + dashed-line styles |
| `package.json` | Modify | Add `fuse.js`, `node-fetch`; keep `xlsx` (dev) |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fuse.js` | ^7.0.0 | Fuzzy multi-field location search |
| `node-fetch` | ^2.7.0 | HTTP client for Nominatim forward + reverse geocoding (CommonJS-compatible) |
| `xlsx` | ^0.18.5 | (dev) one-time Excel→JSON conversion |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Each property below is universally quantified and intended for property-based testing (minimum 100 iterations per property).

### Property 1: Haversine is non-negative, symmetric, and zero on identity

*For any* two coordinate pairs `(lat1, lng1)` and `(lat2, lng2)`, `haversine` returns a value `>= 0`, is symmetric (`haversine(a,b) == haversine(b,a)`), and returns `0` (within floating-point tolerance) when both points are identical.

**Validates: Requirements 3.1**

### Property 2: Nearby_Branch_List bounds and ordering

*For any* resolved coordinates, any set of pickup branches, and any `maxDist > 0` (including the default of 30 when unspecified), `findNearbyPickupBranches` returns a list where every entry's `distance_km` is `<= maxDist`, no branch whose actual distance is `<= maxDist` is missing from the list, and the list is sorted in strictly ascending order of `distance_km`. If no branch qualifies, the list is empty.

**Validates: Requirements 3.2, 3.3, 3.7, 3.8**

### Property 3: Nearest branch is the global minimum and uniquely flagged

*For any* resolved coordinates and any non-empty set of pickup branches, if `findNearbyPickupBranches` returns a non-empty list, its first entry has a distance less than or equal to the distance of every other branch in the input set (not just the returned list), exactly that first entry has `is_nearest === true`, and every other entry has `is_nearest === false`.

**Validates: Requirements 3.4**

### Property 4: Khmer normalization idempotence

*For any* input string `s`, normalizing twice equals normalizing once: `normalizeKhmer(normalizeKhmer(s)) == normalizeKhmer(s)`, and known decomposed vowel sequences map to their composed forms.

**Validates: Requirements 5.1**

### Property 5: Fuzzy match ordering with highest score first

*For any* query, the fuzzy search results are ordered by similarity in non-increasing order, so the first result is the highest-scoring match returned as the resolved location.

**Validates: Requirements 5.2, 5.3, 5.4**

### Property 6: No below-threshold fuzzy fallback

*For any* query for which no candidate meets the similarity threshold, the fuzzy resolver returns no result and never returns a below-threshold record as a match.

**Validates: Requirements 5.6**

### Property 7: Response schema completeness with accurate coordinate source

*For any* successful smart-find response, the response contains `query`, `resolved_location`, `coords.lat`, `coords.lng`, and a `nearby_branches` array; every entry of `nearby_branches` has `branch_id`, coordinates, and a numeric `distance_km >= 0`; when `nearby_branches` is non-empty exactly one entry has `is_nearest === true` and it is the first entry; and `coords_source` is exactly one of `local_db`, `cache`, or `geocoding`, matching the stage that actually produced the coordinates.

**Validates: Requirements 8.2, 8.3, 3.3**

### Property 8: Authoritative branch identifier invariant

*For any* smart-find result, every `nearby_branches[i].branch_id` equals a Delivery Store code from the PickupBranches dataset (format `"CODE - Name"`) and is never the legacy `branch_id` of the matched `routes.json` record.

**Validates: Requirements 1.4, 3.6, 4.2, 8.4**

### Property 9: Geocoding cache round-trip preserves coordinates (including partial)

*For any* geocoding result (including partial results where only latitude or only longitude was extracted), after caching under the normalized query, a subsequent lookup for that normalized query returns the same stored coordinates without invoking the Geocoding_Service.

**Validates: Requirements 2.5, 6.1, 6.2**

### Property 10: Distance formatting

*For any* non-negative distance value, the display formatter produces a string matching `^\d+\.\d{2} km$` (two decimal places followed by " km").

**Validates: Requirements 4.3**

### Property 11: Field-coverage matching across English and Khmer fields

*For any* `routes.json` record and any of its non-empty searchable field values (`market`, `village`, `commune`, `district`, `province` and their `_kh` variants) used as the query, location resolution locates that record.

**Validates: Requirements 2.3, 5.5**

### Property 12: Delivery-store parse round-trip

*For any* delivery-store string of the form `"CODE - Name"`, parsing into `store_code`/`store_name` and reconstructing yields the original combined `branch_id`, with `store_code` and `store_name` correctly split.

**Validates: Requirements 1.2**

### Property 13: Incomplete matched record fails the request

*For any* matched `routes.json` record missing any required field (`market`, `latitude`, or `longitude`), the resolver returns an incomplete-data error rather than a partial or fallback result.

**Validates: Requirements 2.2**

### Property 14: Blank query rejection

*For any* query string that is empty or consists solely of whitespace (and for a missing `q`), the `/api/smart-find` endpoint returns HTTP 400.

**Validates: Requirements 8.5**

### Property 15: Unified pipeline is mode-independent

*For any* query string — whether generated to resemble a market name or a free-text address — and regardless of any extra caller-supplied flag, `resolveLocation` exercises the identical three-stage pipeline (local_db → cache → geocoding) with no branching on query "shape" or on a mode parameter; two queries that resolve at the same stage with the same underlying match produce responses differing only in `query`/`resolved_location`/`coords`, never in structure.

**Validates: Requirements 2.8, 11.1**

### Property 16: Address detail reflects only available reverse-geocode fields

*For any* synthetic reverse-geocoding response containing any combination of present/absent province, district, and ward fields with or without Khmer names, the constructed `address_detail` includes the English value for every field present in the source, includes the Khmer value only when the source actually provided one, and never throws or fails the request due to a missing Khmer translation.

**Validates: Requirements 10.2, 10.3**

### Property 17: Reverse-geocoding graceful degradation

*For any* resolution result whose `coords_source` is `"geocoding"`, if the reverse-geocoding lookup fails, times out, or returns a malformed response, the overall `/api/smart-find` request still succeeds (HTTP 200) with `query`, `resolved_location`, `coords`, `coords_source`, and `nearby_branches` all populated, and `address_detail` simply absent from the response.

**Validates: Requirements 10.4**

### Property 18: Reverse-geocoding invoked if and only if coordinates came from geocoding

*For any* resolution result, a reverse-geocoding call is made exactly when `coords_source === "geocoding"`; no reverse-geocoding call is ever made when `coords_source` is `local_db` or `cache`.

**Validates: Requirements 10.1, 10.5**

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `pickup_branches.json` missing or malformed | Log error; continue with empty branch list (Req 1.3). Only if logging/empty-init itself fails does the system fail completely. |
| `pickup_branches.json` valid but zero records | Continue normally, **no error logged** — zero branches is valid (Req 1.5). |
| Matched market record missing name/lat/lng | Return `422` incomplete-data error; do not fall through (Req 2.2). |
| No local match and geocoding returns empty | Return `404` "location could not be found" (Req 2.6). |
| Geocoding (forward) timeout (>8s) / unreachable / HTTP 429 | Return `503` with retry-later message (Req 2.7). |
| No pickup branch within `max_dist` (nearby_branches would be empty) | Return `404` "no pickup branch within range" (Req 3.8). |
| Cache file missing or corrupted | Create new empty cache, continue (Req 6.4). |
| Invalid coordinates in branch data | Skip record during conversion/loading, log warning. |
| `q` empty, whitespace-only, or missing | Return `400` validation error (Req 8.5). |
| Fuzzy match below threshold only | Return no fuzzy result; proceed to cache/geocoding; never use below-threshold match (Req 5.6). |
| Reverse-geocoding (address detail) fails, times out, or is malformed | Omit `address_detail` from the response; the smart-find request still returns `200` with all other fields (Req 10.4). Never surfaced as a request-level error. |
| Reverse-geocoding succeeds but a field has no Khmer name | Include the English value for that field; omit only the missing Khmer key (Req 10.3). |

## Testing Strategy

### Dual approach

- **Unit / example tests** — loading behavior, error paths, UI rendering (unified results list, marker/label rendering, address-detail card), endpoint contract, and Leaflet visualization (blue marker, red markers, highlighted nearest, dashed line to nearest only).
- **Property-based tests** — the 18 correctness properties above, covering Haversine math, Nearby_Branch_List bounds/ordering, nearest-is-global-minimum, Khmer normalization, fuzzy ordering/threshold, response schema + source accuracy, the authoritative-id invariant, cache round-trip, distance formatting, field coverage, parse round-trip, incomplete-record failure, blank-query rejection, unified-pipeline mode-independence, address-detail field construction, reverse-geocoding graceful degradation, and the reverse-geocoding invocation condition.

### Property-based testing configuration

- **Library**: `fast-check` (JavaScript/Node) — no from-scratch PBT implementation.
- **Iterations**: minimum **100** per property.
- **Generators**: random coordinate pairs (Cambodia-biased and global), random branch sets, random `max_dist` values (including omitted/default), random Khmer/English strings including decomposed vowel sequences and zero-width spaces, `"CODE - Name"` delivery-store strings, whitespace-only strings, synthetic geocoding results including partial coordinates, synthetic reverse-geocoding responses with random combinations of present/absent province/district/ward and EN/KH names, and simulated reverse-geocoding failure modes (thrown error, timeout, non-200, malformed JSON).
- **Tagging**: each property test is tagged `Feature: smart-market-pickup-search, Property {number}: {property_text}`.
- **Mapping**: each of the 18 properties is implemented by a single property-based test.

### Integration / smoke tests (not PBT)

- **INTEGRATION** — Nominatim forward-search call uses Cambodia bias on local miss (Req 2.4); timeout/429 yields retry-later (Req 2.7). Nominatim reverse-geocode call uses the resolved coordinates and `accept-language=km,en&addressdetails=1`. Verified with a stubbed HTTP client, 1–3 examples.
- **SMOKE** — request completes within 5s (local) / 10s (geocoding) (Req 8.6); startup loads both datasets; endpoint accepts `q`/`max_dist` query parameters (Req 8.1).

### UI tests

- Example/DOM-based tests for Requirements 4.1, 4.2, 4.4, 4.5, 7.1–7.7, 9.1–9.4, 10.6, 11.2, 11.3, 11.5: assert the single blue marker + label at the resolved location (same treatment for local_db/cache/geocoding sources), a red marker + red-text label for every `nearby_branches` entry, the nearest entry visually distinguished from the rest, exactly one dashed connecting line (blue marker → nearest red marker), viewport fit to all markers, popup contents on branch-marker click, the unified results list mixing `/api/search` markets with the smart-find location (every entry clickable, identical fly-to + recompute behavior), the result/detail card fields (resolved location, Nearby_Branch_List with correct branch IDs, province, district EN+KH, coordinates, labeled distance, `address_detail` when present), the Google Maps link (new tab), and "Back to list" behavior. These confirm the legacy `routes.json` `branch_id` is never rendered and that no `Market_Mode` toggle exists in the UI.
