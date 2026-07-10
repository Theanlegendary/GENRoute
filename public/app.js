/* ── Cambodia Route & Branch Maps JS // Metfone Express Customer Service ── */
const API = '';

// App State
let map;
let tileLayers = {};
let activeTileLayer = null;
let markerClusterGroup; // Layer to hold all map markers
let vectorLayerGroup; // Layer to hold all polylines and circles
let activeMarkers = []; // Array of currently rendered markers
let currentResults = [];
let currentPage = 1;
const limit = 50;

// Sticker Labels State
let showLabelsToggle = true; // default on
let labelSize = 'normal';    // default normal (medium)
let activeStickerMarkers = [];

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const searchBtn = document.getElementById('searchBtn');
const provinceSelect = document.getElementById('provinceSelect');
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
const resultsCount = document.getElementById('resultsCount');
const resultsList = document.getElementById('resultsList');
const footerStats = document.getElementById('footerStats');

// States DOM
const stateWelcome = document.getElementById('stateWelcome');
const stateLoading = document.getElementById('stateLoading');
const stateEmpty = document.getElementById('stateEmpty');

// Custom Eco-Organic Metfone Red Pin (Post Office / Branch)
const redIcon = L.divIcon({
  html: `
    <div class="eco-pin eco-pin--metfone">
      <div class="eco-pin__bubble"><span style="transform: rotate(45deg); display: inline-block;">📮</span></div>
    </div>
  `,
  className: 'custom-eco-pin',
  iconSize: [36, 42],
  iconAnchor: [18, 42],
  popupAnchor: [0, -38]
});

// Custom Market Target Pin (Using flaticon icon as requested by USER)
const marketIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/2792/2792541.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28]
});

const selectedMarketIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/2792/2792541.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -36]
});

// Initialize Application
(async function init() {
  initMap();
  setupThemeSwitcher();
  await loadStats();
  setupEventListeners();
  setupLabelsControl();
  // Clear/empty map state at startup
  showState('welcome');
})();

// Initialize Leaflet Map
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([12.5657, 104.9910], 7.5);

  tileLayers.voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  tileLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  tileLayers.positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Metfone Smart Grid',
    subdomains: 'abcd',
    maxZoom: 20
  });

  // Hybrid Satellite = Google Hybrid (Satellite + Roads/Labels)
  tileLayers.satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Map data &copy; Google',
    maxZoom: 20
  });

  // Set default active layer
  tileLayers.voyager.addTo(map);
  activeTileLayer = tileLayers.voyager;

  L.control.zoom({ position: 'topright' }).addTo(map);
  markerClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    disableClusteringAtZoom: 15,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false
  }).addTo(map);
  vectorLayerGroup = L.layerGroup().addTo(map);

  // Map click listener for adding custom points
  map.on('click', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`
        <div class="map-popup-content" style="width: 200px; padding: 2px;">
          <h4 style="margin: 0 0 6px 0; font-size: 12px; color: #1e293b; font-family: var(--font-heading);">📍 Custom Map Point</h4>
          <p style="margin: 0 0 8px 0; font-size: 10px; color: #64748b; font-family: monospace;">${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
          <button onclick="triggerAddLocationModal('', ${lat}, ${lng}, '', '')" style="background-color: #3b82f6; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; width: 100%; font-weight: bold; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add Location Here</button>
        </div>
      `)
      .openOn(map);
  });
}

// Setup Map Theme Switcher logic
function setupThemeSwitcher() {
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      if (tileLayers[theme]) {
        // Remove active layer
        map.removeLayer(activeTileLayer);
        // Add new layer
        tileLayers[theme].addTo(map);
        activeTileLayer = tileLayers[theme];

        // Update active class on buttons
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Toggle dark-theme styling on switcher frame
        const switcher = document.querySelector('.map-theme-switcher');
        if (switcher) {
          if (theme === 'dark') {
            switcher.classList.add('dark-theme-active');
          } else {
            switcher.classList.remove('dark-theme-active');
          }
        }
      }
    });
  });
}

// Load stats into footer
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();
    if (footerStats) {
      footerStats.innerHTML = `EXPRESS GRID: <span>${data.total_branches.toLocaleString()}</span> PO BRANCHES · <span>${(data.total_markets || 1888).toLocaleString()}</span> MARKETS`;
    }
  } catch (e) {
    if (footerStats) {
      footerStats.textContent = 'METFONE EXPRESS GRID · ONLINE';
    }
  }
}

// Helper to check if string contains lat/lng coordinates (e.g. "11.556, 104.928")
function parseCoordinates(q) {
  const match = q.match(/^[-+]?([1-9]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/);
  if (match) {
    const parts = q.split(',').map(num => parseFloat(num.trim()));
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

// Event Listeners Setup
function setupEventListeners() {
  // Clear search input
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    if (provinceSelect) provinceSelect.value = '';
    clearBtn.style.display = 'none';
    closeAutocomplete();
    clearAllMapLayers();
    activeMarkers = [];
    showState('welcome');
    if (resultsCount) {
      resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
    }
    map.setView([12.5657, 104.9910], 7.5);
  });

  // Search submit button
  searchBtn.addEventListener('click', () => {
    closeAutocomplete();
    runSmartFind();
  });

  // Search input typing with debounce for autocomplete
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.style.display = q ? 'block' : 'none';
    
    clearTimeout(debounceTimer);
    if (!q) {
      closeAutocomplete();
      return;
    }
    debounceTimer = setTimeout(() => showAutocomplete(q), 250);
  });

  // Enter key in search box
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      closeAutocomplete();
      runSmartFind();
    } else if (e.key === 'Escape') {
      closeAutocomplete();
    }
  });

  // Province dropdown change re-trigger search
  if (provinceSelect) {
    provinceSelect.addEventListener('change', () => {
      if (searchInput.value.trim()) {
        closeAutocomplete();
        runSmartFind();
      }
    });
  }

  // Welcome hint chips click
  document.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.textContent.replace(/[\[\]]/g, '').trim();
      searchInput.value = text;
      clearBtn.style.display = 'block';
      runSmartFind();
    });
  });

  // Close autocomplete when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-panel') && !e.target.closest('.autocomplete-dropdown')) {
      closeAutocomplete();
    }
  });
}

