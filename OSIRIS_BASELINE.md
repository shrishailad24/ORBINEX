# OSIRIS Baseline Audit & Architecture Verification

**Project Location:** `C:\Users\shash\Downloads\osiris-master\osiris-master`  
**Baseline Git Tag/Branch:** `osiris-pristine-baseline`  
**Active Development Branch:** `feat/geointel-ai`  
**Execution Runtime:** Node.js v24.12.0, npm 11.6.2, Next.js 16.4.3 (Turbopack)  
**Dev Server:** Active at `http://localhost:3000`

---

## 1. System Inventory

### 1.1 Frontend Architecture
* **Framework:** Next.js 16.4.3 App Router with Turbopack & React 19.2.4
* **Mapping Engine:** MapLibre GL 6.7.0 (`react-map-gl` 8.1.1)
  * WebGL GPU-accelerated rendering pipeline
  * Custom 3D altitude-projected satellite layer (`src/lib/satellite-layer.ts`)
  * Custom GPU pick-pass for spacecraft selection
  * Multi-layer source manager handling 30+ GeoJSON dynamic sources (`OsirisMap.tsx`)
* **Styling & Animation:** Tailwind CSS v4, Framer Motion 12.38.0
* **Iconography:** Lucide React 1.14.0
* **Graph & Vision:**
  * `onnxruntime-web` 1.30.0 for client-side neural network execution
  * `react-force-graph-2d` 1.29.1 for entity relationship mapping
  * `satellite.js` 7.0.0 for orbital mechanics & SGP4 propagation

### 1.2 Backend API Services
* **Sentinel & Earth Observation:** `/api/sentinel` queries AWS Element84 STAC (`sentinel-1-grd`, `sentinel-2-l2a`) with fallback to Copernicus Data Space.
* **Geocoding & Reverse Geocoding:** `/api/geosearch`, `/api/geo/reverse` (Nominatim & Photon reverse lookups).
* **Intelligence & OSINT Endpoints:**
  * Flights: `/api/flights` (OpenSky Network)
  * Earthquakes: `/api/earthquakes` (USGS real-time)
  * CCTV: `/api/cctv` (17,000+ public cameras across UK, US, Asia, Europe)
  * Fires: `/api/fires` (NASA FIRMS open CSV)
  * Maritime & AIS: `/api/maritime`, `/api/maritime/ships`
  * Weather & Atmospheric: `/api/weather` (NASA EONET / NOAA)
  * Cyber Threats & Sanctions: `/api/osint/sanctions` (OpenSanctions OFAC SDN)

---

## 2. Integrity Assurance Checklist

- [x] Globe & 2D Map rendering verified at 60fps
- [x] No existing layer code or data points removed
- [x] Git branch `osiris-pristine-baseline` preserved
- [x] Local server confirmed responding on port 3000
