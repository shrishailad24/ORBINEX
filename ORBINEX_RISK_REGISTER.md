# ORBINEX — Project Risk Register
**Platform:** ORBINEX Global Satellite Intelligence Platform  
**Document Version:** 2.0.0 (Multi-Resolution & VHR Baseline)  
**Date:** October 31, 2026  
**Status:** Active Governance Document  

---

## 1. Comprehensive Risk Matrix

| Risk ID | Category | Description | Likelihood | Impact | Severity | Mitigation Strategy | Owner |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-01** | **Satellite Data** | Optical imagery cloudy or unavailable via Sentinel-2 | High | High | **CRITICAL** | Dual-sensor fallback: automatic switch to Sentinel-1 SAR (all-weather radar) and Landsat 8/9. | Satellite Lead |
| **RSK-02** | **Security / SSRF** | User-supplied satellite asset URLs target private networks or cloud metadata | Medium | High | **HIGH** | Strict hostname allowlist (`isAllowedSatelliteUrl`), blocking RFC 1918 private IPs and `169.254.169.254`. | Security Lead |
| **RSK-03** | **API Quota** | Gemini / AI model endpoints exhausted by unauthenticated traffic | High | Medium | **HIGH** | Session-level rate limiting, in-memory SWR caching, and optional user-provided API key. | Backend Lead |
| **RSK-04** | **Upstream Outage**| Element84 STAC, Copernicus, or USGS experiencing downtime | Medium | Medium | **MEDIUM** | Stale-While-Revalidate (SWR) cache pattern and local disk fallback (`.cache/satellite-processed/`). | Architecture |
| **RSK-05** | **Rate Limiting** | Nominatim geocoding throttling or bans | Medium | High | **HIGH** | Nominatim gateway in `src/lib/nominatim.ts` throttles to 2s gap, rounds coordinates, and serves 10k LRU cache. | Backend Lead |
| **RSK-06** | **Data Loss** | Accidental overwrite of `.cache/cctv-catalog.json` or `public/data/` | Low | High | **HIGH** | Mark datasets as immutable in Phase guidelines; maintain baseline commits in git. | DevOps |
| **RSK-07** | **Browser Memory** | Excessive GeoJSON layers or concurrent video decodes cause browser tab crash | Medium | Medium | **MEDIUM** | Commercial flights decimated by 10x; CCTV video decodes capped at max 4 concurrent tiles (`CctvPreviews.tsx`). | Frontend Lead |
| **RSK-08** | **Legal / Ethics** | AI misclassifying legal settlements or determining nationality/immigration status | Medium | Critical | **CRITICAL** | Clear project boundary: AI detects measurable *physical geographical changes* only (structures, canopy, roads); no demographic determinations. | Product Lead |
| **RSK-09** | **VHR Licensing** | Uncontrolled commercial tasking or archive downloads causing budget runaway | High | High | **CRITICAL** | Read-only archive catalogue search by default; explicit confirmation and pricing display before any commercial asset order. | Product Lead |
| **RSK-10** | **Archive Scarcity**| Commercial 30cm imagery unavailable for an arbitrary historical date on a 2,000 sq ft plot | High | Medium | **HIGH** | Enforce **Honest Communication Rule**: Display clear warning when 30cm imagery does not exist; never upscale 10m data to fake high-res. | Satellite Lead |
| **RSK-11** | **Resolution Confusion**| User conflates 30cm panchromatic (greyscale) with 1.2m multispectral color | High | Low | **MEDIUM** | Clear UI telemetry labeling: explicitly distinguish PAN geometric detail from multispectral spectral bands. | UI/UX Lead |
| **RSK-12** | **Hardware Training**| Attempting foundation model training on 16GB RAM / CPU-only development machine | High | High | **HIGH** | Restrict local environment to development, preprocessing, and CPU inference; provision cloud GPU nodes for model training. | AI Lead |

---

## 2. Risk Mitigation Protocols

### Protocol 1: Satellite Change Detection Boundary (RSK-08)
- The AI settlement detection engine is strictly trained to identify physical objects:
  - Structures (roof footprints, temporary shelters, permanent masonry).
  - Forest and vegetation cover canopy changes ($NDVI$ delta).
  - Roads, cleared paths, and riverbank morphology changes.
- Automated alert text must refer strictly to physical indicators (e.g. *"New structures detected at Lat X, Lng Y between Date A and Date B"*), without speculation on resident nationality or legal status.

### Protocol 2: Commercial VHR Purchase & Tasking Guard (RSK-09)
- All commercial satellite integrations (Airbus OneAtlas, Planet Orders, Maxar ARD) operate strictly in **Metadata Discovery Mode** by default.
- Paid raster pixel downloads or satellite tasking orders require multi-step analyst authorization and explicit budget checks.

### Protocol 3: Honest Resolution & Degraded State Notice (RSK-10 & RSK-11)
- If a user selects an area smaller than $50,000\text{ m}^2$ (e.g. 2,000 sq ft) and 30cm VHR imagery is unavailable, the UI must display:
  > *"30 cm VHR archive imagery is not licensed or unavailable for this location on the requested date. Displaying Sentinel-2 (10 m/px) open imagery. Plot resolution is limited to ~2 pixels; internal plot-level change cannot be verified."*
- 10m open imagery must never be artificially supersampled to simulate sub-meter detail.

### Protocol 4: External Hardware Training Governance (RSK-12)
- Local development machines (16GB RAM, CPU-only) are governed strictly for frontend development, STAC querying, raster clipping, and ONNX/SAHI CPU inference.
- Earth-observation foundation model fine-tuning (Prithvi-EO-2.0, TerraMind) must be executed on cloud GPU instances with at least 32–64GB RAM and 24–80GB VRAM (e.g. NVIDIA A100/H100).