// Autocomplete suggestions handler
// Queries both local database and the FREE Google Maps Autocomplete proxy in parallel.
async function showAutocomplete(q) {
  try {
    const normQ = normalizeKhmer(q).toLowerCase();

    // 1. Check if user typed direct GPS coordinates
    const coords = parseCoordinates(q);
    if (coords) {
      autocompleteDropdown.innerHTML = '';
      const item = document.createElement('div');
      item.className = 'ac-item';
      item.innerHTML = `
        <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: #DA251D;">🌐</span>
        <div class="ac-details" style="display: flex; flex-direction: column; gap: 2px;">
          <span class="ac-label" style="font-size: 13px; font-weight: 600; color: #1e293b;">Go to Coordinates</span>
          <span class="ac-sub" style="font-size: 11px; color: #64748b; line-height: 1.3;">Latitude: ${coords.lat}, Longitude: ${coords.lng}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        searchInput.value = q;
        clearBtn.style.display = 'block';
        closeAutocomplete();
        const selectedLoc = {
          id: 'target_' + Date.now(),
          market: `GPS Coordinates: ${coords.lat}, ${coords.lng}`,
          latitude: coords.lat,
          longitude: coords.lng,
          province: 'GPS Location',
          district: '',
          google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
        };
        selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
      });
      autocompleteDropdown.appendChild(item);
      autocompleteDropdown.classList.add('open');
      return;
    }

    // 2. Fetch local database search & FREE Google Autocomplete proxy in parallel
    const prov = provinceSelect ? provinceSelect.value : '';
    
    const localUrl = `${API}/api/search?q=${encodeURIComponent(q)}&limit=50&type=market` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
    const localPromise = fetch(localUrl)
      .then(r => r.json())
      .catch(() => ({ results: [] }));

    const branchUrl = `${API}/api/search?q=${encodeURIComponent(q)}&limit=50` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
    const branchPromise = fetch(branchUrl)
      .then(r => r.json())
      .catch(() => ({ results: [] }));

    const googleUrl = `${API}/api/google-autocomplete?q=${encodeURIComponent(q)}` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
    const googlePromise = fetch(googleUrl)
      .then(r => r.json())
      .catch(() => []);

    const [localData, branchData, googleData] = await Promise.all([localPromise, branchPromise, googlePromise]);

    let suggestions = [];

    // Filter and add local branch matches first (High priority!)
    const filteredBranches = (branchData.results || []).filter(r => {
      const code = (r.branch_id || '').toLowerCase();
      const name = (r.market || '').toLowerCase();
      return code.includes(normQ) || name.includes(normQ);
    });

    filteredBranches.forEach(r => {
      const label = `${r.market} (${r.branch_id})`;
      const addressString = [r.district, r.province].filter(Boolean).join(', ');
      suggestions.push({
        isLocal: true,
        isBranch: true,
        label: r.branch_id,
        displayLabel: label,
        address: `${addressString} · 📮 Metfone Post Office`,
        lat: r.latitude,
        lng: r.longitude,
        raw: r
      });
    });

    // Filter local database matches strictly (Only matching ones)
    const filteredLocal = (localData.results || []).filter(r => {
      // Special case: Allow Phnom Penh's Central Market (id: 43) for Phsar Thmey/Central Market queries
      if (r.id === 43 && (normQ.includes('ផ្សារ') || normQ.includes('ថ្មី') || normQ.includes('psar') || normQ.includes('thmey') || normQ.includes('phsar') || normQ.includes('central'))) {
        return true;
      }
      const marketEn = (r.market || '').toLowerCase();
      const marketKh = (r.market_kh || '').toLowerCase();
      const branchId = (r.branch_id || '').toLowerCase();
      return marketEn.includes(normQ) || marketKh.includes(normQ) || branchId.includes(normQ);
    });

    // Sort local matches to prioritize prefix/exact matches
    filteredLocal.sort((a, b) => {
      const aName = (a.market || '').toLowerCase();
      const bName = (b.market || '').toLowerCase();
      const aStarts = aName.startsWith(normQ);
      const bStarts = bName.startsWith(normQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.localeCompare(bName);
    });

    // Add local matches to suggestions list (Tagged as "Metfone Partner Market")
    filteredLocal.forEach(r => {
      const label = r.market || r.village || r.commune || 'Market';
      const labelKh = r.market_kh || r.village_kh || r.commune_kh || '';
      const fullLabel = labelKh ? `${label} (${labelKh})` : label;
      const addressString = [r.commune || r.village, r.district, r.province].filter(Boolean).join(', ');

      // Avoid duplicates with branch matches
      const exists = suggestions.some(s => s.isBranch && s.label.toLowerCase() === (r.branch_id || '').toLowerCase());
      if (!exists) {
        suggestions.push({
          isLocal: true,
          isBranch: false,
          label: label,
          displayLabel: fullLabel,
          address: `${addressString} · 🛒 Partner Market`,
          lat: r.latitude,
          lng: r.longitude,
          raw: r
        });
      }
    });

    // 3. Add Google Autocomplete suggestions (Tagged as "Google Maps Search")
    googleData.forEach(text => {
      // Avoid duplicate names if they already exist in database markets
      const isDuplicate = suggestions.some(s => s.label.toLowerCase() === text.toLowerCase());
      if (!isDuplicate && suggestions.length < 6) {
        suggestions.push({
          isLocal: false,
          isBranch: false,
          label: text,
          displayLabel: text,
          address: prov ? `🌐 Google Maps Search (in ${prov})` : `🌐 Google Maps Search (in Cambodia)`,
          lat: null, // Will geocode dynamically on click!
          lng: null
        });
      }
    });

    // Always append verbatim search query as a fallback option so they can always trigger the search!
    const verbatimExists = suggestions.some(s => s.label.toLowerCase() === q.toLowerCase());
    if (!verbatimExists) {
      suggestions.push({
        isLocal: false,
        isBranch: false,
        label: q,
        displayLabel: `Search for "${q}"`,
        address: prov ? `🌐 Google Maps Search (in ${prov})` : `🌐 Google Maps Search (in Cambodia)`,
        lat: null,
        lng: null
      });
    }

    if (!suggestions.length) { closeAutocomplete(); return; }

    autocompleteDropdown.innerHTML = '';
    suggestions.slice(0, 6).forEach(s => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      
      const displayLabel = highlightMatch(s.displayLabel, q);
      const displayAddress = highlightMatch(s.address, q);
      const icon = s.isBranch ? '📮' : (s.isLocal ? '🛒' : '📍');

      item.innerHTML = `
        <span class="ac-icon-marker" style="margin-right: 12px; font-size: 1.1rem; color: #64748b;">${icon}</span>
        <div class="ac-details" style="display: flex; flex-direction: column; gap: 2px;">
          <span class="ac-label" style="font-size: 13px; font-weight: 600; color: #1e293b;">${displayLabel}</span>
          <span class="ac-sub" style="font-size: 11px; color: #64748b; line-height: 1.3;">${displayAddress}</span>
        </div>
      `;
      
      item.addEventListener('click', async () => {
        searchInput.value = s.label;
        clearBtn.style.display = 'block';
        closeAutocomplete();
        
        if (s.isLocal) {
          if (s.isBranch) {
            // Direct Post Office Branch Click
            showState('none');
            clearAllMapLayers();
            activeMarkers = [];
            const marker = L.marker([s.lat, s.lng], { icon: redIcon }).addTo(markerClusterGroup);
            marker.bindPopup(`
              <div class="map-popup-content">
                <div class="popup-header">
                  <span class="popup-badge">ID: ${s.raw.branch_id}</span>
                  <span class="popup-coord">${s.lat.toFixed(4)}°, ${s.lng.toFixed(4)}°</span>
                </div>
                <h4>📮 ${escHtml(s.raw.market)}</h4>
                <p class="popup-addr">${escHtml([s.raw.district, s.raw.province].filter(Boolean).join(', '))}</p>
                <a class="popup-directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; background-color: #3b82f6; color: white; border-radius: 4px; padding: 6px 12px; text-decoration: none; font-size: 11px; font-weight: bold; text-align: center;">🚗 GO (Directions)</a>
              </div>
            `);
            activeMarkers.push({ id: s.raw.id, marker });
            renderResultsList([s.raw], false, null);
            if (resultsCount) {
              resultsCount.innerHTML = `Found Metfone Express Branch: <span>${s.raw.branch_id}</span>`;
            }
            map.setView([s.lat, s.lng], 17);
            marker.openPopup(); // Auto-open branch popup
          } else {
            // Local Partner Market Click
            const selectedLoc = {
              id: 'target_' + Date.now(),
              market: s.label,
              latitude: s.lat,
              longitude: s.lng,
              province: s.raw.province,
              district: s.raw.district,
              google_maps_url: `https://www.google.com/maps?q=${s.lat},${s.lng}`
            };
            showSingleTargetOnMap(selectedLoc, [selectedLoc]);
          }
        } else {
          // Dynamically geocode the Google suggestion for FREE!
          showState('loading');
          try {
            const geoRes = await fetch(`${API}/api/google-geocode?q=${encodeURIComponent(s.label)}`);
            if (!geoRes.ok) throw new Error('Geocoding failed');
            const coords = await geoRes.json();
            
            const selectedLoc = {
              id: 'target_' + Date.now(),
              market: s.label,
              latitude: coords.lat,
              longitude: coords.lng,
              province: 'Google Location',
              district: '',
              google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
            };
            showSingleTargetOnMap(selectedLoc, [selectedLoc]);
          } catch (err) {
            console.error(err);
            showState('empty');
            resultsCount.textContent = 'Google Maps coordinates could not be loaded.';
          }
        }
      });
      
      autocompleteDropdown.appendChild(item);
    });
    autocompleteDropdown.classList.add('open');
  } catch (e) { closeAutocomplete(); }
}

function closeAutocomplete() {
  autocompleteDropdown.classList.remove('open');
  autocompleteDropdown.innerHTML = '';
}

// Reset/Welcome screen state
async function runSearch(page = 1) {
  showState('welcome');
  if (resultsCount) resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
  markerClusterGroup.clearLayers();
  activeMarkers = [];
  map.setView([12.5657, 104.9910], 7.5);
}

