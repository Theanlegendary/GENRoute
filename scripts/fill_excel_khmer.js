const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('metfone_addresses_flattened_edit_mapped_compare.xlsx');
const ws1 = wb.Sheets['Sheet1'];
const ws2 = wb.Sheets['Landmarks_Markets'];
const sheet1Data = XLSX.utils.sheet_to_json(ws1);
const sheet2Data = XLSX.utils.sheet_to_json(ws2);

// Province EN -> KH map
const PROV_KH = {
  'Phnom Penh': '\u1797\u17D2\u1793\u17C6\u1796\u17C1\u1789',
  'Banteay Meanchey': '\u1794\u1793\u17D2\u1791\u17B6\u1799\u1798\u17B6\u1793\u1787\u17D0\u1799',
  'Battambang': '\u1794\u17B6\u178F\u17CB\u178A\u17C6\u1794\u1784',
  'Kampong Cham': '\u1780\u17C6\u1796\u1784\u17CB\u1785\u17B6\u1798',
  'Kampong Chhnang': '\u1780\u17C6\u1796\u1784\u17CB\u1786\u17D2\u1793\u17B6\u17C6\u1784',
  'Kampong Speu': '\u1780\u17C6\u1796\u1784\u17CB\u179F\u17D2\u1796\u17BA',
  'Kampong Thom': '\u1780\u17C6\u1796\u1784\u17CB\u1792\u17C6',
  'Kampot': '\u1780\u17C6\u1796\u178F',
  'Kandal': '\u1780\u178E\u17D2\u178F\u17B6\u179B',
  'Kep': '\u1780\u17C2\u1794',
  'Koh Kong': '\u1780\u17C4\u17C7\u1780\u17BB\u1784',
  'Kratie': '\u1780\u17D2\u179A\u1785\u17C1\u17C7',
  'Mondulkiri': '\u1798\u178E\u17D2\u178C\u179B\u1782\u17B8\u179A\u17B8',
  'Oddar Meanchey': '\u17A7\u178F\u17D2\u178F\u179A\u1798\u17B6\u1793\u1787\u17D0\u1799',
  'Pailin': '\u1794\u17C9\u17C3\u179B\u17B7\u1793',
  'Preah Vihear': '\u1796\u17D2\u179A\u17C7\u179C\u17B7\u17A0\u17B6\u179A',
  'Prey Veng': '\u1796\u17D2\u179A\u17C3\u179C\u17C2\u1784',
  'Pursat': '\u1796\u17C4\u1792\u17B7\u17CD\u179F\u17B6\u178F\u17CB',
  'Ratanakiri': '\u179A\u178F\u1793\u1782\u17B8\u179A\u17B8',
  'Siem Reap': '\u179F\u17C0\u1798\u179A\u17B6\u1794',
  'Sihanoukville': '\u1796\u17D2\u179A\u17C7\u179F\u17B8\u17A0\u1793\u17BB',
  'Preah Sihanouk': '\u1796\u17D2\u179A\u17C7\u179F\u17B8\u17A0\u1793\u17BB',
  'Stung Treng': '\u179F\u17D2\u1791\u17B9\u1784\u178F\u17D2\u179A\u17C2\u1784',
  'Svay Rieng': '\u179F\u17D2\u179C\u17B6\u1799\u179A\u17C0\u1784',
  'Takeo': '\u178F\u17B6\u1780\u17C2\u179C',
  'Tboung Khmum': '\u178F\u17D2\u1794\u17BC\u1784\u1783\u17D2\u1798\u17BB\u17C6'
};

// Build district EN -> KH map from NCDD hierarchy
let ncdd = [];
try {
  ncdd = JSON.parse(fs.readFileSync('data/ncdd_hierarchy.json', 'utf8'));
} catch(e) {
  console.log('No NCDD hierarchy file, using pickup branches');
}

const distEnToKh = {};
const provDistToCommKh = {};

if (ncdd.length > 0) {
  // ncdd is array of provinces
  ncdd.forEach(prov => {
    const districts = prov.districts || [];
    districts.forEach(dist => {
      const dEn = (dist.name_en || '').trim();
      const dKh = (dist.name_kh || '').trim();
      if (dEn && dKh) distEnToKh[dEn.toLowerCase()] = dKh;
      
      const communes = dist.communes || [];
      communes.forEach(comm => {
        const cEn = (comm.name_en || '').trim();
        const cKh = (comm.name_kh || '').trim();
        if (cEn && cKh) {
          const key = dEn.toLowerCase() + '|' + cEn.toLowerCase();
          provDistToCommKh[key] = cKh;
        }
      });
    });
  });
}

// Also build from pickup_branches
const pickup = JSON.parse(fs.readFileSync('data/pickup_branches.json', 'utf8'));
pickup.forEach(b => {
  if (b.district_en && b.district_kh) {
    distEnToKh[b.district_en.toLowerCase()] = b.district_kh;
  }
});

// Also from routes
const routes = JSON.parse(fs.readFileSync('data/routes.json', 'utf8'));
routes.forEach(r => {
  if (r.district && r.district_kh) distEnToKh[r.district.toLowerCase()] = r.district_kh;
});

console.log('District EN->KH entries:', Object.keys(distEnToKh).length);

// Now fill the Excel
let filledProvKh = 0, filledDistKh = 0, filledDist = 0;

sheet2Data.forEach(row => {
  // Fill province_name_kh
  if (!row.province_name_kh && row.province_name) {
    const kh = PROV_KH[row.province_name];
    if (kh) {
      row.province_name_kh = kh;
      filledProvKh++;
    }
  }
  
  // Fill district_name_kh
  if (!row.district_name_kh && row.district_name) {
    const kh = distEnToKh[row.district_name.toLowerCase()];
    if (kh) {
      row.district_name_kh = kh;
      filledDistKh++;
    }
  }
  
  // Fill empty district_name from district_name_kh if available
  if (!row.district_name && row.district_name_kh) {
    // reverse lookup
    for (const [en, kh] of Object.entries(distEnToKh)) {
      if (kh === row.district_name_kh) {
        row.district_name = en;
        filledDist++;
        break;
      }
    }
  }
});

console.log('Filled province_name_kh:', filledProvKh);
console.log('Filled district_name_kh:', filledDistKh);
console.log('Filled district_name:', filledDist);

// Check remaining empties
let emptyProvKh = 0, emptyDistKh = 0, emptyDist = 0;
sheet2Data.forEach(row => {
  if (!row.province_name_kh) emptyProvKh++;
  if (!row.district_name_kh) emptyDistKh++;
  if (!row.district_name) emptyDist++;
});
console.log('\nRemaining empty:');
console.log('  province_name_kh:', emptyProvKh);
console.log('  district_name_kh:', emptyDistKh);
console.log('  district_name:', emptyDist);

// Save
const newWs2 = XLSX.utils.json_to_sheet(sheet2Data);
wb.Sheets['Landmarks_Markets'] = newWs2;
XLSX.writeFile(wb, 'metfone_addresses_flattened_edit_mapped_compare.xlsx');
console.log('\nExcel saved!');
