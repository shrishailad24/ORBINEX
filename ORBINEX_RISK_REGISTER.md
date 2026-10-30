# ORBINEX — Project Risk Register

**Platform:** ORBINEX Global Geospatial Intelligence Platform  
**Document Version:** 1.0.0 (Phase 0 Baseline)  
**Date:** October 31, 2026  
**Status:** Active Governance Document  

---

## 1. Risk Matrix Overview

| Risk ID | Category | Description | Likelihood | Impact | Severity | Mitigation Strategy | Owner |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | **Satellite Data** | Optical imagery unavailable via existing Sentinel-1 SAR catalog | High | High | **CRITICAL** | Implement multispectral Sentinel-2 L2A / Landsat-8 and Planet API connectors in Phase 1 & 2. | Satellite Lead |
| **RSK-02** | **Security / SSRF** | `/api/osint/portscan` and `/api/cctv/proxy` allow user-controlled network targets | Medium | High | **HIGH** | Strict private IP validation (already rejecting RFC 1918), add rate limiting and Analyst-tier API token authentication. | Security Lead |
| **RSK-03** | **API Quota** | Gemini AI endpoints (`/api/ai/*`) are unauthenticated and could exhaust token quota | High | Medium | **HIGH** | Enforce per-session rate limits, in-memory briefing caching, and require user API key or session token. | Backend Lead |
| **RSK-04** | **Upstream Outage** | External providers (OpenSky, USGS, FIRMS, NWS) experience intermittent downtime | High | Medium | **MEDIUM** | Stale-While-Revalidate (SWR) cache pattern already implemented; ensures cached data is served seamlessly during outages. | Architecture |
| **RSK-05** | **Rate Limiting** | Nominatim geocoding bans due to request bursts from multiple clients | Medium | High | **HIGH** | Nominatim gateway in `src/lib/nominatim.ts` throttles to 2s gap, rounds coordinates to 0.1°, and serves 10k LRU cache. | Backend Lead |
| **RSK-06** | **Data Loss** | Accidental overwrite of `.cache/cctv-catalog.json` or `public/data/` | Low | High | **HIGH** | Mark datasets as immutable in Phase guidelines; maintain baseline commits in git. | DevOps |
| **RSK-07** | **Browser Memory** | Excessive GeoJSON layers or concurrent video decodes cause browser tab crash | Medium | Medium | **MEDIUM** | Commercial flights decimated by 10x; CCTV video decodes capped at max 4 concurrent tiles (`CctvPreviews.tsx`). | Frontend Lead |
| **RSK-08** | **Legal / Ethics** | AI misclassifying legal settlements or determining nationality/immigration status | Medium | Critical | **CRITICAL** | Clear project boundary: AI detects measurable *physical geographical changes* only (structures, canopy, roads); no demographic determinations. | Product Lead |

---

## 2. Risk Mitigation Protocols

### Protocol 1: Satellite Change Detection Boundary (RSK-08)
- The AI settlement detection engine (Phase 1) is strictly trained to identify physical objects:
  - Structures (roof footprints, temporary shelters, permanent masonry).
  - Forest and vegetation cover canopy changes ($NDVI$ delta).
  - Roads, cleared paths, and riverbank morphology changes.
- Automated alert text must refer strictly to physical indicators (e.g. *"New structures detected at Lat X, Lng Y between Date A and Date B"*), without speculation on resident nationality or legal status.

### Protocol 2: Upstream Resiliency & Graceful Degradation (RSK-04)
- Every external API integration must be wrapped with:
  1. Strict `AbortSignal.timeout` (maximum 3.5s for real-time layers).
  2. SWR memory caching with `stale-while-revalidate` headers.
  3. Graceful fallback payload so a single downstream failure never renders an empty dashboard.

### Protocol 3: Large Dataset Ingestion Safeguards (RSK-06)
- The 17,000+ camera catalog (`.cache/cctv-catalog.json`) and submarine cables geometry (`public/data/submarine-cables.json`) are critical production assets.
- In-memory updates must be atomic (`fs.writeFile` to temp file before atomic rename) to prevent file truncation during unexpected process exits.
