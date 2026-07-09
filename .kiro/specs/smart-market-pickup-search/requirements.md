# Requirements Document

## Introduction

The Smart Market Pickup Search system helps delivery coordinators find pickup branches near any location in Cambodia. A single, unified search box accepts either a market name or a free-text address. Every query — regardless of what it looks like — is resolved through one pipeline: a local Market_Location match, a fuzzy match, or a Geocoding_Service fallback. Once coordinates are resolved, the system calculates the Nearby_Branch_List: every Pickup_Branch from the authoritative PickupBranches dataset within a maximum radius (30 kilometers by default) of the resolved location, sorted nearest first. The closest branch is highlighted as the primary result, but the coordinator sees the complete ranked list, not just a single answer.

### Data Source Clarification

- **PickupBranches.xlsx (Authoritative Branch Registry):** Contains ~597 correct delivery store codes and locations. Each record has: Province (KH), District (EN), District KH, Delivery Store (format: "BANA001 - Chamnaom", "BANA002 - Paoy Paet", etc.), Latitude, Longitude. These are the ONLY valid branch identifiers to display to users.
- **routes.json (Market Location Database):** Contains ~600 market entries with coordinates, province/district info, and market names (English + Khmer). Used EXCLUSIVELY for resolving market names to geographic coordinates. The `branch_id` field in routes.json (e.g., "MON02", "SIE01", "KAN", "PNP05") is legacy/incorrect data and MUST NOT be displayed as a branch assignment.

### Unified Search, Nearby Branch List, and Address Detail Lookup

There is no separate mode or toggle. Typing a market name and typing a free-text address behave identically — both pass through the same resolution pipeline. The results list mixes matching Market_Location entries together with the resolved free-text location; every entry in that list is clickable. Clicking any entry flies the map to that point and re-runs the Nearby_Branch_List calculation from there, exactly as if that entry had been searched directly.

The resolved search location — whether it came from a market match or a geocoded address — is always shown on the map as a single blue circle marker with a label. Every Pickup_Branch in the Nearby_Branch_List is labeled with its Correct_Branch_ID in red, both in the sidebar list and on the map, and the nearest branch is visually highlighted as the primary entry.

When a query resolves through the Geocoding_Service rather than a local match, the system additionally performs a reverse-geocoding lookup on the resolved coordinates to determine the Province, District, and Ward/Commune for that point, in English and Khmer where available, and displays that Address_Detail alongside the result.

## Glossary

- **Search_Engine**: The server-side component responsible for resolving search queries (market names or free-text addresses) into geographic coordinates using a single unified pipeline: local routes.json market matching, fuzzy matching, and fallback to external geocoding
- **Pickup_Branch_Finder**: The server-side component that calculates the Nearby_Branch_List — every Pickup_Branch (from PickupBranches data) within a maximum radius of a resolved location's coordinates — using Haversine distance
- **Geocoding_Service**: The external service (Nominatim/OpenStreetMap) used to resolve free-text queries to latitude/longitude coordinates when routes.json has no match, and to reverse-geocode coordinates into address details (Province, District, Ward/Commune)
- **Pickup_Branch**: A delivery/pickup store from the PickupBranches dataset, identified by a Delivery Store code in the format "BANA001 - Chamnaom" with associated latitude, longitude, province, and district. This is the AUTHORITATIVE source of branch IDs.
- **Market_Location**: A market entry in routes.json containing coordinates, province, district, commune, village, and market names in English and Khmer. The `branch_id` field in this data is legacy/incorrect and must be ignored for display purposes.
- **Fuzzy_Matching**: A string similarity algorithm that finds approximate matches when the user query contains misspellings or partial text
- **Map_UI**: The Leaflet-based interactive map on the right side of the split-screen layout that displays markers for the resolved search location and for Pickup_Branch entries
- **Correct_Branch_ID**: The delivery store code from PickupBranches.xlsx in the format "XXXXX### - Name" (e.g., "BANA001 - Chamnaom"). This is the only branch identifier that should be shown to users, and it is always rendered in red.
- **Location_Match**: An entry in the unified results list — either a matching Market_Location record or a location resolved via the Geocoding_Service from free text — that is clickable and, when selected, becomes the searched location for the Nearby_Branch_List calculation
- **Nearby_Branch_List**: The sorted (nearest-first) list of every Pickup_Branch within max_dist of a resolved location's coordinates, produced by the Pickup_Branch_Finder. The default max_dist for this list is 30 kilometers when the caller does not specify one. The first item in this list is always the Nearest_Pickup_Branch.
- **Nearest_Pickup_Branch**: The single Pickup_Branch with the smallest distance to a resolved location's coordinates, as calculated by the Pickup_Branch_Finder. It is always the first entry of the Nearby_Branch_List and is visually highlighted as the primary/highlighted entry, distinguishing it from the rest of the list.
- **Address_Detail**: The structured breakdown of a resolved location into Province, District, and Ward/Commune, each provided in English and in Khmer where available, produced by a reverse-geocoding lookup through the Geocoding_Service when a query resolves via geocoding (coords_source is "geocoding")

