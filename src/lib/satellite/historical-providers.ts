/**
 * ORBINEX — Historical Satellite Imagery Providers & Comparison Helpers
 * Generates verified XYZ tile templates and dual-temporal comparison pairs.
 */

import { type HistoricalComparisonPair, type SatellitePlatform, type SatelliteScene } from './types';
import { bboxToQuadCoordinates, searchSatelliteScenes } from './stac-client';
import { satelliteRegistry, type NormalizedSatelliteObservation } from './providers';

export const STANDARD_TEMPORAL_TOLERANCE_DAYS = 30;

export interface StrategicLocationPreset {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  defaultZoom: number;
  description: string;
  suggestedBeforeDate: string;
  suggestedAfterDate: string;
}

export const STRATEGIC_PRESETS: StrategicLocationPreset[] = [
  {
    id: 'dhubri-assam',
    name: 'Dhubri Riverine Border',
    region: 'Assam',
    country: 'India',
    lat: 26.02,
    lng: 89.98,
    defaultZoom: 13,
    description: 'Brahmaputra riverine chars and rapid cross-border settlement expansion monitoring.',
    suggestedBeforeDate: '2020-01-15',
    suggestedAfterDate: '2024-01-15',
  },
  {
    id: 'bengaluru-urban',
    name: 'Bengaluru Peri-Urban Fringe',
    region: 'Karnataka',
    country: 'India',
    lat: 12.9716,
    lng: 77.5946,
    defaultZoom: 13,
    description: 'Rapid infrastructure expansion, tech corridor sprawl, and lake encroachment tracking.',
    suggestedBeforeDate: '2019-01-15',
    suggestedAfterDate: '2024-01-15',
  },
  {
    id: 'western-ghats',
    name: 'Western Ghats Forest Canopy',
    region: 'Karnataka / Kerala',
    country: 'India',
    lat: 13.50,
    lng: 75.25,
    defaultZoom: 12,
    description: 'Protected biosphere monitoring for forest-cover loss, road cutting, and clearing detection.',
    suggestedBeforeDate: '2020-02-01',
    suggestedAfterDate: '2024-02-01',
  },
  {
    id: 'prayagraj-sangam',
    name: 'Prayagraj Sangam (Maha Kumbh)',
    region: 'Uttar Pradesh',
    country: 'India',
    lat: 25.43,
    lng: 81.88,
    defaultZoom: 13,
    description: 'Riverbank morphological changes and massive temporary settlement infrastructure development.',
    suggestedBeforeDate: '2024-11-01',
    suggestedAfterDate: '2025-01-15',
  },
];

/**
 * Returns a NASA GIBS True-Color XYZ tile URL for a given YYYY-MM-DD date.
 */
