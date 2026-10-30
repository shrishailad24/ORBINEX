# ORBINEX — Technical Architecture Documentation

This document describes the architectural layout, data flow, rendering pipelines, and component hierarchy of the ORBINEX geospatial platform.

---

## 1. System Architecture Overview

```mermaid
flowchart TD
    subgraph Client ["ORBINEX Frontend (Browser / WebGL)"]
        UI["Main HUD & Navigation Drawer"]
        MapEngine["MapLibre GL v6 Engine (GPU)"]
        VisionWorker["Camera Vision Worker (ONNX)"]
        Deduplicator["Client-Side In-Flight Deduplicator"]
    end

    subgraph Server ["Next.js 16 Application Server (Node.js)"]
        APIRouter["API Route Handlers (87 Endpoints)"]
        SWRStore["In-Memory SWR Source Cache"]
        NominatimGateway["Nominatim Rate-Limited Gateway"]
        LocalDiskCache["Disk Snapshot Cache (.cache/)"]
    end

    subgraph ExternalFeeds ["External Intelligence Providers"]
        OpenSky["OpenSky Network (Aviation)"]
        USGS["USGS (Earthquakes)"]
        FIRMS["NASA FIRMS (Fires)"]
        EONET["NASA EONET / NOAA (Weather)"]
        WireFeeds["Wire Services & Telegram OSINT"]
        Celestrak["Celestrak TLEs (Satellites)"]
        Copernicus["Copernicus / Element84 (STAC)"]
        Yahoo["Yahoo Finance (Markets)"]
    end

    UI --> Deduplicator
    Deduplicator --> MapEngine
    Deduplicator --> APIRouter
    MapEngine --> VisionWorker

    APIRouter <--> SWRStore
    APIRouter <--> NominatimGateway
    APIRouter <--> LocalDiskCache

    APIRouter --> OpenSky
    APIRouter --> USGS
    APIRouter --> FIRMS
    APIRouter --> EONET
    APIRouter --> WireFeeds
    APIRouter --> Celestrak
    APIRouter --> Copernicus
    APIRouter --> Yahoo
```

---

## 2. Rendering Pipeline & GPU Offloading

ORBINEX renders large datasets without browser stuttering through a pure WebGL GPU architecture:

1. **MapLibre GL Vector Pipeline:**
   - Map points are never injected into the React DOM tree as `HTMLDivElement` markers.
   - All layers (flights, earthquakes, satellites, CCTV, fires, storm polygons) are declared as MapLibre GeoJSON sources.
   - Data is batched and rendered using GPU vertex shaders (`circle`, `line`, `symbol`, `fill-extrusion`).
2. **Flight Decimation Worker:**
   - Global aviation datasets containing 10,000+ points are decimated by a factor of 10 for commercial flights and factor of 2 for private flights.
3. **CCTV Preview Virtualization:**
   - Snapshot preview cards only bind to the DOM when map zoom is `≥ 13`.
   - Capped at maximum 8 preview tiles and 4 concurrent video decodes.

---

## 3. Data Ingestion & Caching Hierarchy

```mermaid
flowchart LR
    Request["Incoming API Request"] --> HotCache{"In-Memory SWR Store?"}
    HotCache -- "Hit (Fresh)" --> ReturnData["Return Payload (< 1ms)"]
    HotCache -- "Hit (Stale)" --> ServeStale["Serve Stale (< 1ms)"]
    ServeStale --> BackgroundFetch["Async Background Revalidation"]
    HotCache -- "Cold Miss" --> InflightCheck{"In-Flight Deduplication?"}
    InflightCheck -- "Yes" --> SharePromise["Join Existing Upstream Fetch"]
    InflightCheck -- "No" --> UpstreamFetch["Call Upstream API with Strict Timeout"]
    UpstreamFetch --> UpdateCache["Update In-Memory & Disk Cache"]
    UpdateCache --> ReturnData
```

### Caching Layers
1. **L1: Browser Memory / React Ref Deduplication:**
   - In-flight Promise map in `page.tsx` prevents duplicate HTTP requests when multiple components mount.
2. **L2: Node.js In-Memory SWR Cache (`src/lib/sourceCache.ts`):**
   - Configurable TTLs (60s to 30m) with background revalidation.
3. **L3: Persistent Disk Snapshots (`.cache/`):**
   - Stores CCTV indexes and reverse geocode responses so server restarts do not re-query rate-limited upstreams.
4. **L4: Upstream Rate Limiting (`src/lib/nominatim.ts`):**
   - Enforces a 2-second rate-limit gap and strict 1.5s timeout guards.

---

## 4. Component Hierarchy

- **Root Layout (`src/app/layout.tsx`):**
  - Font definitions, metadata headers, theme providers.
- **Main View (`src/app/page.tsx`):**
  - **`OsirisMap.tsx`:** Primary WebGL container, handles layer styling, camera movements, coordinate hooks, and click events.
  - **`GlobalStatusBar.tsx`:** Top telemetry HUD bar.
  - **`LayerPanel.tsx`:** Slide-out drawer with toggles for all 15+ intelligence layers.
  - **`LiveAlerts.tsx`:** Chronological breaking news and high-priority incident feed.
  - **`MarketsPanel.tsx`:** Financial markets and maritime chokepoints overview.
  - **`DrawingToolbar.tsx`:** Spatial AOI drawing and feature filtering.
  - **`CameraViewer.tsx`:** Live CCTV player modal with ONNX object detector.
  - **`AiOverview.tsx`:** Gemini situation analysis modal.
