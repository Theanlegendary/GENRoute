#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DATA_PATH = path.join(__dirname, '..', 'data', 'routes.json');
const BACKUP_PATH = path.join(__dirname, '..', 'data', 'routes.json.bak');

// Bounding box for Cambodia to restrict geocoding results
// Lat: 9.5 to 15.0, Lng: 102.0 to 108.0
const CAMBODIA_BBOX = '102.35,9.90,107.63,14.69';

// Helpers for terminal styling
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

function logInfo(msg) {
  console.log(`${colors.fg.cyan}[INFO]${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.fg.green}✅ ${msg}${colors.reset}`);
}

function logWarning(msg) {
  console.log(`${colors.fg.yellow}⚠️  ${msg}${colors.reset}`);
}

function logError(msg) {
  console.error(`${colors.fg.red}❌ ${msg}${colors.reset}`);
}

// ──────────────────────────────────────────────────────────────────
// GEOGRAPHIC & TEXT HELPERS
// ──────────────────────────────────────────────────────────────────

function normalizeKhmer(str) {
  if (!str) return "";
  let normalized = str.normalize("NFC").toLowerCase().trim();
  normalized = normalized.replace(/\u17C1\u17B8/g, "\u17BE"); // decomposed vowel OE (េី -> ើ)
  normalized = normalized.replace(/\u17C1\u17B6/g, "\u17C4"); // decomposed vowel OO (េា -> ោ)
  normalized = normalized.replace(/\u200B/g, "");             // zero-width space
  return normalized;
}

// ──────────────────────────────────────────────────────────────────
// FREE GEOCODING ENGINES
// ──────────────────────────────────────────────────────────────────

