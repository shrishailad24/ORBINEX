/**
 * ORBINEX — Historical Satellite Imagery Providers & Comparison Helpers
 * Generates verified XYZ tile templates and dual-temporal comparison pairs.
 */

import { type HistoricalComparisonPair, type SatelliteScene } from './types';
import { searchSatelliteScenes } from './stac-client';

export interface StrategicLocationPreset {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  defaultZoom: number;
  description: string;
  suggestedBeforeDate: string;
  suggestedAfterDate: string;
}

export const STRATEGIC_PRESETS: StrategicLocationPreset[] = [
  {
    id: 'dhubri-assam',
    name: 'Dhubri Riverine Border',
    region: 'Assam',
    country: 'India',
    lat: 26.02,
    lng: 89.98,
    defaultZoom: 13,
    description: 'Brahmaputra riverine chars and rapid cross-border settlement expansion monitoring.',
    suggestedBeforeDate: '2020-01-15',
    suggestedAfterDate: '2024-01-15',
  },
  {
    id: 'bengaluru-urban',
    name: 'Bengaluru Peri-Urban Fringe',
    region: 'Karnataka',
    country: 'India',
    lat: 12.9716,
    lng: 77.5946,
    defaultZoom: 13,
    description: 'Rapid infrastructure expansion, tech corridor sprawl, and lake encroachment tracking.',
    suggestedBeforeDate: '2019-01-15',
    suggestedAfterDate: '2024-01-15',
  },
  {
    id: 'western-ghats',
    name: 'Western Ghats Forest Canopy',
    region: 'Karnataka / Kerala',
    country: 'India',
    lat: 13.50,
    lng: 75.25,
    defaultZoom: 12,
    description: 'Protected biosphere monitoring for forest-cover loss, road cutting, and clearing detection.',
    suggestedBeforeDate: '2020-02-01',
    suggestedAfterDate: '2024-02-01',
  },
  {
    id: 'prayagraj-sangam',
    name: 'Prayagraj Sangam (Maha Kumbh)',
    region: 'Uttar Pradesh',
    country: 'India',
    lat: 25.43,
    lng: 81.88,
    defaultZoom: 13,
    description: 'Riverbank morphological changes and massive temporary settlement infrastructure development.',
    suggestedBeforeDate: '2024-11-01',
    suggestedAfterDate: '2025-01-15',
  },
];

/**
 * Returns a NASA GIBS True-Color XYZ tile URL for a given YYYY-MM-DD date.
 */
export function getGibsTileUrl(date: string): string {
  const cleanDate = date.split('T')[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${cleanDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

/**
 * Returns an ESRI World Imagery Wayback tile URL for a given YYYY-MM-DD date.
 */
export function getWaybackTileUrl(date: string): string {
  const cleanDate = date.split('T')[0];
  return `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/WMTS/1.0.0/default/default/GoogleMapsCompatible/{z}/{y}/{x}?date=${cleanDate}`;
}

/**
 * Builds a dual-date historical satellite comparison pair for any coordinates and dates.
 */
export async function buildHistoricalComparison(
  lat: number,
  lng: number,
  beforeDate: string,
  afterDate: string,
  platform: 'Sentinel-2' | 'Sentinel-1' | 'Landsat' | 'NASA-GIBS' = 'Sentinel-2',
  radiusKm: number = 10,
  bbox?: [number, number, number, number]
): Promise<HistoricalComparisonPair> {
  const cleanBefore = beforeDate.split('T')[0];
  const cleanAfter = afterDate.split('T')[0];

  let beforeScene: SatelliteScene | null = null;
  let afterScene: SatelliteScene | null = null;

  if (platform === 'NASA-GIBS') {
    return {
      locationName: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
      center: { lat, lng },
      zoom: 12,
      before: {
        targetDate: cleanBefore,
        matchedScene: null,
        tileUrl: getGibsTileUrl(cleanBefore),
      },
      after: {
        targetDate: cleanAfter,
        matchedScene: null,
        tileUrl: getGibsTileUrl(cleanAfter),
      },
    };
  }

  // Optical or SAR STAC Search for both dates concurrently
  const [beforeScenes, afterScenes] = await Promise.all([
    searchSatelliteScenes({
      lat,
      lng,
      targetDate: cleanBefore,
      platform,
      radiusKm,
      bbox,
      maxCloudCover: platform === 'Sentinel-1' ? undefined : 25,
      limit: 3,
    }),
    searchSatelliteScenes({
      lat,
      lng,
      targetDate: cleanAfter,
      platform,
      radiusKm,
      bbox,
      maxCloudCover: platform === 'Sentinel-1' ? undefined : 25,
      limit: 3,
    }),
  ]);

  beforeScene = beforeScenes[0] || null;
  afterScene = afterScenes[0] || null;

  return {
    locationName: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
    center: { lat, lng },
    zoom: 13,
    before: {
      targetDate: cleanBefore,
      matchedScene: beforeScene,
      tileUrl: getGibsTileUrl(cleanBefore),
    },
    after: {
      targetDate: cleanAfter,
      matchedScene: afterScene,
      tileUrl: getGibsTileUrl(cleanAfter),
    },
  };
}
