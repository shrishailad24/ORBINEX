import { NextResponse } from 'next/server';
import { normalizeAssetHref, bboxToQuadCoordinates } from '@/lib/satellite/stac-client';

// Sentinel Satellite — STAC Catalog via Element84 Earth Search + Copernicus fallback
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const radius = parseFloat(searchParams.get('radius') || '2');
  const days = parseInt(searchParams.get('days') || '30'); // Expanded to 30 days for more results
  const requestedCollection = searchParams.get('collection'); // Optional explicit collection

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Missing lat/lng parameters' }, { status: 400 });
  }

  try {
    const bbox = [lng - radius, lat - radius, lng + radius, lat + radius];
    const now = new Date();
    const from = new Date(now.getTime() - days * 86400000);
    const datetime = `${from.toISOString().split('.')[0]}Z/${now.toISOString().split('.')[0]}Z`;

    let scenes: any[] = [];
    let source = '';
    let total = 0;

    const collectionsToTry = requestedCollection
      ? [requestedCollection]
      : ['sentinel-2-l2a', 'sentinel-1-grd'];

    // Source 1: Element84 Earth Search v1
    for (const col of collectionsToTry) {
      if (scenes.length > 0) break;
      try {
        const res = await fetch('https://earth-search.aws.element84.com/v1/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            collections: [col],
            bbox,
            datetime,
            limit: 20,
            sortby: [{ field: 'properties.datetime', direction: 'desc' }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          scenes = (data.features || []).map(formatScene);
          total = data.numberMatched || scenes.length;
          source = `element84-${col}`;
        }
      } catch (e) {
        console.warn('[ORBINEX] Suppressed error in Element84 query:', e instanceof Error ? e.message : e);
      }
    }

    // Source 2: Copernicus STAC fallback
    if (scenes.length === 0) {
      try {
        const fallbackRes = await fetch('https://catalogue.dataspace.copernicus.eu/stac/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            collections: ['SENTINEL-2'],
            bbox,
            datetime,
            limit: 10,
          }),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          scenes = (data.features || []).map(formatScene);
          total = data.numberMatched || scenes.length;
          source = 'copernicus';
        }
      } catch (e) {
        console.warn('[ORBINEX] Suppressed error in Copernicus query:', e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json(
      {
        source,
        scenes,
        total,
        bbox,
        datetime,
        timestamp: new Date().toISOString(),
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      }
    );
  } catch (e) {
    return NextResponse.json({ error: 'Sentinel lookup failed', scenes: [] }, { status: 500 });
  }
}

function formatScene(feature: any) {
  const props = feature.properties || {};
  const assets = feature.assets || {};

  const rawThumb = assets.thumbnail?.href || assets.preview?.href || assets.overview?.href || null;
  const rawVisual = assets.visual?.href || assets.TCI?.href || assets.vv?.href || rawThumb;

  const thumbnail = normalizeAssetHref(rawThumb);
  const visualUrl = normalizeAssetHref(rawVisual);

  const quadCoords = feature.bbox && feature.bbox.length === 4
    ? bboxToQuadCoordinates(feature.bbox as [number, number, number, number])
    : null;

  const processUrl = thumbnail
    ? `/api/satellite/process?url=${encodeURIComponent(thumbnail)}&platform=${encodeURIComponent(props.platform || 'Sentinel')}&stretch=true`
    : null;

  return {
    id: feature.id,
    datetime: props.datetime,
    platform: props.platform || props['sar:instrument_mode'] || 'Sentinel',
    orbit: props['sat:orbit_state'] || props.orbitDirection,
    polarization: props['sar:polarizations'] || props.polarisation,
    mode: props['sar:instrument_mode'] || props.productType,
    resolution: props['sar:resolution_range'] || 10,
    pass_direction: props['sat:relative_orbit'] || null,
    cloud_cover: props['eo:cloud_cover'] ?? null,
    bbox: feature.bbox,
    coordinates: quadCoords,
    thumbnail,
    preview: thumbnail,
    visualUrl,
    processUrl,
    geometry_type: feature.geometry?.type,
    area_km2: feature.bbox ? estimateArea(feature.bbox) : null,
    attribution: 'Contains modified Copernicus Sentinel data [2024], processed by ORBINEX / Element84',
  };
}

function estimateArea(bbox: number[]): number {
  if (bbox.length < 4) return 0;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const latDiff = Math.abs(maxLat - minLat) * 111;
  const lngDiff = Math.abs(maxLng - minLng) * 111 * Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180);
  return Math.round(latDiff * lngDiff);
}