## Requirements

### Requirement 1: Pickup Branch Data Loading

**User Story:** As a system administrator, I want the application to load the authoritative PickupBranches dataset at startup, so that nearest-branch calculations use the correct branch IDs and locations.

#### Acceptance Criteria

1. WHEN the server starts, THE Search_Engine SHALL parse the PickupBranches dataset (PickupBranches.xlsx) and load all pickup branch records into memory
2. THE Search_Engine SHALL store each Pickup_Branch with its Delivery Store code (e.g., "BANA001 - Chamnaom"), province, district (English and Khmer), latitude, and longitude
3. IF the PickupBranches data file is missing or malformed, THEN THE Search_Engine SHALL log an error message and continue operating with an empty pickup branch list; if error logging or empty list initialization itself fails, THE Search_Engine SHALL allow the system to fail completely
4. THE Search_Engine SHALL treat PickupBranches data as the sole authoritative source of branch identifiers — branch_id values from routes.json SHALL NOT be used as branch assignments
5. WHEN the PickupBranches data file is valid but contains zero records, THE Search_Engine SHALL continue operating normally without logging an error, treating zero branches as valid data

### Requirement 2: Unified Location Resolution

**User Story:** As a delivery coordinator, I want to type a market name or a free-text address into a single search box and have the system find its geographic coordinates, so that nearby pickup branches can be calculated without choosing a search mode first.

#### Acceptance Criteria

1. WHEN a user submits a search query, THE Search_Engine SHALL search routes.json Market_Location records to find a matching market
2. WHEN a matching market is found in routes.json, THE Search_Engine SHALL return the market name, latitude, and longitude from the matched Market_Location record; IF any required field (market name, latitude, or longitude) is missing from the matched record, THEN THE Search_Engine SHALL fail the request with an error indicating incomplete market data
3. THE Search_Engine SHALL match against market name (English and Khmer), village, commune, and district fields in routes.json
4. WHEN no market match is found in routes.json, THE Search_Engine SHALL send a geocoding request to the Geocoding_Service with the query text and a Cambodia geographic bias
5. WHEN the Geocoding_Service returns a valid result, THE Search_Engine SHALL extract the latitude and longitude from the response and cache the result for future lookups
6. IF both routes.json and the Geocoding_Service fail to resolve the query, THEN THE Search_Engine SHALL return an error response indicating that the location could not be found
7. IF the Geocoding_Service is unreachable or returns a rate-limit error, THEN THE Search_Engine SHALL return an error response with a message suggesting the user retry later
8. THE Search_Engine SHALL apply the same resolution pipeline (local database match, fuzzy match, geocoding fallback) to every query regardless of whether the query text represents a market name or a free-text address, without requiring the user to select a search mode

### Requirement 3: Nearby Pickup Branch List Calculation

**User Story:** As a delivery coordinator, I want to see a ranked list of every pickup branch (with correct branch IDs) near any searched location, so that I can choose the correct delivery store for that area rather than being limited to a single suggestion.

#### Acceptance Criteria

1. WHEN geographic coordinates are resolved for a search query, THE Pickup_Branch_Finder SHALL calculate the Haversine distance from those coordinates to every Pickup_Branch in the PickupBranches dataset
2. THE Pickup_Branch_Finder SHALL produce a Nearby_Branch_List containing every Pickup_Branch whose calculated distance is less than or equal to max_dist, sorted in ascending order of distance (nearest first)
3. WHERE max_dist is not specified by the caller, THE Pickup_Branch_Finder SHALL default max_dist to 30 kilometers for the Nearby_Branch_List calculation
4. THE Pickup_Branch_Finder SHALL designate the first entry of the Nearby_Branch_List as the Nearest_Pickup_Branch and mark it as the highlighted/primary entry
5. THE Pickup_Branch_Finder SHALL include the Correct_Branch_ID (e.g., "BANA001 - Chamnaom") and the calculated distance in kilometers for every entry in the Nearby_Branch_List
6. THE Pickup_Branch_Finder SHALL NOT use or display branch_id values from routes.json — only Delivery Store codes from PickupBranches are valid branch identifiers
7. WHILE max_dist is in effect (whether user-specified or defaulted to 30 kilometers), THE Pickup_Branch_Finder SHALL exclude Pickup_Branch records whose distance exceeds that threshold from the Nearby_Branch_List
8. IF no Pickup_Branch is found within max_dist, THEN THE Pickup_Branch_Finder SHALL return an error response indicating no pickup branch exists within the specified range

### Requirement 4: Search Result Display

