import { describe, it, expect } from 'vitest';
import { evaluateAreaSuitability, calculateGeodesicArea, getResolutionClass } from './providers/small-area-evaluator';
import { continuousLearningRegistry } from './continuous-learning';
import { planetaryEventBus } from './streaming';

interface GlobalBiomeBenchmark {
  id: string;
  name: string;
  category: string;
  bbox: [number, number, number, number];
  primarySensor: string;
  expectedResolutionTier: string;
  targetAnalytics: string;
}

const TEN_GLOBAL_BIOMES: GlobalBiomeBenchmark[] = [
  {
    id: 'amazon_rainforest',
    name: 'Amazon Basin (Pará, Brazil)',
    category: 'Tropical Rainforest',
    bbox: [-50.5, -3.5, -50.1, -3.1],
    primarySensor: 'Sentinel-2 L2A',
    expectedResolutionTier: 'regional',
    targetAnalytics: 'Deforestation & canopy loss',
  },
  {
    id: 'tokyo_megacity',
    name: 'Shinjuku (Tokyo, Japan)',
    category: 'Dense Urban Megacity',
    bbox: [139.68, 35.68, 139.72, 35.71],
    primarySensor: 'Pléiades Neo',
    expectedResolutionTier: 'sub_meter',
    targetAnalytics: 'Building footprints & micro-plot change',
  },
  {
    id: 'sahara_erg',
    name: 'Erg Chebbi (Morocco)',
    category: 'Arid Sand Desert',
    bbox: [-4.05, 31.12, -3.95, 31.25],
    primarySensor: 'Landsat-9',
    expectedResolutionTier: 'coarse',
    targetAnalytics: 'High albedo dune migration',
  },
  {
    id: 'nile_delta',
    name: 'Kafr El Sheikh (Nile Delta, Egypt)',
    category: 'Intensive Irrigated Agriculture',
    bbox: [30.9, 31.05, 31.1, 31.25],
    primarySensor: 'Sentinel-2 L2A',
    expectedResolutionTier: 'regional',
    targetAnalytics: 'Cropland phenology & irrigation canals',
  },
  {
    id: 'jakobshavn_glacier',
    name: 'Jakobshavn Isbræ (Greenland)',
    category: 'Glacial Ice Sheet',
    bbox: [-50.4, 69.1, -49.8, 69.3],
    primarySensor: 'Sentinel-1 SAR',
    expectedResolutionTier: 'regional',
    targetAnalytics: 'Glacial terminus calving & radar backscatter',
  },
  {
    id: 'iowa_corn_belt',
    name: 'Des Moines River Basin (Iowa, USA)',
    category: 'Temperate Monoculture Cropland',
    bbox: [-93.8, 41.5, -93.4, 41.8],
    primarySensor: 'Landsat-8',
    expectedResolutionTier: 'coarse',
    targetAnalytics: 'Crop harvesting & seasonal NDVI shift',
  },
  {
    id: 'sundarbans_mangrove',
    name: 'Sundarbans Delta (India / Bangladesh)',
    category: 'Intertidal Wetland & Mangrove',
    bbox: [88.7, 21.6, 89.2, 22.0],
    primarySensor: 'Sentinel-2 L2A',
    expectedResolutionTier: 'regional',
    targetAnalytics: 'Tidal inundation & mangrove recession',
  },
  {
    id: 'swiss_alps',
    name: 'Jungfrau Region (Bernese Alps, Switzerland)',
    category: 'High-Relief Mountainous Alpine',
    bbox: [7.9, 46.5, 8.1, 46.65],
    primarySensor: 'Sentinel-2 L2A',
    expectedResolutionTier: 'regional',
    targetAnalytics: 'Snow cover extent & slope shadow masking',
  },
  {
    id: 'pilbara_mining',
    name: 'Mount Whaleback Mine (Pilbara, Australia)',
    category: 'Open-Pit Mining Disturbance',
    bbox: [119.6, -23.4, 119.75, -23.3],
    primarySensor: 'SkySat 50cm',
    expectedResolutionTier: 'high_res',
    targetAnalytics: 'Excavation boundaries & haul road expansion',
  },
  {
    id: 'singapore_strait',
    name: 'Jurong Port & Strait (Singapore)',
    category: 'Maritime Coastal Reclamation',
    bbox: [103.68, 1.22, 103.78, 1.30],
    primarySensor: 'Pléiades Neo',
    expectedResolutionTier: 'sub_meter',
    targetAnalytics: 'Coastal landfilling & vessel berth activity',
  },
];

describe('Phase 5 — Lakehouse Storage, Global Validation & Continuous Learning (AI-16 to AI-18)', () => {
  it('validates multi-sensor suitability across 10 global biomes (AI-16)', () => {
    for (const biome of TEN_GLOBAL_BIOMES) {
      const geo = calculateGeodesicArea(biome.bbox);
      expect(geo.areaKm2).toBeGreaterThan(0.1);

      // Verify resolution classification for the primary sensor
      let gsd = 10;
      if (biome.primarySensor === 'Pléiades Neo') gsd = 0.3;
      if (biome.primarySensor === 'SkySat 50cm') gsd = 0.5;
      if (biome.primarySensor === 'Landsat-8' || biome.primarySensor === 'Landsat-9') gsd = 30;

      const tier = getResolutionClass(gsd);
      expect(tier).toBe(biome.expectedResolutionTier);

      const suitability = evaluateAreaSuitability(geo.areaM2, gsd, biome.primarySensor);
      expect(suitability.suitabilityStatus).not.toBe('INSUFFICIENT');
    }
  });

  it('records analyst feedback and computes accuracy metrics (AI-18)', async () => {
    const feedback = await continuousLearningRegistry.recordFeedback({
      aoiBbox: [77.5, 12.9, 77.6, 13.0],
      predictedCategory: 'forest',
      verification: 'TRUE_POSITIVE',
      confidenceScore: 0.94,
      correctedAreaKm2: 4.2,
      analystNotes: 'Verified deforestation patch adjacent to highway expansion.',
      modelIdentifier: 'ORBINEX-ForestSpecialist-v2',
    });

    expect(feedback.id).toMatch(/^gt_/);
    expect(feedback.verification).toBe('TRUE_POSITIVE');

    const stats = await continuousLearningRegistry.getFeedbackStats();
    expect(stats.totalFeedbackRecords).toBeGreaterThanOrEqual(1);
    expect(stats.accuracyRate).toBeGreaterThan(0);
    expect(stats.breakdown.TRUE_POSITIVE).toBeGreaterThanOrEqual(1);
  });
});
