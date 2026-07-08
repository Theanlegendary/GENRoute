const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const Fuse    = require('fuse.js');
const fetch   = require('node-fetch'); // Import node-fetch for API/Geocoding proxying

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Load data once at startup ──
const DATA_PATH = path.join(__dirname, 'data', 'routes.json');
const PICKUP_DATA_PATH = path.join(__dirname, 'data', 'pickup_branches.json');
let routes = [];
let pickupBranches = [];
let fuse;
let branchFuse;


try {
  routes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  console.log(`✅ Loaded ${routes.length} route records`);
} catch (err) {
  console.error('❌ Failed to load routes.json:', err.message);
}

try {
  if (fs.existsSync(PICKUP_DATA_PATH)) {
    pickupBranches = JSON.parse(fs.readFileSync(PICKUP_DATA_PATH, 'utf-8'));
    console.log(`✅ Loaded ${pickupBranches.length} pickup branch records`);
  } else {
    console.warn('⚠️  pickup_branches.json not found, operating with empty list');
  }
} catch (err) {
  console.error('❌ Failed to load pickup_branches.json:', err.message);
  pickupBranches = [];
}

initializeFuse();

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────

function initializeFuse() {
  fuse = new Fuse(routes, {
    keys: [
      { name: 'market', weight: 0.5 },
      { name: 'market_kh', weight: 0.5 },
      { name: 'province', weight: 0.05 },
      { name: 'province_kh', weight: 0.05 },
      { name: 'district', weight: 0.05 },
      { name: 'district_kh', weight: 0.05 },
      { name: 'commune', weight: 0.02 },
      { name: 'commune_kh', weight: 0.02 },
      { name: 'village', weight: 0.01 },
      { name: 'village_kh', weight: 0.01 }
    ],
    threshold: 0.5
  });

  branchFuse = new Fuse(pickupBranches, {
    keys: [
      { name: 'store_code', weight: 0.3 },
      { name: 'store_name', weight: 0.4 },
      { name: 'district_en', weight: 0.1 },
      { name: 'district_kh', weight: 0.1 },
      { name: 'province_kh', weight: 0.1 },
      { name: 'raw_delivery_store', weight: 0.2 }
    ],
    threshold: 0.5
  });
}


function resolveMarketLocal(q, province = '') {
  if (!fuse) return null;
  let searchResults = fuse.search(q);
  if (province) {
    const normProv = normalizeKhmer(province);
    searchResults = searchResults.filter(res => 
      (res.item.province && normalizeKhmer(res.item.province).includes(normProv)) ||
      (res.item.province_kh && normalizeKhmer(res.item.province_kh).includes(normProv))
    );
  }

  if (searchResults && searchResults.length > 0) {
    return {
      match: searchResults[0].item,
      source: 'local_db_fuzzy'
    };
  }
  
  // fallback exact match
  const normQ = normalizeKhmer(q);
  let exactList = routes;
  if (province) {
    const normProv = normalizeKhmer(province);
    exactList = exactList.filter(r =>
      (r.province && normalizeKhmer(r.province).includes(normProv)) ||
      (r.province_kh && normalizeKhmer(r.province_kh).includes(normProv))
    );
  }
  const exact = exactList.find(r => 
    (r.market && normalizeKhmer(r.market).includes(normQ)) ||
    (r.market_kh && normalizeKhmer(r.market_kh).includes(normQ))
  );
  if (exact) {
    return {
      match: exact,
      source: 'local_db_exact'
    };
  }
  return null;
}


function matchesPickupBranchQuery(branch, q) {
  const normQ = normalizeKhmer(q);
  if (!normQ) return false;

  const fields = [
    branch.store_code,
    branch.store_name,
    branch.province_kh,
    branch.district_en,
    branch.district_kh,
    branch.raw_delivery_store
  ];

  return fields.some(field => {
    if (!field) return false;
    return normalizeKhmer(field).includes(normQ);
  });
}

