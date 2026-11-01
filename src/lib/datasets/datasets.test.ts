import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFIED_DATASET_REGISTRY,
  DATASET_CATEGORIES,
  getDatasetById,
  getDatasetsByCategory,
} from './registry';
import {
  discoverDatasetsForAOI,
  generateFileId,
  calculateChecksum,
  findExistingAcquisition,
  acquireDatasetForAOI,
  loadManifest,
  saveManifest,
  getDatasetCatalogueSummary,
} from './acquisition-engine';
import type { DatasetCategory } from './types';

describe('ORBINEX Unified Dataset Catalogue System', () => {
  it('covers all 8 essential geospatial dataset categories', () => {
    const requiredCategories: DatasetCategory[] = [
      'satellite',
      'elevation',
      'landcover',
      'infrastructure',
      'hydrology',
      'environmental',
      'population',
      'ai_benchmark',
    ];

    expect(DATASET_CATEGORIES.length).toBe(8);
    for (const cat of requiredCategories) {
      const found = DATASET_CATEGORIES.find((c) => c.id === cat);
      expect(found).toBeDefined();

      const inCategory = getDatasetsByCategory(cat);
      expect(inCategory.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('contains over 35 authoritative, structured geospatial dataset records', () => {
    expect(UNIFIED_DATASET_REGISTRY.length).toBeGreaterThanOrEqual(35);
  });

  it('validates completeness and metadata schema for all registered datasets', () => {
    for (const d of UNIFIED_DATASET_REGISTRY) {
      expect(d.id).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.category).toBeTruthy();
      expect(d.tier).toBeTruthy();
      expect(d.provider).toBeTruthy();
      expect(d.license).toBeTruthy();
      expect(d.auth).toBeTruthy();
      expect(d.nativeResolution).toBeTruthy();
      expect(d.spatialCrs).toBeTruthy();
      expect(d.temporalCoverage).toBeTruthy();
      expect(d.primaryUseCases.length).toBeGreaterThan(0);
      expect(d.documentationUrl.startsWith('http')).toBe(true);
      expect(d.citation).toBeTruthy();
    }
  });

  it('correctly retrieves datasets by ID', () => {
    const s2 = getDatasetById('sentinel-2-l2a');
    expect(s2).toBeDefined();
    expect(s2?.name).toContain('Sentinel-2');
    expect(s2?.category).toBe('satellite');

    const glo30 = getDatasetById('copernicus-dem-glo-30');
    expect(glo30).toBeDefined();
    expect(glo30?.category).toBe('elevation');

    const worldCover = getDatasetById('esa-worldcover-10m');
    expect(worldCover).toBeDefined();
    expect(worldCover?.category).toBe('landcover');

    const osm = getDatasetById('osm-infrastructure-vector');
    expect(osm).toBeDefined();
    expect(osm?.category).toBe('infrastructure');

    const jrcWater = getDatasetById('jrc-global-surface-water');
    expect(jrcWater).toBeDefined();
    expect(jrcWater?.category).toBe('hydrology');

    const firms = getDatasetById('nasa-firms-active-fire');
    expect(firms).toBeDefined();
    expect(firms?.category).toBe('environmental');

    const worldPop = getDatasetById('worldpop-global-100m');
    expect(worldPop).toBeDefined();
    expect(worldPop?.category).toBe('population');

    const levirCd = getDatasetById('levir-cd-benchmark');
    expect(levirCd).toBeDefined();
    expect(levirCd?.category).toBe('ai_benchmark');
  });

  it('discovers datasets for an active AOI bounding box', () => {
    const bangaloreBbox: [number, number, number, number] = [77.50, 12.85, 77.75, 13.10];
    const discovered = discoverDatasetsForAOI(bangaloreBbox);

    expect(discovered.length).toBe(UNIFIED_DATASET_REGISTRY.length);
    const streamable = discovered.filter((d) => d.availability === 'streamable');
    const downloadable = discovered.filter((d) => d.availability === 'downloadable_aoi');
    const commercialGated = discovered.filter((d) => d.availability === 'commercial_approval_gated');

    expect(streamable.length).toBeGreaterThan(5);
    expect(downloadable.length).toBeGreaterThan(10);
    expect(commercialGated.length).toBeGreaterThan(0);
  });

  it('filters AOI discovery by selected category', () => {
    const bbox: [number, number, number, number] = [89.8, 25.9, 90.1, 26.2];
    const discoveredElevation = discoverDatasetsForAOI(bbox, ['elevation']);

    expect(discoveredElevation.length).toBeGreaterThanOrEqual(4);
    for (const item of discoveredElevation) {
      expect(item.dataset.category).toBe('elevation');
    }
  });

  it('generates deterministic deduplication file IDs', () => {
    const bbox: [number, number, number, number] = [77.59, 12.97, 77.65, 13.02];
    const id1 = generateFileId('copernicus-dem-glo-30', bbox, '2024-01-01');
    const id2 = generateFileId('copernicus-dem-glo-30', bbox, '2024-01-01');
    const id3 = generateFileId('copernicus-dem-glo-30', bbox, '2020-01-01');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1.length).toBe(16);
  });

  it('computes accurate SHA-256 checksums', () => {
    const buf = Buffer.from('ORBINEX Geospatial Data Verification Payload', 'utf-8');
    const hash = calculateChecksum(buf);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const sameHash = calculateChecksum(buf);
    expect(sameHash).toBe(hash);
  });

  it('blocks automated commercial purchases without human authorization (RSK-09)', async () => {
    const bbox: [number, number, number, number] = [77.55, 12.90, 77.65, 13.00];

    await expect(
      acquireDatasetForAOI({
        datasetId: 'planet-skysat-vhr',
        aoiBbox: bbox,
        aoiName: 'Commercial Test AOI',
      })
    ).rejects.toThrow(/Mandatory Safety Boundary/);

    await expect(
      acquireDatasetForAOI({
        datasetId: 'airbus-pleiades-neo',
        aoiBbox: bbox,
      })
    ).rejects.toThrow(/Mandatory Safety Boundary/);
  });

  it('acquires and persists an on-demand AOI dataset envelope with manifest verification', async () => {
    const bbox: [number, number, number, number] = [77.60, 12.95, 77.65, 13.00];
    const entry = await acquireDatasetForAOI({
      datasetId: 'esa-worldcover-10m',
      aoiBbox: bbox,
      aoiName: 'Bengaluru East AOI',
      targetDate: '2021-12-31',
    });

    expect(entry).toBeDefined();
    expect(entry.datasetId).toBe('esa-worldcover-10m');
    expect(entry.category).toBe('landcover');
    expect(entry.status).toBe('verified_available');
    expect(entry.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.fileSizeBytes).toBeGreaterThan(0);

    // Verify manifest registration
    const manifest = loadManifest();
    const recorded = manifest.find((m) => m.fileId === entry.fileId);
    expect(recorded).toBeDefined();
    expect(recorded?.sha256Checksum).toBe(entry.sha256Checksum);

    // Verify deduplication: re-acquiring returns cached entry
    const cached = await acquireDatasetForAOI({
      datasetId: 'esa-worldcover-10m',
      aoiBbox: bbox,
      aoiName: 'Bengaluru East AOI',
      targetDate: '2021-12-31',
    });
    expect(cached.fileId).toBe(entry.fileId);
  });

  it('generates accurate dataset catalogue summary metrics', () => {
    const summary = getDatasetCatalogueSummary();
    expect(summary.totalDatasets).toBeGreaterThanOrEqual(35);
    expect(Object.keys(summary.byCategory).length).toBe(8);
    expect(summary.byTier.cloud_streaming).toBeGreaterThanOrEqual(5);
    expect(summary.byTier.on_demand_aoi).toBeGreaterThanOrEqual(10);
    expect(summary.byTier.commercial_licensed).toBeGreaterThanOrEqual(3);
    expect(typeof summary.totalLocalFilesAcquired).toBe('number');
    expect(typeof summary.localStorageFormatted).toBe('string');
  });
});
