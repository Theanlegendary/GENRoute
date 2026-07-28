/**
 * MAP CURATED LANDMARKS & FAMOUS MARKETS WITH PROVINCE_ID & PROVINCE_CODE
 * 
 * Sources:
 *   - data/curated_landmarks.json (118 records)
 *   - data/famous_markets.json (690 records)
 * 
 * Province mapping derived from metfone_addresses_flattened (2).xlsx
 * 
 * Outputs:
 *   1. data/curated_landmarks.json     - Updated with province_id, province_code, province_refs_POSTCODE
 *   2. data/famous_markets.json        - Updated with province_id, province_code, province_refs_POSTCODE
 *   3. metfone_addresses_flattened (2).xlsx - New sheet "Landmarks_Markets" appended
 */

const fs   = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');

// ── Province mapping from metfone_addresses_flattened (2).xlsx ──────────────
// province_name → { province_id, province_code, province_refs_POSTCODE }
const PROVINCE_MAP = {
  'Banteay Meanchey': { province_id: 4025109, province_code: 'BAN', province_refs_POSTCODE: '01' },
  'Battambang':       { province_id: 4025110, province_code: 'BAT', province_refs_POSTCODE: '02' },
  'Kampong Cham':     { province_id: 4025111, province_code: 'CHA', province_refs_POSTCODE: '03' },
  'Kampong Chhnang':  { province_id: 4025112, province_code: 'CHH', province_refs_POSTCODE: '04' },
  'Kampong Speu':     { province_id: 4025113, province_code: 'SPE', province_refs_POSTCODE: '05' },
  'Kampong Thom':     { province_id: 4025114, province_code: 'THO', province_refs_POSTCODE: '06' },
  'Kampot':           { province_id: 4025115, province_code: 'KAM', province_refs_POSTCODE: '07' },
  'Kandal':           { province_id: 4025116, province_code: 'KAN', province_refs_POSTCODE: '08' },
  'Koh Kong':         { province_id: 4025117, province_code: 'KOH', province_refs_POSTCODE: '09' },
  'Kratie':           { province_id: 4025118, province_code: 'KRA', province_refs_POSTCODE: '10' },
  'Mondulkiri':       { province_id: 4025119, province_code: 'MON', province_refs_POSTCODE: '11' },
  'Mondul Kiri':      { province_id: 4025119, province_code: 'MON', province_refs_POSTCODE: '11' },
  'Phnom Penh':       { province_id: 4025120, province_code: 'PNP', province_refs_POSTCODE: '12' },
  'Preah Vihear':     { province_id: 4025121, province_code: 'PRH', province_refs_POSTCODE: '13' },
  'Prey Veng':        { province_id: 4025122, province_code: 'PRE', province_refs_POSTCODE: '14' },
  'Pursat':           { province_id: 4025123, province_code: 'PUR', province_refs_POSTCODE: '15' },
  'Ratanakiri':       { province_id: 4025124, province_code: 'ROT', province_refs_POSTCODE: '16' },
  'Ratanak Kiri':     { province_id: 4025124, province_code: 'ROT', province_refs_POSTCODE: '16' },
  'Siem Reap':        { province_id: 4025125, province_code: 'SIE', province_refs_POSTCODE: '17' },
  'Preah Sihanouk':   { province_id: 4025126, province_code: 'SIH', province_refs_POSTCODE: '18' },
  'Sihanoukville':    { province_id: 4025126, province_code: 'SIH', province_refs_POSTCODE: '18' },
  'Stung Treng':      { province_id: 4025127, province_code: 'STU', province_refs_POSTCODE: '19' },
  'Svay Rieng':       { province_id: 4025128, province_code: 'SVA', province_refs_POSTCODE: '20' },
  'Takeo':            { province_id: 4025129, province_code: 'TAK', province_refs_POSTCODE: '21' },
  'Otdar Meanchey':   { province_id: 4025130, province_code: 'ODD', province_refs_POSTCODE: '22' },
  'Oddar Meanchey':   { province_id: 4025130, province_code: 'ODD', province_refs_POSTCODE: '22' },
  'Kep':              { province_id: 4025131, province_code: 'KEP', province_refs_POSTCODE: '23' },
  'Pailin':           { province_id: 4025132, province_code: 'PAI', province_refs_POSTCODE: '24' },
  'Tboung Khmum':     { province_id: 4025133, province_code: 'TBK', province_refs_POSTCODE: '25' },
};

function getProvince(provinceStr) {
  if (!provinceStr) return null;
  return PROVINCE_MAP[provinceStr] || null;
}

