import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateVhrQuote, VHR_CATALOG } from './vhr-pricing';
import { evaluateAreaSuitability } from './providers/small-area-evaluator';
import { AirbusOneAtlasAdapter } from './providers/airbus.adapter';
import { PlanetAdapter } from './providers/planet.adapter';
import { MaxarAdapter } from './providers/maxar.adapter';
import {
  evaluateCommercialOrderSafety,
  validateCommercialAssetAuthorization,
} from './vhr-safety';

describe('Phase 2 / AI-04 — Commercial Very High Resolution (VHR) Satellite Integration', () => {
  describe('1. Commercial Pricing, Billable Minimums & Catalog Specs', () => {
    it('enforces minimum order billable area for small plots', () => {
      // 2,000 sq ft plot is ~0.000186 km²
      const smallAreaKm2 = 0.000186;
      const quote = calculateVhrQuote({
        providerId: 'airbus-neo',
        areaKm2: smallAreaKm2,
        orderType: 'archive',
        licensing: 'Single-User',
      });

      expect(quote.appliedMinimum).toBe(true);
      expect(quote.billableAreaKm2).toBe(25.0); // Airbus minimum is 25 km²
      expect(quote.totalEstimateUsd).toBe(25.0 * 18.5);
      expect(quote.provider.resolutionGSD).toBe(0.3);
    });

    it('correctly prices standard commercial orders above minimum', () => {
      const quote = calculateVhrQuote({
        providerId: 'planet-skysat',
        areaKm2: 10.0,
        orderType: 'fresh_tasking',
        licensing: 'Multi-User',
        priority: 'rush',
      });

      expect(quote.appliedMinimum).toBe(false);
      expect(quote.billableAreaKm2).toBe(10.0);
      // 10 km2 * 22.5 $/km2 * 1.35 * 1.5 = 455.63
      expect(quote.totalEstimateUsd).toBe(455.63);
      expect(quote.estimatedDeliveryHours).toBe(12); // half of 24h for rush
    });

    it('contains full commercial catalog specifications', () => {
      expect(Object.keys(VHR_CATALOG)).toEqual(['airbus-neo', 'planet-skysat', 'maxar-worldview']);
      expect(VHR_CATALOG['maxar-worldview'].resolutionGSD).toBe(0.31);
      expect(VHR_CATALOG['planet-skysat'].resolutionGSD).toBe(0.5);
      expect(VHR_CATALOG['airbus-neo'].resolutionGSD).toBe(0.3);
    });
  });

  describe('2. Provider Authentication & Truthful Status Reporting', () => {
    const originalAirbus = process.env.AIRBUS_API_KEY;
    const originalPlanet = process.env.PLANET_API_KEY;
    const originalMaxar = process.env.MAXAR_API_TOKEN;

    afterEach(() => {
      if (originalAirbus) process.env.AIRBUS_API_KEY = originalAirbus;
      else delete process.env.AIRBUS_API_KEY;
      if (originalPlanet) process.env.PLANET_API_KEY = originalPlanet;
      else delete process.env.PLANET_API_KEY;
      if (originalMaxar) process.env.MAXAR_API_TOKEN = originalMaxar;
      else delete process.env.MAXAR_API_TOKEN;
    });

    it('accurately reports unconfigured status when credentials are absent', async () => {
      delete process.env.AIRBUS_API_KEY;
      delete process.env.ONEATLAS_API_KEY;
      const airbus = new AirbusOneAtlasAdapter();
      const status = await airbus.getStatus();

      expect(status.isConfigured).toBe(false);
      expect(status.status).toBe('unconfigured');
      expect(status.licensingTier).toBe('commercial_metadata_only');
      expect(status.configuredEnvVar).toBe('AIRBUS_API_KEY');
    });

    it('truthfully transitions to active status when environment key is configured', async () => {
      process.env.PLANET_API_KEY = 'test-planet-key-abc123xyz';
      const planet = new PlanetAdapter();
      const status = await planet.getStatus();

      expect(status.isConfigured).toBe(true);
      expect(status.status).toBe('active');
      expect(status.licensingTier).toBe('commercial_licensed');
    });
  });

  describe('3. Normalized Observation Model & Spectral Resolution Breakdown', () => {
    it('normalizes Airbus Pléiades Neo with 30cm PAN and 1.2m MS distinctions', async () => {
      const airbus = new AirbusOneAtlasAdapter();
      const results = await airbus.search({
        lat: 26.02,
        lng: 89.98,
        radiusKm: 5,
        targetDate: '2024-01-15',
      });

      expect(results.length).toBeGreaterThan(0);
      const obs = results[0];
      expect(obs.crs).toBe('EPSG:4326');
      expect(obs.gsdMeters).toBe(0.3);
      expect(obs.panchromaticResolutionMeters).toBe(0.3);
      expect(obs.multispectralResolutionMeters).toBe(1.2);
      expect(obs.accessStatus).toBe('metadata_only');
      expect(obs.assetStage).toBe('catalogue_metadata');
      expect(obs.downloadAvailability).toBe(false);
      expect(obs.orderRequirements).toBeDefined();
      expect(obs.orderRequirements?.minOrderAreaKm2).toBe(25.0);
    });

    it('normalizes Planet SkySat with 50cm PAN and 0.8m MS distinctions', async () => {
      const planet = new PlanetAdapter();
      const results = await planet.search({
        lat: 12.97,
        lng: 77.59,
        radiusKm: 2,
        targetDate: '2024-02-14',
      });

      expect(results.length).toBeGreaterThan(0);
      const obs = results[0];
      expect(obs.gsdMeters).toBe(0.5);
      expect(obs.panchromaticResolutionMeters).toBe(0.5);
      expect(obs.multispectralResolutionMeters).toBe(0.8);
      expect(obs.orderRequirements?.minOrderAreaKm2).toBe(5.0);
    });

    it('normalizes Maxar WorldView-3 with 31cm PAN and 1.24m MS distinctions', async () => {
      const maxar = new MaxarAdapter();
      const results = await maxar.search({
        lat: -3.465,
        lng: -62.215, // Amazon Basin negative coordinates
        radiusKm: 5,
        targetDate: '2024-01-20',
      });

      expect(results.length).toBeGreaterThan(0);
      const obs = results[0];
      expect(obs.gsdMeters).toBe(0.31);
      expect(obs.panchromaticResolutionMeters).toBe(0.31);
      expect(obs.multispectralResolutionMeters).toBe(1.24);
      expect(obs.satellite).toContain('WorldView');
    });
  });

  describe('4. Mandatory Paid Order & Tasking Safety Boundary (Section 8 / RSK-09)', () => {
    it('strictly rejects automated commercial purchase without explicit human approval', () => {
      const response = evaluateCommercialOrderSafety({
        providerId: 'airbus-neo',
        areaKm2: 30.0,
        humanApprovalSigned: false, // Automated trigger attempt
      });

      expect(response.success).toBe(false);
      expect(response.status).toBe('HUMAN_CONFIRMATION_REQUIRED');
      expect(response.message).toContain('Explicit human authorization is required');
      expect(response.safetyInterlock.automatedBillingPrevented).toBe(true);
      expect(response.safetyInterlock.backgroundTaskingPrevented).toBe(true);
    });

    it('locks order against billing runaway even when human signature is present', () => {
      const response = evaluateCommercialOrderSafety({
        providerId: 'planet-skysat',
        areaKm2: 12.5,
        orderType: 'archive',
        licensing: 'Single-User',
        humanApprovalSigned: true, // Explicit human authorization
        signedByAnalyst: 'Lead Geospatial Analyst',
      });

      expect(response.success).toBe(true);
      expect(response.status).toBe('SAFEGUARD_LOCKED');
      expect(response.message).toContain('ORDER AUTHORIZATION VERIFIED');
      expect(response.message).toContain('locked to prevent automated billing');
      expect(response.quote).toBeDefined();
      expect(response.quote?.billableAreaKm2).toBe(12.5);
      expect(response.dossierSummary?.totalUsd).toBe(12.5 * 12.0);
    });
  });

  describe('5. Authorized Raster Retrieval & SSRF Isolation', () => {
    afterEach(() => {
      delete process.env.AIRBUS_API_KEY;
    });

    it('rejects raster retrieval when credentials are missing', () => {
      delete process.env.AIRBUS_API_KEY;
      const auth = validateCommercialAssetAuthorization('airbus-oneatlas', 'https://data.api.oneatlas.airbus.com/sample.tif');

      expect(auth.authorized).toBe(false);
      expect(auth.statusCode).toBe(401);
      expect(auth.error).toContain('CREDENTIALS_REQUIRED');
      expect(auth.configuredEnvVar).toBe('AIRBUS_API_KEY');
    });

    it('blocks SSRF attempts targeting unauthorized private hosts or cloud metadata', () => {
      process.env.AIRBUS_API_KEY = 'valid-key-for-test';

      const ssrf1 = validateCommercialAssetAuthorization('airbus-oneatlas', 'http://169.254.169.254/latest/meta-data/');
      expect(ssrf1.authorized).toBe(false);
      expect(ssrf1.statusCode).toBe(403);
      expect(ssrf1.error).toContain('SECURITY_VIOLATION');

      const ssrf2 = validateCommercialAssetAuthorization('airbus-oneatlas', 'http://localhost:3000/internal-api');
      expect(ssrf2.authorized).toBe(false);
      expect(ssrf2.statusCode).toBe(403);
    });

    it('permits authorized retrieval from approved commercial endpoints when key is active', () => {
      process.env.AIRBUS_API_KEY = 'valid-key-for-test';

      const validAuth = validateCommercialAssetAuthorization(
        'airbus-oneatlas',
        'https://data.api.oneatlas.airbus.com/api/v1/assets/pleiades-neo/tile_01.tif'
      );
      expect(validAuth.authorized).toBe(true);
      expect(validAuth.statusCode).toBe(200);
      expect(validAuth.isAllowedUrl).toBe(true);
    });
  });

  describe('6. 2,000 sq ft Small-Plot Analytical Benchmark', () => {
    it('verifies 2,000 sq ft benchmark on Sentinel-2 vs Commercial VHR', () => {
      const areaM2 = 186; // 2,000 sq ft
      const sentinelEval = evaluateAreaSuitability(areaM2, 10, 'Sentinel-2 L2A');

      expect(sentinelEval.areaM2).toBe(186);
      expect(sentinelEval.pixelsOnAOI).toBeLessThan(5); // ~2 pixels on Sentinel-2
      expect(sentinelEval.suitabilityStatus).toBe('INSUFFICIENT');
      expect(sentinelEval.isSmallPlot).toBe(true);

      const pleiadesEval = evaluateAreaSuitability(areaM2, 0.3, 'Airbus Pléiades Neo');
      expect(pleiadesEval.pixelsOnAOI).toBeGreaterThan(2000); // ~2,067 pixels
      expect(pleiadesEval.suitabilityStatus).toBe('SUITABLE');
    });
  });
});

