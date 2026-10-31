import type { GeoResult } from './geosearch';

export interface VerifiedPOI {
  name: string;
  context: string;
  lat: number;
  lng: number;
  kind: 'poi' | 'city' | 'region';
  aliases: string[];
}

/**
 * Curated directory of verified regional institutions, campuses,
 * road junctions, rural settlements, and known landmarks.
 */
export const VERIFIED_LOCAL_POIS: VerifiedPOI[] = [
  {
    name: "KLE's Prerana Residential PU Science College",
    context: "Kundgol Cross, Kotagondahunashi, Hubballi, Dharwad, Karnataka, India",
    lat: 15.3141171,
    lng: 75.1606321,
    kind: 'poi',
    aliases: [
      'prerana',
      'kle prerana',
      'prerana residential',
      'prerana pu college',
      'kles prerana residential pu science college',
      "kle's prerana residential pu science college",
      'prerana pu science college',
      'kle prerana kundgol cross',
      'prerana residential hubli',
      'prerana residential hubballi',
    ],
  },
  {
    name: "KLE Prerana PU College (Vidyanagar)",
    context: "Vidyanagar, Hubballi, Dharwad, Karnataka, India",
    lat: 15.3705906,
    lng: 75.1194666,
    kind: 'poi',
    aliases: [
      'prerana',
      'kle prerana',
      'prerana pu college',
      'kle prerana vidyanagar',
      'prerana college vidyanagar hubli',
    ],
  },
  {
    name: "Kundgol Cross (Kundagol Cross)",
    context: "NH48 / NH52 Junction, Bidnal, Hubballi, Karnataka, India",
    lat: 15.3141171,
    lng: 75.1606321,
    kind: 'poi',
    aliases: [
      'kundgol cross',
      'kundagol cross',
      'kundgol road junction',
      'kundgol hubli',
    ],
  },
  {
    name: "Kotagondahunashi (Kotagondhunshi)",
    context: "Hubballi Taluk, Dharwad District, Karnataka, India",
    lat: 15.2950,
    lng: 75.1680,
    kind: 'city',
    aliases: [
      'kotagondhunshi',
      'kotagondahunashi',
      'kotagondanahalli',
      'kotgondhunsi',
    ],
  },
  {
    name: "BMS College of Engineering",
    context: "Bull Temple Road, Basavanagudi, Bengaluru, Karnataka, India",
    lat: 12.941559,
    lng: 77.5659889,
    kind: 'poi',
    aliases: [
      'bms college of engineering',
      'bms college of engineering bengaluru',
      'bmsce',
      'bms engineering college bangalore',
    ],
  },
  {
    name: "Yaragatti (Belagavi)",
    context: "Yaragatti Taluk, Belagavi District, Karnataka, India",
    lat: 16.1781299,
    lng: 74.579005,
    kind: 'city',
    aliases: [
      'yaragatti',
      'yaragatti belagavi',
      'yargatti',
      'yaragatti plot monitoring',
    ],
  },
];

/**
 * Searches the curated local POI directory with alias matching and fuzzy token overlap.
 */
export function searchInstitutionalCatalog(rawQuery: string): GeoResult[] {
  const q = rawQuery.trim().toLowerCase().replace(/['"’]/g, '');
  if (!q || q.length < 2) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const matches: { poi: VerifiedPOI; score: number }[] = [];

  for (const poi of VERIFIED_LOCAL_POIS) {
    let bestScore = 0;
    const cleanName = poi.name.toLowerCase().replace(/['"’]/g, '');

    // Exact or prefix match on name
    if (cleanName === q) {
      bestScore = Math.max(bestScore, 100);
    } else if (cleanName.startsWith(q) || cleanName.includes(q)) {
      bestScore = Math.max(bestScore, 85);
    }

    // Check alias list
    for (const alias of poi.aliases) {
      const cleanAlias = alias.replace(/['"’]/g, '');
      if (cleanAlias === q) {
        bestScore = Math.max(bestScore, 95);
      } else if (cleanAlias.startsWith(q) || q.startsWith(cleanAlias) || cleanAlias.includes(q)) {
        bestScore = Math.max(bestScore, 80);
      } else {
        // Token overlap score
        const aliasTokens = cleanAlias.split(/\s+/);
        const hitCount = tokens.filter((t) => aliasTokens.some((at) => at.includes(t) || t.includes(at))).length;
        if (hitCount >= tokens.length && tokens.length > 0) {
          bestScore = Math.max(bestScore, 70 + (hitCount / aliasTokens.length) * 10);
        }
      }
    }

    if (bestScore > 0) {
      matches.push({ poi, score: bestScore });
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);

  return matches.map(({ poi, score }) => ({
    name: poi.name,
    context: poi.context,
    lat: poi.lat,
    lng: poi.lng,
    kind: poi.kind,
    source: 'nominatim',
    score: score / 100,
  }));
}