async function run() {
  // ── Step 1: Update curated_landmarks.json ──────────────────────────────
  const clPath = path.join(ROOT, 'data', 'curated_landmarks.json');
  const cl = JSON.parse(fs.readFileSync(clPath, 'utf-8'));
  let clMapped = 0, clMissed = 0;
  const clUpdated = cl.map(item => {
    const prov = getProvince(item.province);
    if (prov) {
      clMapped++;
      return { ...item, province_id: prov.province_id, province_code: prov.province_code, province_refs_POSTCODE: prov.province_refs_POSTCODE };
    } else {
      clMissed++;
      console.warn(`⚠️  LANDMARK no province match: "${item.province}" → ${item.market}`);
      return { ...item, province_id: null, province_code: null, province_refs_POSTCODE: null };
    }
  });
  fs.writeFileSync(clPath, JSON.stringify(clUpdated, null, 2), 'utf-8');
  console.log(`✅ curated_landmarks.json: ${clMapped} mapped, ${clMissed} unmatched`);

  // ── Step 2: Update famous_markets.json ─────────────────────────────────
  const fmPath = path.join(ROOT, 'data', 'famous_markets.json');
  const fm = JSON.parse(fs.readFileSync(fmPath, 'utf-8'));
  let fmMapped = 0, fmMissed = 0;
  const fmUpdated = fm.map(item => {
    const prov = getProvince(item.province);
    if (prov) {
      fmMapped++;
      return { ...item, province_id: prov.province_id, province_code: prov.province_code, province_refs_POSTCODE: prov.province_refs_POSTCODE };
    } else {
      fmMissed++;
      if (item.province) console.warn(`⚠️  MARKET no province match: "${item.province}" → ${item.market}`);
      return { ...item, province_id: null, province_code: null, province_refs_POSTCODE: null };
    }
  });
  fs.writeFileSync(fmPath, JSON.stringify(fmUpdated, null, 2), 'utf-8');
  console.log(`✅ famous_markets.json: ${fmMapped} mapped, ${fmMissed} unmatched`);

  // ── Step 3: Append a new sheet to metfone_addresses_flattened (2).xlsx ─
  const xlsxPath = path.join(ROOT, 'metfone_addresses_flattened (2).xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  // Remove old sheet if exists
  const oldSheet = wb.getWorksheet('Landmarks_Markets');
  if (oldSheet) wb.removeWorksheet(oldSheet.id);

  const ws = wb.addWorksheet('Landmarks_Markets');

  // Set header row
  ws.columns = [
    { header: 'source_type',           key: 'source_type',           width: 18 },
    { header: 'id',                    key: 'id',                    width: 12 },
    { header: 'province_id',           key: 'province_id',           width: 14 },
    { header: 'province_code',         key: 'province_code',         width: 14 },
    { header: 'province_refs_POSTCODE',key: 'province_refs_POSTCODE',width: 20 },
    { header: 'province_name',         key: 'province_name',         width: 22 },
    { header: 'province_name_kh',      key: 'province_name_kh',      width: 22 },
    { header: 'district_name',         key: 'district_name',         width: 22 },
    { header: 'district_name_kh',      key: 'district_name_kh',      width: 22 },
    { header: 'commune_name',          key: 'commune_name',          width: 22 },
    { header: 'commune_name_kh',       key: 'commune_name_kh',       width: 22 },
    { header: 'market_en',             key: 'market_en',             width: 30 },
    { header: 'market_kh',             key: 'market_kh',             width: 30 },
    { header: 'object_type',           key: 'object_type',           width: 16 },
    { header: 'latitude',              key: 'latitude',              width: 14 },
    { header: 'longitude',             key: 'longitude',             width: 14 },
    { header: 'google_maps_url',       key: 'google_maps_url',       width: 50 },
    { header: 'branch_id',             key: 'branch_id',             width: 16 },
    { header: 'confidence',            key: 'confidence',            width: 12 },
    { header: 'is_verified',           key: 'is_verified',           width: 12 },
  ];

  // Style header row
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDA251D' } };

  // Add curated landmarks rows
  for (const item of clUpdated) {
    ws.addRow({
      source_type:            'curated_landmark',
      id:                     item.id,
      province_id:            item.province_id,
      province_code:          item.province_code,
      province_refs_POSTCODE: item.province_refs_POSTCODE,
      province_name:          item.province,
      province_name_kh:       item.province_kh || '',
      district_name:          item.district || '',
      district_name_kh:       item.district_kh || '',
      commune_name:           item.commune || '',
      commune_name_kh:        item.commune_kh || '',
      market_en:              item.market,
      market_kh:              item.market_kh || '',
      object_type:            item.object_type || '',
      latitude:               item.latitude,
      longitude:              item.longitude,
      google_maps_url:        item.google_maps_url || '',
      branch_id:              item.branch_id || '',
      confidence:             item.confidence || 100,
      is_verified:            item.is_verified ? 'TRUE' : 'FALSE',
    });
  }

  // Add famous markets rows
  for (const item of fmUpdated) {
    ws.addRow({
      source_type:            'famous_market',
      id:                     item.id,
      province_id:            item.province_id,
      province_code:          item.province_code,
      province_refs_POSTCODE: item.province_refs_POSTCODE,
      province_name:          item.province || '',
      province_name_kh:       item.province_kh || '',
      district_name:          item.district || '',
      district_name_kh:       item.district_kh || '',
      commune_name:           item.commune || '',
      commune_name_kh:        item.commune_kh || '',
      market_en:              item.market,
      market_kh:              item.market_kh || '',
      object_type:            item.object_type || 'market',
      latitude:               item.latitude,
      longitude:              item.longitude,
      google_maps_url:        item.google_maps_url || '',
      branch_id:              item.branch_id || '',
      confidence:             item.priority_score || item.confidence || '',
      is_verified:            '',
    });
  }

  await wb.xlsx.writeFile(xlsxPath);

  const totalRows = clUpdated.length + fmUpdated.length;
  console.log(`\n✅ metfone_addresses_flattened (2).xlsx → Sheet "Landmarks_Markets" created with ${totalRows} rows`);
  console.log(`   - Curated Landmarks: ${clUpdated.length} rows`);
  console.log(`   - Famous Markets:    ${fmUpdated.length} rows`);
  console.log(`\n✅ ALL DONE!`);
}

run().catch(console.error);
