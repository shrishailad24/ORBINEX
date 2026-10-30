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
- Multi-Constellation Satellite Pipeline: Copernicus Sentinel-2 Optical (10m resolution, Level-2A surface reflectance), Sentinel-1 C-Band SAR (Synthetic Aperture Radar, all-weather imaging), NASA GIBS worldview.
- Live Infrastructure Feeds: 17,000+ CCTV surveillance cameras across North America, Europe, and Asia-Pacific; real-time ADS-B flight telemetry, AIS global maritime vessel tracks, and GDELT geopolitical news feeds.
- AOI Interaction: Operators can click "Draw Rectangle" anywhere on the globe to analyze uncatalogued regions with automated reverse geocoding and dual-temporal change detection.`);

  sources.push({
    type: 'system',
    name: 'ORBINEX System Catalogue & Knowledge Base',
    details: 'Copernicus Sentinel-1/2, 17,000+ CCTVs, live AIS & ADS-B feeds',
    timestamp: new Date().toISOString(),
  });

  return {
    contextBlock: contextParts.join('\n\n'),
    sources,
  };
}