/** Haversine distance in km between two lat/lng pairs */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PROVINCE_MAP = {
  'phnom penh': 'ភ្នំពេញ',
  'phnom penh capital': 'ភ្នំពេញ',
  'siem reap': 'សៀមរាប',
  'siemreap': 'សៀមរាប',
  'battambang': 'បាត់ដំបង',
  'kampong cham': 'កំពង់ចាម',
  'kampong chhnang': 'កំពង់ឆ្នាំង',
  'kampong speu': 'កំពង់ស្ពឺ',
  'kampong thom': 'កំពង់ធំ',
  'kampot': 'កំពត',
  'kandal': 'កណ្តាល',
  'kep': 'កែប',
  'koh kong': 'កោះកុង',
  'kratie': 'ក្រចេះ',
  'mondul kiri': 'មណ្ឌលគីរី',
  'mondulkiri': 'មណ្ឌលគីរី',
  'oddar meanchey': 'ឧត្តរមានជ័យ',
  'otdar meanchey': 'ឧត្តរមានជ័យ',
  'pailin': 'ប៉ៃលិន',
  'preah sihanouk': 'ព្រះសីហនុ',
  'preah vihear': 'ព្រះវិហារ',
  'prey veng': 'ព្រៃវែង',
  'pursat': 'ពោធិ៍សាត់',
  'ratanak kiri': 'រតនគីរី',
  'ratanakkiri': 'រតនគីរី',
  'stung treng': 'ស្ទឹងត្រែង',
  'svay rieng': 'ស្វាយរៀង',
  'takeo': 'តាកែវ',
  'tboung khmum': 'ត្បូងឃ្មុំ',
  'tboungkhmum': 'ត្បូងឃ្មុំ',
  'banteay meanchey': 'បន្ទាយមានជ័យ'
};

function getKhmerProvince(prov) {
  if (!prov) return '';
  const norm = prov.toLowerCase().trim();
  return PROVINCE_MAP[norm] || prov;
}

/** Find the nearest pickup branch to a coordinate */
function findNearestPickupBranch(lat, lng, maxDist = Infinity, province = '') {
  if (pickupBranches.length === 0) return null;

  let list = pickupBranches;
  if (province) {
    const normProv = normalizeKhmer(getKhmerProvince(province));
    list = list.filter(b => 
      (b.province_kh && normalizeKhmer(b.province_kh).includes(normProv))
    );
  }

  const scored = list
    .map(b => ({ ...b, distance_km: haversine(lat, lng, b.latitude, b.longitude) }))
    .filter(b => b.distance_km <= maxDist)
    .sort((a, b) => a.distance_km - b.distance_km);

  return scored[0] || null;
}

/** Find the nearest market in routes.json to a coordinate */
function findNearestRouteMarket(lat, lng, maxDist = 3.0, province = '') {
  if (routes.length === 0) return null;

  let list = routes;
  if (province) {
    const normProv = normalizeKhmer(province);
    list = list.filter(r => 
      (r.province && normalizeKhmer(r.province).includes(normProv)) ||
      (r.province_kh && normalizeKhmer(r.province_kh).includes(normProv))
    );
  }

  const scored = list
    .map(r => ({ ...r, distance_km: haversine(lat, lng, r.latitude, r.longitude) }))
    .filter(r => r.distance_km <= maxDist)
    .sort((a, b) => a.distance_km - b.distance_km);

  return scored[0] || null;
}



/** Check if a route matches a free-text query (Unicode normalized and case-insensitive) */
function normalizeKhmer(str) {
  if (!str) return "";
  let normalized = str.normalize("NFC").toLowerCase().trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, "\u17BE"); // decomposed vowel OE (េី -> ើ)
  normalized = normalized.replace(/\u17C1\u17B6/g, "\u17C4"); // decomposed vowel OO (េា -> ោ)
  normalized = normalized.replace(/\u200B/g, "");             // zero-width space
  return normalized;
}