**User Story:** As a delivery coordinator, I want the ranked list of nearby pickup branches to clearly show each branch's correct ID and distance, so that I can quickly identify the delivery store assignment for the searched location.

#### Acceptance Criteria

1. WHEN a smart search resolves a searched location, THE Map_UI SHALL display the searched location's name or address together with the full Nearby_Branch_List, showing each entry's Correct_Branch_ID and distance in kilometers from the searched location
2. THE Map_UI SHALL NOT display legacy branch_id values from routes.json (e.g., "MON02", "SIE01", "KAN") as branch assignments
3. THE Map_UI SHALL format each distance in the Nearby_Branch_List to two decimal places followed by " km" (e.g., "12.34 km")
4. WHEN the Nearby_Branch_List is displayed, THE Map_UI SHALL visually distinguish the Nearest_Pickup_Branch as the highlighted/primary entry at the top of the list
5. THE Map_UI SHALL render the Correct_Branch_ID of every Nearby_Branch_List entry in red text, both in the sidebar list and in the entry's map label

### Requirement 5: Fuzzy Search with Khmer Text Support

**User Story:** As a field agent, I want the search to handle Khmer text and tolerate misspellings, so that I can find markets even when I type imprecisely.

#### Acceptance Criteria

1. WHEN a user submits a query containing Khmer characters, THE Search_Engine SHALL normalize the text using NFC Unicode normalization and decomposed vowel correction before matching
2. WHEN a user submits a query that does not exactly match any market in routes.json, THE Search_Engine SHALL apply Fuzzy_Matching with a similarity threshold to find approximate matches
3. THE Search_Engine SHALL rank fuzzy match results by similarity score in descending order
4. WHEN multiple fuzzy matches exceed the similarity threshold, THE Search_Engine SHALL return the match with the highest similarity score as the resolved market location
5. THE Search_Engine SHALL support fuzzy matching across both English and Khmer text fields (market, village, commune, district, province)
6. WHEN no fuzzy matches exceed the similarity threshold, THE Search_Engine SHALL return no results and SHALL NOT fall back to the closest below-threshold match

### Requirement 6: Geocoding Result Caching

**User Story:** As a system administrator, I want geocoding results to be cached locally, so that repeated searches for the same market do not consume external API quota.

#### Acceptance Criteria

1. WHEN the Geocoding_Service returns a successful result, THE Search_Engine SHALL store the query text, resolved coordinates (including partial results where only latitude or only longitude was extracted), and display name in a local cache file
2. WHEN a user submits a query that exists in the cache, THE Search_Engine SHALL return the cached coordinates (which may be partial) without calling the Geocoding_Service; a cache miss SHALL lead to a geocoding fallback via the Geocoding_Service
3. THE Search_Engine SHALL load the geocoding cache from disk at startup and persist new entries to disk after each successful geocoding response
4. IF the cache file is missing or corrupted, THEN THE Search_Engine SHALL create a new empty cache and continue operating

### Requirement 7: Map Visualization of Search Results

**User Story:** As a delivery coordinator, I want to see the searched location and every nearby pickup branch on the map, so that I can visually confirm proximity relationships at a glance.

#### Acceptance Criteria

1. WHEN a smart search resolves a searched location, THE Map_UI SHALL display a single blue circle marker at the resolved coordinates with a label showing the searched location's name or address
2. THE Map_UI SHALL apply the same blue-marker-and-label treatment to the searched location regardless of whether it was resolved from a Market_Location match or from a geocoded free-text address
3. WHEN the Nearby_Branch_List is calculated, THE Map_UI SHALL display a red marker for every Pickup_Branch entry in the Nearby_Branch_List, each labeled with its Correct_Branch_ID in red text
4. THE Map_UI SHALL visually distinguish the marker for the Nearest_Pickup_Branch from the markers for the other Nearby_Branch_List entries
5. WHEN the searched location marker and the Nearby_Branch_List is displayed, THE Map_UI SHALL draw a dashed line between the searched location marker and the Nearest_Pickup_Branch marker
6. WHEN the searched location marker and the Nearby_Branch_List markers are placed, THE Map_UI SHALL adjust the map viewport to fit the searched location and all Nearby_Branch_List markers with appropriate padding
7. WHEN a user clicks a Pickup_Branch marker, THE Map_UI SHALL display a popup containing the Correct_Branch_ID in red, province, district, and distance from the searched location

### Requirement 8: Smart Search API Endpoint

**User Story:** As a frontend developer, I want a single API endpoint that performs the full smart search workflow, so that the client can trigger location resolution and nearby-branch lookup with one request.

#### Acceptance Criteria

