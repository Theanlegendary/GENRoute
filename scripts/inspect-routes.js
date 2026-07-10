const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'routes.json');

if (!fs.existsSync(DATA_PATH)) {
  console.error('routes.json not found!');
  process.exit(1);
}

const routes = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
console.log(`Total route records: ${routes.length}`);

let missingCoords = 0;
let defaultCoords = 0;
let invalidBounds = 0;
let okCoords = 0;

// Cambodia bounds roughly:
// Lat: 9.5 to 15.0
// Lng: 102.0 to 108.0
routes.forEach(r => {
  const lat = parseFloat(r.latitude);
  const lng = parseFloat(r.longitude);
  
  if (!r.latitude || !r.longitude || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
    missingCoords++;
  } else if (Math.abs(lat - 11.57422315) < 0.005 && Math.abs(lng - 104.9264128) < 0.005) {
    // Check if it's the default PP center and not in PP
    const isPP = (r.province || '').toLowerCase().includes('phnom') || (r.province_kh || '').includes('ភ្នំពេញ');
    if (!isPP) {
      defaultCoords++;
    } else {
      okCoords++;
    }
  } else if (lat < 9.5 || lat > 15.0 || lng < 102.0 || lng > 108.0) {
    invalidBounds++;
  } else {
    okCoords++;
  }
});

console.log(`- Valid coordinates within Cambodia: ${okCoords}`);
console.log(`- Missing or zero coordinates: ${missingCoords}`);
console.log(`- Default Phnom Penh coordinates on non-Phnom Penh locations: ${defaultCoords}`);
console.log(`- Out of bounds coordinates: ${invalidBounds}`);
