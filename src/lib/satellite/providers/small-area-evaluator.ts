/**
 * ORBINEX — Small-Area Evaluator & Spatial Resolution Benchmark Engine
 *
 * Mathematically evaluates Area of Interest (AOI) scale, pixel coverage, and analytical
 * viability across satellite sensor resolutions (from 30cm VHR to 30m Landsat).
 */

import { type SmallAreaEvaluation, type ResolutionClass } from './types';

const SQFT_PER_M2 = 10.7639104;
const ACRES_PER_M2 = 0.000247105;

/**
 * Calculates geodesic bounding box dimensions and surface area in square meters.
 * Uses WGS84 meridian distance and latitude-compensated parallel distance.
 */
export function calculateGeodesicArea(bbox: [number, number, number, number]): {
  areaM2: number;
  areaSqFt: number;
  areaAcres: number;
  areaKm2: number;
  widthMeters: number;
  heightMeters: number;
} {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  const avgLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const deltaLng = Math.abs(maxLng - minLng);
  const deltaLat = Math.abs(maxLat - minLat);

  // WGS-84 approximations
  const metersPerDegLat = 111132.95 - 559.82 * Math.cos(2 * avgLatRad) + 1.17 * Math.cos(4 * avgLatRad);
  const metersPerDegLng = 111412.84 * Math.cos(avgLatRad) - 93.5 * Math.cos(3 * avgLatRad);

  const widthMeters = Math.max(1, deltaLng * metersPerDegLng);
  const heightMeters = Math.max(1, deltaLat * metersPerDegLat);
  const areaM2 = widthMeters * heightMeters;

  return {
    areaM2,
    areaSqFt: areaM2 * SQFT_PER_M2,
    areaAcres: areaM2 * ACRES_PER_M2,
    areaKm2: areaM2 / 1_000_000,
    widthMeters,
    heightMeters,
  };
}

/**
 * Classifies GSD into standard geospatial resolution tiers.
 */
export function getResolutionClass(gsdMeters: number): ResolutionClass {
  if (gsdMeters <= 0.4) return 'sub_meter';    // e.g. Pléiades Neo 30cm, WorldView 31cm
  if (gsdMeters <= 1.5) return 'high_res';     // e.g. SkySat 50cm, SPOT 1.5m
  if (gsdMeters <= 15) return 'regional';      // e.g. Sentinel-2 10m, Sentinel-1 10m
  return 'coarse';                             // e.g. Landsat 30m, MODIS 250m
}

/**
 * Evaluates whether an AOI of a given area is suitable for analysis under a specific sensor's GSD.
 * Handles micro-plots (such as 2,000 sq ft / 186 m²) with strict analytical rigor.
 */
export function evaluateAreaSuitability(
  areaM2: number,
  gsdMeters: number,
  sensorName: string
): SmallAreaEvaluation {
  const areaSqFt = areaM2 * SQFT_PER_M2;
  const areaAcres = areaM2 * ACRES_PER_M2;
  const areaKm2 = areaM2 / 1_000_000;
  const isSmallPlot = areaM2 <= 50_000; // <= 0.05 km2 (~12.3 acres)

  const singlePixelAreaM2 = Math.max(0.01, gsdMeters * gsdMeters);
  const pixelsOnAOI = Math.round(areaM2 / singlePixelAreaM2);
  const resolutionTier = getResolutionClass(gsdMeters);

  let suitabilityStatus: 'SUITABLE' | 'MARGINAL' | 'INSUFFICIENT' = 'SUITABLE';
  let suitabilitySummary = '';
  const limitations: string[] = [];

  // 1. Pixel Count Evaluation
  if (pixelsOnAOI < 5) {
    suitabilityStatus = 'INSUFFICIENT';
    suitabilitySummary = `Insufficient resolution (${pixelsOnAOI} px on plot). Plot is sub-pixel scale; internal structures or changes cannot be verified.`;
    limitations.push(
      `Sensor GSD of ${gsdMeters}m produces only ~${pixelsOnAOI} pixels across ${Math.round(areaSqFt).toLocaleString()} sq ft (${Math.round(areaM2)} m²).`,
      'Internal plot changes, roof outlines, and boundary lines are mathematically undetectable.'
    );
  } else if (pixelsOnAOI < 100) {
    suitabilityStatus = 'MARGINAL';
    suitabilitySummary = `Marginal resolution (${pixelsOnAOI} px on plot). Can detect broad regional color or vegetation shifts, but not structural boundaries.`;
    limitations.push(
      `Covers only ~${pixelsOnAOI} pixels. Mixed pixel artifacts will blur boundary edges.`,
      'Small vehicles, footpaths, and individual trees cannot be distinguished.'
    );
  } else {
    suitabilityStatus = 'SUITABLE';
    suitabilitySummary = `High geometric coverage (${pixelsOnAOI.toLocaleString()} px on plot). Suitable for visual inspection and feature extraction.`;
    limitations.push(
      `High spatial density (~${pixelsOnAOI.toLocaleString()} pixels). Footprints, driveways, and land clearing are visually distinct.`
    );
  }

  // 2. Physical & Analytical Disclaimers (Honest Communication Policy)
  limitations.push(
    'Monoscopic satellite imagery cannot verify internal building structural integrity or safety.',
    'Sun illumination angles, building shadows, and tree canopy can conceal surface objects.',
    'Co-registration error between observation dates must remain under 0.5 pixel to prevent false edge changes.'
  );

  if (gsdMeters <= 0.4) {
    limitations.push(
      'Note: 30cm resolution is panchromatic (luminance). Multispectral color bands operate at ~1.2m GSD.'
    );
  }

  return {
    areaM2,
    areaSqFt,
    areaAcres,
    areaKm2,
    isSmallPlot,
    pixelsOnAOI,
    resolutionTier,
    suitabilityStatus,
    suitabilitySummary,
    limitations,
  };
}

/**
 * Computes the percentage of an AOI bounding box that intersects with a scene bounding box.
 */
export function calculateBboxIntersection(
  aoiBbox: [number, number, number, number],
  sceneBbox: [number, number, number, number]
): number {
  const [aMinLng, aMinLat, aMaxLng, aMaxLat] = aoiBbox;
  const [sMinLng, sMinLat, sMaxLng, sMaxLat] = sceneBbox;

  const iMinLng = Math.max(aMinLng, sMinLng);
  const iMinLat = Math.max(aMinLat, sMinLat);
  const iMaxLng = Math.min(aMaxLng, sMaxLng);
  const iMaxLat = Math.min(aMaxLat, sMaxLat);

  if (iMinLng >= iMaxLng || iMinLat >= iMaxLat) {
    return 0; // No intersection
  }

  const aoiArea = Math.max(1e-12, (aMaxLng - aMinLng) * (aMaxLat - aMinLat));
  const intersectArea = (iMaxLng - iMinLng) * (iMaxLat - iMinLat);

  return Math.min(100, Math.round((intersectArea / aoiArea) * 100));
}
