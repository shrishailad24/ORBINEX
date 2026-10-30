/**
 * ORBINEX — Satellite Security & SSRF Protection
 * Sanitizes coordinates, bounding boxes, date ranges, and whitelists outbound asset URLs.
 */

const ALLOWED_IMAGERY_HOSTS = new Set([
  'sentinel-cogs.s3.us-west-2.amazonaws.com',
  'sentinel-s2-l2a.s3.amazonaws.com',
  'sentinel-s1-l1c.s3.amazonaws.com',
  'sentinel-s1-l1c.s3.us-west-2.amazonaws.com',
  'landsat-pds.s3.us-west-2.amazonaws.com',
  'earth-search.aws.element84.com',
  'gibs.earthdata.nasa.gov',
  'wayback.maptiles.arcgis.com',
  'services.arcgisonline.com',
  'catalogue.dataspace.copernicus.eu',
  'browser.dataspace.copernicus.eu',
  'planetarycomputer.microsoft.com',
  'tiles.rdnt.io',
]);

/**
 * Validates whether a target asset URL is on the strictly verified satellite provider allowlist.
 */
export function isAllowedSatelliteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (ALLOWED_IMAGERY_HOSTS.has(hostname)) return true;

    // Subdomain matching for trusted AWS S3 buckets or NASA/ESA services
    if (
      hostname.endsWith('.s3.us-west-2.amazonaws.com') ||
      hostname.endsWith('.s3.amazonaws.com') ||
      hostname.endsWith('.earthdata.nasa.gov') ||
      hostname.endsWith('.copernicus.eu')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validates and clamps a bounding box [minLng, minLat, maxLng, maxLat].
 */
export function validateBbox(bbox: number[]): [number, number, number, number] | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox;

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  if (minLat >= maxLat || minLng >= maxLng) return null;

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Converts a center lat/lng and radius in km into a valid bounding box.
 */
export function pointToBbox(lat: number, lng: number, radiusKm: number = 10): [number, number, number, number] {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const clampedLng = Math.max(-180, Math.min(180, lng));
  const safeRadius = Math.max(1, Math.min(100, radiusKm));

  const latDelta = safeRadius / 111.32;
  const lngDelta = safeRadius / (111.32 * Math.cos((clampedLat * Math.PI) / 180));

  return [
    Math.max(-180, clampedLng - lngDelta),
    Math.max(-85, clampedLat - latDelta),
    Math.min(180, clampedLng + lngDelta),
    Math.min(85, clampedLat + latDelta),
  ];
}

/**
 * Validates an ISO date string format (YYYY-MM-DD or full ISO).
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const ts = Date.parse(dateStr);
  return Number.isFinite(ts) && ts > 0;
}
