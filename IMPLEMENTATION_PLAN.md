# OSIRIS GeoIntelligence AI — Implementation Plan & Roadmap

## Target: AI Geospatial Intelligence & Settlement Monitoring Platform

### Immediate Milestone 1 & 2 Deliverables:
1. **Location Search & AOI Selection:**
   * Global search with India region prioritization (e.g. *Dhubri, Assam*; *Bengaluru, Karnataka*; *Sonitpur*; custom lat/lng coordinates).
   * Map-click & bounding box AOI drawing.
2. **Real Satellite Imagery Catalog Integration:**
   * Sentinel-2 L2A (10m Optical) & Sentinel-1 GRD (SAR cloud-penetrating radar) querying via Element84 STAC and Copernicus Data Space.
   * High-resolution satellite tile baseline.
3. **Interactive Before/After Satellite Comparison Interface (The 3rd Screenshot Experience):**
   * Side-by-side and interactive vertical curtain swipe divider.
   * Dual-date picker: January 2020/2024 vs January 2024/2026.
   * Synchronized zoom & pan.
4. **AI Change Detection & Land Boundary Verification:**
   * Structure / Shelter footprint detection (GeoJSON overlay).
   * Forest cover loss (NDVI differential).
   * Road / Access route detection.
   * Comparison against official forest reserve boundaries.
   * Evidence dossier with exportable GeoJSON and human verification workflow.

### Preservation Rules:
* All existing OSIRIS 3D globe and 2D layers remain active and untouched.
* All new features are built modularly under `src/components/geointel/`, `src/app/api/geointel/`, and `src/lib/geointel/`.
