// overpass-road-import.js
// Updated script to fetch road data from OpenStreetMap for Cambodia using multiple Overpass endpoints.
// Includes fallback logic and a reduced query to improve reliability.

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// List of Overpass API endpoints to try in order.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter'
];

// Simplified Overpass query: fetch highway ways within Cambodia area (ISO KH).
// Excludes relations to reduce size and complexity.
const overpassQuery = `
[out:json][timeout:1200];
area["ISO3166-1"="KH"][admin_level=2];
(
  way["highway"](area);
);
out tags center;`;

async function fetchRoads(endpoint) {
  const url = `${endpoint}?data=${encodeURIComponent(overpassQuery)}`;
  console.log(`Fetching road data from ${endpoint}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function fetchWithFallback() {
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      return await fetchRoads(ep);
    } catch (err) {
      console.warn(`Endpoint ${ep} failed: ${err.message}`);
      // Continue to next endpoint
    }
  }
  throw new Error('All Overpass endpoints failed');
}

function transformToRoads(overpassData) {
  const roads = [];
  const elems = overpassData.elements || [];
  elems.forEach(el => {
    if (!el.tags) return;
    const name = el.tags.name || '';
    const highway = el.tags.highway || '';
    const lat = el.center ? el.center.lat : null;
    const lon = el.center ? el.center.lon : null;
    if (name && lat && lon) {
      roads.push({
        id: el.id,
        name,
        highway,
        lat,
        lon,
        tags: el.tags
      });
    }
  });
  return roads;
}

async function main() {
  try {
    const overpassData = await fetchWithFallback();
    const roads = transformToRoads(overpassData);
    const outPath = path.join(__dirname, '..', 'data', 'osm_roads.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(roads, null, 2), 'utf-8');
    console.log(`✅ Saved ${roads.length} road records to ${outPath}`);
  } catch (err) {
    console.error('❌ Error during road import:', err);
    process.exit(1);
  }
}

main();
