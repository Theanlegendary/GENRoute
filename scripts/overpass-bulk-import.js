const fs = require('fs');
const fetch = require('c:/Users/DELL/Downloads/branch/branch-search/node_modules/node-fetch');

// Paths (adjust if your project layout changes)
const DATA_PATH = 'c:/Users/DELL/Downloads/branch/branch-search/data/routes.json';
const BACKUP_PATH = 'c:/Users/DELL/Downloads/branch/branch-search/data/routes.json.bak';
const PROVINCE_LOOKUP_PATH = 'c:/Users/DELL/Downloads/branch/branch-search/data/province_lookup.json';

// Normalisation helpers (same as bulk‑import script)
function normalizeKhmer(str) {
  if (!str) return '';
  let normalized = str.normalize('NFC').toLowerCase().trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, '\u17BE');
  normalized = normalized.replace(/\u17C1\u17B6/g, '\u17C4');
  normalized = normalized.replace(/\u200B/g, '');
  return normalized;
}
const norm = (s) => normalizeKhmer(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Load existing routes and build lookup structures
if (!fs.existsSync(DATA_PATH)) {
  console.error('routes.json not found at', DATA_PATH);
  process.exit(1);
}
const routes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

// Build or load province lookup (maps lower‑cased variants to canonical name)
let provinceLookup = {};
if (fs.existsSync(PROVINCE_LOOKUP_PATH)) {
  provinceLookup = JSON.parse(fs.readFileSync(PROVINCE_LOOKUP_PATH, 'utf-8'));
} else {
  // auto‑generate from existing routes
  routes.forEach(r => {
    if (r.province) {
      const key = r.province.toLowerCase().trim();
      if (!provinceLookup[key]) provinceLookup[key] = r.province;
    }
  });
  fs.writeFileSync(PROVINCE_LOOKUP_PATH, JSON.stringify(provinceLookup, null, 2), 'utf-8');
  console.log('Generated province_lookup.json with', Object.keys(provinceLookup).length, 'entries');
}

// Overpass query – fetch nodes, ways, relations with market tags inside Cambodia
const overpassQuery = `
[out:json][timeout:300];
area["ISO3166-1"="KH"]->.searchArea;
(
  node["amenity"="marketplace"](area.searchArea);
  node["shop"="supermarket"](area.searchArea);
  node["shop"="mall"](area.searchArea);
  way["amenity"="marketplace"](area.searchArea);
  way["shop"="supermarket"](area.searchArea);
  way["shop"="mall"](area.searchArea);
  relation["amenity"="marketplace"](area.searchArea);
  relation["shop"="supermarket"](area.searchArea);
  relation["shop"="mall"](area.searchArea);
);
out center;`;

async function fetchOverpass() {
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery,
      headers: { 'Content-Type': 'text/plain', 'User-Agent': 'MetfoneExpress/1.0' }
    });
    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
    const data = await res.json();
    return data.elements || [];
  } catch (e) {
    console.error('Error fetching Overpass data:', e);
    return [];
  }
}

function toRecord(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'] || tags['name:km'] || '';
  // Province determination – try several possible tags
  let rawProv = tags['addr:province'] || tags['addr:state'] || tags['addr:region'] || '';
  rawProv = rawProv.toLowerCase().trim();
  const province = provinceLookup[rawProv] || rawProv || '';

  // Coordinates – node has lat/lon, ways/relations have center
  let lat = el.lat, lon = el.lon;
  if (el.type !== 'node' && el.center) {
    lat = el.center.lat;
    lon = el.center.lon;
  }
  if (lat === undefined || lon === undefined) return null;

  return {
    osm_id: el.id,
    osm_type: el.type,
    branch_id: '',
    latitude: lat,
    longitude: lon,
    province,
    province_kh: '',
    district: tags['addr:district'] || '',
    district_kh: '',
    commune: tags['addr:city'] || '',
    commune_kh: '',
    village: '',
    village_kh: '',
    market: name,
    market_kh: '',
    google_maps_url: `https://www.google.com/maps?q=${lat},${lon}`
  };
}

(async () => {
  const elements = await fetchOverpass();
  console.log(`Fetched ${elements.length} OSM elements`);

  let added = 0, skipped = 0, failed = 0;
  const existingNames = new Set(routes.map(r => norm(r.market)));
  const coordTolerance = 0.0002; // ≈20 m

  for (const el of elements) {
    const rec = toRecord(el);
    if (!rec) { failed++; continue; }
    if (!rec.market) { failed++; continue; }

    // Duplicate name check
    if (existingNames.has(norm(rec.market))) {
      console.log(`[DUP] ${rec.market}`);
      skipped++;
      continue;
    }

    // Duplicate coordinate check (within tolerance)
    const dupCoord = routes.some(r => {
      return Math.abs(parseFloat(r.latitude) - rec.latitude) < coordTolerance &&
             Math.abs(parseFloat(r.longitude) - rec.longitude) < coordTolerance;
    });
    if (dupCoord) {
      console.log(`[DUPCOORD] ${rec.market}`);
      skipped++;
      continue;
    }

    // Assign a new incremental id
    const nextId = routes.length > 0 ? Math.max(...routes.map(r => r.id || 0)) + 1 : 1;
    rec.id = nextId;
    routes.push(rec);
    existingNames.add(norm(rec.market));
    added++;
    console.log(`[ADDED] ${rec.market}`);
    // Gentle throttling to avoid hitting Overpass too hard (not needed here but keep a tiny pause)
    await new Promise(r => setTimeout(r, 200));
  }

  if (added) {
    fs.copyFileSync(DATA_PATH, BACKUP_PATH);
    fs.writeFileSync(DATA_PATH, JSON.stringify(routes, null, 2), 'utf-8');
    console.log(`\nSaved. Added ${added}, Skipped ${skipped}, Failed ${failed}. Total ${routes.length}`);
  } else {
    console.log(`\nNo additions. Skipped ${skipped}, Failed ${failed}. Total ${routes.length}`);
  }
})();
