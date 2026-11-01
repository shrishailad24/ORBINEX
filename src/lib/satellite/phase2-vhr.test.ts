import { describe, it, expect } from 'vitest';
import { calculateVhrQuote, VHR_CATALOG } from './vhr-pricing';
import { evaluateAreaSuitability } from './providers/small-area-evaluator';

describe('Phase 2 — Multi-Resolution VHR Discovery & Pricing (AI-04 & AI-05)', () => {
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

  it('contains full commercial catalog specifications', () => {
    expect(Object.keys(VHR_CATALOG)).toEqual(['airbus-neo', 'planet-skysat', 'maxar-worldview']);
    expect(VHR_CATALOG['maxar-worldview'].resolutionGSD).toBe(0.31);
    expect(VHR_CATALOG['planet-skysat'].resolutionGSD).toBe(0.5);
  });
});
