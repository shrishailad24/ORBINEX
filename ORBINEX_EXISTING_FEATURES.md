# ORBINEX — Existing Features & Capabilities Matrix

This document provides a comprehensive inventory of all functional capabilities, layers, data providers, and tools available in the ORBINEX platform prior to Phase 1 extensions.

---

## 1. Intelligence Domains & Layers

| # | Domain / Layer | Data Source / Provider | Refresh Interval | Capabilities & Interactions |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Commercial Aviation** | OpenSky Network | 5 min | Real-time global aircraft positions, flight callsign, altitude, speed, heading, aircraft model, and 3D flight path projection. |
| **2** | **Military Aviation** | OpenSky Network (Mil filtered) | 5 min | Specialized tracking of defense, transport, and reconnaissance military aircraft. |
| **3** | **Private Aviation & Jets** | OpenSky Network | 5 min | Dedicated private jet and general aviation tracking. |
| **4** | **Maritime Intelligence** | AISStream WebSocket & Static Naval DB | Live / On-demand | 39 Tier-1 container and energy ports, 10 strategic maritime chokepoints (Hormuz, Malacca, Suez, Bab el-Mandeb, Panama) with real-time risk ratings. |
| **5** | **Global CCTV Network** | 17,000+ public feeds (TfL, Caltrans, ODOT, THB, etc.) | On-demand / Live | City-scale live camera markers, popup snapshot previews, live HLS video streaming, automated YOLOX vehicle detection. |
| **6** | **Seismic Activity** | USGS Earthquake Hazards API | 15 min | Real-time earthquakes (M2.5+), depth visualization, magnitude color-coding, tectonic fault line proximity. |
| **7** | **Wildfire Monitoring** | NASA FIRMS (VIIRS / MODIS) | 30 min | Active thermal anomalies and global wildfire hotspots. |
| **8** | **Severe Weather & Alerts**| NASA EONET, NOAA/NWS, GDACS | 10 min (SWR) | Extreme storms, volcanic eruptions, tropical cyclones, floods, droughts, and NOAA active weather alerts. |
| **9** | **Live Global News** | 23 international broadcasters, 9 Telegram OSINT channels | 60 sec (SWR) | Geotagged news stories, multi-source verification, video footage links, political lean / geopolitical bloc classification. |
| **10**| **Satellite Tracking** | Celestrak TLEs / Space-Track / SGP4 | 10 min | Real-time 3D orbit simulation, orbital tracks, NORAD ID classification (Military, Weather, Scientific, Starlink), ground pass projections. |
| **11**| **Space Weather** | NOAA Space Weather Prediction Center | 10 min | Solar flare activity, geomagnetic storm indices ($Kp$), solar wind speed, and auroral oval projections. |
| **12**| **Cyber Threat Intel** | CISA KEV, AlienVault OTX, URLhaus | 15 min | Active malware indicators, botnet C2 servers, vulnerability exploits, and port scanning reconnaissance. |
| **13**| **Undersea Cables** | TeleGeography Submarine Cable Map | Static GeoJSON | Global subsea fiber-optic telecommunication cables with landing points and owner details. |
| **14**| **Financial & Energy Markets** | Yahoo Finance v8 | 5 min (SWR) | Global indices (S&P 500, Nasdaq, DAX, Nikkei), defense equities (RTX, LMT, NOC), crude oil (WTI, Brent), precious metals, FX, crypto. |
| **15**| **Sanctions & SDN Tracing**| OpenSanctions (US OFAC SDN Mirror) | In-memory | Instant name, alias, entity, vessel, and cryptocurrency wallet sanctioned status lookup. |

---

## 2. Interactive Analytical Tools

### A. AOI Drawing & Spatial Filtering (`src/components/DrawingToolbar.tsx`)
- **Polygon & Radius Tool:** Users can draw bounding boxes, circles, or arbitrary polygons anywhere on the globe.
- **Entity Discovery:** Automatically tallies all cameras, flights, infrastructure, and historical events falling within the drawn AOI.
- **GeoJSON Export:** Exports selected regions as standard GeoJSON or formatted intelligence dossiers.

### B. Camera Vision AI (`src/components/CameraVision.tsx`)
- **Built-in YOLOX-nano Detector:** Runs client-side in a Web Worker using `onnxruntime-web`.
- **Automated Counting:** Counts cars, buses, trucks, and persons in any camera still frame with bounding box rendering.

### C. Style Studio & Map Themes (`src/components/StyleStudio.tsx`)
- **Switchable Map Aesthetics:**
  - *Dark Matter* (Black/Navy intelligence theme)
  - *Satellite Hybrid* (Photorealistic basemap with vector roads)
  - *Cyber / Radar* (Neon vector lines)
  - *Day / Night Terminator* (Live planetary sunlight line with solar declination)
- **Custom Hue & Accent Tuning:** Allows real-time customization of primary colors, glow strength, and layer opacity.

### D. Recon & OSINT Panel (`src/components/OsintPanel.tsx`)
- **Domain & IP Recon:** DNS resolution, WHOIS records, SSL/TLS certificate chains, BGP prefix lookup.
- **Port Scanner:** Low-latency TCP port availability probe.
- **Username & Leak Check:** Digital footprint analysis across public data breaches.

### E. AI Briefing & Situation Overview (`src/components/AiOverview.tsx`)
- **One-Click Gemini Briefing:** Aggregates current active earthquakes, conflict headlines, market shocks, and high-risk chokepoints into an executive situation briefing using Google Gemini.