async function queryPhoton(query, limit = 5) {
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=${CAMBODIA_BBOX}&limit=${limit + 5}&lang=en`;
    const photonRes = await fetch(photonUrl, {
      headers: { 'User-Agent': 'MetfoneExpressBranchLocatorBot/1.0' }
    });
    const photonData = await photonRes.json();
    
    if (photonData.features && photonData.features.length > 0) {
      const cambodiaResults = photonData.features
        .filter(f => (f.properties.countrycode || '').toUpperCase() === 'KH')
        .slice(0, limit);
      
      return cambodiaResults.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        name: f.properties.name || query,
        city: f.properties.city || f.properties.county || '',
        province: f.properties.state || '',
        type: f.properties.osm_value || f.properties.type || ''
      }));
    }
  } catch (err) {
    logWarning(`Photon query failed for "${query}": ${err.message}`);
  }
  return [];
}

async function queryNominatim(query, limit = 5) {
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=kh&limit=${limit}`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'MetfoneExpressBranchLocatorBot/1.0 (bot@metfone.com.kh)',
        'Accept-Language': 'en,km'
      }
    });
    const nomData = await nomRes.json();
    return nomData.map(r => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      name: r.name || r.display_name.split(',')[0],
      city: r.address.city || r.address.county || '',
      province: r.address.state || '',
      type: r.type || ''
    }));
  } catch (err) {
    logWarning(`Nominatim query failed for "${query}": ${err.message}`);
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
    
    const checkDefaultCoords = (lat, lng) => {
      const isDefaultPP = Math.abs(lat - 11.57422315) < 0.005 && Math.abs(lng - 104.9264128) < 0.005;
      const queryMentionsPP = query.toLowerCase().includes('phnom') || query.toLowerCase().includes('pp') || query.includes('ភ្នំពេញ');
      return isDefaultPP && !queryMentionsPP;
    };

    if (urlMatch) {
      const lat = parseFloat(urlMatch[1]);
      const lng = parseFloat(urlMatch[2]);
      if (!checkDefaultCoords(lat, lng)) {
        return { lat, lng, name: query, source: 'Google Maps URL Match' };
      }
    }

    const html = await response.text();

    const staticMapMatch = html.match(/center=([-+]?\d+\.\d+)(?:%2C|,)([-+]?\d+\.\d+)/i);
    if (staticMapMatch) {
      const lat = parseFloat(staticMapMatch[1]);
      const lng = parseFloat(staticMapMatch[2]);
      if (!checkDefaultCoords(lat, lng)) {
        return { lat, lng, name: query, source: 'Google Maps Static Map Center' };
      }
    }

    const inlineMatch = html.match(/\/maps\/preview\/place\/[^\/]+\/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
    if (inlineMatch) {
      const lat = parseFloat(inlineMatch[1]);
      const lng = parseFloat(inlineMatch[2]);
      if (!checkDefaultCoords(lat, lng)) {
        return { lat, lng, name: query, source: 'Google Maps Inline URL Match' };
      }
    }
  } catch (err) {
    logWarning(`Google Maps crawl failed for "${query}": ${err.message}`);
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// RESOLVING COORDINATES WITH MULTIPLE ENGINES
// ──────────────────────────────────────────────────────────────────

async function resolveCoords(query, province = '') {
  const searchQuery = province ? `${query}, ${province}, Cambodia` : `${query}, Cambodia`;
  
  // 1. Photon Geocoder
  let results = await queryPhoton(searchQuery, 1);
  if (results && results.length > 0) {
    return { lat: results[0].lat, lng: results[0].lng, source: 'Photon OSM', name: results[0].name };
  }

  // 2. Nominatim Geocoder
  results = await queryNominatim(searchQuery, 1);
  if (results && results.length > 0) {
    return { lat: results[0].lat, lng: results[0].lng, source: 'Nominatim OSM', name: results[0].name };
  }

  // 3. Spelling correction suggestions then Photon/Nominatim
  try {
    const autocompleteUrl = `https://clients1.google.com/complete/search?client=chrome&hl=km&gl=kh&q=${encodeURIComponent(searchQuery)}`;
    const autoRes = await fetch(autocompleteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const autoData = await autoRes.json();
    const suggestions = autoData[1] || [];
    
    for (const sugg of suggestions.slice(0, 3)) {
      if (sugg.toLowerCase() !== searchQuery.toLowerCase()) {
        const photonSugg = await queryPhoton(sugg, 1);
        if (photonSugg && photonSugg.length > 0) {
          return { lat: photonSugg[0].lat, lng: photonSugg[0].lng, source: `Spelling Correction (${sugg}) via Photon`, name: photonSugg[0].name };
        }
        const nomSugg = await queryNominatim(sugg, 1);
        if (nomSugg && nomSugg.length > 0) {
          return { lat: nomSugg[0].lat, lng: nomSugg[0].lng, source: `Spelling Correction (${sugg}) via Nominatim`, name: nomSugg[0].name };
        }
      }
    }
  } catch (err) {
    // Ignore spelling correction fails
  }

  // 4. Last resort: Google Maps HTML Crawler
  const crawled = await crawlGoogleMapsCoords(searchQuery);
  if (crawled) {
    return { lat: crawled.lat, lng: crawled.lng, source: crawled.source || 'Google Maps Crawler', name: query };
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ──────────────────────────────────────────────────────────────────

function loadRoutes() {
  if (!fs.existsSync(DATA_PATH)) {
    logError(`Database file routes.json not found at ${DATA_PATH}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    logError(`Failed to parse routes.json: ${err.message}`);
    process.exit(1);
  }
}

function saveRoutes(routes) {
  try {
    // Keep a backup of the current database before writing
    if (fs.existsSync(DATA_PATH)) {
      fs.copyFileSync(DATA_PATH, BACKUP_PATH);
    }
    
    // Write atomically
    const tempPath = DATA_PATH + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(routes, null, 2), 'utf-8');
    fs.renameSync(tempPath, DATA_PATH);
  } catch (err) {
    logError(`Failed to save database: ${err.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────────────────────────────────
// CLI BOT ACTIONS
// ──────────────────────────────────────────────────────────────────

async function runSearch(query, province = '') {
  logInfo(`Searching Google Maps & OSM for "${query}"${province ? ' in ' + province : ''}...`);
  const result = await resolveCoords(query, province);
  if (result) {
    console.log(`\n${colors.fg.green}${colors.bright}Location Resolved:${colors.reset}`);
    console.log(`  - Query:       ${query}`);
    console.log(`  - Resolved to: ${result.name}`);
    console.log(`  - Latitude:    ${result.lat}`);
    console.log(`  - Longitude:   ${result.lng}`);
    console.log(`  - Source:      ${result.source}`);
    console.log(`  - Google Maps: https://www.google.com/maps?q=${result.lat},${result.lng}\n`);
  } else {
    logError(`Could not resolve coordinates for query: "${query}"`);
  }
}

async function runAdd(marketName, branchId, province) {
  if (!marketName) {
    logError('Please specify a market/location name using --add');
    process.exit(1);
  }

  logInfo(`Adding location: "${marketName}" (Branch: ${branchId || 'N/A'}, Province: ${province || 'Cambodia'})`);
  
  // Search Google Maps first
  const result = await resolveCoords(marketName, province);
  
  let latitude = 0;
  let longitude = 0;
  let mapsUrl = "";
  
  if (result) {
    latitude = result.lat;
    longitude = result.lng;
    mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
    logSuccess(`Resolved coordinates to: ${latitude}, ${longitude} (via ${result.source})`);
  } else {
    logWarning(`Could not find coordinates automatically. Creating record with empty coordinates.`);
  }

  const routes = loadRoutes();
  const nextId = Math.max(...routes.map(r => r.id), 0) + 1;

  const newRecord = {
    id: nextId,
    branch_id: (branchId || "UNKNOWN").toUpperCase(),
    latitude: latitude || null,
    longitude: longitude || null,
    province: province || "",
    province_kh: "", // Optional: filled manually or left blank
    district: "",
    district_kh: "",
    commune: "",
    commune_kh: "",
    village: "",
    village_kh: "",
    market: marketName,
    market_kh: "",
    google_maps_url: mapsUrl || ""
  };

  routes.push(newRecord);
  saveRoutes(routes);
  
  logSuccess(`Added new record (ID: ${nextId}) to routes.json successfully!`);
}

async function runAutoFill() {
  const routes = loadRoutes();
  let count = 0;
  
  // Identify records with missing or empty coordinates
  const missing = routes.filter(r => 
    !r.latitude || !r.longitude || 
    isNaN(parseFloat(r.latitude)) || isNaN(parseFloat(r.longitude)) ||
    parseFloat(r.latitude) === 0 || parseFloat(r.longitude) === 0
  );

  if (missing.length === 0) {
    logSuccess('All routes already have valid coordinates. No auto-fill needed.');
    return;
  }

  logInfo(`Found ${missing.length} routes with missing/zero coordinates. Starting auto-teach...`);

  for (let i = 0; i < missing.length; i++) {
    const record = missing[i];
    const searchQuery = record.market_kh || record.market;
    
    logInfo(`[${i + 1}/${missing.length}] Resolving "${searchQuery}" (Province: ${record.province || 'Cambodia'})...`);
    
    const result = await resolveCoords(searchQuery, record.province);
    
    if (result) {
      // Find item in the main list and update
      const idx = routes.findIndex(r => r.id === record.id);
      if (idx !== -1) {
        routes[idx].latitude = result.lat;
        routes[idx].longitude = result.lng;
        routes[idx].google_maps_url = `https://www.google.com/maps?q=${result.lat},${result.lng}`;
        count++;
        logSuccess(`Updated ${record.market}: [${result.lat}, ${result.lng}] (Source: ${result.source})`);
      }
    } else {
      logWarning(`Could not resolve coordinates for ${record.market}`);
    }

    // Sleep for 1.5 seconds between queries to be polite to free APIs
    if (i < missing.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  if (count > 0) {
    saveRoutes(routes);
    logSuccess(`Auto-teach complete! Successfully updated ${count} records in routes.json`);
  } else {
    logWarning('Could not resolve coordinates for any of the missing records.');
  }
}

async function runWatch(intervalSeconds = 15) {
  logInfo(`Starting Google Maps Teaching Bot in watch mode (scanning every ${intervalSeconds}s)...`);
  logInfo(`Press Ctrl+C to exit. Bot will auto-teach when new empty records appear in routes.json`);
  
  let lastMtime = null;

  setInterval(async () => {
    try {
      if (!fs.existsSync(DATA_PATH)) return;
      
      const stats = fs.statSync(DATA_PATH);
      const mtime = stats.mtimeMs;
      
      // If file has not changed and this isn't the first run, skip
      if (lastMtime && mtime === lastMtime) {
        return;
      }
      
      lastMtime = mtime;
      const routes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      
      const missing = routes.filter(r => 
        !r.latitude || !r.longitude || 
        isNaN(parseFloat(r.latitude)) || isNaN(parseFloat(r.longitude)) ||
        parseFloat(r.latitude) === 0 || parseFloat(r.longitude) === 0
      );

      if (missing.length > 0) {
        logInfo(`[WATCH] Detected ${missing.length} records with missing/empty coordinates.`);
        
        let updatedCount = 0;
        for (let i = 0; i < missing.length; i++) {
          const record = missing[i];
          const searchQuery = record.market_kh || record.market;
          
          logInfo(`[WATCH] Resolving "${searchQuery}" (Province: ${record.province || 'Cambodia'})...`);
          const result = await resolveCoords(searchQuery, record.province);
          
          if (result) {
            const idx = routes.findIndex(r => r.id === record.id);
            if (idx !== -1) {
              routes[idx].latitude = result.lat;
              routes[idx].longitude = result.lng;
              routes[idx].google_maps_url = `https://www.google.com/maps?q=${result.lat},${result.lng}`;
              updatedCount++;
              logSuccess(`[WATCH] Taught location "${record.market}" -> [${result.lat}, ${result.lng}]`);
            }
          } else {
            logWarning(`[WATCH] Failed to resolve coordinates for "${record.market}"`);
          }
          
          // Sleep between checks
          if (i < missing.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        
        if (updatedCount > 0) {
          saveRoutes(routes);
          // Keep mtime up to date to avoid immediately re-triggering
          lastMtime = fs.statSync(DATA_PATH).mtimeMs;
          logSuccess(`[WATCH] Auto-teach complete! Persisted ${updatedCount} locations.`);
        }
      }
    } catch (err) {
      logError(`Error during watch scan: ${err.message}`);
    }
  }, intervalSeconds * 1000);
}

// ──────────────────────────────────────────────────────────────────
// CLI PARSER / ROUTER
// ──────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${colors.bright}Google Maps Learning & Database Teaching Bot (CLI)${colors.reset}

${colors.bright}Usage:${colors.reset}
  node scripts/map-learning-bot.js [options]

${colors.bright}Options:${colors.reset}
  --help, -h          Show this help menu.
  --search "<q>"      Search Google Maps/OSM for a location and show coordinates.
  --add "<name>"      Search Google Maps and add a new record to routes.json.
  --branch "<id>"     (Optional) The Metfone/Express branch ID to assign (used with --add).
  --province "<prov>" (Optional) The province name (used with --add or --search).
  --auto-fill         Scan routes.json for missing/zero coordinates and geocode them.
  --watch             Start in background watch mode. Periodically scans routes.json
                      and automatically resolves empty records when added.
  --interval <sec>    Set the scanning interval for --watch (default: 15 seconds).

${colors.bright}Examples:${colors.reset}
  # Resolve and test a query:
  node scripts/map-learning-bot.js --search "Phsar Chhouk" --province "Battambang"

  # Search and automatically insert a new route record:
  node scripts/map-learning-bot.js --add "Aeon Mall 3" --branch "PP01" --province "Phnom Penh"

  # Find all existing empty coordinate records in database and auto-teach them:
  node scripts/map-learning-bot.js --auto-fill

  # Start the background daemon watch loop:
  node scripts/map-learning-bot.js --watch --interval 10
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Parse arguments
  let searchVal = null;
  let addVal = null;
  let branchVal = null;
  let provinceVal = null;
  let autoFillFlag = false;
  let watchFlag = false;
  let intervalVal = 15;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--search') {
      searchVal = args[i + 1];
      i++;
    } else if (args[i] === '--add') {
      addVal = args[i + 1];
      i++;
    } else if (args[i] === '--branch') {
      branchVal = args[i + 1];
      i++;
    } else if (args[i] === '--province') {
      provinceVal = args[i + 1];
      i++;
    } else if (args[i] === '--auto-fill') {
      autoFillFlag = true;
    } else if (args[i] === '--watch') {
      watchFlag = true;
    } else if (args[i] === '--interval') {
      intervalVal = parseInt(args[i + 1]) || 15;
      i++;
    }
  }

  if (searchVal) {
    await runSearch(searchVal, provinceVal);
  } else if (addVal) {
    await runAdd(addVal, branchVal, provinceVal);
  } else if (autoFillFlag) {
    await runAutoFill();
  } else if (watchFlag) {
    await runWatch(intervalVal);
  } else {
    logError('Invalid arguments. Please use one of the options.');
    printHelp();
  }
}

main().catch(err => {
  logError(`Fatal execution error: ${err.message}`);
  process.exit(1);
});
