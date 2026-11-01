/**
 * ORBINEX — Unified Geospatial Dataset Catalogue & Acquisition Engine Types
 * Covers all 8 domain categories across satellite, terrain, land-cover, infrastructure,
 * water, environmental disasters, population, and AI training benchmarks.
 */

export type DatasetCategory =
  | 'satellite'
  | 'elevation'
  | 'landcover'
  | 'infrastructure'
  | 'hydrology'
  | 'environmental'
  | 'population'
  | 'ai_benchmark';

export type DatasetTier =
  | 'cloud_streaming'      // Streamed directly on demand via COG range/WMTS without full download
  | 'on_demand_aoi'       // Downloaded and clipped selectively to user AOI footprint
  | 'bulk_reference'      // Static global/regional reference polygons (e.g. HydroBASINS)
  | 'commercial_licensed'; // Commercial sub-meter imagery requiring explicit approval

export type DatasetLicense =
  | 'Copernicus Open Access'
  | 'USGS Public Domain'
  | 'Open Database License (ODbL)'
  | 'Open Data Commons Open Database License (ODbL)'
  | 'Creative Commons CC-BY-4.0'
  | 'Creative Commons CC-BY-SA-4.0'
  | 'Creative Commons CC-BY-NC-4.0'
  | 'Creative Commons CC-BY-NC-SA-4.0'
  | 'Open Access / Creative Commons'
  | 'NASA Public Domain'
  | 'Open Access / NASA Public Domain'
  | 'Open Access / Public Domain'
  | 'Community Data License Agreement (CDLA-Permissive-1.0)'
  | 'Open Government / Public Domain'
  | 'Commercial Tasking / Paid License'
  | 'Academic & Research Only';

export type AccessMethod =
  | 'stac_api'
  | 'cog_range_streaming'
  | 'overpass_vector_api'
  | 'wms_wmts'
  | 'direct_download'
  | 'planetary_computer'
  | 'gee_rest_api'
  | 'vendor_tasking_api';

export type AuthRequirement =
  | 'none_open'
  | 'free_account_key'
  | 'cloud_requester_pays'
  | 'commercial_payment_gated';

export interface DatasetRecord {
  id: string;
  name: string;
  category: DatasetCategory;
  tier: DatasetTier;
  provider: string;
  license: DatasetLicense;
  auth: AuthRequirement;
  nativeResolution: string; // e.g. "10m", "30m", "0.5m", "Vector"
  spatialCrs: string;       // e.g. "EPSG:4326", "EPSG:3857"
  temporalCoverage: string; // e.g. "2015-present", "1984-2021"
  updateFrequency: string;  // e.g. "5 days", "Daily", "Annual", "Static"
  description: string;
  primaryUseCases: string[];
  accessMethod: AccessMethod;
  endpointUrl?: string;
  documentationUrl: string;
  citation: string;
  aoiClipSupported: boolean;
  cloudNativeStreamable: boolean;
  status: 'operational_streaming' | 'on_demand_ready' | 'adapter_configured' | 'approval_gated';
}

export interface DatasetAcquisitionRequest {
  datasetId: string;
  aoiBbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  aoiName?: string;
  targetDate?: string;
  targetResolutionMeters?: number;
  format?: 'geojson' | 'geotiff' | 'png' | 'parquet' | 'csv';
}

export interface AcquiredDatasetManifestEntry {
  fileId: string;
  datasetId: string;
  datasetName: string;
  category: DatasetCategory;
  filePath: string;
  relativePath: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  sha256Checksum: string;
  aoiBbox: [number, number, number, number];
  aoiName: string;
  acquisitionDate: string;
  timestamp: string;
  format: string;
  status: 'verified_available' | 'corrupt' | 'pending';
  provenance: {
    provider: string;
    license: DatasetLicense;
    sourceEndpoint: string;
  };
}

export interface DatasetCatalogueSummary {
  totalDatasets: number;
  byCategory: Record<DatasetCategory, number>;
  byTier: Record<DatasetTier, number>;
  byAuth: Record<AuthRequirement, number>;
  totalLocalFilesAcquired: number;
  totalLocalStorageBytes: number;
  localStorageFormatted: string;
}
