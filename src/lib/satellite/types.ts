/**
 * ORBINEX — Satellite Imagery & Geospatial Intelligence Types
 * Defines data structures for STAC items, optical/SAR scenes, historical comparison pairs, and AOI filters.
 */

export type SatellitePlatform = 'Sentinel-2' | 'Sentinel-1' | 'Landsat-8' | 'Landsat-9' | 'NASA-GIBS' | 'Wayback';

export type ImageryModality = 'optical' | 'sar' | 'thermal' | 'composite';

export interface GeoBoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export type MapLibreQuadCoordinates = [
  [number, number], // Top-Left: [lng, lat]
  [number, number], // Top-Right: [lng, lat]
  [number, number], // Bottom-Right: [lng, lat]
  [number, number]  // Bottom-Left: [lng, lat]
];

export interface SatelliteSceneAsset {
  key: string;
  name: string;
  href: string;
  type: string;
  isCOG?: boolean;
  role: 'visual' | 'thumbnail' | 'data' | 'metadata';
}

export interface SatelliteScene {
  id: string;
  platform: SatellitePlatform;
  modality: ImageryModality;
  collection: string;
  datetime: string;
  cloudCover: number | null;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  coordinates: MapLibreQuadCoordinates;
  thumbnailUrl: string;
  visualUrl: string;
  tileUrlTemplate?: string;
  metadata: {
    resolutionMeters: number;
    orbitDirection?: 'ascending' | 'descending';
    polarization?: string[];
    instrument?: string;
    sunElevation?: number;
  };
}

export interface HistoricalComparisonPair {
  locationName: string;
  center: { lat: number; lng: number };
  zoom: number;
  before: {
    targetDate: string;
    matchedScene: SatelliteScene | null;
    tileUrl?: string;
  };
  after: {
    targetDate: string;
    matchedScene: SatelliteScene | null;
    tileUrl?: string;
  };
}

export interface STACSearchQuery {
  bbox?: [number, number, number, number];
  lat?: number;
  lng?: number;
  radiusKm?: number;
  startDate?: string;
  endDate?: string;
  targetDate?: string;
  platform?: SatellitePlatform | 'all';
  maxCloudCover?: number; // 0 - 100
  limit?: number;
}
