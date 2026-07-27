# 🇰🇭 Metfone Express Grid & Cambodia Address Resolver v3.3

An interactive, high-performance web application, PWA, and API engine for looking up Cambodia Metfone Express Post Office branches, commercial markets, administrative areas (Provinces → Districts → Communes → Villages), and logistics routes.

---

## 📊 1. Master Dataset Specifications (Updated July 25/27, 2026)

The application uses the authoritative master dataset built directly from **`PickupBranches_ALL_PICKUP_25.07_11H54.xlsx`**:

* **Physical Post Offices**: **663 Active Branches** with 100% verified GPS coordinates, district names, province names, and official contact phone numbers.
* **Master Excel Cleaning**:
  * **Purged 44 Non-Location / Internal Entries**: Removed test, training, and vehicle team rows (`BCTEST`, `TRAINING`, `DVCMEGA`, `DVCZ`, `DVCT`) lacking customer store coordinates.
  * **Auto-Fixed Swapped Coordinates**: Corrected inverted latitude/longitude coordinates (`PNPA059`, `PNPA071`, `PNPA072`, `THOA017`).
* **NCDD Administrative Gazetteer**: **16,457 Records** covering 25 Provinces, 209 Districts, 1,634 Communes, and 14,589 Villages.
* **Curated Landmarks & Markets**: **690 Famous Markets, Malls, Boreys, and National Landmarks**.

---

## 📦 2. Project Directory Structure

```
genroute/
├── server.js                      # Node.js Express Backend Server & Address Resolver API Engine
├── package.json                   # Dependencies & Scripts
├── PickupBranches_ALL_PICKUP_25.07_11H54.xlsx  # Official Master Spreadsheet (July 25/27 Release)
├── CLEAN_BRANCHES_FORMATTED.txt   # Formatted 663 pickup branches text export
├── TOP_3_5_NEARBY_LOCATIONS_GOOGLE.txt  # Precomputed 15km nearby post office export
├── BRANCH_DATA_TOP3_5_NEARBY.json # JSON format of 15km nearby post office mappings
├── all_700_branches_keywords_mapped.csv # CSV export of clean physical branch dataset
├── data/                          # 📁 Primary Local Datasets
│   ├── ncdd_hierarchy.json        # 16,457 Official NCDD Administrative Records
│   ├── curated_landmarks.json     # 118 Curated National Landmarks (100% Priority Lock)
│   ├── famous_markets.json        # 690 Famous Markets, Malls, Boreys, Bus Stations
│   ├── pickup_branches.json       # 663 Post Office branches JSON with GPS & phone numbers
│   ├── routes.json                # 895 Delivery Route records
│   └── geocoding_cache.json       # 0ms Instant Cache File
├── public/                        # 📁 Web Application Frontend (HTML, CSS, JS)
│   ├── index.html                 # Main Dashboard Web Page
│   ├── app.js                     # Frontend Map UI & Autocomplete Engine
│   ├── style.css                  # Metfone Express Glassmorphism & Red Theme (#DA251D)
│   ├── pastemaster.html           # Bulk Excel / Address Paste Master Tool
│   ├── pastemaster.js             # Bulk Geocoder Logic
│   └── manifest.json              # PWA App Manifest
├── scripts/
│   ├── rebuild_branches_from_official_excel.js  # Excel Master Parser Script
│   └── regenerate_all_export_files.js          # Export Files Generator Script
└── tests/
    └── test_search_regression.js  # Automated Search Regression Test Suite
```

---

## 🚀 3. Quick Deployment & Setup

### Prerequisites
* **Node.js**: v16.x or higher
* **npm**: v8.x or higher

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Environment Variables (Optional)
Create a `.env` file in the root directory:
```env
PORT=3000
GEMINI_API_KEY=your_optional_gemini_api_key_here
```

### Step 3: Run the Server
```bash
# Start Server in Production Mode
node server.js

# Or run using PM2 for production process management:
pm2 start server.js --name "metfone-express-grid"
```

### Step 4: Access Application & Verify
* **Web UI**: [http://localhost:3000](http://localhost:3000)
* **Bulk Paste Master Tool**: [http://localhost:3000/pastemaster](http://localhost:3000/pastemaster)
* **Address Resolver API**: `GET http://localhost:3000/api/smart-find?q=វត្តភ្នំ`
* **Run Regression Tests**:
```bash
node tests/test_search_regression.js
```

---

## 🔍 4. Key Engine Features & Rules

1. **Strict Province Scoping & NCDD Auto-Sync**:
   * Selecting any District, Commune, or Village automatically syncs the top `provinceSelect` dropdown using NCDD 2-digit province code mapping (e.g., Code `02` → `Battambang`).
   * Enforces the **Province Jumping Penalty rule** so searches in Battambang, Kampong Cham, or Preah Sihanouk never jump cross-province.
2. **Exact Branch & Commune Match Priority**:
   * If a target location matches a branch commune or store name (e.g., `Sandaek` → `CHAA004`), `CHAA004` is automatically floated to the **#1 top spot** in the recommended post office list.
3. **Smooth Touch Map Zoom & Gesture Performance**:
   * Ultra-light boundary viscosity (`maxBoundsViscosity: 0.2`) and sub-pixel zoom steps (`zoomSnap: 0.25`, `zoomDelta: 0.5`).
   * Mobile touch-action CSS (`touch-action: pan-x pan-y pinch-zoom !important;`) for responsive pinch-to-zoom on iOS & Android.
4. **15km Spatial Indexing**:
   * Client-side Haversine formula instantly finds and renders the top 5 nearest post office branches under 15km.
5. **0ms Local Search & Cache Memory**:
   * Auto-saves external geocoded coordinates to `data/geocoding_cache.json` for 0ms future lookups.

---

## 🌐 5. Production Hosting Options
* **Vercel / Render / AWS EC2 / DigitalOcean**:
  * Set **Build Command**: `npm install`
  * Set **Start Command**: `node server.js`
  * Port: `3000` (or `process.env.PORT`)
  * Live Vercel Deployment: [mapmfe-theanlegendarys-projects.vercel.app](https://mapmfe-theanlegendarys-projects.vercel.app)
