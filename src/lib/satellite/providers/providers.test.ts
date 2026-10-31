import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateGeodesicArea,
  evaluateAreaSuitability,
  calculateBboxIntersection,
  getResolutionClass,
} from './small-area-evaluator';
import { OpenStacAdapter } from './open-stac.adapter';
import { AirbusOneAtlasAdapter } from './airbus.adapter';
import { PlanetAdapter } from './planet.adapter';
import { MaxarAdapter } from './maxar.adapter';
import { rankObservations } from './ranking';
import { SatelliteProviderRegistry, satelliteRegistry } from './registry';
import { type NormalizedSatelliteObservation } from './types';

describe('ORBINEX AI-03 — Unified Multi-Provider Satellite Discovery', () => {
  describe('Small-Area Evaluator & 2,000 sq ft Benchmark', () => {
    it('accurately calculates geodesic area and conversions', () => {
      // 0.001 deg at equator (~111m x 111m ~ 12,321 m2)
      const bbox: [number, number, number, number] = [0.0, 0.0, 0.001, 0.001];
      const area = calculateGeodesicArea(bbox);

      expect(area.areaM2).toBeGreaterThan(12000);
      expect(area.areaM2).toBeLessThan(13000);
      expect(area.areaSqFt).toBeCloseTo(area.areaM2 * 10.7639, -1);
      expect(area.areaKm2).toBeCloseTo(area.areaM2 / 1e6, 4);
    });

    it('evaluates the 2,000 sq ft (186 m²) benchmark across resolutions', () => {
      const area2000SqFtM2 = 186.0;

      // Sentinel-2 (10m): 186 / 100 = ~2 pixels -> INSUFFICIENT
      const s2Eval = evaluateAreaSuitability(area2000SqFtM2, 10.0, 'Sentinel-2');
      expect(s2Eval.pixelsOnAOI).toBe(2);
      expect(s2Eval.suitabilityStatus).toBe('INSUFFICIENT');
      expect(s2Eval.suitabilitySummary).toContain('Insufficient resolution');
      expect(s2Eval.limitations.length).toBeGreaterThan(2);

      // Planet SkySat (50cm / 0.5m): 186 / 0.25 = 744 pixels -> SUITABLE
      const skySatEval = evaluateAreaSuitability(area2000SqFtM2, 0.5, 'Planet SkySat');
      expect(skySatEval.pixelsOnAOI).toBe(744);
      expect(skySatEval.suitabilityStatus).toBe('SUITABLE');

      // Airbus Pléiades Neo (30cm / 0.3m): 186 / 0.09 = ~2,067 pixels -> SUITABLE
      const pneoEval = evaluateAreaSuitability(area2000SqFtM2, 0.3, 'Pléiades Neo');
      expect(pneoEval.pixelsOnAOI).toBe(2067);
      expect(pneoEval.suitabilityStatus).toBe('SUITABLE');
      expect(pneoEval.resolutionTier).toBe('sub_meter');

      // Landsat-8/9 (30m): 186 / 900 = ~0.21 pixels -> INSUFFICIENT
      const landsatEval = evaluateAreaSuitability(area2000SqFtM2, 30.0, 'Landsat');
      expect(landsatEval.pixelsOnAOI).toBe(0);
      expect(landsatEval.suitabilityStatus).toBe('INSUFFICIENT');
    });

    it('computes accurate bounding box intersection ratios', () => {
      const aoi: [number, number, number, number] = [10.0, 10.0, 11.0, 11.0];
      const identicalScene: [number, number, number, number] = [10.0, 10.0, 11.0, 11.0];
      const disjointScene: [number, number, number, number] = [20.0, 20.0, 21.0, 21.0];
      const halfScene: [number, number, number, number] = [10.5, 10.0, 11.0, 11.0];

      expect(calculateBboxIntersection(aoi, identicalScene)).toBe(100);
      expect(calculateBboxIntersection(aoi, disjointScene)).toBe(0);
      expect(calculateBboxIntersection(aoi, halfScene)).toBe(50);
    });

    it('correctly classifies resolution tiers', () => {
      expect(getResolutionClass(0.3)).toBe('sub_meter');
      expect(getResolutionClass(0.5)).toBe('high_res');
      expect(getResolutionClass(10)).toBe('regional');
      expect(getResolutionClass(30)).toBe('coarse');
    });
  });

  describe('Provider Adapters', () => {
    it('Open STAC Adapter returns open access configuration', async () => {
      const adapter = new OpenStacAdapter();
      const status = await adapter.getStatus();

      expect(status.id).toBe('element84-stac');
      expect(status.type).toBe('open');
      expect(status.isConfigured).toBe(true);
      expect(status.licensingTier).toBe('open_access');
      expect(status.attribution).toContain('Copernicus');
    });

    it('Airbus OneAtlas Adapter reports unconfigured when no API key exists', async () => {
      const originalKey = process.env.AIRBUS_API_KEY;
      delete process.env.AIRBUS_API_KEY;
      delete process.env.ONEATLAS_API_KEY;

      const adapter = new AirbusOneAtlasAdapter();
      const status = await adapter.getStatus();

      expect(status.id).toBe('airbus-oneatlas');
      expect(status.type).toBe('commercial');
      expect(status.isConfigured).toBe(false);
      expect(status.status).toBe('unconfigured');
      expect(status.nominalGSDMeters).toBe(0.3);

      const obs = await adapter.search({ bbox: [-50.2, -0.5, -50.1, -0.4], targetDate: '2024-01-15' });
      expect(obs.length).toBe(1);
      expect(obs[0].satellite).toContain('Pléiades Neo');
      expect(obs[0].gsdMeters).toBe(0.3);
      expect(obs[0].isRasterAvailable).toBe(false);
      expect(obs[0].licensing.tier).toBe('commercial_metadata_only');
      expect(obs[0].licensing.notice).toContain('AIRBUS_API_KEY');

      if (originalKey) process.env.AIRBUS_API_KEY = originalKey;
    });

    it('Planet Adapter reports unconfigured and returns 50cm metadata', async () => {
      const originalKey = process.env.PLANET_API_KEY;
      delete process.env.PLANET_API_KEY;

      const adapter = new PlanetAdapter();
      const status = await adapter.getStatus();

      expect(status.id).toBe('planet-data');
      expect(status.nominalGSDMeters).toBe(0.5);
      expect(status.isConfigured).toBe(false);

      const obs = await adapter.search({ bbox: [77.5, 12.9, 77.6, 13.0], targetDate: '2024-01-15' });
      expect(obs.length).toBe(1);
      expect(obs[0].satellite).toContain('SkySat');
      expect(obs[0].gsdMeters).toBe(0.5);
      expect(obs[0].isRasterAvailable).toBe(false);
      expect(obs[0].licensing.notice).toContain('PLANET_API_KEY');

      if (originalKey) process.env.PLANET_API_KEY = originalKey;
    });

    it('Maxar Adapter reports unconfigured and returns 31cm metadata', async () => {
      const originalToken = process.env.MAXAR_API_TOKEN;
      delete process.env.MAXAR_API_TOKEN;

      const adapter = new MaxarAdapter();
      const status = await adapter.getStatus();

      expect(status.id).toBe('maxar-ard');
      expect(status.nominalGSDMeters).toBe(0.31);
      expect(status.isConfigured).toBe(false);

      const obs = await adapter.search({ bbox: [85.2, 22.2, 85.3, 22.3], targetDate: '2024-01-15' });
      expect(obs.length).toBe(1);
      expect(obs[0].satellite).toContain('WorldView');
      expect(obs[0].gsdMeters).toBe(0.31);

      if (originalToken) process.env.MAXAR_API_TOKEN = originalToken;
    });
  });

  describe('Provider Ranking Engine', () => {
    it('prioritizes sub-meter VHR observations for small plots', () => {
      const mockS2: NormalizedSatelliteObservation = {
        id: 's2-test',
        providerId: 'element84-stac',
        providerName: 'Open STAC',
        satellite: 'Sentinel-2',
        sensor: 'MSI',
        modality: 'optical',
        acquisitionDate: '2024-01-15T10:00:00Z',
        gsdMeters: 10,
        cloudCover: 5,
        bands: ['B02', 'B03', 'B04'],
        productLevel: 'L2A',
        bbox: [10, 10, 10.01, 10.01],
        aoiIntersectionPercent: 100,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        visualUrl: 'https://example.com/vis.tif',
        isRasterAvailable: true,
        licensing: { tier: 'open_access', requiresCredentials: false, hasCredentials: true, attribution: 'ESA' },
        suitability: evaluateAreaSuitability(186, 10, 'Sentinel-2'),
      };

      const mockPNeo: NormalizedSatelliteObservation = {
        ...mockS2,
        id: 'pneo-test',
        satellite: 'Pléiades Neo',
        gsdMeters: 0.3,
        isRasterAvailable: false,
        licensing: { tier: 'commercial_metadata_only', requiresCredentials: true, hasCredentials: false, attribution: 'Airbus' },
        suitability: evaluateAreaSuitability(186, 0.3, 'Pléiades Neo'),
      };

      // For a small plot (isSmallPlot = true), Pléiades Neo 30cm scores higher than Sentinel-2 10m
      const rankedSmall = rankObservations([mockS2, mockPNeo], '2024-01-15', true);
      expect(rankedSmall[0].satellite).toBe('Pléiades Neo');
      expect(rankedSmall[0].rankingScore).toBeGreaterThan(rankedSmall[1].rankingScore!);

      // For a large regional zone (isSmallPlot = false), Sentinel-2 with available raster and open access scores higher
      const rankedLarge = rankObservations([mockS2, mockPNeo], '2024-01-15', false);
      expect(rankedLarge[0].satellite).toBe('Sentinel-2');
    });
  });

  describe('Central Registry & Multi-Provider Query', () => {
    it('initializes with all 4 core providers', async () => {
      const registry = new SatelliteProviderRegistry();
      const providers = await registry.listProviders();

      expect(providers.length).toBe(4);
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('element84-stac');
      expect(ids).toContain('airbus-oneatlas');
      expect(ids).toContain('planet-data');
      expect(ids).toContain('maxar-ard');
    });

    it('executes multi-provider discovery on negative coordinates (Pará, Brazil)', async () => {
      // Bounding box in southern/western hemisphere: [-50.2, -0.5, -50.1, -0.4]
      const result = await satelliteRegistry.searchAll({
        bbox: [-50.2, -0.5, -50.1, -0.4],
        targetDate: '2024-01-15',
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.aoiAreaKm2).toBeGreaterThan(0);
      expect(result.observations.length).toBeGreaterThan(0);

      // Verify commercial discovery observations were synthesized without paid ordering
      const satellitesFound = result.observations.map((o) => o.satellite);
      expect(satellitesFound.some((s) => s.includes('Pléiades') || s.includes('SkySat'))).toBe(true);
    });

    it('formulates Honest Resolution Notice for micro plots under 50,000 m2', async () => {
      // Tiny 2,000 sq ft plot (~14m x 13m ~ 0.00012 degrees)
      const tinyBbox: [number, number, number, number] = [85.531, 22.428, 85.53112, 22.42812];
      const result = await satelliteRegistry.searchAll({
        bbox: tinyBbox,
        targetDate: '2024-01-15',
      });

      expect(result.smallAreaEvaluation.isSmallPlot).toBe(true);
      expect(result.resolutionLimitNotice).toBeDefined();
      expect(result.resolutionLimitNotice).toContain('Commercial 30cm/50cm raster pixels are not licensed');
      expect(result.resolutionLimitNotice).toContain('internal plot-level change cannot be verified');
    });
  });
});