function matchesQuery(route, q) {
  const normQ = normalizeKhmer(q);
  if (!normQ) return false;

  const fields = [
    route.branch_id,
    route.province,
    route.province_kh,
    route.district,
    route.district_kh,
    route.commune,
    route.commune_kh,
    route.village,
    route.village_kh,
    route.market,
    route.market_kh
  ];

  return fields.some(field => {
    if (!field) return false;
    return normalizeKhmer(field).includes(normQ);
  });
}


// ──────────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/search
 */
app.get('/api/search', (req, res) => {
  const { q = '', branch_id, province, district, limit = 20, page = 1, type } = req.query;

  let results = [];
  const isMarket = (type === 'market');

  if (isMarket) {
    let dataset = routes;
    
    // Apply province filter first!
    if (province) {
      const normProv = normalizeKhmer(province);
      dataset = dataset.filter(r =>
        normalizeKhmer(r.province).includes(normProv) ||
        normalizeKhmer(r.province_kh).includes(normProv)
      );
    }
    // Apply district filter!
    if (district) {
      const normDist = normalizeKhmer(district);
      dataset = dataset.filter(r =>
        normalizeKhmer(r.district).includes(normDist) ||
        normalizeKhmer(r.district_kh).includes(normDist)
      );
    }
    // Apply branch_id filter!
    if (branch_id) {
      const normBranch = normalizeKhmer(branch_id);
      dataset = dataset.filter(r => normalizeKhmer(r.branch_id) === normBranch);
    }

    // Now search within the filtered dataset!
    if (q.trim()) {
      // Substring/Prefix matches first (high priority)
      const exactMatches = dataset.filter(r => matchesQuery(r, q.trim()));
      
      // Fuzzy matches as fallback
      let fuzzyMatches = [];
      if (exactMatches.length < 15) {
        const tempFuse = new Fuse(dataset, {
          keys: [
            { name: 'market', weight: 0.5 },
            { name: 'market_kh', weight: 0.5 }
          ],
          threshold: 0.5
        });
        fuzzyMatches = tempFuse.search(q.trim()).map(res => res.item);
      }
      
      // Combine and remove duplicates
      const combined = [...exactMatches, ...fuzzyMatches];
      results = Array.from(new Set(combined));

      // Check if this is Phsar Thmey query and prioritize central market
      const isPhsarThmeyQuery = /p[h]?s[h]?ar.*t[h]?me[yi]/i.test(q) || 
                               /p[h]?s[h]?ar.*t[h]?o[m]?.*t[h]?me[yi]/i.test(q) || 
                               /central.*market/i.test(q) || 
                               q.includes('ផ្សារថ្មី') || 
                               q.includes('ផ្សារ ថ្មី') || 
                               q.includes('ផ្សារធំថ្មី') || 
                               q.includes('ផ្សារ ធំ ថ្មី');
      if (isPhsarThmeyQuery) {
        const centralMarketRoute = routes.find(r => r.id === 43);
        if (centralMarketRoute) {
          results = results.filter(r => r.id !== 43);
          results.unshift(centralMarketRoute);
        }
      }
    } else {
      results = dataset;
    }

  } else {
    // Search in pickup branches (Post Offices)
    let dataset = pickupBranches;

    // Apply province filter first!
    if (province) {
      const normProv = normalizeKhmer(getKhmerProvince(province));
      dataset = dataset.filter(b =>
        normalizeKhmer(b.province_kh).includes(normProv)
      );
    }
    // Apply district filter!
    if (district) {
      const normDist = normalizeKhmer(district);
      dataset = dataset.filter(b =>
        normalizeKhmer(b.district_en).includes(normDist) ||
        normalizeKhmer(b.district_kh).includes(normDist)
      );
    }
    // Apply branch_id filter!
    if (branch_id) {
      const normBranch = normalizeKhmer(branch_id);
      dataset = dataset.filter(b =>
        normalizeKhmer(b.store_code) === normBranch ||
        normalizeKhmer(b.raw_delivery_store).includes(normBranch)
      );
    }

    // Now search within the filtered dataset!
    if (q.trim()) {
      // Substring matches first (highly reliable)
      const exactMatches = dataset.filter(b => matchesPickupBranchQuery(b, q.trim()));
      
      // Fuzzy matches as fallback
      let fuzzyMatches = [];
      if (exactMatches.length < 15) {
        const tempFuse = new Fuse(dataset, {
          keys: [
            { name: 'store_code', weight: 0.3 },
            { name: 'store_name', weight: 0.4 },
            { name: 'raw_delivery_store', weight: 0.3 }
          ],
          threshold: 0.5
        });
        fuzzyMatches = tempFuse.search(q.trim()).map(res => res.item);
      }
      
      const combined = [...exactMatches, ...fuzzyMatches];
      results = Array.from(new Set(combined));
    } else {
      results = dataset;
    }

    // Format pickup branch records to match frontend expectations
    results = results.map(r => ({
      id: `po_${r.store_code}`,
      branch_id: r.store_code,
      market: r.store_name,
      market_kh: '',
      province: r.province_kh,
      province_kh: r.province_kh,
      district: r.district_en,
      district_kh: r.district_kh,
      commune: '',
      commune_kh: '',
      village: '',
      village_kh: '',
      latitude: r.latitude,
      longitude: r.longitude,
      google_maps_url: `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
    }));
  }


  // Pagination
  const total      = results.length;
  const pageNum    = Math.max(1, parseInt(page));
  const limitNum   = Math.min(100, Math.max(1, parseInt(limit)));
  const offset     = (pageNum - 1) * limitNum;
  const paginated  = results.slice(offset, offset + limitNum);

  res.json({
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
    results: paginated
  });
});


/**
 * GET /api/branch/:id
 */
app.get('/api/branch/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  const results = routes.filter(r => r.branch_id.toLowerCase() === id);
  if (results.length === 0) {
    return res.status(404).json({ error: `No routes found for branch "${req.params.id}"` });
  }
  res.json({ branch_id: req.params.id.toUpperCase(), count: results.length, routes: results });
});

/**
 * GET /api/nearby
 */
app.get('/api/nearby', (req, res) => {
  const { lat, lng, radius = 10, limit = 20, type, province } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  const latF  = parseFloat(lat);
  const lngF  = parseFloat(lng);
  const radF  = parseFloat(radius);
  const limN  = Math.min(100, parseInt(limit));

  const isMarket = (type === 'market');
  let results = isMarket 
    ? routes.filter(r => r.latitude && r.longitude)
    : pickupBranches.filter(b => b.latitude && b.longitude);

  if (province) {
    const normProv = normalizeKhmer(province);
    results = results.filter(r => {
      const p = isMarket ? r.province : r.province_kh;
      const pKh = isMarket ? r.province_kh : r.province_kh;
      return (p && normalizeKhmer(p).includes(normProv)) || (pKh && normalizeKhmer(pKh).includes(normProv));
    });
  }


  results = results
    .map(r => {
      if (isMarket) {
        return {
          ...r,
          distance_km: Math.round(haversine(latF, lngF, r.latitude, r.longitude) * 100) / 100
        };
      } else {
        return {
          id: `po_${r.store_code}`,
          branch_id: r.store_code,
          market: r.store_name,
          market_kh: '',
          province: r.province_kh,
          province_kh: r.province_kh,
          district: r.district_en,
          district_kh: r.district_kh,
          commune: '',
          commune_kh: '',
          village: '',
          village_kh: '',
          latitude: r.latitude,
          longitude: r.longitude,
          google_maps_url: `https://www.google.com/maps?q=${r.latitude},${r.longitude}`,
          distance_km: Math.round(haversine(latF, lngF, r.latitude, r.longitude) * 100) / 100
        };
      }
    })
    .filter(r => r.distance_km <= radF)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limN);

  res.json({ lat: latF, lng: lngF, radius_km: radF, count: results.length, results });
});