// Select a market, village, commune, or district and find its nearest Post Offices (within 30km)
// With Mushroom Network (Dashed Lines & Popup List) + Close Zoom!
async function selectLocationAndFindNearbyPOs(selectedLoc, allMatchedLocs, fly = true) {
  currentResults = allMatchedLocs || [selectedLoc];
  showState('loading');
  try {
    const radius = 30; // Max 30km
    const province = provinceSelect ? provinceSelect.value : '';

    // Fetch default PO for this location if it has branch_id
    let defaultPO = null;
    if (selectedLoc.branch_id) {
      try {
        const resDef = await fetch(`${API}/api/search?branch_id=${selectedLoc.branch_id}`);
        const dataDef = await resDef.json();
        if (dataDef.results && dataDef.results.length > 0) {
          defaultPO = dataDef.results[0];
        }
      } catch (err) {
        console.warn('Failed to fetch default PO metadata:', err.message);
      }
    }

    const nearbyParams = new URLSearchParams({
      lat: selectedLoc.latitude,
      lng: selectedLoc.longitude,
      radius: radius,
      limit: 10,
      type: 'branch'
    });
    if (province) nearbyParams.set('province', province);

    const res = await fetch(`${API}/api/nearby?${nearbyParams}`);
    const data = await res.json();
    const nearbyPOs = data.results;

    showState('none');

    clearAllMapLayers();
    activeMarkers = [];

    const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Selected Location';
    
    let poListHtml = '';

    // Add default registered PO at the top of the list if it exists
    if (defaultPO) {
      const distToDefault = nearbyPOs.find(po => po.branch_id === defaultPO.branch_id)?.distance_km 
        || haversine(selectedLoc.latitude, selectedLoc.longitude, defaultPO.latitude, defaultPO.longitude);
        
      poListHtml += `
        <div class="popup-po-item" style="margin-top: 4px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 3px; font-family: sans-serif; background-color: #eff6ff; padding: 2px 4px; border-radius: 4px; margin-bottom: 6px;">
          <span style="color:#1e3a8a;"><b>📮 REG ZONE PO:</b> ${escHtml(defaultPO.market || defaultPO.store_name)} (${defaultPO.branch_id})</span>
          <span style="color:#1e3a8a; font-weight: 700; margin-left: 8px;">${formatDistance(distToDefault)}</span>
        </div>
      `;
    }

    nearbyPOs.forEach((nearPo, idx) => {
      const isDefault = defaultPO && (defaultPO.branch_id === nearPo.branch_id);
      poListHtml += `
        <div class="popup-po-item" style="margin-top: 4px; font-size: 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px; font-family: sans-serif; ${isDefault ? 'background-color: #eff6ff;' : ''}">
          <span style="color:#1e293b;"><b>${idx + 1}.</b> ${escHtml(nearPo.market || nearPo.store_name || 'Post Office')} (${nearPo.branch_id})</span>
          <span style="color:var(--metfone-red, #d32f2f); font-weight: 700; margin-left: 8px;">${formatDistance(nearPo.distance_km)}</span>
        </div>
      `;
    });

    // Plot target location with Mushroom popup list
    const targetMarker = L.marker([selectedLoc.latitude, selectedLoc.longitude], { icon: selectedMarketIcon }).addTo(markerClusterGroup);
    const isGoogleLocation = String(selectedLoc.id).startsWith('target_');
    const addDbBtnHtml = isGoogleLocation ? `
      <button class="popup-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(targetTitle)}', ${selectedLoc.latitude}, ${selectedLoc.longitude}, '${escHtml(selectedLoc.province || '')}', '${escHtml(selectedLoc.district || '')}')" style="background-color: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 6px; width: 100%; font-weight: bold; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add to Local Database</button>
    ` : '';
    
    targetMarker.bindPopup(`
      <div class="map-popup-content" style="width: 260px;">
        <div class="popup-header" style="background-color: #173020; margin-bottom: 6px;">
          <span class="popup-badge" style="background-color: #173020; color: #fff;">TARGET LOCATION</span>
          <span class="popup-coord">${selectedLoc.latitude.toFixed(4)}°, ${selectedLoc.longitude.toFixed(4)}°</span>
        </div>
        <h4 style="margin: 4px 0; font-size:13px; color:#1e293b;">📍 ${escHtml(targetTitle)}</h4>
        <p class="popup-addr" style="margin: 2px 0 8px 0; font-size: 11px; color: #64748b;">${escHtml([selectedLoc.district, selectedLoc.province].filter(Boolean).join(', ') || '')}</p>
        
        <div class="popup-po-list" style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
          <h5 style="margin: 0 0 4px 0; font-size: 11px; color: #0f172a; font-weight: 700; text-transform: uppercase;">🌱 Nearest Post Offices (Max 10)</h5>
          ${poListHtml || '<p style="margin: 0; font-size: 11px; color: #94a3b8;">No post offices found within 30km.</p>'}
        </div>
        ${addDbBtnHtml}
        <a class="popup-directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${selectedLoc.latitude},${selectedLoc.longitude}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; background-color: #3b82f6; color: white; border-radius: 4px; padding: 6px 12px; text-decoration: none; font-size: 11px; font-weight: bold; text-align: center;">🚗 GO (Directions)</a>
        <a class="popup-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" style="margin-top: 6px; display: block; font-size:10px; text-align:right; color: #64748b; text-decoration: underline;">View on Google Maps ↗</a>
      </div>
    `);
    activeMarkers.push({ id: selectedLoc.id, marker: targetMarker });
    activeStickerMarkers.push({ marker: targetMarker, r: selectedLoc });

    // Plot default PO on map if not in nearby list
    if (defaultPO && defaultPO.latitude && defaultPO.longitude) {
      const isAlreadyPlotted = nearbyPOs.some(po => po.branch_id === defaultPO.branch_id);
      if (!isAlreadyPlotted) {
        const marker = L.marker([defaultPO.latitude, defaultPO.longitude], { icon: redIcon }).addTo(markerClusterGroup);
        marker.bindPopup(`
          <div class="map-popup-content">
            <div class="popup-header" style="background-color:#1e3a8a; margin-bottom: 6px;">
              <span class="popup-badge" style="background-color:#1e3a8a; color:#fff;">DEFAULT REGISTERED PO</span>
              <span class="popup-coord">${defaultPO.latitude.toFixed(4)}°, ${defaultPO.longitude.toFixed(4)}°</span>
            </div>
            <h4>📮 ${escHtml(defaultPO.market || defaultPO.store_name)}</h4>
            <p class="popup-addr">${escHtml([defaultPO.district, defaultPO.province].filter(Boolean).join(', '))}</p>
          </div>
        `);
        activeMarkers.push({ id: defaultPO.id, marker: marker });
      }
    }

    // Draw connection line to nearest PO
    if (nearbyPOs.length > 0) {
      const nearestPO = nearbyPOs[0];
      const nearestLine = L.polyline([
        [selectedLoc.latitude, selectedLoc.longitude],
        [nearestPO.latitude, nearestPO.longitude]
      ], {
        color: 'var(--metfone-red, #d32f2f)',
        weight: 3.5,
        dashArray: '5, 8',
        opacity: 0.8
      }).addTo(vectorLayerGroup);
      nearestLine.bindPopup(`Nearest PO: ${nearestPO.market} (${formatDistance(nearestPO.distance_km)})`);
    }

    // Draw connection line to default PO
    if (defaultPO && defaultPO.latitude && defaultPO.longitude) {
      const nearestPO = nearbyPOs[0];
      const isSame = (nearestPO && nearestPO.branch_id === defaultPO.branch_id);
      if (!isSame) {
        const defaultLine = L.polyline([
          [selectedLoc.latitude, selectedLoc.longitude],
          [defaultPO.latitude, defaultPO.longitude]
        ], {
          color: '#3b82f6',
          weight: 3.5,
          dashArray: '2, 6',
          opacity: 0.8
        }).addTo(vectorLayerGroup);
        defaultLine.bindPopup(`Default Registered PO Zone: ${defaultPO.market}`);
      }
    }

    // Plot all nearby post offices
    nearbyPOs.forEach(po => {
      const marker = L.marker([po.latitude, po.longitude], { icon: redIcon }).addTo(markerClusterGroup);
      const popupContent = `
        <div class="map-popup-content">
          <div class="popup-header">
            <span class="popup-badge">PO: ${po.branch_id}</span>
            <span class="popup-coord">${po.latitude.toFixed(4)}°, ${po.longitude.toFixed(4)}°</span>
          </div>
          <h4>📮 ${escHtml(po.market || po.village || 'Post Office')}</h4>
          <div class="popup-divider"></div>
          <p class="popup-addr">${escHtml([po.district, po.province].filter(Boolean).join(', '))}</p>
          <p style="color: var(--metfone-red); font-weight: 700; margin-top: 4px;">📡 Distance: ${formatDistance(po.distance_km)}</p>
          <a class="popup-directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${po.latitude},${po.longitude}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; background-color: #3b82f6; color: white; border-radius: 4px; padding: 6px 12px; text-decoration: none; font-size: 11px; font-weight: bold; text-align: center;">🚗 GO (Directions)</a>
          <a class="popup-gmaps-link" href="${po.google_maps_url || `https://www.google.com/maps?q=${po.latitude},${po.longitude}`}" target="_blank" rel="noopener" style="margin-top: 6px; display: block; font-size: 10px; text-align:right; color: #64748b; text-decoration: underline;">View on Google Maps ↗</a>
        </div>
      `;
      marker.bindPopup(popupContent);
      
      marker.on('click', () => {
        const card = document.querySelector(`.location-card[data-id="${po.id}"]`);
        if (card) {
          document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      activeMarkers.push({ id: po.id, marker: marker });
      activeStickerMarkers.push({ marker: marker, r: po });
    });
    refreshStickerLabels();

    // Render nearby POs in the sidebar results list WITH back button and target item!
    renderResultsList(nearbyPOs, true, targetTitle, selectedLoc);

    // Update results metadata
    if (resultsCount) {
      resultsCount.innerHTML = `📍 Near <b>${escHtml(targetTitle)}</b>: showing <span>${nearbyPOs.length}</span> nearby Metfone Express Branches`;
    }

    // Draw 30km circle around selected location (subtle opacity so it doesn't distract)
    L.circle([selectedLoc.latitude, selectedLoc.longitude], {
      color: '#4A805B',
      fillColor: '#4A805B',
      fillOpacity: 0.03,
      radius: 30000
    }).addTo(vectorLayerGroup);

    // Zoom in close directly to the target location at zoom level 17!
    if (selectedLoc.latitude && selectedLoc.longitude) {
      map.setView([selectedLoc.latitude, selectedLoc.longitude], 17, { animate: true, duration: 1.2 });
    } else {
      fitMapToMarkers(15);
    }
    
    // Auto-open target popup with detailed list
    if (targetMarker) {
      targetMarker.openPopup();
    }
  } catch (e) {
    console.error(e);
    showState('empty');
    if (resultsCount) {
      resultsCount.textContent = `Error finding nearby branches: ${e.message}`;
    }
  }
}

// Distance formatting helper: meters for < 1km, km for >= 1km
function formatDistance(distKm) {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)}m`;
  }
  return `${distKm.toFixed(1)} km`;
}

// Calculate distance in kilometers between two lat/lng points using Haversine formula
function haversine(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Search Like Google & Include Nearby Branches Logic
 */
async function runSmartFind() {
  const q = searchInput.value.trim();

  if (!q) {
    alert('Please enter a location first.');
    return;
  }

  showState('loading');
  closeAutocomplete();

  try {
    // 1. Check if user typed direct GPS coordinates (e.g. 11.556, 104.928)
    const coords = parseCoordinates(q);
    if (coords) {
      const selectedLoc = {
        id: 'target_' + Date.now(),
        market: `GPS Coordinates: ${coords.lat}, ${coords.lng}`,
        latitude: coords.lat,
        longitude: coords.lng,
        province: 'GPS Location',
        district: '',
        google_maps_url: `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
      };
      await selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
      return;
    }

    const normQ = normalizeKhmer(q).toLowerCase();

    // 1.5 FIRST: Check local database for exact/close post office branch ID match (e.g. Metfone branch ID like PNP01 or PNPP014)
    // This MUST run before geocoding, so branch ID queries center directly on the post office!
    try {
      const branchRes = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}&limit=100`);
      const branchData = await branchRes.json();
      const branchMatch = branchData.results?.find(r => r.branch_id && q.toLowerCase().replace(/[^a-z0-9]/g, '') === r.branch_id.toLowerCase().replace(/[^a-z0-9]/g, ''));
      
      if (branchMatch) {
        showState('none');
        clearAllMapLayers();
        activeMarkers = [];
        const marker = L.marker([branchMatch.latitude, branchMatch.longitude], { icon: redIcon }).addTo(markerClusterGroup);
        marker.bindPopup(`
          <div class="map-popup-content">
            <div class="popup-header">
              <span class="popup-badge">ID: ${branchMatch.branch_id}</span>
              <span class="popup-coord">${branchMatch.latitude.toFixed(4)}°, ${branchMatch.longitude.toFixed(4)}°</span>
            </div>
            <h4>📮 ${escHtml(branchMatch.market)}</h4>
            <p class="popup-addr">${escHtml([branchMatch.district, branchMatch.province].filter(Boolean).join(', '))}</p>
          </div>
        `);
        activeMarkers.push({ id: branchMatch.id, marker });
        activeStickerMarkers.push({ marker: marker, r: branchMatch });
        refreshStickerLabels();
        renderResultsList([branchMatch], false, null);
        if (resultsCount) {
          resultsCount.innerHTML = `Found Metfone Express Branch: <span>${branchMatch.branch_id}</span>`;
        }
        map.setView([branchMatch.latitude, branchMatch.longitude], 17);
        marker.openPopup(); // Auto-open branch popup
        return;
      }
    } catch (err) {
      console.warn('Branch ID local database pre-check failed:', err.message);
    }

    // 2. Query FREE Google Maps Geocoding proxy first
    try {
      const prov = provinceSelect ? provinceSelect.value : '';
      const geoUrl = `${API}/api/google-geocode?q=${encodeURIComponent(q)}` + (prov ? `&province=${encodeURIComponent(prov)}` : '');
      const geoRes = await fetch(geoUrl);
      if (geoRes.ok) {
        const coordsData = await geoRes.json();
        
        // If multiple matching locations are returned
        if (coordsData.type === 'multiple') {
          currentResults = coordsData.results;
          // Automatically select the first (most popular/Google primary) match,
          // while rendering other matched options as pills at the top of the sidebar list!
          showSingleTargetOnMap(coordsData.results[0], coordsData.results);
          return;
        }

        const selectedLoc = {
          id: 'target_' + Date.now(),
          market: coordsData.name || q,
          latitude: coordsData.lat,
          longitude: coordsData.lng,
          province: 'Google Location',
          district: '',
          google_maps_url: `https://www.google.com/maps?q=${coordsData.lat},${coordsData.lng}`
        };
        showSingleTargetOnMap(selectedLoc, [selectedLoc]);
        return;
      }
    } catch (err) {
      console.warn('Google geocoder search failed, trying local DB fallback...');
    }

    // 3. Fallback: Check local market database if geocoding/branch matching returns nothing
    const localRes = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}&limit=100&type=market`);
    const localData = await localRes.json();

    const filteredLocal = (localData.results || []).filter(r => {
      const marketEn = (r.market || '').toLowerCase();
      const marketKh = (r.market_kh || '').toLowerCase();
      return marketEn.includes(normQ) || marketKh.includes(normQ);
    });

    if (filteredLocal.length > 0) {
      const topMatch = filteredLocal[0];
      const selectedLoc = {
        id: topMatch.id,
        market: topMatch.market || topMatch.village || topMatch.commune || 'Market',
        latitude: topMatch.latitude,
        longitude: topMatch.longitude,
        province: topMatch.province,
        district: topMatch.district,
        google_maps_url: topMatch.google_maps_url || `https://www.google.com/maps?q=${topMatch.latitude},${topMatch.longitude}`
      };
      showSingleTargetOnMap(selectedLoc, filteredLocal);
      return;
    }

    throw new Error('Location not found.');

  } catch (e) {
    console.error(e);
    showState('empty');
    if (resultsCount) {
      resultsCount.textContent = `Error: ${e.message}`;
    }
  }
}

