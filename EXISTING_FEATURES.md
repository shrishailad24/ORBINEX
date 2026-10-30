# OSIRIS Existing Features Catalog

This document preserves the catalog of all existing OSIRIS modules and layers to prevent accidental regressions.

## 1. Map & Globe Core
* **3D Globe & 2D Projection Switcher:** Seamless toggle with coordinate preservation and camera memory.
* **Camera Controls:** Free orbit, pitch, bearing, reset north, zoom lock, screenshot capture.
* **Terrain & Elevation:** MapLibre terrain DEM integration with local hillshade.

## 2. Intelligence Layers
* **Aviation:** Commercial, Military, Private Jets, Cargo (OpenSky ADS-B).
* **Maritime:** Global shipping ports, chokepoints, static naval intel, live ship pings.
* **CCTV Network:** 17,000+ public cameras with streaming/snapshots (TfL, WSDOT, Caltrans, Texas DOT, Hong Kong TD, Taiwan THB).
* **Seismic Activity:** USGS Earthquake real-time M2.5+ events with epicenter depth and magnitude rings.
* **Wildfires:** NASA FIRMS hotspot clusters with thermal anomaly detection.
* **Satellites:** Real-time orbit propagation via `satellite.js` and custom WebGL altitude rendering.
* **Conflict Zones:** Curated geopolitical tension zones with linked live international headlines.
* **Global News Streams:** 23 broadcast channels mapped by geographic broadcasting source.
* **Atmospheric:** Radar precipitation and global wind field streamlines.

## 3. Toolkit Panels
* **RECON OSINT:** Port scanner, DNS lookup, WHOIS, SSL inspector, IP intelligence, OFAC SDN sanctions search, Crypto wallet tracer.
* **OI Prediction & Assist:** Multimodal reasoning engine with agentic simulation and tool calling.
* **ArcGIS Importer:** Custom GeoJSON/ESRI feature service loader with dynamic styling.
* **Live Alerts:** Digest of real-time incoming events across all active domains.