/**
 * GET /api/branches
 */
app.get('/api/branches', (req, res) => {
  const counts = {};
  routes.forEach(r => {
    if (!counts[r.branch_id]) counts[r.branch_id] = 0;
    counts[r.branch_id]++;
  });
  const list = Object.entries(counts)
    .map(([branch_id, count]) => ({ branch_id, count }))
    .sort((a, b) => a.branch_id.localeCompare(b.branch_id));
  res.json({ total: list.length, branches: list });
});

/**
 * GET /api/filters
 */
app.get('/api/filters', (req, res) => {
  const provinces = [...new Set(routes.map(r => r.province).filter(Boolean))].sort();
  const branches = [...new Set(pickupBranches.map(b => b.store_code).filter(Boolean))].sort();
  res.json({
    provinces,
    branches: branches.map(b => ({ branch_id: b, name_en: b }))
  });
});

/**
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  const provinces = [...new Set(routes.map(r => r.province))].filter(Boolean);
  const districts = [...new Set(routes.map(r => r.district))].filter(Boolean);
  const branchSet = [...new Set(routes.map(r => r.branch_id))].filter(Boolean);
  res.json({
    total_routes: routes.length,
    total_branches: branchSet.length,
    total_provinces: provinces.length,
    total_districts: districts.length,
    provinces: provinces.sort()
  });
});

// ──────────────────────────────────────────────────────────────────
// FREE GOOGLE MAPS PROXY ENDPOINTS (NO KEY REQUIRED!)
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/google-autocomplete
 * Proxy Google's public search autocomplete engine
 */
