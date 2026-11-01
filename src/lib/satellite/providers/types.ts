/**
 * ORBINEX — Multi-Provider Satellite Intelligence Types
 * Defines the unified normalized schema for all Earth Observation satellite providers.
 */

export type ProviderType = 'open' | 'commercial';

export type ResolutionClass = 'sub_meter' | 'high_res' | 'regional' | 'coarse';

export type CommercialAccessStatus =
  | 'ready_to_download'
  | 'order_required'
  | 'metadata_only'
  | 'unauthorized'
  | 'unavailable';

export type AssetPipelineStage =
  | 'catalogue_metadata'
  | 'thumbnail_preview'
  | 'licensed_asset'
  | 'downloadable_raster'
  | 'processed_raster';

export interface CommercialRasterAsset {
  key: string;
  name: string;
  type: 'panchromatic' | 'multispectral' | 'pansharpened' | 'visual' | 'thumbnail' | 'metadata_xml' | 'dem';
  format: 'COG' | 'GeoTIFF' | 'JPEG2000' | 'PNG' | 'JPEG' | 'XML';
  resolutionMeters: number;
  downloadUrl?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  isAuthorized: boolean;
}

export interface CommercialOrderRequirements {
  minOrderAreaKm2: number;
  requestedAreaKm2: number;
  billableAreaKm2: number;
  estimatedCostUsd: number;
  turnaroundHours: number;
  humanApprovalRequired: boolean;
  isPurchased: boolean;
  taskingEligible: boolean;
  orderSafeguardNotice: string;
}

export type LicensingTier =
  | 'open_access'
  | 'commercial_metadata_only'
  | 'commercial_licensed'
  | 'tasking_required';

export interface LicensingInfo {
  tier: LicensingTier;
  requiresCredentials: boolean;
  hasCredentials: boolean;
  attribution: string;
  termsUrl?: string;
  estimatedCostUSD?: number;
  notice?: string;
}

export interface SmallAreaEvaluation {
  areaM2: number;
  areaSqFt: number;
  areaAcres: number;
  areaKm2: number;
  isSmallPlot: boolean; // true if <= 50,000 m2 (~12.3 acres)
  pixelsOnAOI: number;
  resolutionTier: ResolutionClass;
  suitabilityStatus: 'SUITABLE' | 'MARGINAL' | 'INSUFFICIENT';
  suitabilitySummary: string;
  limitations: string[];
}

export interface NormalizedSatelliteObservation {
  id: string;
  providerId: string;
  providerName: string;
  satellite: string;
  sensor: string;
  modality: 'optical' | 'sar' | 'thermal' | 'composite';
  acquisitionDate: string;
  gsdMeters: number;
  panchromaticResolutionMeters?: number;
  multispectralResolutionMeters?: number;
  crs: string; // EPSG identifier, e.g. "EPSG:4326"
  cloudCover: number | null;
  bands: string[];
  productLevel: string;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  footprint?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  aoiIntersectionPercent: number; // 0 to 100%
  thumbnailUrl: string;
  visualUrl: string;
  isRasterAvailable: boolean;
  accessStatus: CommercialAccessStatus;
  assetStage: AssetPipelineStage;
  availableAssets: CommercialRasterAsset[];
  orderRequirements?: CommercialOrderRequirements;
  downloadAvailability: boolean;
  licensing: LicensingInfo;
  suitability: SmallAreaEvaluation;
  rankingScore?: number;
}

export interface SatelliteDiscoveryQuery {
  bbox?: [number, number, number, number];
  lat?: number;
  lng?: number;
  radiusKm?: number;
  targetDate?: string;
  startDate?: string;
  endDate?: string;
  maxCloudCover?: number;
  providerFilter?: string[];
  platform?: string;
  limit?: number;
}

export interface ProviderStatus {
  id: string;
  name: string;
  type: ProviderType;
  nominalGSDMeters: number;
  isConfigured: boolean;
  configuredEnvVar?: string;
  status: 'active' | 'unconfigured' | 'quota_exceeded' | 'error';
  description: string;
  licensingTier: LicensingTier;
  attribution: string;
}

export interface MultiProviderDiscoveryResult {
  success: boolean;
  query: SatelliteDiscoveryQuery;
  aoiAreaM2: number;
  aoiAreaSqFt: number;
  aoiAreaKm2: number;
  smallAreaEvaluation: SmallAreaEvaluation;
  providers: ProviderStatus[];
  totalObservationsFound: number;
  observations: NormalizedSatelliteObservation[];
  rankedBestObservation: NormalizedSatelliteObservation | null;
  resolutionLimitNotice?: string;
  timestamp: string;
}
