/**
 * ORBINEX — STAC Satellite Discovery Client
 * Queries Earth Search v1 / Copernicus STAC catalogs for Sentinel-2, Sentinel-1, and Landsat.
 * Translates STAC items into verified, displayable SatelliteScene objects with quad coordinates.
 */

import {
  type MapLibreQuadCoordinates,
  type SatellitePlatform,
  type SatelliteScene,
  type STACSearchQuery,
} from './types';
import { pointToBbox, validateBbox } from './security';

const STAC_ENDPOINT = 'https://earth-search.aws.element84.com/v1/search';

/**
 * Converts a bounding box into MapLibre Image Source 4-corner coordinates:
 * [[topLeftLng, topLeftLat], [topRightLng, topRightLat], [bottomRightLng, bottomRightLat], [bottomLeftLng, bottomLeftLat]]
 */
export function bboxToQuadCoordinates(bbox: [number, number, number, number]): MapLibreQuadCoordinates {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    [minLng, maxLat], // Top-Left
    [maxLng, maxLat], // Top-Right
    [maxLng, minLat], // Bottom-Right
    [minLng, minLat], // Bottom-Left
  ];
}

/**
 * Normalizes an S3 URI (s3://bucket/key) into a public HTTPS CDN URL.
 */
export function normalizeAssetHref(href?: string): string {
  if (!href) return '';
  if (href.startsWith('s3://')) {
    const parts = href.replace('s3://', '').split('/');
    const bucket = parts.shift();
    const key = parts.join('/');
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
  return href;
}

/**
 * Maps a STAC feature item to a verified ORBINEX SatelliteScene.
 */
export function parseSTACFeature(feature: any, defaultPlatform?: SatellitePlatform): SatelliteScene | null {
  if (!feature || !feature.id || !feature.bbox) return null;

  const validBbox = validateBbox(feature.bbox);
  if (!validBbox) return null;

  const props = feature.properties || {};
  const collection = feature.collection || '';
  const assets = feature.assets || {};

  let platform: SatellitePlatform = defaultPlatform || 'Sentinel-2';
  if (collection.includes('sentinel-1') || props['sar:instrument_mode']) {
    platform = 'Sentinel-1';
  } else if (collection.includes('landsat')) {
    platform = props.platform?.includes('9') ? 'Landsat-9' : 'Landsat-8';
  }

  const modality = platform === 'Sentinel-1' ? 'sar' : 'optical';

  // Determine thumbnail and visual high-res asset
  let thumbnailUrl = '';
  let visualUrl = '';

  if (platform === 'Sentinel-2') {
    thumbnailUrl = normalizeAssetHref(assets.thumbnail?.href || assets.overview?.href);
    visualUrl = normalizeAssetHref(assets.visual?.href || assets.TCI?.href || thumbnailUrl);
  } else if (platform === 'Sentinel-1') {
    thumbnailUrl = normalizeAssetHref(assets.thumbnail?.href || assets.preview?.href);
    visualUrl = normalizeAssetHref(assets.vv?.href || assets.vh?.href || thumbnailUrl);
  } else {
    // Landsat
    thumbnailUrl = normalizeAssetHref(assets.thumbnail?.href || assets.reduced_resolution_browse?.href);
    visualUrl = normalizeAssetHref(assets.visual?.href || assets.SR_B4?.href || thumbnailUrl);
  }

  const quadCoords = bboxToQuadCoordinates(validBbox);

  return {
    id: feature.id,
    platform,
    modality,
    collection,
    datetime: props.datetime || new Date().toISOString(),
    cloudCover: props['eo:cloud_cover'] != null ? Number(props['eo:cloud_cover'].toFixed(1)) : null,
    bbox: validBbox,
    coordinates: quadCoords,
    thumbnailUrl,
    visualUrl,
    metadata: {
      resolutionMeters: platform === 'Sentinel-2' ? 10 : platform === 'Sentinel-1' ? 10 : 30,
      orbitDirection: props['sat:orbit_state'] || props['sat:orbit_direction'],
      polarization: props['sar:polarizations'],
      instrument: props.instruments?.[0] || props.platform,
      sunElevation: props['view:sun_elevation'],
    },
  };
}

/**
 * Searches STAC catalogs for imagery matching location, date, and cloud criteria.
 */
export async function searchSatelliteScenes(query: STACSearchQuery): Promise<SatelliteScene[]> {
  let bbox = query.bbox;
  if (!bbox && query.lat != null && query.lng != null) {
    bbox = pointToBbox(query.lat, query.lng, query.radiusKm || 15);
  }

  if (!bbox) return [];

  // Determine STAC collections based on requested platform
  const collections: string[] = [];
  if (!query.platform || query.platform === 'all' || query.platform === 'Sentinel-2') {
    collections.push('sentinel-2-l2a');
  }
  if (!query.platform || query.platform === 'all' || query.platform === 'Sentinel-1') {
    collections.push('sentinel-1-grd');
  }
  if (query.platform === 'Landsat-8' || query.platform === 'Landsat-9' || query.platform === 'Landsat') {
    collections.push('landsat-c2-l2');
  }

  // Construct datetime filter
  let datetime: string | undefined;
  if (query.startDate && query.endDate) {
    datetime = `${query.startDate}T00:00:00Z/${query.endDate}T23:59:59Z`;
  } else if (query.targetDate) {
    const target = new Date(query.targetDate);
    const windowDays = 45; // 45-day window to maximize finding cloud-free scenes
    const from = new Date(target.getTime() - windowDays * 86400000).toISOString().split('T')[0];
    const to = new Date(target.getTime() + windowDays * 86400000).toISOString().split('T')[0];
    datetime = `${from}T00:00:00Z/${to}T23:59:59Z`;
  } else {
    // Default: Last 60 days
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
    datetime = `${from}T00:00:00Z/${now.toISOString().split('T')[0]}T23:59:59Z`;
  }

  const payload: any = {
    collections,
    bbox,
    datetime,
    limit: query.limit || 12,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
  };

  // Cloud cover filter (only for optical)
  if (query.maxCloudCover != null && query.platform !== 'Sentinel-1') {
    payload.query = { 'eo:cloud_cover': { lte: query.maxCloudCover } };
  }

  try {
    const res = await fetch(STAC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[ORBINEX STAC] Upstream HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rawFeatures = data.features || [];

    const scenes: SatelliteScene[] = [];
    for (const f of rawFeatures) {
      const scene = parseSTACFeature(f);
      if (scene && scene.thumbnailUrl) {
        scenes.push(scene);
      }
    }

    // If a targetDate was provided, sort by proximity to targetDate
    if (query.targetDate) {
      const targetTime = Date.parse(query.targetDate);
      scenes.sort((a, b) => {
        const diffA = Math.abs(Date.parse(a.datetime) - targetTime);
        const diffB = Math.abs(Date.parse(b.datetime) - targetTime);
        return diffA - diffB;
      });
    }

    return scenes;
  } catch (error) {
    console.warn('[ORBINEX STAC] Discovery failed:', error instanceof Error ? error.message : error);
    return [];
  }
}