app.get('/api/google-autocomplete', async (req, res) => {
  const { q, province } = req.query;
  if (!q || !q.trim()) return res.json([]);

  const query = q.trim();
  const searchString = province ? `${query}, ${province}, Cambodia` : `${query}, Cambodia`;

  try {
    const url = `https://clients1.google.com/complete/search?client=chrome&hl=km&gl=kh&q=${encodeURIComponent(searchString)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.json();
    
    // Google suggestions format: [query, [sugg1, sugg2, ...]]
    const suggestions = data[1] || [];
    res.json(suggestions);
  } catch (err) {
    console.error('Google Autocomplete Proxy Error:', err.message);
    res.json([]);
  }
});

/**
 * GET /api/google-geocode
 * Free geocoding by crawling Google Maps search page and parsing coordinates
 */
app.get('/api/google-geocode', async (req, res) => {
  const { q, province } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Query parameter q is required' });

  const query = q.trim();
  const coords = await resolveCoordsWithSpellingCorrection(query, province);
  
  if (coords) {
    return res.json(coords);
  }
  
  res.status(404).json({ error: 'Coordinates not found' });
});

async function resolveCoordsWithSpellingCorrection(query, province = '') {
  // 0. Static coordinate overrides for exact Cambodian major landmarks
  const normQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Static override for Ang Tasom (Angtasom / Angk Ta Saom) in Takeo Province
  const isAngtasom = normQuery.includes('angtasom') || 
                     normQuery.includes('angtarsom') || 
                     normQuery.includes('angtasong') || 
                     (normQuery.includes('ang') && normQuery.includes('tasom')) ||
                     normQuery.includes('angktaasom') || 
                     normQuery.includes('angkktasaom') ||
                     query.includes('អង្គតាសោម');
  if (isAngtasom) {
    return {
      lat: 11.0131,
      lng: 104.6732,
      name: "Angk Ta Saom (អង្គតាសោម)"
    };
  }

  const isPP = normQuery.includes('phnompenh') || normQuery.includes('pp') || province.toLowerCase().includes('phnom penh');

  if (isPP) {
    const isPhsarThmey = /p[h]?s[h]?ar.*t[h]?me[yi]/i.test(normQuery) || 
                         normQuery.includes('centralmarket') || 
                         query.includes('ផ្សារធំថ្មី') || 
                         query.includes('ផ្សារថ្មី') || 
                         query.includes('ផ្សារ ថ្មី') || 
                         query.includes('ផ្សារ ធំ ថ្មី');
    if (isPhsarThmey) {
      return {
        lat: 11.5696,
        lng: 104.9211,
        name: "Central Market (ផ្សារធំថ្មី)"
      };
    }
    const isDaeumKor = /p[h]?s[h]?ar.*d[a-z]+m.*ko/i.test(normQuery) || 
                       query.includes('ផ្សារដើមគរ') || 
                       query.includes('ផ្សារ ដើមគរ') || 
                       query.includes('ផ្សារ ដើម គរ');
    if (isDaeumKor) {
      return {
        lat: 11.5538,
        lng: 104.9025,
        name: "Phsar Daeum Kor (ផ្សារដើមគរ)"
      };
    }
  }

  // Build the search query string, restricting strictly to Cambodia
  const searchQuery = province ? `${query}, ${province}, Cambodia` : `${query}, Cambodia`;

  // 1. Try to geocode the query directly using Nominatim (with our high-precision User-Agent)
  let nomResults = await queryNominatim(searchQuery, 5);
  if (nomResults && nomResults.length > 0) {
    // Sort results: prioritize Phnom Penh matches first if no specific province is selected!
    if (!province) {
      nomResults.sort((a, b) => {
        const aPP = (a.display_name || '').toLowerCase().includes('phnom penh');
        const bPP = (b.display_name || '').toLowerCase().includes('phnom penh');
        if (aPP && !bPP) return -1;
        if (!aPP && bPP) return 1;
        return 0;
      });
    }

    if (nomResults.length === 1) {
      return {
        lat: parseFloat(nomResults[0].lat),
        lng: parseFloat(nomResults[0].lon),
        name: query
      };
    } else {
      return {
        type: 'multiple',
        results: nomResults.map((r, idx) => ({
          id: 'target_' + idx + '_' + Date.now(),
          market: r.name || r.display_name.split(',')[0],
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
          province: r.display_name.split(',').slice(0, 3).join(', '),
          district: '',
          google_maps_url: `https://www.google.com/maps?q=${r.lat},${r.lon}`
        }))
      };
    }
  }

  // 2. If it fails, query Google Autocomplete suggestions to get the corrected spelling
  try {
    const autocompleteUrl = `https://clients1.google.com/complete/search?client=chrome&hl=km&gl=kh&q=${encodeURIComponent(searchQuery)}`;
    const autoRes = await fetch(autocompleteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const autoData = await autoRes.json();
    const suggestions = autoData[1] || [];
    
    // Try to geocode the first 6 suggestions
    for (const sugg of suggestions.slice(0, 6)) {
      if (sugg.toLowerCase() !== searchQuery.toLowerCase()) {
        const suggCoords = await queryNominatim(sugg, 1);
        if (suggCoords && suggCoords.length > 0) {
          console.log(`✨ Corrected spelling "${searchQuery}" -> "${sugg}" and geocoded successfully!`);
          return {
            lat: parseFloat(suggCoords[0].lat),
            lng: parseFloat(suggCoords[0].lon),
            name: sugg
          };
        }
      }
    }
  } catch (err) {
    console.error('Spelling correction autocomplete failed:', err.message);
  }

  // 3. Fallback to Google Maps HTML crawler geocoding for the original query
  const coords = await crawlGoogleMapsCoords(searchQuery);
  return coords;
}