// Render locations in the sidebar list
function renderResultsList(results, isNearbyList = false, targetTitle = null, targetLoc = null) {
  resultsList.innerHTML = '';

  // If showing nearby results for a selected market or search target, show banner at top!
  if (isNearbyList && targetTitle) {
    const banner = document.createElement('div');
    banner.className = 'nearby-header-bar';
    banner.innerHTML = `
      <span class="nearby-header-title">📍 Nearby POs for <b>"${escHtml(targetTitle)}"</b></span>
      <button class="nearby-back-btn" id="nearbyBackBtn">← Back to Results</button>
    `;
    resultsList.appendChild(banner);

    const backBtn = banner.querySelector('#nearbyBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        closeAutocomplete();
        clearAllMapLayers();
        activeMarkers = [];
        showState('welcome');
        if (resultsCount) {
          resultsCount.textContent = 'Welcome to Metfone Express Eco-Route Grid';
        }
        map.setView([12.5657, 104.9910], 7.5);
      });
    }

    // Render the target location itself at the very top of the list!
    if (targetLoc) {
      const targetCard = document.createElement('div');
      targetCard.className = 'location-card target-location-card';
      targetCard.style.backgroundColor = '#eff6ff'; // Light blue highlight
      targetCard.style.borderLeft = '4px solid #3b82f6';
      targetCard.style.marginBottom = '12px';

      const tTitle = targetLoc.market || targetLoc.village || targetLoc.commune || 'Target Location';
      const tTitleKh = targetLoc.market_kh || targetLoc.village_kh || targetLoc.commune_kh || '';
      const q = normalizeKhmer(searchInput.value);
      const isGoogleLocation = String(targetLoc.id).startsWith('target_');
      const addDbTargetBtnHtml = isGoogleLocation ? `
        <button class="card-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(tTitle)}', ${targetLoc.latitude}, ${targetLoc.longitude}, '${escHtml(targetLoc.province || '')}', '${escHtml(targetLoc.district || '')}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; width: 100%; margin-top: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">
          <span>➕</span> Add to Local Database
        </button>
      ` : '';

      targetCard.innerHTML = `
        <div class="card-grid">
          <div class="card-index" style="background-color: #3b82f6; color: #fff; padding: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
            <span class="index-num" style="font-size: 1.1rem; line-height: 1;">🎯</span>
            <span class="type-badge" style="background-color: #1e3a8a; color: #fff; font-size: 8px; font-weight: 700; padding: 1px 3px; border-radius: 3px;">TARGET</span>
          </div>
          <div class="card-content">
            <div class="card-top">
              <span class="card-title" style="color: #1e3a8a; font-weight: 700;">${highlightMatch(tTitle, q)}</span>
              ${targetLoc.branch_id ? `<span class="card-branch-tag" style="background-color: #dbeafe; color: #1e40af;">ID: ${highlightMatch(targetLoc.branch_id, q)}</span>` : ''}
            </div>
            ${tTitleKh ? `<div class="card-title-kh">${highlightMatch(tTitleKh, q)}</div>` : ''}
            <div class="card-address">
              <span class="label-mono">📍</span> ${highlightMatch([targetLoc.village, targetLoc.commune, targetLoc.district, targetLoc.province].filter(Boolean).join(', '), q)}
            </div>
            ${targetLoc.village_kh || targetLoc.district_kh ? `
            <div class="card-address-kh">
              ${highlightMatch([targetLoc.village_kh, targetLoc.commune_kh, targetLoc.district_kh, targetLoc.province_kh].filter(Boolean).join(', '), q)}
            </div>` : ''}
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
              <a class="card-directions-link" href="https://www.google.com/maps/dir/?api=1&destination=${targetLoc.latitude},${targetLoc.longitude}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; background-color: #3b82f6; color: white; text-decoration: none; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; font-weight: bold; text-align: center; width: 100%;">🚗 GO (Directions)</a>
              ${addDbTargetBtnHtml}
              <a class="card-gmaps-link" href="${targetLoc.google_maps_url || `https://www.google.com/maps?q=${targetLoc.latitude},${targetLoc.longitude}`}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="font-size: 11px; color: var(--text-light); text-decoration: underline;">View on Google Maps ↗</a>
            </div>
          </div>
        </div>
      `;
    }

      targetCard.addEventListener('click', () => {
        document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
        targetCard.classList.add('selected');
        if (targetLoc.latitude && targetLoc.longitude) {
          map.flyTo([targetLoc.latitude, targetLoc.longitude], 17, { animate: true, duration: 1.2 });
          const am = activeMarkers.find(m => m.id === 'target_loc' || m.id === targetLoc.id);
          if (am) {
            setTimeout(() => am.marker.openPopup(), 1200);
          }
        }
      });

      resultsList.appendChild(targetCard);
    }

    // If there are multiple matched search targets, render the horizontal switch bar!
    if (currentResults && currentResults.length > 1) {
      const matchBar = document.createElement('div');
      matchBar.className = 'search-matches-bar';
      matchBar.innerHTML = `
        <div class="matches-title">📍 Alternative Matches:</div>
        <div class="matches-pills">
          ${currentResults.map(r => {
            const isActive = (r.market === targetTitle);
            return `
              <button class="match-pill ${isActive ? 'active' : ''}" onclick="triggerSelectLocation('${r.id}')">
                ${escHtml(r.market)}
              </button>
            `;
          }).join('')}
        </div>
      `;
      resultsList.appendChild(matchBar);
    }
  }

  results.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'location-card';
    card.setAttribute('data-id', r.id);

    const title = r.market || r.village || r.commune || 'Route Location';
    const titleKh = r.market_kh || r.village_kh || r.commune_kh || '';
    const indexStr = String(idx + 1).padStart(2, '0');
    
    const q = normalizeKhmer(searchInput.value);

    card.innerHTML = `
      <div class="card-grid">
        <div class="card-index">
          <span class="index-num">${indexStr}</span>
          <span class="type-badge">${!r.branch_id && !isNearbyList ? 'MKT' : 'PO'}</span>
        </div>
        <div class="card-content">
          <div class="card-top">
            <span class="card-title">${highlightMatch(title, q)}</span>
            ${r.branch_id ? `<span class="card-branch-tag">ID: ${highlightMatch(r.branch_id, q)}</span>` : ''}
          </div>
          ${titleKh ? `<div class="card-title-kh">${highlightMatch(titleKh, q)}</div>` : ''}
          <div class="card-address">
            <span class="label-mono">📍</span> ${highlightMatch([r.village, r.commune, r.district, r.province].filter(Boolean).join(', '), q)}
          </div>
          ${r.village_kh || r.district_kh ? `
          <div class="card-address-kh">
            ${highlightMatch([r.village_kh, r.commune_kh, r.district_kh, r.province_kh].filter(Boolean).join(', '), q)}
          </div>` : ''}
          ${r.distance_km != null ? `<div class="card-po-line">
            <span class="label-mono">Ref: <b>${highlightMatch(r.branch_id || 'MKT', q)}</b></span>
            <span class="distance-badge">📡 ${formatDistance(r.distance_km)}</span>
          </div>` : ''}
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
            <a class="card-directions-link" href="https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; background-color: #3b82f6; color: white; text-decoration: none; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; font-weight: bold; text-align: center; width: 100%;">🚗 GO (Directions)</a>
            ${String(r.id).startsWith('target_') ? `
              <button class="card-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(title)}', ${r.latitude}, ${r.longitude}, '${escHtml(r.province || '')}', '${escHtml(r.district || '')}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add to Local Database</button>
            ` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <a class="card-gmaps-link" href="${r.google_maps_url || `https://www.google.com/maps?q=${r.latitude},${r.longitude}`}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="font-size: 11px; color: var(--text-light); text-decoration: underline;">View on Google Maps ↗</a>
              ${!r.branch_id && !isNearbyList && !String(r.id).startsWith('target_') ? `
                <button class="card-correct-btn" onclick="event.stopPropagation(); triggerCorrectMarketCoords('${r.id}', '${escHtml(title)}', '${escHtml(r.province || '')}')" style="background: none; border: none; color: #3b82f6; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0;">✏️ Correct via Google</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      // If we are looking at a Market, Commune, District, or Village in normal/market list (not a Post Office), click it to find nearby POs!
      if (!isNearbyList && !r.branch_id) {
        selectLocationAndFindNearbyPOs(r, currentResults);
      } else {
        // If it is already a nearby Post Office or branch, just fly to it on map!
        if (r.latitude && r.longitude) {
          map.flyTo([r.latitude, r.longitude], 17, { animate: true, duration: 1.2 });
          const am = activeMarkers.find(m => m.id === r.id);
          if (am) {
            setTimeout(() => am.marker.openPopup(), 1200);
          }
        }
      }
    });

    resultsList.appendChild(card);
  });
}

// Render markers on Leaflet map
function renderMapMarkers(results) {
  clearAllMapLayers();
  activeMarkers = [];
  const markersToAdd = [];

  results.forEach(r => {
    if (!r.latitude || !r.longitude) return;

    const marker = L.marker([r.latitude, r.longitude], { icon: redIcon });

    const title = r.market || r.village || 'Location';
    const isGoogleLocation = String(r.id).startsWith('target_');
    const addDbBtnHtml = isGoogleLocation ? `
      <button class="popup-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(title)}', ${r.latitude}, ${r.longitude}, '${escHtml(r.province || '')}', '${escHtml(r.district || '')}')" style="background-color: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 6px; width: 100%; font-weight: bold; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add to Local Database</button>
    ` : '';

    const popupContent = `
      <div class="map-popup-content">
        <div class="popup-header">
          <span class="popup-badge">ID: ${r.branch_id || 'LOC'}</span>
          <span class="popup-coord">${r.latitude.toFixed(4)}°, ${r.longitude.toFixed(4)}°</span>
        </div>
        <h4>${escHtml(title)}</h4>
        ${r.market_kh || r.village_kh ? `<p class="popup-kh">${escHtml(r.market_kh || r.village_kh)}</p>` : ''}
        <div class="popup-divider"></div>
        <p class="popup-addr">${escHtml([r.district, r.province].filter(Boolean).join(', '))}</p>
        ${addDbBtnHtml}
        <a class="popup-directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; background-color: #3b82f6; color: white; border-radius: 4px; padding: 6px 12px; text-decoration: none; font-size: 11px; font-weight: bold; text-align: center;">🚗 GO (Directions)</a>
        <a class="popup-gmaps-link" href="${r.google_maps_url || `https://www.google.com/maps?q=${r.latitude},${r.longitude}`}" target="_blank" rel="noopener" style="margin-top: 6px; display: block; font-size: 10px; text-align:right; color: #64748b; text-decoration: underline;">View on Google Maps ↗</a>
      </div>
    `;

    marker.bindPopup(popupContent);

    marker.on('click', () => {
      if (!r.branch_id) {
        selectLocationAndFindNearbyPOs(r, currentResults, false);
      } else {
        const card = document.querySelector(`.location-card[data-id="${r.id}"]`);
        if (card) {
          document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    markersToAdd.push(marker);
    activeMarkers.push({ id: r.id, marker: marker });
    activeStickerMarkers.push({ marker: marker, r: r });
  });
  refreshStickerLabels();

  if (markersToAdd.length > 0) {
    markerClusterGroup.addLayers(markersToAdd);
  }

  fitMapToMarkers(14);
}

// Auto fit map bounds around markers (Never zoom out too far!)
function fitMapToMarkers(customMaxZoom = 15) {
  if (activeMarkers.length === 0) return;
  const group = L.featureGroup(activeMarkers.map(am => am.marker));
  map.fitBounds(group.getBounds().pad(0.2), { maxZoom: customMaxZoom, animate: true, duration: 1.2 });
}

// App State manager helper
function showState(state) {
  stateLoading.style.display = state === 'loading' ? 'flex' : 'none';
  stateWelcome.style.display = state === 'welcome' ? 'flex' : 'none';
  stateEmpty.style.display   = state === 'empty'   ? 'flex' : 'none';
  
  if (state !== 'none') {
    resultsList.innerHTML = '';
  }
}

// Escape HTML helper
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Khmer spelling unicode normalization helper
function normalizeKhmer(str) {
  if (!str) return '';
  let normalized = str.normalize('NFC').trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, '\u17BE');
  normalized = normalized.replace(/\u17C1\u17B6/g, '\u17C4');
  normalized = normalized.replace(/\u200B/g, '');
  return normalized;
}

// Highlight matched search query term in strings
function highlightMatch(text, query) {
  if (!text) return '';
  if (!query) return escHtml(text);

  const normText = normalizeKhmer(text).toLowerCase();
  const normQuery = normalizeKhmer(query).toLowerCase();

  const idx = normText.indexOf(normQuery);
  if (idx === -1) return escHtml(text);

  const isAscii = /^[\x00-\x7F]*$/.test(query);
  if (isAscii) {
    const escText = escHtml(text);
    const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return escText.replace(regex, '<strong>$1</strong>');
  }

  const normalizedText = normalizeKhmer(text);
  const normalizedQuery = normalizeKhmer(query);
  
  const escText = escHtml(normalizedText);
  const regex = new RegExp(`(${normalizedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  return escText.replace(regex, '<strong>$1</strong>');
}

// Global selector wrapper for Leaflet map popup select button clicks
window.triggerSelectLocation = function(id) {
  const matched = (currentResults || []).find(r => r.id === id);
  if (matched) {
    selectLocationAndFindNearbyPOs(matched, currentResults);
  }
};

window.triggerCorrectMarketCoords = async function(id, name, province) {
  showState('loading');
  try {
    const geoRes = await fetch(`${API}/api/google-geocode?q=${encodeURIComponent(name)}` + (province ? `&province=${encodeURIComponent(province)}` : ''));
    if (!geoRes.ok) throw new Error('Location not found on Google Maps');
    const coords = await geoRes.json();

    const updateRes = await fetch(`${API}/api/update-market-coords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: id,
        latitude: coords.lat,
        longitude: coords.lng
      })
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      throw new Error(errData.error || 'Failed to update coordinates');
    }

    // Auto-show nearby posts for the updated location
    const updatedLoc = {
      id: id,
      market: name,
      latitude: coords.lat,
      longitude: coords.lng,
      province: province || 'Cambodia'
    };
    await selectLocationAndFindNearbyPOs(updatedLoc, [updatedLoc]);

  } catch (err) {
    alert(`Error: ${err.message}`);
    showState('none');
  }
};


function clearAllMapLayers() {
  activeStickerMarkers = [];
  if (markerClusterGroup) markerClusterGroup.clearLayers();
  if (vectorLayerGroup) vectorLayerGroup.clearLayers();
}

// Sticker labels refresh & controls setup
function refreshStickerLabels() {
  activeStickerMarkers.forEach(item => {
    const { marker, r } = item;
    
    // Clear old tooltip
    marker.unbindTooltip();
    
    if (showLabelsToggle) {
      const districtPart = r.district_kh || r.district || '';
      const marketPart = r.market_kh || r.market || r.store_name || '';
      const labelText = [districtPart, marketPart].filter(Boolean).join(' - ');
      
      if (labelText) {
        marker.bindTooltip(labelText, {
          permanent: true,
          direction: 'top',
          className: `map-sticker-tooltip size-${labelSize}`,
          interactive: false,
          offset: [0, -12]
        });
      }
    }
  });
}

function setupLabelsControl() {
  const toggleBtn = document.getElementById('toggleLabelsBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('change', () => {
      showLabelsToggle = toggleBtn.checked;
      refreshStickerLabels();
    });
  }
  
  const sizeBtns = document.querySelectorAll('.map-labels-control .size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      labelSize = btn.getAttribute('data-size');
      refreshStickerLabels();
    });
  });
}

// Show a single geocoded target on the map first (clean Google Maps style)
function showSingleTargetOnMap(selectedLoc, allMatchedLocs) {
  currentResults = allMatchedLocs || [selectedLoc];
  showState('none');
  clearAllMapLayers();
  activeMarkers = [];

  const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';
  
  // Plot target marker
  const targetMarker = L.marker([selectedLoc.latitude, selectedLoc.longitude], { icon: selectedMarketIcon }).addTo(markerClusterGroup);
  const isGoogleLocation = String(selectedLoc.id).startsWith('target_');
  const addDbBtnHtml = isGoogleLocation ? `
    <button class="popup-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(targetTitle)}', ${selectedLoc.latitude}, ${selectedLoc.longitude}, '${escHtml(selectedLoc.province || '')}', '${escHtml(selectedLoc.district || '')}')" style="background-color: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 6px; width: 100%; font-weight: bold; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add to Local Database</button>
  ` : '';

  targetMarker.bindPopup(`
    <div class="map-popup-content" style="width: 240px;">
      <div class="popup-header" style="background-color: #173020; margin-bottom: 6px;">
        <span class="popup-badge" style="background-color: #173020; color: #fff;">TARGET LOCATION</span>
        <span class="popup-coord">${selectedLoc.latitude.toFixed(4)}°, ${selectedLoc.longitude.toFixed(4)}°</span>
      </div>
      <h4 style="margin: 4px 0; font-size:13px; color:#1e293b;">📍 ${escHtml(targetTitle)}</h4>
      <p class="popup-addr" style="margin: 2px 0 8px 0; font-size: 11px; color: #64748b;">${escHtml([selectedLoc.district, selectedLoc.province].filter(Boolean).join(', ') || '')}</p>
      
      <button class="popup-find-nearby-btn" onclick="event.stopPropagation(); triggerSelectLocation('${selectedLoc.id}')" style="background-color: var(--metfone-red, #d32f2f); color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 6px; width: 100%; font-weight: bold; text-align: center;">🔍 Find Nearby POs</button>
      ${addDbBtnHtml}
      <a class="popup-directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${selectedLoc.latitude},${selectedLoc.longitude}" target="_blank" rel="noopener" style="margin-top: 8px; display: block; background-color: #3b82f6; color: white; border-radius: 4px; padding: 6px 12px; text-decoration: none; font-size: 11px; font-weight: bold; text-align: center;">🚗 GO (Directions)</a>
      <a class="popup-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" style="margin-top: 6px; display: block; font-size:10px; text-align:right; color: #64748b; text-decoration: underline;">View on Google Maps ↗</a>
    </div>
  `);
  
  activeMarkers.push({ id: selectedLoc.id, marker: targetMarker });
  activeStickerMarkers.push({ marker: targetMarker, r: selectedLoc });
  refreshStickerLabels();

  // Zoom in very close directly to the target location at zoom level 17!
  map.setView([selectedLoc.latitude, selectedLoc.longitude], 17, { animate: true, duration: 1.2 });
  
  // Render results in the sidebar list (shows only this target with a big "Find Nearby POs" button)
  renderSingleTargetList(selectedLoc, currentResults);

  // Auto-open target popup
  setTimeout(() => {
    targetMarker.openPopup();
  }, 500);
}

// Render a single target location in the sidebar list (before finding nearby POs)
function renderSingleTargetList(selectedLoc, allMatchedLocs) {
  resultsList.innerHTML = '';
  const targetTitle = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';

  // If there are multiple matches, render the switch bar
  if (allMatchedLocs && allMatchedLocs.length > 1) {
    const matchBar = document.createElement('div');
    matchBar.className = 'search-matches-bar';
    matchBar.innerHTML = `
      <div class="matches-title">📍 Alternative Matches:</div>
      <div class="matches-pills">
        ${allMatchedLocs.map(r => {
          const isActive = (r.market === targetTitle);
          return `
            <button class="match-pill ${isActive ? 'active' : ''}" onclick="triggerShowSingleLocation('${r.id}')">
              ${escHtml(r.market)}
            </button>
          `;
        }).join('')}
      </div>
    `;
    resultsList.appendChild(matchBar);
  }

  const card = document.createElement('div');
  card.className = 'location-card selected';
  card.setAttribute('data-id', selectedLoc.id);
  card.style.borderLeft = '4px solid var(--metfone-red, #d32f2f)';

  const title = selectedLoc.market || selectedLoc.village || selectedLoc.commune || 'Target Location';
  const titleKh = selectedLoc.market_kh || selectedLoc.village_kh || selectedLoc.commune_kh || '';
  const q = normalizeKhmer(searchInput.value);

  card.innerHTML = `
    <div class="card-grid">
      <div class="card-index" style="background-color: var(--metfone-red, #d32f2f); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
        <span class="index-num">🎯</span>
        <span class="type-badge" style="background-color: #1e3a8a; color: white;">TARGET</span>
      </div>
      <div class="card-content">
        <div class="card-top">
          <span class="card-title" style="font-weight: 700;">${highlightMatch(title, q)}</span>
          ${selectedLoc.branch_id ? `<span class="card-branch-tag">ID: ${highlightMatch(selectedLoc.branch_id, q)}</span>` : ''}
        </div>
        ${titleKh ? `<div class="card-title-kh">${highlightMatch(titleKh, q)}</div>` : ''}
        <div class="card-address">
          <span class="label-mono">📍</span> ${highlightMatch([selectedLoc.village, selectedLoc.commune, selectedLoc.district, selectedLoc.province].filter(Boolean).join(', '), q)}
        </div>
        ${selectedLoc.village_kh || selectedLoc.district_kh ? `
        <div class="card-address-kh">
          ${highlightMatch([selectedLoc.village_kh, selectedLoc.commune_kh, selectedLoc.district_kh, selectedLoc.province_kh].filter(Boolean).join(', '), q)}
        </div>` : ''}
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
          <a class="card-directions-link" href="https://www.google.com/maps/dir/?api=1&destination=${selectedLoc.latitude},${selectedLoc.longitude}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; background-color: #3b82f6; color: white; text-decoration: none; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 11px; font-weight: bold; text-align: center; width: 100%;">🚗 GO (Directions)</a>
          ${String(selectedLoc.id).startsWith('target_') ? `
            <button class="card-add-db-btn" onclick="event.stopPropagation(); triggerAddLocationModal('${escHtml(title)}', ${selectedLoc.latitude}, ${selectedLoc.longitude}, '${escHtml(selectedLoc.province || '')}', '${escHtml(selectedLoc.district || '')}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--font-body);">➕ Add to Local Database</button>
          ` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <a class="card-gmaps-link" href="${selectedLoc.google_maps_url || `https://www.google.com/maps?q=${selectedLoc.latitude},${selectedLoc.longitude}`}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="font-size: 11px; color: var(--text-light); text-decoration: underline;">View on Google Maps ↗</a>
            ${!selectedLoc.branch_id && !String(selectedLoc.id).startsWith('target_') ? `
              <button class="card-correct-btn" onclick="event.stopPropagation(); triggerCorrectMarketCoords('${selectedLoc.id}', '${escHtml(title)}', '${escHtml(selectedLoc.province || '')}')" style="background: none; border: none; color: #3b82f6; font-size: 11px; cursor: pointer; text-decoration: underline; padding: 0;">✏️ Correct via Google</button>
            ` : ''}
          </div>
        </div>
        
        <button class="card-nearby-action-btn" onclick="event.stopPropagation(); selectLocationAndFindNearbyPOs(currentResults.find(r => r.id === '${selectedLoc.id}'), currentResults)" style="background: var(--metfone-red, #d32f2f); color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 12px; font-weight: bold; width: 100%; margin-top: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <span>🔍</span> Find Nearby Post Offices
        </button>
      </div>
    </div>
  `;

  // Clicking the card itself also triggers finding nearby POs!
  card.addEventListener('click', () => {
    selectLocationAndFindNearbyPOs(selectedLoc, allMatchedLocs);
  });

  resultsList.appendChild(card);
  
  if (resultsCount) {
    resultsCount.innerHTML = `Found Location: <span>${escHtml(targetTitle)}</span>. Click "Find Nearby Post Offices" to see routing.`;
  }
}

// Global selector wrapper for alternative matches in single target view
window.triggerShowSingleLocation = function(id) {
  const matched = (currentResults || []).find(r => r.id === id);
  if (matched) {
    showSingleTargetOnMap(matched, currentResults);
  }
};

// ──────────────────────────────────────────────────────────────────
// ADD LOCATION MODAL HANDLERS
// ──────────────────────────────────────────────────────────────────
const addLocationModal = document.getElementById('addLocationModal');
const addLocationForm = document.getElementById('addLocationForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');

window.triggerAddLocationModal = function(name = '', lat, lng, province = '', district = '') {
  document.getElementById('modalMarketName').value = name;
  document.getElementById('modalMarketNameKh').value = '';
  document.getElementById('modalProvince').value = province;
  document.getElementById('modalProvinceKh').value = '';
  document.getElementById('modalDistrict').value = district;
  document.getElementById('modalDistrictKh').value = '';
  document.getElementById('modalCommune').value = '';
  document.getElementById('modalCommuneKh').value = '';
  document.getElementById('modalVillage').value = '';
  document.getElementById('modalVillageKh').value = '';
  document.getElementById('modalLatitude').value = lat;
  document.getElementById('modalLongitude').value = lng;
  document.getElementById('modalBranchId').value = '';

  addLocationModal.style.display = 'flex';
};

function closeLocationModal() {
  addLocationModal.style.display = 'none';
  addLocationForm.reset();
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeLocationModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeLocationModal);

if (addLocationModal) {
  addLocationModal.addEventListener('click', (e) => {
    if (e.target === addLocationModal) {
      closeLocationModal();
    }
  });
}

if (addLocationForm) {
  addLocationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
      market: document.getElementById('modalMarketName').value.trim(),
      market_kh: document.getElementById('modalMarketNameKh').value.trim(),
      province: document.getElementById('modalProvince').value.trim(),
      province_kh: document.getElementById('modalProvinceKh').value.trim(),
      district: document.getElementById('modalDistrict').value.trim(),
      district_kh: document.getElementById('modalDistrictKh').value.trim(),
      commune: document.getElementById('modalCommune').value.trim(),
      commune_kh: document.getElementById('modalCommuneKh').value.trim(),
      village: document.getElementById('modalVillage').value.trim(),
      village_kh: document.getElementById('modalVillageKh').value.trim(),
      latitude: parseFloat(document.getElementById('modalLatitude').value),
      longitude: parseFloat(document.getElementById('modalLongitude').value),
      branch_id: document.getElementById('modalBranchId').value.trim()
    };

    if (!payload.market || isNaN(payload.latitude) || isNaN(payload.longitude)) {
      alert('Name, Latitude, and Longitude are required.');
      return;
    }

    try {
      showState('loading');
      closeLocationModal();
      
      const res = await fetch(`${API}/api/add-market`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save location');
      }

      const resData = await res.json();
      const savedRecord = resData.record;
      
      alert(`Location "${savedRecord.market}" successfully added to routes.json (ID: ${savedRecord.id})!`);
      
      loadStats();

      // Plot and show it on the map
      const selectedLoc = {
        id: savedRecord.id,
        market: savedRecord.market,
        latitude: savedRecord.latitude,
        longitude: savedRecord.longitude,
        province: savedRecord.province,
        district: savedRecord.district,
        google_maps_url: savedRecord.google_maps_url
      };
      
      await selectLocationAndFindNearbyPOs(selectedLoc, [selectedLoc]);
      
    } catch (err) {
      alert(`Error adding location: ${err.message}`);
      showState('none');
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// BULK CSV IMPORT HANDLERS
// ──────────────────────────────────────────────────────────────────
const bulkImportBtn = document.getElementById('bulkImportBtn');
const bulkImportModal = document.getElementById('bulkImportModal');
const bulkImportForm = document.getElementById('bulkImportForm');
const csvTextarea = document.getElementById('csvTextarea');
const importSummary = document.getElementById('importSummary');
const closeBulkModalBtn = document.getElementById('closeBulkModalBtn');
const cancelBulkModalBtn = document.getElementById('cancelBulkModalBtn');

if (bulkImportBtn) {
  bulkImportBtn.addEventListener('click', () => {
    importSummary.style.display = 'none';
    importSummary.innerHTML = '';
    csvTextarea.value = '';
    bulkImportModal.style.display = 'flex';
  });
}

function closeBulkModal() {
  bulkImportModal.style.display = 'none';
  bulkImportForm.reset();
}

if (closeBulkModalBtn) closeBulkModalBtn.addEventListener('click', closeBulkModal);
if (cancelBulkModalBtn) cancelBulkModalBtn.addEventListener('click', closeBulkModal);

if (bulkImportModal) {
  bulkImportModal.addEventListener('click', (e) => {
    if (e.target === bulkImportModal) {
      closeBulkModal();
    }
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  
  // Detect headers
  const firstLine = lines[0].toLowerCase();
  const hasHeaders = firstLine.includes('market') || firstLine.includes('name') || firstLine.includes('latitude') || firstLine.includes('lat');
  
  let headers = ['market', 'province', 'latitude', 'longitude', 'branch_id'];
  let startIndex = 0;
  
  if (hasHeaders) {
    const rawHeaders = splitCSVLine(lines[0]);
    headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
    startIndex = 1;
  }
  
  const results = [];
  for (let i = startIndex; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;
    
    const row = {};
    headers.forEach((header, idx) => {
      let key = header;
      if (header === 'name') key = 'market';
      if (header === 'lat') key = 'latitude';
      if (header === 'lng' || header === 'lon') key = 'longitude';
      if (header === 'branch' || header === 'code') key = 'branch_id';
      
      row[key] = values[idx] ? values[idx].trim() : '';
    });
    
    if (row.market && row.latitude && row.longitude) {
      results.push({
        market: row.market,
        market_kh: row.market_kh || '',
        province: row.province || '',
        province_kh: row.province_kh || '',
        district: row.district || '',
        district_kh: row.district_kh || '',
        commune: row.commune || '',
        commune_kh: row.commune_kh || '',
        village: row.village || '',
        village_kh: row.village_kh || '',
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        branch_id: row.branch_id || 'UNKNOWN'
      });
    }
  }
  return results;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(s => s.replace(/^"|"$/g, '').trim());
}

if (bulkImportForm) {
  bulkImportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const rawCSV = csvTextarea.value.trim();
    if (!rawCSV) return;
    
    const parsedLocations = parseCSV(rawCSV);
    if (parsedLocations.length === 0) {
      alert('Could not parse any valid location records from the CSV. Ensure columns include market, latitude, and longitude.');
      return;
    }

    try {
      importSummary.style.display = 'block';
      importSummary.innerHTML = `<span style="color:#2563eb; font-weight:bold;">⏳ Uploading ${parsedLocations.length} locations to server...</span>`;
      
      const res = await fetch(`${API}/api/bulk-import-markets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ locations: parsedLocations })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to bulk import data');
      }

      const data = await res.json();
      
      // Render summary output
      let skippedHtml = '';
      if (data.skippedCount > 0) {
        const listItems = data.skippedList.slice(0, 5).map(item => `<li><strong>${escHtml(item.name)}</strong>: ${escHtml(item.reason)}</li>`).join('');
        skippedHtml = `
          <div style="margin-top: var(--space-2); color: #9a3412;">
            <strong>Skipped Duplicates (${data.skippedCount}):</strong>
            <ul style="padding-left: 18px; margin-top: 4px; font-size:11px;">
              ${listItems}
              ${data.skippedList.length > 5 ? `<li>...and ${data.skippedList.length - 5} more</li>` : ''}
            </ul>
          </div>
        `;
      }

      importSummary.innerHTML = `
        <div style="color: #15803d; font-weight: bold; font-size:13px; margin-bottom:4px;">✅ Bulk Import Completed!</div>
        <div>Added: <strong>${data.addedCount}</strong> new locations.</div>
        <div>Skipped: <strong>${data.skippedCount}</strong> existing duplicates.</div>
        ${skippedHtml}
        <button type="button" onclick="window.location.reload()" style="margin-top:12px; background:#15803d; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; width:100%;">🔄 Reload Page to Refresh Map</button>
      `;
      
      loadStats();
    } catch (err) {
      importSummary.innerHTML = `<span style="color:#b91c1c; font-weight:bold;">❌ Import Error: ${escHtml(err.message)}</span>`;
    }
  });
}

