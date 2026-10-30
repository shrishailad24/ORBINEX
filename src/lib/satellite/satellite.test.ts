import { describe, it, expect } from 'vitest';
import {
  isAllowedSatelliteUrl,
  validateBbox,
  pointToBbox,
  isValidDateString,
} from './security';
import {
  bboxToQuadCoordinates,
  normalizeAssetHref,
  parseSTACFeature,
} from './stac-client';
import { getGibsTileUrl, getWaybackTileUrl, STRATEGIC_PRESETS } from './historical-providers';
import { processSatelliteAsset } from './image-processor';
import path from 'path';

describe('Satellite Security & Validation', () => {
  it('allows verified satellite imagery hosts', () => {
    expect(isAllowedSatelliteUrl('https://sentinel-cogs.s3.us-west-2.amazonaws.com/thumbnail.jpg')).toBe(true);
    expect(isAllowedSatelliteUrl('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/tile.jpg')).toBe(true);
    expect(isAllowedSatelliteUrl('https://wayback.maptiles.arcgis.com/arcgis/rest/tile.jpg')).toBe(true);
  });

  it('rejects untrusted or malicious URLs', () => {
    expect(isAllowedSatelliteUrl('http://insecure.com/tile.jpg')).toBe(false);
    expect(isAllowedSatelliteUrl('https://evil-attacker.com/exploit.jpg')).toBe(false);
    expect(isAllowedSatelliteUrl('https://localhost:8080/internal')).toBe(false);
    expect(isAllowedSatelliteUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedSatelliteUrl('https://10.0.0.1/private')).toBe(false);
    expect(isAllowedSatelliteUrl('https://192.168.1.1/router')).toBe(false);
  });

  it('validates and clamps bounding boxes correctly', () => {
    expect(validateBbox([89.5, 25.5, 90.5, 26.5])).toEqual([89.5, 25.5, 90.5, 26.5]);
    expect(validateBbox([90.5, 25.5, 89.5, 26.5])).toBeNull(); // minLng > maxLng
    expect(validateBbox([89.5, 95.0, 90.5, 26.5])).toBeNull(); // lat > 90
    expect(validateBbox([1, 2, 3] as any)).toBeNull(); // wrong length
  });

  it('generates a valid bounding box from center point and radius', () => {
    const bbox = pointToBbox(26.02, 89.98, 10);
    expect(bbox.length).toBe(4);
    expect(bbox[0]).toBeLessThan(bbox[2]); // minLng < maxLng
    expect(bbox[1]).toBeLessThan(bbox[3]); // minLat < maxLat
  });

  it('validates date strings', () => {
    expect(isValidDateString('2024-01-15')).toBe(true);
    expect(isValidDateString('2020-12-31T23:59:59Z')).toBe(true);
    expect(isValidDateString('invalid-date')).toBe(false);
  });
});

describe('STAC Client Utilities', () => {
  it('converts bounding box into MapLibre quad coordinates', () => {
    const bbox: [number, number, number, number] = [89.0, 25.0, 91.0, 27.0];
    const quads = bboxToQuadCoordinates(bbox);
    expect(quads).toEqual([
      [89.0, 27.0], // Top-Left
      [91.0, 27.0], // Top-Right
      [91.0, 25.0], // Bottom-Right
      [89.0, 25.0], // Bottom-Left
    ]);
  });

  it('normalizes S3 URLs into public HTTPS URLs', () => {
    const s3Uri = 's3://sentinel-s1-l1c/GRD/2023/preview/quick-look.png';
    const httpsUrl = normalizeAssetHref(s3Uri);
    expect(httpsUrl).toBe('https://sentinel-s1-l1c.s3.amazonaws.com/GRD/2023/preview/quick-look.png');
  });

  it('parses a raw STAC feature into an ORBINEX SatelliteScene', () => {
    const mockFeature = {
      id: 'S2A_TEST_SCENE',
      collection: 'sentinel-2-l2a',
      bbox: [89.0, 25.0, 90.0, 26.0],
      properties: {
        datetime: '2024-01-15T05:00:00Z',
        'eo:cloud_cover': 4.5,
        platform: 'Sentinel-2A',
      },
      assets: {
        thumbnail: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/thumb.jpg' },
        visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/TCI.tif' },
      },
    };

    const scene = parseSTACFeature(mockFeature);
    expect(scene).not.toBeNull();
    expect(scene?.id).toBe('S2A_TEST_SCENE');
    expect(scene?.platform).toBe('Sentinel-2');
    expect(scene?.modality).toBe('optical');
    expect(scene?.cloudCover).toBe(4.5);
    expect(scene?.coordinates[0]).toEqual([89.0, 26.0]);
  });
});

describe('Historical Imagery & Presets', () => {
  it('generates correct NASA GIBS tile template', () => {
    const url = getGibsTileUrl('2024-01-15');
    expect(url).toContain('2024-01-15');
    expect(url).toContain('GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg');
  });

  it('includes strategic Indian presets', () => {
    const dhubri = STRATEGIC_PRESETS.find(p => p.id === 'dhubri-assam');
    expect(dhubri).toBeDefined();
    expect(dhubri?.lat).toBe(26.02);
    expect(dhubri?.lng).toBe(89.98);

    const bengaluru = STRATEGIC_PRESETS.find(p => p.id === 'bengaluru-urban');
    expect(bengaluru).toBeDefined();
    expect(bengaluru?.lat).toBeCloseTo(12.97, 1);
  });
});

describe('Satellite Image Processing Security & Rejection', () => {
  it('rejects processing when input URL is not authorized', async () => {
    await expect(
      processSatelliteAsset({
        inputUrl: 'https://malicious-site.com/exploit.jpg',
      })
    ).rejects.toThrow('not authorized by security policy');
  });

  it('rejects local loopback addresses in processing engine', async () => {
    await expect(
      processSatelliteAsset({
        inputUrl: 'https://127.0.0.1:8000/internal-secret.png',
      })
    ).rejects.toThrow('not authorized by security policy');
  });
});