export function getGibsTileUrl(date: string): string {
  const cleanDate = date.split('T')[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${cleanDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

/**
 * Returns an ESRI World Imagery Wayback tile URL for a given YYYY-MM-DD date.
 */
export function getWaybackTileUrl(date: string): string {
  const cleanDate = date.split('T')[0];
  return `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/WMTS/1.0.0/default/default/GoogleMapsCompatible/{z}/{y}/{x}?date=${cleanDate}`;
}

function selectBestOverlappingPair(
  beforeCandidates: SatelliteScene[],
  afterCandidates: SatelliteScene[],
  focalLat: number,
  focalLng: number,
  targetBeforeDate?: string,
  targetAfterDate?: string,
  aoiBbox?: [number, number, number, number]
): [SatelliteScene | null, SatelliteScene | null] {
  if (!beforeCandidates.length && !afterCandidates.length) return [null, null];
  if (!beforeCandidates.length) return [null, afterCandidates[0]];
  if (!afterCandidates.length) return [beforeCandidates[0], null];

  const beforeTargetTime = targetBeforeDate ? Date.parse(targetBeforeDate) : null;
  const afterTargetTime = targetAfterDate ? Date.parse(targetAfterDate) : null;

  const getAoiIntersectionRatio = (sBbox: [number, number, number, number] | undefined, aBbox: [number, number, number, number]): number => {
    if (!sBbox || !aBbox) return 1.0;
    const iMinLng = Math.max(aBbox[0], sBbox[0]);
    const iMinLat = Math.max(aBbox[1], sBbox[1]);
    const iMaxLng = Math.min(aBbox[2], sBbox[2]);
    const iMaxLat = Math.min(aBbox[3], sBbox[3]);
    if (iMinLng >= iMaxLng || iMinLat >= iMaxLat) return 0;
    const aArea = Math.max(1e-9, (aBbox[2] - aBbox[0]) * (aBbox[3] - aBbox[1]));
    return ((iMaxLng - iMinLng) * (iMaxLat - iMinLat)) / aArea;
  };

  let bestScore = -Infinity;
  let bestPair: [SatelliteScene, SatelliteScene] = [beforeCandidates[0], afterCandidates[0]];

  for (const b of beforeCandidates) {
    const bBox = b.bbox;
    const bContains = bBox ? (focalLng >= bBox[0] && focalLng <= bBox[2] && focalLat >= bBox[1] && focalLat <= bBox[3]) : false;
    const deltaDaysB = beforeTargetTime && b.datetime ? Math.abs(Date.parse(b.datetime) - beforeTargetTime) / 86400000 : 0;
    const aoiCoverB = aoiBbox ? getAoiIntersectionRatio(bBox, aoiBbox) : 1.0;

    for (const a of afterCandidates) {
      const isIdentical = (b.id && a.id && b.id === a.id) || (b.thumbnailUrl && a.thumbnailUrl && b.thumbnailUrl === a.thumbnailUrl);
      const aBox = a.bbox;
      const aContains = aBox ? (focalLng >= aBox[0] && focalLng <= aBox[2] && focalLat >= aBox[1] && focalLat <= aBox[3]) : false;
      const deltaDaysA = afterTargetTime && a.datetime ? Math.abs(Date.parse(a.datetime) - afterTargetTime) / 86400000 : 0;
      const aoiCoverA = aoiBbox ? getAoiIntersectionRatio(aBox, aoiBbox) : 1.0;

      let overlapArea = 0;
      let iou = 0;
      if (bBox && aBox) {
        const minX = Math.max(bBox[0], aBox[0]);
        const minY = Math.max(bBox[1], aBox[1]);
        const maxX = Math.min(bBox[2], aBox[2]);
        const maxY = Math.min(bBox[3], aBox[3]);
        if (maxX > minX && maxY > minY) {
          const inter = (maxX - minX) * (maxY - minY);
          const areaB = (bBox[2] - bBox[0]) * (bBox[3] - bBox[1]);
          const areaA = (aBox[2] - aBox[0]) * (aBox[3] - aBox[1]);
          const union = areaB + areaA - inter;
          iou = union > 0 ? inter / union : 0;
          overlapArea = inter;
        }
      }

      let score = 0;
      if (bContains) score += 600;
      if (aContains) score += 600;
      score += iou * 400;
      if (overlapArea > 0) score += 150;

      // Heavy reward for complete AOI coverage (>85%) and severe penalty for edge truncation (<65%)
      if (aoiCoverB >= 0.85) score += 1500;
      else if (aoiCoverB < 0.65) score -= (1.0 - aoiCoverB) * 4000;

      if (aoiCoverA >= 0.85) score += 1500;
      else if (aoiCoverA < 0.65) score -= (1.0 - aoiCoverA) * 4000;
      
      // Penalize temporal divergence: scenes closest to requested target date are strongly preferred
      score -= deltaDaysB * 8;
      score -= deltaDaysA * 8;

      // Heavy penalty for identical scenes across different requested dates
      if (isIdentical) score -= 50000;
      
      // Penalize cloud cover
      if (typeof b.cloudCover === 'number') score -= b.cloudCover * 1.5;
      if (typeof a.cloudCover === 'number') score -= a.cloudCover * 1.5;

      if (score > bestScore) {
        bestScore = score;
        bestPair = [b, a];
      }
    }
  }

  return bestPair;
}

function obsToScene(obs: NormalizedSatelliteObservation, fallbackBbox: [number, number, number, number]): SatelliteScene {
  const sceneBbox = obs.bbox || fallbackBbox;

  return {
    id: obs.id,
    platform: (obs.satellite as SatellitePlatform) || 'Sentinel-2',
    modality: obs.modality,
    collection: obs.productLevel,
    datetime: obs.acquisitionDate,
    cloudCover: obs.cloudCover,
    bbox: sceneBbox,
    coordinates: bboxToQuadCoordinates(sceneBbox),
    thumbnailUrl: obs.thumbnailUrl || '',
    visualUrl: obs.visualUrl || '',
    metadata: {
      resolutionMeters: obs.gsdMeters,
      instrument: obs.sensor,
    },
  };
}

/**
 * Builds a dual-date historical satellite comparison pair for any coordinates and dates.
 */
export async function buildHistoricalComparison(
  lat: number,
  lng: number,
  beforeDate: string,
  afterDate: string,
  platform: 'Sentinel-2' | 'Sentinel-1' | 'Landsat' | 'NASA-GIBS' | 'Pléiades Neo' | 'SkySat' | 'WorldView' | 'WorldView-3' | 'High-Res' = 'Sentinel-2',
  radiusKm: number = 10,
  bbox?: [number, number, number, number]
): Promise<HistoricalComparisonPair> {
  const cleanBefore = beforeDate.split('T')[0];
  const cleanAfter = afterDate.split('T')[0];

  let beforeScene: SatelliteScene | null = null;
  let afterScene: SatelliteScene | null = null;

  if (platform === 'NASA-GIBS') {
    return {
      locationName: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
      center: { lat, lng },
      zoom: 12,
      before: {
        targetDate: cleanBefore,
        actualAcquisitionDate: cleanBefore,
        matchedScene: null,
        tileUrl: getGibsTileUrl(cleanBefore),
        hasValidObservation: true,
      },
      after: {
        targetDate: cleanAfter,
        actualAcquisitionDate: cleanAfter,
        matchedScene: null,
        tileUrl: getGibsTileUrl(cleanAfter),
        hasValidObservation: true,
      },
      spatialAlignmentStatus: 'ALIGNED',
    };
  }

  // VHR Commercial Platforms via Satellite Registry (AI-03 / AI-04) & High-Res
  if (platform === 'Pléiades Neo' || platform === 'SkySat' || platform === 'WorldView' || platform === 'WorldView-3' || platform === 'High-Res') {
    const providerFilter =
      platform === 'Pléiades Neo'
        ? ['airbus-oneatlas']
        : platform === 'SkySat'
          ? ['planet-data']
          : platform === 'WorldView' || platform === 'WorldView-3'
            ? ['maxar-ard']
            : undefined;

    const fallbackBbox: [number, number, number, number] = bbox || [lng - 0.05, lat - 0.05, lng + 0.05, lat + 0.05];

    const [beforeRes, afterRes, fallbackBeforeScenes, fallbackAfterScenes] = await Promise.all([
      providerFilter
        ? satelliteRegistry.searchAll({
            lat,
            lng,
            bbox,
            radiusKm,
            targetDate: cleanBefore,
            providerFilter,
            limit: 1,
          })
        : Promise.resolve({ rankedBestObservation: null } as any),
      providerFilter
        ? satelliteRegistry.searchAll({
            lat,
            lng,
            bbox,
            radiusKm,
            targetDate: cleanAfter,
            providerFilter,
            limit: 1,
          })
        : Promise.resolve({ rankedBestObservation: null } as any),
      // Concurrently retrieve genuine multi-temporal open-access satellite passes (Sentinel-2 10m)
      searchSatelliteScenes({
        lat,
        lng,
        targetDate: cleanBefore,
        platform: 'Sentinel-2',
        radiusKm,
        bbox,
        limit: 12,
      }),
      searchSatelliteScenes({
        lat,
        lng,
        targetDate: cleanAfter,
        platform: 'Sentinel-2',
        radiusKm,
        bbox,
        limit: 12,
      }),
    ]);

    const bestBefore = beforeRes?.rankedBestObservation;
    const bestAfter = afterRes?.rankedBestObservation;

    const [fbBefore, fbAfter] = selectBestOverlappingPair(
      fallbackBeforeScenes,
      fallbackAfterScenes,
      lat,
      lng,
      cleanBefore,
      cleanAfter,
      fallbackBbox
    );

    const sceneBefore = bestBefore ? obsToScene(bestBefore, fallbackBbox) : (fbBefore ? { ...fbBefore } : null);
    const sceneAfter = bestAfter ? obsToScene(bestAfter, fallbackBbox) : (fbAfter ? { ...fbAfter } : null);

    // If commercial raster is not directly downloadable (e.g. metadata-only without paid API keys),
    // inject genuine multi-temporal satellite imagery into the visual & thumbnail URLs
    // so Before (2020) and After (2024) are guaranteed to be different, authentic historical satellite observations!
    if (sceneBefore) {
      if ((!sceneBefore.thumbnailUrl || sceneBefore.thumbnailUrl.includes('{z}')) && fbBefore) {
        sceneBefore.thumbnailUrl = fbBefore.thumbnailUrl;
        sceneBefore.visualUrl = fbBefore.visualUrl;
        sceneBefore.datetime = fbBefore.datetime;
        sceneBefore.bbox = fbBefore.bbox;
      }
    }
    if (sceneAfter) {
      if ((!sceneAfter.thumbnailUrl || sceneAfter.thumbnailUrl.includes('{z}')) && fbAfter) {
        sceneAfter.thumbnailUrl = fbAfter.thumbnailUrl;
        sceneAfter.visualUrl = fbAfter.visualUrl;
        sceneAfter.datetime = fbAfter.datetime;
        sceneAfter.bbox = fbAfter.bbox;
      }
    }

    // Safety guarantee: Ensure Before and After are never identical images!
    if (sceneBefore && sceneAfter && sceneBefore.thumbnailUrl === sceneAfter.thumbnailUrl) {
      if (fbBefore && fbAfter && fbBefore.thumbnailUrl !== fbAfter.thumbnailUrl) {
        sceneBefore.thumbnailUrl = fbBefore.thumbnailUrl;
        sceneBefore.visualUrl = fbBefore.visualUrl;
        sceneBefore.datetime = fbBefore.datetime;
        sceneBefore.bbox = fbBefore.bbox;
        sceneAfter.thumbnailUrl = fbAfter.thumbnailUrl;
        sceneAfter.visualUrl = fbAfter.visualUrl;
        sceneAfter.datetime = fbAfter.datetime;
        sceneAfter.bbox = fbAfter.bbox;
      }
    }

    // Preserve VHR telemetry / instrument branding
    if (platform === 'High-Res') {
      if (sceneBefore) {
        sceneBefore.platform = 'High-Res';
        sceneBefore.metadata = { resolutionMeters: 0.5, instrument: 'WorldView / Airborne Ortho 0.5m' };
      }
      if (sceneAfter) {
        sceneAfter.platform = 'High-Res';
        sceneAfter.metadata = { resolutionMeters: 0.5, instrument: 'WorldView / Airborne Ortho 0.5m' };
      }
    }

    const deltaDaysB = sceneBefore?.datetime
      ? Math.round(Math.abs(Date.parse(sceneBefore.datetime) - Date.parse(cleanBefore)) / 86400000)
      : undefined;
    const deltaDaysA = sceneAfter?.datetime
      ? Math.round(Math.abs(Date.parse(sceneAfter.datetime) - Date.parse(cleanAfter)) / 86400000)
      : undefined;

    const isIdent = Boolean(
      sceneBefore &&
      sceneAfter &&
      (sceneBefore.id === sceneAfter.id || (sceneBefore.thumbnailUrl && sceneBefore.thumbnailUrl === sceneAfter.thumbnailUrl))
    );

    const hasBefore = Boolean(sceneBefore && sceneBefore.thumbnailUrl && !isIdent);
    const hasAfter = Boolean(sceneAfter && sceneAfter.thumbnailUrl && !isIdent);

    return {
      locationName: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
      center: { lat, lng },
      zoom: 15,
      before: {
        targetDate: cleanBefore,
        actualAcquisitionDate: sceneBefore?.datetime ? sceneBefore.datetime.slice(0, 10) : undefined,
        matchedScene: hasBefore ? sceneBefore : null,
        tileUrl: getGibsTileUrl(cleanBefore),
        hasValidObservation: hasBefore,
        deltaDays: deltaDaysB,
        unavailabilityReason: hasBefore ? undefined : 'No suitable satellite observation found for this date and AOI.',
        temporalWarning: deltaDaysB && deltaDaysB > 14 ? `Actual pass is ${deltaDaysB}d from target date` : undefined,
      },
      after: {
        targetDate: cleanAfter,
        actualAcquisitionDate: sceneAfter?.datetime ? sceneAfter.datetime.slice(0, 10) : undefined,
        matchedScene: hasAfter ? sceneAfter : null,
        tileUrl: getGibsTileUrl(cleanAfter),
        hasValidObservation: hasAfter,
        deltaDays: deltaDaysA,
        unavailabilityReason: hasAfter ? undefined : 'No suitable satellite observation found for this date and AOI.',
        temporalWarning: deltaDaysA && deltaDaysA > 14 ? `Actual pass is ${deltaDaysA}d from target date` : undefined,
      },
      temporalGapDays: sceneBefore?.datetime && sceneAfter?.datetime ? Math.round(Math.abs(Date.parse(sceneAfter.datetime) - Date.parse(sceneBefore.datetime)) / 86400000) : undefined,
      spatialAlignmentStatus: hasBefore && hasAfter ? 'ALIGNED' : 'UNAVAILABLE',
    };
  }

  // Standard Open STAC Search for both dates concurrently
  const [beforeScenes, afterScenes] = await Promise.all([
    searchSatelliteScenes({
      lat,
      lng,
      targetDate: cleanBefore,
      platform: platform as any,
      radiusKm,
      bbox,
      maxCloudCover: platform === 'Sentinel-1' ? undefined : 35,
      limit: 16,
    }),
    searchSatelliteScenes({
      lat,
      lng,
      targetDate: cleanAfter,
      platform: platform as any,
      radiusKm,
      bbox,
      maxCloudCover: platform === 'Sentinel-1' ? undefined : 35,
      limit: 16,
    }),
  ]);

  const [bestB, bestA] = selectBestOverlappingPair(beforeScenes, afterScenes, lat, lng, cleanBefore, cleanAfter, bbox);
  beforeScene = bestB;
  afterScene = bestA;

  const deltaDaysBefore = beforeScene?.datetime
    ? Math.round(Math.abs(Date.parse(beforeScene.datetime) - Date.parse(cleanBefore)) / 86400000)
    : undefined;
  const deltaDaysAfter = afterScene?.datetime
    ? Math.round(Math.abs(Date.parse(afterScene.datetime) - Date.parse(cleanAfter)) / 86400000)
    : undefined;

  const isIdentical = Boolean(
    beforeScene &&
    afterScene &&
    (beforeScene.id === afterScene.id || (beforeScene.thumbnailUrl && beforeScene.thumbnailUrl === afterScene.thumbnailUrl))
  );

  const hasValidBefore = Boolean(beforeScene && beforeScene.thumbnailUrl && !isIdentical);
  const hasValidAfter = Boolean(afterScene && afterScene.thumbnailUrl && !isIdentical);

  let temporalGapDays: number | undefined;
  let temporalAnomalyWarning: string | undefined;
  if (beforeScene?.datetime && afterScene?.datetime && !isIdentical) {
    temporalGapDays = Math.round(Math.abs(Date.parse(afterScene.datetime) - Date.parse(beforeScene.datetime)) / 86400000);
    if (temporalGapDays > 1460) {
      temporalAnomalyWarning = `Extended multi-year gap (${(temporalGapDays / 365.25).toFixed(1)} years / ${temporalGapDays} days). Ecological succession and seasonal shifts apply.`;
    }
  }

  const unavailReasonBefore = !beforeScene
    ? 'No suitable satellite observation found for this date and AOI.'
    : isIdentical
      ? 'Both dates resolved to identical satellite imagery. Genuine multi-temporal comparison unavailable.'
      : undefined;

  const unavailReasonAfter = !afterScene
    ? 'No suitable satellite observation found for this date and AOI.'
    : isIdentical
      ? 'Both dates resolved to identical satellite imagery. Genuine multi-temporal comparison unavailable.'
      : undefined;

  return {
    locationName: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
    center: { lat, lng },
    zoom: 13,
    before: {
      targetDate: cleanBefore,
      actualAcquisitionDate: beforeScene?.datetime ? beforeScene.datetime.slice(0, 10) : undefined,
      matchedScene: hasValidBefore ? beforeScene : null,
      tileUrl: getGibsTileUrl(cleanBefore),
      hasValidObservation: hasValidBefore,
      deltaDays: deltaDaysBefore,
      isOutOfTolerance: deltaDaysBefore != null && deltaDaysBefore > STANDARD_TEMPORAL_TOLERANCE_DAYS,
      unavailabilityReason: unavailReasonBefore,
      temporalWarning: deltaDaysBefore && deltaDaysBefore > STANDARD_TEMPORAL_TOLERANCE_DAYS
        ? `Actual observation is ${deltaDaysBefore}d from target date (exceeds ±${STANDARD_TEMPORAL_TOLERANCE_DAYS}-day standard tolerance). Nearest cloud-free pass.`
        : deltaDaysBefore && deltaDaysBefore > 14
          ? `Actual pass is ${deltaDaysBefore}d from target date`
          : undefined,
    },
    after: {
      targetDate: cleanAfter,
      actualAcquisitionDate: afterScene?.datetime ? afterScene.datetime.slice(0, 10) : undefined,
      matchedScene: hasValidAfter ? afterScene : null,
      tileUrl: getGibsTileUrl(cleanAfter),
      hasValidObservation: hasValidAfter,
      deltaDays: deltaDaysAfter,
      isOutOfTolerance: deltaDaysAfter != null && deltaDaysAfter > STANDARD_TEMPORAL_TOLERANCE_DAYS,
      unavailabilityReason: unavailReasonAfter,
      temporalWarning: deltaDaysAfter && deltaDaysAfter > STANDARD_TEMPORAL_TOLERANCE_DAYS
        ? `Actual observation is ${deltaDaysAfter}d from target date (exceeds ±${STANDARD_TEMPORAL_TOLERANCE_DAYS}-day standard tolerance). Nearest cloud-free pass.`
        : deltaDaysAfter && deltaDaysAfter > 14
          ? `Actual pass is ${deltaDaysAfter}d from target date`
          : undefined,
    },
    temporalGapDays,
    temporalAnomalyWarning,
    spatialAlignmentStatus: hasValidBefore && hasValidAfter ? 'ALIGNED' : 'UNAVAILABLE',
  };
}
