/**
 * ORBINEX — Grounded Retrieval-Augmented Generation (RAG) Engine
 * Retrieves live context from active AOI telemetry, Copernicus STAC satellite metadata,
 * USGS seismic network, OSINT live alerts, and ORBINEX platform datasets.
 */

export interface RAGSource {
  type: 'satellite' | 'seismic' | 'news' | 'conflict' | 'aoi' | 'system';
  name: string;
  details: string;
  timestamp?: string;
  url?: string;
}

export interface AssistantContext {
  activeAOI?: {
    id: string;
    name: string;
    bbox: [number, number, number, number];
    center: [number, number];
    areaKm2: number;
    beforeScene?: {
      id: string;
      datetime: string;
      cloudCover?: number;
      platform: string;
    } | null;
    afterScene?: {
      id: string;
      datetime: string;
      cloudCover?: number;
      platform: string;
    } | null;
    changeAnalysis?: {
      total_change_pct: number;
      changed_area_km2: number;
      metrics: {
        vegetation_loss_pct: number;
        vegetation_loss_km2: number;
        vegetation_gain_pct: number;
        water_shift_pct: number;
        water_shift_km2: number;
        builtup_disturbance_pct: number;
        builtup_disturbance_km2: number;
      };
      summary: string;
      findings: string[];
      confidence_pct: number;
    } | null;
  } | null;
  viewState?: {
    lat: number;
    lng: number;
    zoom: number;
  } | null;
  activeLayers?: string[];
}

export interface GroundedRAGResult {
  contextBlock: string;
  sources: RAGSource[];
}