async function queryNominatim(query, limit = 1) {
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=kh&limit=${limit}`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'MetfoneExpressBranchLocator/1.0 (contact@metfone.com.kh)',
        'Accept-Language': 'en,km'
      }
    });
    const nomData = await nomRes.json();
    return nomData || [];
  } catch (err) {
    console.error(`Nominatim query failed for "${query}":`, err.message);
  }
  return [];
}

async function crawlGoogleMapsCoords(query) {
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,km;q=0.8'
      }
    });

    const finalUrl = response.url;
    const urlMatch = finalUrl.match(/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
    
    // Helper to check if resolved coordinates are just the default Phnom Penh viewport center
    const checkDefaultCoords = (lat, lng) => {
      const isDefaultPP = Math.abs(lat - 11.57422315) < 0.005 && Math.abs(lng - 104.9264128) < 0.005;
      const queryMentionsPP = query.toLowerCase().includes('phnom') || query.toLowerCase().includes('pp') || query.includes('ភ្នំពេញ');
      return isDefaultPP && !queryMentionsPP;
    };

    if (urlMatch) {
      const lat = parseFloat(urlMatch[1]);
      const lng = parseFloat(urlMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }

    const html = await response.text();

    const staticMapMatch = html.match(/center=([-+]?\d+\.\d+)(?:%2C|,)([-+]?\d+\.\d+)/i);
    if (staticMapMatch) {
      const lat = parseFloat(staticMapMatch[1]);
      const lng = parseFloat(staticMapMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }

    const inlineMatch = html.match(/\/maps\/preview\/place\/[^\/]+\/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
    if (inlineMatch) {
      const lat = parseFloat(inlineMatch[1]);
      const lng = parseFloat(inlineMatch[2]);
      if (checkDefaultCoords(lat, lng)) {
        return null;
      }
      return {
        lat,
        lng,
        name: query
      };
    }
  } catch (err) {
    console.error(`Google maps crawl failed for "${query}":`, err.message);
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// SMART FINDER (LEGACY BACKUP)
// ──────────────────────────────────────────────────────────────────

app.get('/api/smart-find', async (req, res) => {
  const { q = '', max_dist, province } = req.query;
  if (!q.trim()) {
    return res.status(400).json({ error: 'Query q is required' });
  }

  // 1. Try Google Maps Geocoder first to get the most accurate coordinates!
  try {
    const geoCoords = await resolveCoordsWithSpellingCorrection(q.trim(), province);
    if (geoCoords && geoCoords.lat && geoCoords.lng) {
      coords = { lat: geoCoords.lat, lng: geoCoords.lng };
      source = 'google_geocoding';
      
      // Look up if there's a matching market in our routes.json database
      // to extract metadata like district, province, and default assigned branch_id!
      const localResult = resolveMarketLocal(q.trim(), province);
      if (localResult) {
        resolvedMarket = localResult.match;
      } else {
        // If no text match, find the nearest market in routes.json within 3km of Google's coordinates
        const nearestMarket = findNearestRouteMarket(coords.lat, coords.lng, 3.0, province);
        if (nearestMarket) {
          resolvedMarket = nearestMarket;
        } else {
          resolvedMarket = { market: geoCoords.name || q.trim() };
        }
      }
    }
  } catch (err) {
    console.error('Google geocoding failed in smart-find:', err.message);
  }

  // 2. Fallback: Search local database (routes.json) if geocoding fails
  if (!coords) {
    const localResult = resolveMarketLocal(q.trim(), province);
    if (localResult) {
      resolvedMarket = localResult.match;
      coords = { lat: resolvedMarket.latitude, lng: resolvedMarket.longitude };
      source = localResult.source;
    }
  }

  // 3. Fallback: Search saved place cache (geocoding_cache.json)
  if (!coords) {
    try {
      const cachePath = path.join(__dirname, '..', 'geocoding_cache.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const normQ = normalizeKhmer(q.trim());
        const cacheEntry = Object.entries(cache).find(([key, val]) => 
          val.display_name && normalizeKhmer(val.display_name).includes(normQ)
        );
        if (cacheEntry) {
          const [key] = cacheEntry;
          const [lat, lng] = key.split(',').map(Number);
          coords = { lat, lng };
          source = 'cache';
          resolvedMarket = { market: cacheEntry[1].display_name };
        }
      }
    } catch (err) {
      console.error('Cache search error:', err.message);
    }
  }

  if (!coords) {
    return res.status(404).json({ 
      error: 'Location not found in DB, cache, or Geocoding Service.',
      query: q 
    });
  }

  const nearest = findNearestPickupBranch(coords.lat, coords.lng, max_dist ? parseFloat(max_dist) : Infinity, province);

  if (!nearest) {
    return res.status(404).json({ 
      error: 'No pickup branch found within the specified distance.',
      coords,
      source
    });
  }

  let defaultAssignedPO = null;
  if (resolvedMarket && resolvedMarket.branch_id) {
    const branchCode = resolvedMarket.branch_id.toUpperCase();
    const foundBranch = pickupBranches.find(b => b.store_code.toUpperCase() === branchCode);
    if (foundBranch) {
      defaultAssignedPO = {
        id: `po_${foundBranch.store_code}`,
        branch_id: foundBranch.store_code,
        market: foundBranch.store_name,
        province: foundBranch.province_kh,
        district: foundBranch.district_en,
        latitude: foundBranch.latitude,
        longitude: foundBranch.longitude
      };
    }
  }

  res.json({
    query: q,
    resolved_market: resolvedMarket,
    found_coords: coords,
    coords_source: source,
    default_assigned_post_office: defaultAssignedPO,
    nearest_post_office: {
      id: `po_${nearest.store_code}`,
      branch_id: nearest.store_code,
      market: nearest.store_name,
      market_kh: '',
      province: nearest.province_kh,
      province_kh: nearest.province_kh,
      district: nearest.district_en,
      district_kh: nearest.district_kh,
      commune: '',
      commune_kh: '',
      village: '',
      village_kh: '',
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      google_maps_url: `https://www.google.com/maps?q=${nearest.latitude},${nearest.longitude}`,
      distance_km: parseFloat(nearest.distance_km.toFixed(2))
    },
    pickup_branch: {
      branch_id: nearest.raw_delivery_store,
      store_code: nearest.store_code,
      store_name: nearest.store_name,
      province_kh: nearest.province_kh,
      district_en: nearest.district_en,
      district_kh: nearest.district_kh,
      latitude: nearest.latitude,
      longitude: nearest.longitude
    },
    distance_km: parseFloat(nearest.distance_km.toFixed(2))
  });

});

/**
 * POST /api/update-market-coords
 * Update market coordinates and persist to routes.json
 */
app.post('/api/update-market-coords', (req, res) => {
  const { id, latitude, longitude } = req.body;
  if (id == null || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Parameters id, latitude, and longitude are required' });
  }

  // Find the index of the route in our in-memory list
  const idx = routes.findIndex(r => String(r.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: 'Market not found in database' });
  }

  // Update in memory
  routes[idx].latitude = parseFloat(latitude);
  routes[idx].longitude = parseFloat(longitude);
  routes[idx].google_maps_url = `https://www.google.com/maps?q=${latitude},${longitude}`;

  // Persist to routes.json
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(routes, null, 2), 'utf-8');
    console.log(`💾 Persisted market correction for ID ${id}: (${latitude}, ${longitude})`);
    
    // Re-initialize search index
    initializeFuse();
    
    res.json({ success: true, message: 'Market coordinates updated successfully', updated: routes[idx] });
  } catch (err) {
    console.error('Failed to write to routes.json:', err.message);
    res.status(500).json({ error: 'Failed to persist updates to database file' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Branch Search Server running at http://localhost:${PORT}`);
});
