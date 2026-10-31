/**
 * ORBINEX — Central Satellite Provider Registry
 * Aggregates all Earth Observation providers (Open STAC + Commercial VHR),
 * evaluates AOI scale, and executes parallel multi-constellation discovery.
 */

import { type SatelliteProviderAdapter } from './adapter';
import {
  type MultiProviderDiscoveryResult,
  type NormalizedSatelliteObservation,
  type ProviderStatus,
  type SatelliteDiscoveryQuery,
} from './types';
import { OpenStacAdapter } from './open-stac.adapter';
import { AirbusOneAtlasAdapter } from './airbus.adapter';
import { PlanetAdapter } from './planet.adapter';
import { MaxarAdapter } from './maxar.adapter';
import { calculateGeodesicArea, evaluateAreaSuitability } from './small-area-evaluator';
import { rankObservations } from './ranking';
import { pointToBbox } from '../security';

export class SatelliteProviderRegistry {
  private adapters: Map<string, SatelliteProviderAdapter> = new Map();

  constructor() {
    this.register(new OpenStacAdapter());
    this.register(new AirbusOneAtlasAdapter());
    this.register(new PlanetAdapter());
    this.register(new MaxarAdapter());
  }

  register(adapter: SatelliteProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): SatelliteProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  async listProviders(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const s = await adapter.getStatus();
        statuses.push(s);
      } catch (err) {
        statuses.push({
          id: adapter.id,
          name: adapter.name,
          type: adapter.type,
          nominalGSDMeters: adapter.nominalGSDMeters,
          isConfigured: false,
          status: 'error',
          description: 'Provider failed health check',
          licensingTier: 'commercial_metadata_only',
          attribution: 'Unknown',
        });
      }
    }
    return statuses;
  }

  /**
   * Unified multi-provider search across all registered satellite catalogs.
   */
  async searchAll(query: SatelliteDiscoveryQuery): Promise<MultiProviderDiscoveryResult> {
    let bbox = query.bbox;
    if (!bbox && query.lat != null && query.lng != null) {
      bbox = pointToBbox(query.lat, query.lng, query.radiusKm || 15);
    }

    if (!bbox) {
      return {
        success: false,
        query,
        aoiAreaM2: 0,
        aoiAreaSqFt: 0,
        aoiAreaKm2: 0,
        smallAreaEvaluation: evaluateAreaSuitability(0, 10, 'None'),
        providers: await this.listProviders(),
        totalObservationsFound: 0,
        observations: [],
        rankedBestObservation: null,
        timestamp: new Date().toISOString(),
      };
    }

    const { areaM2, areaSqFt, areaKm2 } = calculateGeodesicArea(bbox);
    const isSmallPlot = areaM2 <= 50_000; // <= 0.05 km2 (~12.3 acres)

    // Evaluate small area benchmark at baseline open resolution (10m)
    const baselineSmallAreaEval = evaluateAreaSuitability(areaM2, 10, 'Sentinel-2 (Baseline)');

    // Filter providers if query requested specific providers
    const providersToQuery = Array.from(this.adapters.values()).filter((adapter) => {
      if (query.providerFilter && query.providerFilter.length > 0) {
        return query.providerFilter.includes(adapter.id);
      }
      return true;
    });

    // Execute provider discovery in parallel with 8s maximum timeout
    const results = await Promise.allSettled(
      providersToQuery.map((adapter) =>
        Promise.race([
          adapter.search(query),
          new Promise<NormalizedSatelliteObservation[]>((_, reject) =>
            setTimeout(() => reject(new Error('Provider timeout')), 8000)
          ),
        ])
      )
    );

    const allObservations: NormalizedSatelliteObservation[] = [];
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        allObservations.push(...res.value);
      } else {
        const adapter = providersToQuery[idx];
        console.warn(`[ORBINEX Registry] Provider ${adapter.id} search failed:`, res.reason);
      }
    });

    // Rank observations according to AOI size, GSD, temporal proximity, and licensing
    const rankedObservations = rankObservations(allObservations, query.targetDate, isSmallPlot);
    const rankedBestObservation = rankedObservations.length > 0 ? rankedObservations[0] : null;

    // Honest Communication Rule:
    // If user drew a small plot (e.g. 2,000 sq ft) and only 10m open imagery is available for raster analysis:
    let resolutionLimitNotice: string | undefined;
    const hasActiveSubMeterRaster = rankedObservations.some(
      (obs) => obs.gsdMeters <= 0.5 && obs.isRasterAvailable
    );

    if (isSmallPlot && !hasActiveSubMeterRaster) {
      resolutionLimitNotice = `Small Area Focus (${Math.round(areaSqFt).toLocaleString()} sq ft / ${Math.round(areaM2)} m²): Commercial 30cm/50cm raster pixels are not licensed. Displaying Sentinel-2 (10m/px) open imagery. Plot is covered by only ~${baselineSmallAreaEval.pixelsOnAOI} pixels; internal plot-level change cannot be verified.`;
    }

    const providerStatuses = await this.listProviders();

    return {
      success: true,
      query,
      aoiAreaM2: Math.round(areaM2),
      aoiAreaSqFt: Math.round(areaSqFt),
      aoiAreaKm2: Number(areaKm2.toFixed(4)),
      smallAreaEvaluation: baselineSmallAreaEval,
      providers: providerStatuses,
      totalObservationsFound: rankedObservations.length,
      observations: rankedObservations,
      rankedBestObservation,
      resolutionLimitNotice,
      timestamp: new Date().toISOString(),
    };
  }
}

// Global singleton instance
export const satelliteRegistry = new SatelliteProviderRegistry();