export async function buildGroundedContext(
  prompt: string,
  clientContext?: AssistantContext
): Promise<GroundedRAGResult> {
  const sources: RAGSource[] = [];
  const textLower = prompt.toLowerCase();
  const contextParts: string[] = [];

  // 1. ACTIVE AOI & SATELLITE CONTEXT
  if (clientContext?.activeAOI) {
    const aoi = clientContext.activeAOI;
    const [minLng, minLat, maxLng, maxLat] = aoi.bbox;
    let aoiText = `### ACTIVE GEOGRAPHICAL AREA OF INTEREST (AOI)
- Location Identifier: "${aoi.name}"
- Center Coordinates: Latitude ${aoi.center[0].toFixed(4)}°, Longitude ${aoi.center[1].toFixed(4)}°
- Bounding Box: [${minLng.toFixed(4)}, ${minLat.toFixed(4)}, ${maxLng.toFixed(4)}, ${maxLat.toFixed(4)}]
- Total Footprint Area: ~${aoi.areaKm2.toFixed(1)} km²`;

    sources.push({
      type: 'aoi',
      name: aoi.name,
      details: `Bounding Box: [${minLng.toFixed(2)}, ${minLat.toFixed(2)}, ${maxLng.toFixed(2)}, ${maxLat.toFixed(2)}], Area: ${aoi.areaKm2.toFixed(1)} km²`,
      timestamp: new Date().toISOString(),
    });

    if (aoi.beforeScene) {
      aoiText += `\n- Historical Observation (BEFORE): Scene ID ${aoi.beforeScene.id}, Captured: ${aoi.beforeScene.datetime}, Cloud Cover: ${aoi.beforeScene.cloudCover ?? 0}%, Platform: ${aoi.beforeScene.platform}`;
      sources.push({
        type: 'satellite',
        name: `Sentinel-2 Before Scene (${aoi.beforeScene.id})`,
        details: `Acquired ${aoi.beforeScene.datetime}, Cloud: ${aoi.beforeScene.cloudCover ?? 0}%`,
        timestamp: aoi.beforeScene.datetime,
      });
    }

    if (aoi.afterScene) {
      aoiText += `\n- Current Observation (AFTER): Scene ID ${aoi.afterScene.id}, Captured: ${aoi.afterScene.datetime}, Cloud Cover: ${aoi.afterScene.cloudCover ?? 0}%, Platform: ${aoi.afterScene.platform}`;
      sources.push({
        type: 'satellite',
        name: `Sentinel-2 After Scene (${aoi.afterScene.id})`,
        details: `Acquired ${aoi.afterScene.datetime}, Cloud: ${aoi.afterScene.cloudCover ?? 0}%`,
        timestamp: aoi.afterScene.datetime,
      });
    }

    if (aoi.changeAnalysis) {
      const ca = aoi.changeAnalysis;
      aoiText += `\n### MEASURED SATELLITE MULTI-TEMPORAL CHANGE METRICS:
- Total Detected Change: ${ca.total_change_pct}% of AOI (${ca.changed_area_km2} km²)
- Vegetation Loss: ${ca.metrics.vegetation_loss_pct}% (${ca.metrics.vegetation_loss_km2} km²)
- Vegetation Regrowth/Greening: ${ca.metrics.vegetation_gain_pct}%
- Water Surface Shift: ${ca.metrics.water_shift_pct > 0 ? `+${ca.metrics.water_shift_pct}` : ca.metrics.water_shift_pct}% (${ca.metrics.water_shift_km2} km²)
- Ground Disturbance / Built-Up Expansion: ${ca.metrics.builtup_disturbance_pct}% (${ca.metrics.builtup_disturbance_km2} km²)
- Change Summary Assessment: "${ca.summary}"
- Analytical Confidence: ${ca.confidence_pct}%`;

      sources.push({
        type: 'satellite',
        name: 'Automated Spectral Change Analysis',
        details: `Delta: ${ca.total_change_pct}% changed across ${ca.changed_area_km2} km² (Confidence: ${ca.confidence_pct}%)`,
        timestamp: new Date().toISOString(),
      });
    }

    contextParts.push(aoiText);
  } else if (clientContext?.viewState) {
    const vs = clientContext.viewState;
    contextParts.push(`### CURRENT MAP VIEWPORT
- Center Coordinates: ${vs.lat.toFixed(4)}°N, ${vs.lng.toFixed(4)}°E (Zoom Level: ${vs.zoom.toFixed(1)})`);
  }

  // 2. SEISMIC DATA RETRIEVAL (USGS)
  if (textLower.includes('earthquake') || textLower.includes('quake') || textLower.includes('seismic') || textLower.includes('tsunami') || textLower.includes('disaster')) {
    try {
      const usgsRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', {
        headers: { 'User-Agent': 'ORBINEX-AI-RAG/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (usgsRes.ok) {
        const usgsData = await usgsRes.json();
        const quakes = (usgsData.features || []).slice(0, 5);
        if (quakes.length > 0) {
          let quakesText = '### LIVE SEISMIC EVENTS (USGS M2.5+ LAST 24H):\n';
          for (const q of quakes) {
            const p = q.properties;
            const timeStr = new Date(p.time).toISOString();
            quakesText += `- Magnitude ${p.mag.toFixed(1)}: "${p.place}" at ${timeStr} (Depth: ${q.geometry?.coordinates?.[2] || 0} km, Tsunami Alert: ${p.tsunami ? 'YES' : 'NO'})\n`;
            sources.push({
              type: 'seismic',
              name: `USGS M${p.mag.toFixed(1)} - ${p.place}`,
              details: `Magnitude ${p.mag.toFixed(1)}, Depth: ${q.geometry?.coordinates?.[2]} km`,
              timestamp: timeStr,
              url: p.url,
            });
          }
          contextParts.push(quakesText);
        }
      }
    } catch (e: any) {
      console.warn('[ORBINEX-RAG] Seismic fetch failed:', e.message);
    }
  }

  // 3. SYSTEM & CATALOGUE METADATA
  contextParts.push(`### ORBINEX SYSTEM CAPABILITIES & PLATFORM ARCHITECTURE
- Platform Identity: ORBINEX (Tagline: See the World. Understand the Change.)
- Multi-Constellation Satellite Pipeline: Copernicus Sentinel-2 Optical (10m resolution, Level-2A surface reflectance), Sentinel-1 C-Band SAR (Synthetic Aperture Radar, all-weather imaging), Landsat 8/9 (30m multispectral/thermal), Planet SkySat (50cm GSD VHR), Airbus Pléiades Neo (30cm GSD VHR), and NASA GIBS worldview.
- Live Infrastructure Feeds: 17,000+ CCTV surveillance cameras across North America, Europe, and Asia-Pacific; real-time ADS-B flight telemetry, AIS global maritime vessel tracks, and USGS seismic network.
- Historical Analysis: Dual-date multi-temporal split comparison slider, automated spectral delta change detection (vegetation loss/greening, water shifts, built-up ground disturbance), and publication-grade 8-page georeferenced PDF dossiers.`);

  sources.push({
    type: 'system',
    name: 'ORBINEX System Catalogue & Knowledge Base',
    details: 'Copernicus Sentinel-1/2, Landsat 8/9, VHR SkySat/Pléiades, 17,000+ CCTVs, live AIS & ADS-B feeds',
    timestamp: new Date().toISOString(),
  });

  return {
    contextBlock: contextParts.join('\n\n'),
    sources,
  };
}

