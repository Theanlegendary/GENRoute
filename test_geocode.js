const fetch = require('node-fetch');

async function testGeocodeApproaches(query) {
  console.log(`\n=== Testing: ${query} ===`);
  
  // Approach 1: Photon geocoder (OSM-based, free, better fuzzy search)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=102.3,9.5,108.0,14.7&limit=3&lang=en`;
    const photonRes = await fetch(photonUrl, { headers: { 'User-Agent': 'MetfoneExpressBranchLocator/1.0' } });
    const photonData = await photonRes.json();
    if (photonData.features && photonData.features.length > 0) {
      photonData.features.forEach((f, i) => {
        console.log(`Photon[${i}]: ${f.properties.name || ''} (${f.properties.city || ''}, ${f.properties.state || ''}) -> [${f.geometry.coordinates[1]}, ${f.geometry.coordinates[0]}]`);
      });
    } else {
      console.log('Photon: No results');
    }
  } catch (err) {
    console.log('Photon error:', err.message);
  }
  
  // Approach 2: Nominatim structured search (better than free text)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=kh&limit=3&accept-language=en,km`;
    const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': 'MetfoneExpressBranchLocator/1.0' } });
    const nomData = await nomRes.json();
    if (nomData.length > 0) {
      nomData.forEach((r, i) => {
        console.log(`Nominatim[${i}]: ${r.display_name} -> [${r.lat}, ${r.lon}]`);
      });
    } else {
      console.log('Nominatim: No results');
    }
  } catch (err) {
    console.log('Nominatim error:', err.message);
  }

  // Approach 3: Google Maps internal Places API (embedded in Maps page as data)
  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query + ' Cambodia')}`;
    const res = await fetch(searchUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();
    
    // Try to parse APP_INITIALIZATION_STATE more carefully
    const appInitMatch = html.match(/APP_INITIALIZATION_STATE=(\[\[.*?\]\])\s*;/s);
    if (appInitMatch) {
      try {
        const initArr = JSON.parse(appInitMatch[1]);
        // Format: [[[zoom_value, lng, lat], ...], ...]
        if (initArr[0] && initArr[0][0]) {
          const [_, lng, lat] = initArr[0][0];
          console.log(`Google APP_INIT: [${lat}, ${lng}]`);
        }
      } catch (e) {}
    }
    
    // Try to find place IDs or structured place data
    const placeIdMatch = html.match(/0x[a-f0-9]+:0x[a-f0-9]+/g);
    if (placeIdMatch) {
      console.log('Google place IDs found:', placeIdMatch.length);
    }
    
    // Try the !3d and !4d pattern in the pb parameter (place lat/lng)
    const pbMatch = html.match(/!3d([-\d.]+)!4d([-\d.]+)/);
    if (pbMatch) {
      console.log(`Google pb match: lat=${pbMatch[1]}, lng=${pbMatch[2]}`);
    }
    
    // Try !8m2 data patterns
    const m8Match = html.match(/!8m2!3d([-\d.]+)!4d([-\d.]+)/);
    if (m8Match) {
      console.log(`Google !8m2 match: lat=${m8Match[1]}, lng=${m8Match[2]}`);
    }
  } catch (err) {
    console.log('Google scrape error:', err.message);
  }
}

(async () => {
  await testGeocodeApproaches('ផ្សារបឹងឈូក');
  console.log('\n' + '='.repeat(60));
  await testGeocodeApproaches('Phsar Thmey');
  console.log('\n' + '='.repeat(60));
  await testGeocodeApproaches('ផ្សារដេប៉ូ');
  console.log('\n' + '='.repeat(60));
  await testGeocodeApproaches('Aeon Mall Phnom Penh');
})();
