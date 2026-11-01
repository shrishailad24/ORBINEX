/**
 * ORBINEX AI-06 — Satellite Comparison Specifications & Multi-Resolution Engine
 * Handles sensor resolution mappings, GSD asymmetry calculations, and viewport synchronization.
 */

import type { SatellitePlatform, ImageryModality } from './types';

export type ComparisonMode = 'swipe' | 'side-by-side' | 'overlay';

export interface SensorGsdSpec {
  platform: SatellitePlatform | string;
  nativeGsdMeters: number;
  modality: ImageryModality;
  provider: string;
  nominalBandwidth: string;
  tier: 'High-Res Open' | 'Medium-Res Open' | 'Commercial Sub-Meter VHR';
}

/**
 * Canonical sensor GSD and resolution specification registry.
 */
export const SENSOR_SPECS: Record<string, SensorGsdSpec> = {
  'Sentinel-2': {
    platform: 'Sentinel-2',
    nativeGsdMeters: 10.0,
    modality: 'optical',
    provider: 'ESA Copernicus (Element84 STAC)',
    nominalBandwidth: 'VNIR 10m (B2, B3, B4, B8)',
    tier: 'High-Res Open',
  },
  'Sentinel-1': {
    platform: 'Sentinel-1',
    nativeGsdMeters: 10.0,
    modality: 'sar',
    provider: 'ESA Copernicus (C-Band Radar)',
    nominalBandwidth: 'VV / VH Polarized Synthetic Aperture',
    tier: 'High-Res Open',
  },
  'Landsat-8': {
    platform: 'Landsat-8',
    nativeGsdMeters: 30.0,
    modality: 'optical',
    provider: 'USGS / NASA Landsat Program',
    nominalBandwidth: 'Multispectral 30m / Panchromatic 15m',
    tier: 'Medium-Res Open',
  },
  'Landsat-9': {
    platform: 'Landsat-9',
    nativeGsdMeters: 30.0,
    modality: 'optical',
    provider: 'USGS / NASA Landsat Program',
    nominalBandwidth: 'Multispectral 30m / Panchromatic 15m',
    tier: 'Medium-Res Open',
  },
  'Landsat': {
    platform: 'Landsat',
    nativeGsdMeters: 30.0,
    modality: 'optical',
    provider: 'USGS / NASA Landsat Program',
    nominalBandwidth: 'Multispectral 30m / Panchromatic 15m',
    tier: 'Medium-Res Open',
  },
  'SkySat': {
    platform: 'SkySat',
    nativeGsdMeters: 0.50,
    modality: 'optical',
    provider: 'Planet Labs PBC',
    nominalBandwidth: 'Pan-Sharpened 50cm / Video Tasking',
    tier: 'Commercial Sub-Meter VHR',
  },
  'Pléiades Neo': {
    platform: 'Pléiades Neo',
    nativeGsdMeters: 0.30,
    modality: 'optical',
    provider: 'Airbus OneAtlas',
    nominalBandwidth: 'Native Panchromatic 30cm / 1.2m Deep Blue-NIR',
    tier: 'Commercial Sub-Meter VHR',
  },
  'WorldView-3': {
    platform: 'WorldView-3',
    nativeGsdMeters: 0.31,
    modality: 'optical',
    provider: 'Maxar Technologies',
    nominalBandwidth: 'Panchromatic 31cm / 1.24m 8-Band VNIR',
    tier: 'Commercial Sub-Meter VHR',
  },
  'High-Res': {
    platform: 'High-Res',
    nativeGsdMeters: 0.60,
    modality: 'optical',
    provider: 'Esri World Imagery Basemap (Maxar / Earthstar)',
    nominalBandwidth: 'RGB Orthomosaic ~60cm',
    tier: 'Commercial Sub-Meter VHR',
  },
};

/**
 * Resolves sensor specification based on platform name string.
 */