1. THE Search_Engine SHALL expose a GET endpoint at /api/smart-find that accepts query parameters: q (search text, required), max_dist (maximum distance in km, optional)
2. WHEN a valid request is received, THE Search_Engine SHALL execute the unified location resolution pipeline (local routes.json match, fuzzy match, geocoding fallback) followed by the Nearby_Branch_List calculation from PickupBranches data
3. THE Search_Engine SHALL return a JSON response containing: the original query, resolved location name or address, resolved coordinates, coordinate source (local_db, cache, or geocoding), and a nearby_branches array representing the Nearby_Branch_List ranked nearest-first, where each entry includes its Correct_Branch_ID, coordinates, and distance in kilometers, with the first entry flagged as the Nearest_Pickup_Branch; the coordinate source value SHALL accurately reflect the actual resolution method used (local_db if resolved from routes.json, cache if retrieved from cache, or geocoding if resolved via Geocoding_Service)
4. THE Search_Engine SHALL NOT include legacy branch_id values from routes.json in the API response as branch assignments
5. IF the q parameter is empty, whitespace-only, or missing, THEN THE Search_Engine SHALL return a 400 status with an error message
6. THE Search_Engine SHALL complete the smart-find request within 5 seconds for local database matches and within 10 seconds for geocoding-dependent matches
7. WHERE max_dist is not specified in the request, THE Search_Engine SHALL default max_dist to 30 kilometers for the Nearby_Branch_List calculation
8. WHEN the coordinate source of the response is geocoding, THE Search_Engine SHALL include an address_detail object in the response containing the Address_Detail (Province, District, and Ward/Commune in English and Khmer) produced by the Address Detail Lookup described in Requirement 10

### Requirement 9: Pickup Branch Detail Display

**User Story:** As a delivery coordinator, I want to see detailed information about the nearest pickup branch in the sidebar, so that I can quickly confirm the delivery store assignment for the searched location.

#### Acceptance Criteria

1. WHEN a smart search returns a Nearest_Pickup_Branch, THE Map_UI SHALL display a detail card in the sidebar showing: the searched location's name or address, the Correct_Branch_ID (e.g., "BANA001 - Chamnaom") prominently, province, district (English and Khmer), coordinates, and distance from the searched location
2. THE Map_UI SHALL clearly label the distance between the searched location and the Nearest_Pickup_Branch (e.g., "Distance: 12.34 km")
3. THE Map_UI SHALL provide an "Open in Google Maps" link for the Nearest_Pickup_Branch that opens the location in a new browser tab
4. WHEN the user clicks "Back to list", THE Map_UI SHALL return to the standard search results view

### Requirement 10: Address Detail Lookup via Reverse Geocoding

**User Story:** As a delivery coordinator, I want to see the province, district, and ward/commune for a searched address that isn't a known market, so that I can understand exactly where that location is before choosing a pickup branch.

#### Acceptance Criteria

1. WHEN a search query resolves via the Geocoding_Service (coords_source is "geocoding"), THE Search_Engine SHALL perform a reverse-geocoding request against the Geocoding_Service using the resolved coordinates to obtain address details
2. WHEN the reverse-geocoding request succeeds, THE Search_Engine SHALL extract the Province, District, and Ward/Commune values from the response and construct an Address_Detail containing each value in English and in Khmer where available
3. IF the Geocoding_Service reverse-geocoding response does not include a Khmer value for a given field, THEN THE Search_Engine SHALL include the English value for that field and omit the missing Khmer value rather than fail the request
4. IF the reverse-geocoding request fails or times out, THEN THE Search_Engine SHALL return the resolved coordinates and location name without an Address_Detail rather than failing the overall smart-find request
5. WHEN a search query resolves via local_db or cache rather than geocoding, THE Search_Engine SHALL NOT perform a reverse-geocoding request
6. WHEN an Address_Detail is present in the response, THE Map_UI SHALL display the Province, District, and Ward/Commune (English and Khmer) alongside the resolved search location's result card

### Requirement 11: Unified Search Results List and Selection Behavior

**User Story:** As a delivery coordinator, I want market matches and resolved address results to appear together in one clickable list, so that I never have to decide which search mode to use.

#### Acceptance Criteria

1. THE Search_Engine SHALL resolve every search query through the single unified pipeline described in Requirement 2, without requiring the user to select a search mode
2. WHEN a search query is submitted, THE Map_UI SHALL display a unified results list containing both matching Market_Location entries and the resolved free-text location together, without separating them into distinct modes or views
3. THE Map_UI SHALL render every Location_Match in the unified results list as clickable
4. WHEN a user clicks a Location_Match in the unified results list, THE Map_UI SHALL fly the map to that Location_Match's coordinates and treat it as the searched location for the Nearby_Branch_List calculation, using the same behavior as directly searching a market
5. WHEN a user clicks a Location_Match in the unified results list, THE Map_UI SHALL display the blue circle marker and label for that Location_Match's resolved coordinates as described in Requirement 7