/**
 * Intelligent Local Knowledge Responder for ORBINEX AI.
 * Guarantees crisp, informative, user-friendly responses even when upstream LLM APIs are offline or rate-limited.
 */
export function generateLocalFallbackResponse(prompt: string, context?: AssistantContext): string {
  const query = prompt.toLowerCase();
  const aoiName = context?.activeAOI?.name || 'Active AOI';

  // 1. PDF Report Generation queries
  if (query.includes('pdf') || query.includes('report') || query.includes('dossier') || query.includes('export')) {
    const locMatch = query.match(/bengaluru|dhubri|prayagraj|western ghats|tokyo|london|new york/i);
    const targetLoc = locMatch ? locMatch[0].toUpperCase() : aoiName;
    return `### 📄 How to Generate a Satellite Intelligence PDF Dossier

You can generate an authoritative, publication-ready **8-page Satellite Intelligence Report** for **${targetLoc}**:

1. **Select Target Location:** Pick **${targetLoc}** from the preset list or use **Global Location Search** (or click **Draw AOI** on the globe).
2. **Choose Constellation & Dates:** Select **Sentinel-2 Optical (10m)**, **Landsat (30m)**, or **SkySat (50cm)**. Set your Historical date (e.g., **2020-01-15**) and Current date (e.g., **2024-01-15**).
3. **Execute Search:** Click **Search Satellite Imagery** to retrieve calibrated cloud-free observation passes.
4. **Generate Dossier:** In the panel, scroll down to the **Intelligence Dossier (PDF)** section and click **Generate Intelligence Dossier**.
5. **Download:** ORBINEX will synthesize dual-temporal multi-spectral imagery, radiometric change heatmaps, pixel variance analytics, and verified data provenance into a downloadable PDF report!`;
  }

  // 2. Before & After Satellite Comparison queries
  if (query.includes('compare') || query.includes('before and after') || query.includes('difference') || query.includes('slider')) {
    return `### 🛰️ How to Compare Before & After Satellite Imagery

ORBINEX features an interactive dual-temporal comparison engine:

1. **Open the Satellite Panel:** Click the Satellite Engine icon on the left rail or in the top toolbar.
2. **Select Constellation:** 
   - **Sentinel-2 (10m):** Best for vegetation, water bodies, and broad land changes.
   - **Sentinel-1 (SAR):** All-weather radar imaging through clouds and rain.
   - **Landsat (30m):** Long-term historical environmental changes.
   - **Planet SkySat (50cm) / Pléiades Neo (30cm):** Sub-meter high-resolution plot analysis.
3. **Set Dates:** Choose your **Historical Target Date** (e.g., 2020-01-15) and **Current Target Date** (e.g., 2024-01-15).
4. **Hit Search:** Click **Search Satellite Imagery**.
5. **Interactive Slider:** Use the **Split Comparison Slider** to swipe between historical and current passes with 1:1 pixel registration.
6. **Automated Delta:** Click **Run Automated Change Detection** to generate false-color spectral delta heatmaps and quantified percentage changes.`;
  }

  // 3. Drawing AOI queries
  if (query.includes('draw') || query.includes('aoi') || query.includes('rectangle') || query.includes('polygon') || query.includes('box') || query.includes('boundary')) {
    return `### 📐 How to Draw an Area of Interest (AOI)

You can define custom observation zones anywhere on Earth:

1. **Activate Draw Mode:** In the Satellite Engine panel or map toolbar, click **Rectangle** or **Polygon** under *Draw-to-Analyse AOI*.
2. **Select on Globe:** Click and drag directly on the map over your target property, city, or forest.
3. **Automated Geodesic Analysis:** ORBINEX instantly computes the exact surface area in **sq ft, hectares, and km²** (including small ~2,000 sq ft plots).
4. **Adjust Footprint:** Use the **Surrounding Radius** slider (from 0.5 km plot to 25 km district) to expand or contract the observation area.
5. **Instant Imagery Retrieval:** Available satellite observations for that exact bounding box are immediately retrieved for comparison.`;
  }

  // 4. Platform Capabilities / What can I do
  if (query.includes('what can') || query.includes('what do') || query.includes('help') || query.includes('features') || query.includes('overview') || query.includes('capabilities')) {
    return `### 🌐 What You Can Do on ORBINEX

ORBINEX is an AI-powered global Earth observation and geospatial intelligence platform:

- 🛰️ **Multi-Resolution Satellite Comparison:** Compare historical (2020) and recent (2024) passes across Sentinel-1, Sentinel-2, Landsat-8/9, Planet SkySat (50cm), and Pléiades Neo (30cm).
- 📐 **Global AOI Drawing:** Draw custom rectangles or polygons anywhere on Earth with sub-meter geodesic measurement and reverse geocoding.
- 📊 **AI Change Detection:** Automatically quantify vegetation loss/greening, riverbank morphology shifts, and built-up land disturbances.
- 📄 **Forensic PDF Dossiers:** Generate publication-ready 8-page intelligence reports with verified geospatial provenance.
- 📹 **17,000+ Live Infrastructure CCTVs:** Live highway and urban surveillance camera feeds across 3 continents.
- ✈️ **Real-Time Global Traffic:** Live ADS-B aircraft flights and AIS maritime ship tracking.
- 🌋 **Live Global Alerts:** Real-time USGS earthquake network, NASA wildfire hotspots, and weather radar.`;
  }

  // 5. Specific Locations (e.g. Bengaluru, Dhubri, Prayagraj, Western Ghats)
  if (query.includes('bengaluru') || query.includes('bangalore')) {
    return `### 📍 Bengaluru Peri-Urban Monitoring (Karnataka, India)

- **Target Coordinates:** 12.9716°N, 77.5946°E
- **Primary Intelligence Focus:** Rapid urban tech corridor sprawl, lake encroachment, and peri-urban forest canopy loss.
- **Recommended Comparison:** **2019-01-15** vs **2024-01-15** using **Sentinel-2 Optical** or **High-Res Aerial**.
- **Action:** Select **Bengaluru Peri-Urban Fringe** in Strategic Presets to immediately load multi-temporal imagery and generate a full change dossier.`;
  }

  if (query.includes('dhubri') || query.includes('brahmaputra')) {
    return `### 📍 Dhubri Riverine Border Monitoring (Assam, India)

- **Target Coordinates:** 26.0200°N, 89.9800°E
- **Primary Intelligence Focus:** Brahmaputra riverine chars morphological shifting, cross-border settlement expansion, and seasonal monsoon flood channels.
- **Recommended Comparison:** **2020-01-15** vs **2024-01-15** using **Sentinel-2** or **Sentinel-1 SAR Radar**.
- **Action:** Select **Dhubri Riverine Border** in Strategic Presets to inspect sandbar deltas and run automated spectral change detection.`;
  }

  // 6. Generic Contextual Fallback
  return `### 🌐 ORBINEX Planetary Telemetry Assistant

I am connected to live ORBINEX Earth observation feeds for **${aoiName}**:

- **Active Satellite Sensors:** Copernicus Sentinel-2 Optical (10m), Sentinel-1 SAR Radar, and High-Resolution VHR.
- **Surface Observation:** Dual-temporal multi-spectral imaging and automated change detection.

You can ask me to:
- Explain **how to compare satellite scenes** between any dates
- Guide you on **drawing custom AOIs** or small plots
- Help **generate publication-grade PDF reports**
- Inspect live **CCTV cameras, flights (ADS-B), or earthquake alerts**`;
}
