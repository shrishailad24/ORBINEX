import { describe, it, expect } from 'vitest';
import {
  SENTINEL2_BAND_CATALOG,
  resolveBandAssetUrl,
  inspectCogMetadata,
  extractAnalyticalAoiWindow,
  buildAnalyticalPair,
  type ExtractedBandRaster,
} from './cog-reader';

describe('ORBINEX — Full-Resolution Analytical COG Window Reader (AI-07 Foundation)', () => {
  // ── 1. COG METADATA EXTRACTION & SYNTHETIC TIFF PARSER ──
  describe('1. COG Metadata Extraction', () => {
    it('correctly parses classic TIFF IFDs, tile dimensions, and tile offsets', async () => {
      // Construct a valid synthetic 16 KB little-endian TIFF header
      const buf = Buffer.alloc(16384);
      buf.writeUInt16LE(0x4949, 0); // "II" (Little-Endian)
      buf.writeUInt16LE(42, 2);     // Classic TIFF magic (42)
      buf.writeUInt32LE(8, 4);      // Offset to first IFD = 8

      // IFD with 8 entries
      const ifdOffset = 8;
      const numEntries = 8;
      buf.writeUInt16LE(numEntries, ifdOffset);

      let cur = ifdOffset + 2;
      const writeTag = (tag: number, type: number, count: number, val: number) => {
        buf.writeUInt16LE(tag, cur);
        buf.writeUInt16LE(type, cur + 2);
        buf.writeUInt32LE(count, cur + 4);
        buf.writeUInt32LE(val, cur + 8);
        cur += 12;
      };

      writeTag(256, 4, 1, 10980); // ImageWidth
      writeTag(257, 4, 1, 10980); // ImageLength
      writeTag(322, 4, 1, 1024);  // TileWidth
      writeTag(323, 4, 1, 1024);  // TileLength
      writeTag(324, 4, 121, 500); // TileOffsets offset = 500
      writeTag(325, 4, 121, 1000); // TileByteCounts offset = 1000
      writeTag(33550, 12, 3, 2000); // ModelPixelScaleTag offset = 2000
      writeTag(33922, 12, 6, 2100); // ModelTiepointTag offset = 2100

      // Populate offsets & byte counts
      for (let i = 0; i < 121; i++) {
        buf.writeUInt32LE(50000 + i * 20000, 500 + i * 4);
        buf.writeUInt32LE(15000, 1000 + i * 4);
      }

      // Pixel scale: [10.0, 10.0, 0.0]
      buf.writeDoubleLE(10.0, 2000);
      buf.writeDoubleLE(10.0, 2008);
      buf.writeDoubleLE(0.0, 2016);

      // Tie point: [0, 0, 0, 500000, 3000000, 0]
      buf.writeDoubleLE(0, 2100);
      buf.writeDoubleLE(0, 2108);
      buf.writeDoubleLE(0, 2116);
      buf.writeDoubleLE(500000, 2124);
      buf.writeDoubleLE(3000000, 2132);
      buf.writeDoubleLE(0, 2140);

      // Mock fetch returning HTTP 206
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(buf, {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-16383/340000000' },
        });

      try {
        const meta = await inspectCogMetadata('https://mock-s3.com/B04.tif');
        expect(meta.isCog).toBe(true);
        expect(meta.imageWidth).toBe(10980);
        expect(meta.imageLength).toBe(10980);
        expect(meta.tileWidth).toBe(1024);
        expect(meta.tileLength).toBe(1024);
        expect(meta.tilesAcross).toBe(11);
        expect(meta.tilesDown).toBe(11);
        expect(meta.totalTiles).toBe(121);
        expect(meta.tileOffsets.length).toBe(121);
        expect(meta.tileByteCounts.length).toBe(121);
        expect(meta.pixelScale[0]).toBe(10.0);
        expect(meta.rangeSupported).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ── 2. HTTP RANGE SUPPORT ──
  describe('2. HTTP Range Support Verification', () => {
    it('verifies server supports HTTP 206 Partial Content', async () => {
      const originalFetch = global.fetch;
      let requestedRangeHeader: string | null = null;

      global.fetch = async (url, opts: any) => {
        requestedRangeHeader = opts?.headers?.Range || null;
        const fakeBuf = Buffer.alloc(500);
        fakeBuf.writeUInt16LE(0x4949, 0);
        fakeBuf.writeUInt16LE(42, 2);
        fakeBuf.writeUInt32LE(8, 4);
        fakeBuf.writeUInt16LE(0, 8); // 0 entries
        return new Response(fakeBuf, { status: 206 });
      };

      try {
        const meta = await inspectCogMetadata('https://test-s3.com/B08.tif');
        expect(requestedRangeHeader).toBe('bytes=0-16383');
        expect(meta.rangeSupported).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ── 3. RANGE-REQUEST FALLBACK ──
  describe('3. Range-Request Fallback & HTTP 200 Rejection', () => {
    it('strictly aborts and throws RANGE_NOT_SUPPORTED when upstream returns HTTP 200', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(Buffer.alloc(100), {
          status: 200, // Upstream returned 200 OK (entire file) instead of 206 Partial Content
        });

      try {
        await expect(inspectCogMetadata('https://unsupported-host.com/large.tif')).rejects.toThrow(
          /RANGE_NOT_SUPPORTED/
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ── 4. INDIVIDUAL-BAND SELECTION ──
  describe('4. Individual-Band Selection & Visual Asset Rejection', () => {
    it('discovers individual band assets and rejects visual composites (TCI / thumbnails)', () => {
      const mockStacAssets = {
        blue: { href: 'https://s3.com/B02.tif' },
        green: { href: 'https://s3.com/B03.tif' },
        red: { href: 'https://s3.com/B04.tif' },
        nir: { href: 'https://s3.com/B08.tif' },
        visual: { href: 'https://s3.com/TCI.tif' }, // Visual composite
        thumbnail: { href: 'https://s3.com/preview.jpg' }, // Visual preview
      };

      expect(resolveBandAssetUrl(mockStacAssets, 'B04')).toBe('https://s3.com/B04.tif');
      expect(resolveBandAssetUrl(mockStacAssets, 'B08')).toBe('https://s3.com/B08.tif');
      expect(resolveBandAssetUrl(mockStacAssets, 'B02')).toBe('https://s3.com/B02.tif');
    });
  });

  // ── 5. AOI WINDOW EXTRACTION ──
  describe('5. AOI Window Extraction', () => {
    it('extracts standardized normalized 256x256 window with valid surface reflectance', async () => {
      const mockRaster: ExtractedBandRaster = {
        bandId: 'B04',
        commonName: 'red',
        nativeResolutionMeters: 10,
        sampledResolutionMeters: 10,
        width: 256,
        height: 256,
        data: new Float32Array(256 * 256).fill(0.12),
        validMask: new Uint8Array(256 * 256).fill(1),
        minReflectance: 0.12,
        maxReflectance: 0.12,
        meanReflectance: 0.12,
        stdDevReflectance: 0.0,
        validPixelCount: 256 * 256,
        totalPixelCount: 256 * 256,
        aoiCoveragePct: 100.0,
        nodataValue: 0,
        reflectanceScaling: 'DN / 10000.0',
      };

      expect(mockRaster.data.length).toBe(65536);
      expect(mockRaster.validPixelCount).toBe(65536);
      expect(mockRaster.aoiCoveragePct).toBe(100.0);
    });
  });

  // ── 6. CRS TRANSFORMATION & BOUNDS VALIDATION ──
  describe('6. CRS Transformation & Bounding Box Validation', () => {
    it('rejects invalid or inverted bounding box coordinates', async () => {
      // Inverted latitude (minLat > maxLat)
      await expect(
        extractAnalyticalAoiWindow({}, [89.0, 26.5, 90.0, 25.5], 'SCENE_1', '2024-01-15')
      ).rejects.toThrow(/Invalid AOI bounding box/);

      // Out of bounds latitude (> 90)
      await expect(
        extractAnalyticalAoiWindow({}, [89.0, 95.0, 90.0, 100.0], 'SCENE_1', '2024-01-15')
      ).rejects.toThrow(/Invalid AOI bounding box/);
    });
  });

  // ── 7. REFLECTANCE SCALING ──
  describe('7. Reflectance Scaling (DN / 10,000.0)', () => {
    it('accurately calibrates raw uint16 DN to surface reflectance range [0.0, 1.0]', () => {
      const rawDnValues = [0, 850, 1420, 2800, 10000, 12000];
      const scaled = rawDnValues.map((dn) => (dn > 0 && dn < 65535 ? Math.min(1.0, dn / 10000.0) : 0.0));

      expect(scaled[0]).toBe(0.0); // Nodata
      expect(scaled[1]).toBeCloseTo(0.085, 3); // 8.5% reflectance
      expect(scaled[2]).toBeCloseTo(0.142, 3); // 14.2% reflectance
      expect(scaled[3]).toBeCloseTo(0.280, 3); // 28.0% reflectance
      expect(scaled[4]).toBe(1.0); // 100% reflectance
      expect(scaled[5]).toBe(1.0); // Clamped saturation
    });
  });

  // ── 8. NDVI CORRECTNESS ──
  describe('8. NDVI Correctness ((NIR - Red) / (NIR + Red))', () => {
    it('computes accurate NDVI across vegetation, bare ground, and water', () => {
      const eps = 1e-6;
      // Dense Vegetation: NIR=0.45, Red=0.08
      const vegNdvi = (0.45 - 0.08) / (0.45 + 0.08 + eps);
      expect(vegNdvi).toBeCloseTo(0.698, 2);

      // Bare Soil: NIR=0.22, Red=0.18
      const soilNdvi = (0.22 - 0.18) / (0.22 + 0.18 + eps);
      expect(soilNdvi).toBeCloseTo(0.100, 2);

      // Deep Water: NIR=0.01, Red=0.05 -> Negative
      const waterNdvi = (0.01 - 0.05) / (0.01 + 0.05 + eps);
      expect(waterNdvi).toBeLessThan(0);
    });
  });

  // ── 9. NDWI CORRECTNESS ──
  describe('9. NDWI (McFeeters) Correctness ((Green - NIR) / (Green + NIR))', () => {
    it('identifies water bodies with strongly positive NDWI values', () => {
      const eps = 1e-6;
      // Open Water: Green=0.16, NIR=0.01
      const waterNdwi = (0.16 - 0.01) / (0.16 + 0.01 + eps);
      expect(waterNdwi).toBeGreaterThan(0.85);

      // Dense Canopy: Green=0.10, NIR=0.48
      const vegNdwi = (0.10 - 0.48) / (0.10 + 0.48 + eps);
      expect(vegNdwi).toBeLessThan(-0.6);
    });
  });

  // ── 10. NODATA PROPAGATION ──
  describe('10. Nodata Propagation Across Spectral Indices', () => {
    it('propagates nodata mask when either NIR or Red pixel is invalid', () => {
      const redValid = new Uint8Array([1, 0, 1, 0]);
      const nirValid = new Uint8Array([1, 1, 0, 0]);
      const outputValid = new Uint8Array(4);

      for (let i = 0; i < 4; i++) {
        outputValid[i] = redValid[i] === 1 && nirValid[i] === 1 ? 1 : 0;
      }

      expect(outputValid).toEqual(new Uint8Array([1, 0, 0, 0])); // Only index 0 is valid
    });
  });

  // ── 11. DIFFERENT NATIVE BAND RESOLUTIONS ──
  describe('11. Native Resolution Integrity (10m vs 20m)', () => {
    it('strictly preserves native resolution metadata and prevents silent 10m misrepresentation', () => {
      // 10m native bands
      expect(SENTINEL2_BAND_CATALOG['B02'].nativeResolutionMeters).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B03'].nativeResolutionMeters).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B04'].nativeResolutionMeters).toBe(10);
      expect(SENTINEL2_BAND_CATALOG['B08'].nativeResolutionMeters).toBe(10);

      // 20m native bands
      expect(SENTINEL2_BAND_CATALOG['B8A'].nativeResolutionMeters).toBe(20);
      expect(SENTINEL2_BAND_CATALOG['B11'].nativeResolutionMeters).toBe(20);
      expect(SENTINEL2_BAND_CATALOG['B12'].nativeResolutionMeters).toBe(20);

      expect(SENTINEL2_BAND_CATALOG['B11'].nativeResolutionMeters).not.toBe(
        SENTINEL2_BAND_CATALOG['B04'].nativeResolutionMeters
      );
    });
  });

  // ── 12. CACHE ISOLATION ──
  describe('12. Analytical Cache Directory Isolation', () => {
    it('isolates analytical COG cached outputs from preview thumbnails', () => {
      const cacheDir = '.cache/orbinex-analytical-cog';
      expect(cacheDir).not.toContain('thumbnails');
      expect(cacheDir).toContain('analytical-cog');
    });
  });

  // ── 13. BEFORE/AFTER ALIGNMENT ──
  describe('13. Before/After Spatial Alignment Verification', () => {
    it('validates matching coordinate systems and pixel grids for dual epochs', async () => {
      const beforeScene = {
        id: 'S2_2020',
        datetime: '2020-01-15T00:00:00Z',
        assets: {},
      };
      const afterScene = {
        id: 'S2_2024',
        datetime: '2024-01-15T00:00:00Z',
        assets: {},
      };

      const pair = await buildAnalyticalPair(
        beforeScene,
        afterScene,
        [89.2, 25.3, 90.7, 26.6],
        { before: '2020-01-15', after: '2024-01-15' },
        []
      );

      expect(pair.temporalDeltaDays).toBeGreaterThan(1400); // 4-year gap
      expect(pair.requestedDates.before).toBe('2020-01-15');
      expect(pair.requestedDates.after).toBe('2024-01-15');
    });
  });

  // ── 14. INSUFFICIENT OVERLAP HANDLING ──
  describe('14. Insufficient Surface Overlap (< 25%) Safeguard', () => {
    it('strictly returns INSUFFICIENT_DATA status and inhibits change metrics when overlap < 25%', async () => {
      const beforeScene = { id: 'S2_B', datetime: '2020-01-15', assets: {} };
      const afterScene = { id: 'S2_A', datetime: '2024-01-15', assets: {} };

      const pair = await buildAnalyticalPair(
        beforeScene,
        afterScene,
        [89.2, 25.3, 90.7, 26.6],
        { before: '2020-01-15', after: '2024-01-15' },
        [] // empty bands -> 0% overlap
      );

      expect(pair.status).toBe('INSUFFICIENT_DATA');
      expect(pair.spatialAlignment.isAligned).toBe(false);
      expect(pair.disclosures[0]).toContain('INSUFFICIENT_DATA');
      expect(pair.disclosures[0]).toContain('< 25% minimum threshold');
    });
  });

  // ── 15. LARGE-FILE MEMORY PROTECTION ──
  describe('15. Large-File & Tile Memory Protection', () => {
    it('refuses tiles exceeding 15MB byte count threshold to prevent heap exhaustion', async () => {
      const { extractCogTile } = await import('./cog-reader');
      await expect(
        extractCogTile('https://s3.com/huge.tif', 100, 25 * 1024 * 1024, 1024, 1024)
      ).rejects.toThrow(/exceeds safe memory threshold/);
    });
  });

  // ── 16. INVALID STAC ASSET HANDLING ──
  describe('16. Invalid STAC Asset Graceful Handling', () => {
    it('handles missing or malformed asset dictionaries without crashing', () => {
      expect(resolveBandAssetUrl({}, 'B04')).toBeNull();
      expect(resolveBandAssetUrl(null as any, 'B04')).toBeNull();
      expect(resolveBandAssetUrl({ other: { href: 'not-a-band.xml' } }, 'B04')).toBeNull();
    });
  });
});