export function getSensorSpec(platformName?: string): SensorGsdSpec {
  if (!platformName) return SENSOR_SPECS['Sentinel-2'];
  const norm = platformName.toLowerCase();
  if (norm.includes('pléiades') || norm.includes('pleiades')) return SENSOR_SPECS['Pléiades Neo'];
  if (norm.includes('skysat') || norm.includes('planet')) return SENSOR_SPECS['SkySat'];
  if (norm.includes('worldview') || norm.includes('maxar')) return SENSOR_SPECS['WorldView-3'];
  if (norm.includes('landsat')) return SENSOR_SPECS['Landsat-8'];
  if (norm.includes('sentinel-1') || norm.includes('sar')) return SENSOR_SPECS['Sentinel-1'];
  if (norm.includes('high-res') || norm.includes('esri') || norm.includes('wayback')) return SENSOR_SPECS['High-Res'];
  return SENSOR_SPECS['Sentinel-2'];
}

export interface ResolutionAsymmetryResult {
  hasAsymmetry: boolean;
  ratio: number;
  beforeGsd: number;
  afterGsd: number;
  higherResEpoch: 'before' | 'after' | 'balanced';
  commonGridGsd: number;
  message: string;
}

/**
 * Computes multi-sensor resolution asymmetry and honest reporting guidance.
 */
export function computeResolutionAsymmetry(
  beforePlatform?: string,
  afterPlatform?: string
): ResolutionAsymmetryResult {
  const specB = getSensorSpec(beforePlatform);
  const specA = getSensorSpec(afterPlatform);

  const bGsd = specB.nativeGsdMeters;
  const aGsd = specA.nativeGsdMeters;

  const ratio = Math.max(bGsd, aGsd) / Math.max(0.001, Math.min(bGsd, aGsd));
  const commonGrid = Math.min(bGsd, aGsd);

  if (Math.abs(bGsd - aGsd) < 0.05) {
    return {
      hasAsymmetry: false,
      ratio: 1.0,
      beforeGsd: bGsd,
      afterGsd: aGsd,
      higherResEpoch: 'balanced',
      commonGridGsd: commonGrid,
      message: `Balanced spatial resolution (${bGsd.toFixed(1)}m GSD across both observation passes).`,
    };
  }

  const higherResEpoch = bGsd < aGsd ? 'before' : 'after';
  const highGsd = higherResEpoch === 'before' ? bGsd : aGsd;
  const lowGsd = higherResEpoch === 'before' ? aGsd : bGsd;
  const highPlatform = higherResEpoch === 'before' ? specB.platform : specA.platform;
  const lowPlatform = higherResEpoch === 'before' ? specA.platform : specB.platform;

  return {
    hasAsymmetry: true,
    ratio: Math.round(ratio * 10) / 10,
    beforeGsd: bGsd,
    afterGsd: aGsd,
    higherResEpoch,
    commonGridGsd: commonGrid,
    message: `Multi-GSD Asymmetry (${ratio.toFixed(1)}×): ${highPlatform} (${highGsd}m) vs ${lowPlatform} (${lowGsd}m). Resampled to common ${commonGrid}m coordinate grid without synthetic interpolation.`,
  };
}

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT_TRANSFORM: ViewportTransform = {
  zoom: 1.0,
  panX: 0,
  panY: 0,
};

/**
 * Clamps pan coordinates based on zoom level to ensure imagery remains bounded in viewport.
 */
export function clampViewportPan(
  panX: number,
  panY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { panX: number; panY: number } {
  if (zoom <= 1.0) {
    return { panX: 0, panY: 0 };
  }
  const maxPanX = (viewportWidth * (zoom - 1)) / 2;
  const maxPanY = (viewportHeight * (zoom - 1)) / 2;
  return {
    panX: Math.max(-maxPanX, Math.min(maxPanX, panX)),
    panY: Math.max(-maxPanY, Math.min(maxPanY, panY)),
  };
}
