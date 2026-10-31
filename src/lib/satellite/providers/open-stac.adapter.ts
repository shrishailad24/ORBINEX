/**
 * ORBINEX — Open STAC Provider Adapter
 * Connects to Element84 Earth Search v1 / Copernicus STAC catalogs.
 * Provides free, global open-access observations for Sentinel-2, Sentinel-1, and Landsat 8/9.
 */

import { type SatelliteProviderAdapter } from './adapter';
import {
  type NormalizedSatelliteObservation,
  type ProviderStatus,
  type SatelliteDiscoveryQuery,
} from './types';
import { searchSatelliteScenes } from '../stac-client';
import { pointToBbox } from '../security';
import {
  calculateBboxIntersection,
  calculateGeodesicArea,
  evaluateAreaSuitability,
} from './small-area-evaluator';

export class OpenStacAdapter implements SatelliteProviderAdapter {
  readonly id = 'element84-stac';
  readonly name = 'Copernicus / USGS Open STAC (Sentinel-1/2, Landsat)';
  readonly type = 'open' as const;
  readonly nominalGSDMeters = 10;

  async getStatus(): Promise<ProviderStatus> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      nominalGSDMeters: this.nominalGSDMeters,
      isConfigured: true,
      status: 'active',
      description: 'Global open-access public STAC catalog hosted on AWS. Sentinel-2 (10m), Sentinel-1 (10m SAR), Landsat-8/9 (30m).',
      licensingTier: 'open_access',
      attribution: 'Contains modified Copernicus Sentinel data [ESA] & USGS Landsat data [NASA/USGS]',
    };
  }

  async search(query: SatelliteDiscoveryQuery): Promise<NormalizedSatelliteObservation[]> {
    let bbox = query.bbox;
    if (!bbox && query.lat != null && query.lng != null) {
      bbox = pointToBbox(query.lat, query.lng, query.radiusKm || 15);
    }
    if (!bbox) return [];

    const { areaM2 } = calculateGeodesicArea(bbox);

    // Call existing STAC client
    const rawScenes = await searchSatelliteScenes({
      bbox,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      targetDate: query.targetDate,
      startDate: query.startDate,
      endDate: query.endDate,
      maxCloudCover: query.maxCloudCover,
      platform: (query.platform as any) || 'all',
      limit: query.limit || 8,
    });

    const normalized: NormalizedSatelliteObservation[] = [];

    for (const scene of rawScenes) {
      const gsdMeters = scene.metadata.resolutionMeters || (scene.platform === 'Sentinel-1' ? 10 : scene.platform === 'Sentinel-2' ? 10 : 30);
      const intersectionPercent = calculateBboxIntersection(bbox, scene.bbox);
      const suitability = evaluateAreaSuitability(areaM2, gsdMeters, scene.platform);

      normalized.push({
        id: scene.id,
        providerId: this.id,
        providerName: 'ESA / USGS Open STAC',
        satellite: scene.platform,
        sensor: scene.metadata.instrument || scene.platform,
        modality: scene.modality,
        acquisitionDate: scene.datetime,
        gsdMeters,
        cloudCover: scene.cloudCover,
        bands: scene.platform === 'Sentinel-1' ? ['VV', 'VH'] : scene.platform === 'Sentinel-2' ? ['B02', 'B03', 'B04', 'B08', 'TCI'] : ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'],
        productLevel: scene.collection.includes('l2a') ? 'L2A (BOA)' : scene.collection.includes('grd') ? 'L1-GRD' : 'L2 (Surface Reflectance)',
        bbox: scene.bbox,
        footprint: {
          type: 'Polygon',
          coordinates: [
            [
              [scene.bbox[0], scene.bbox[1]],
              [scene.bbox[2], scene.bbox[1]],
              [scene.bbox[2], scene.bbox[3]],
              [scene.bbox[0], scene.bbox[3]],
              [scene.bbox[0], scene.bbox[1]],
            ],
          ],
        },
        aoiIntersectionPercent: intersectionPercent,
        thumbnailUrl: scene.thumbnailUrl,
        visualUrl: scene.visualUrl,
        isRasterAvailable: true,
        licensing: {
          tier: 'open_access',
          requiresCredentials: false,
          hasCredentials: true,
          attribution: 'Contains modified Copernicus Sentinel data [ESA] & USGS Landsat data [NASA/USGS]',
          termsUrl: 'https://dataspace.copernicus.eu/terms-and-conditions',
          estimatedCostUSD: 0,
        },
        suitability,
      });
    }

    return normalized;
  }
}
