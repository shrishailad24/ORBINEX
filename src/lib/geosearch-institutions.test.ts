import { describe, it, expect } from 'vitest';
import { searchInstitutionalCatalog } from './geosearch-institutions';

describe('Global Location Search — Local Places & POI Discovery', () => {
  const testQueries = [
    { query: 'Prerana', minResults: 1 },
    { query: 'KLE Prerana', minResults: 1 },
    { query: 'Prerana Residential', minResults: 1 },
    { query: 'Prerana PU College', minResults: 1 },
    { query: 'Kundgol Cross', minResults: 1 },
    { query: 'Kotagondhunshi', minResults: 1 },
    { query: "KLE's Prerana Residential PU Science College", minResults: 1 },
    { query: 'BMS College of Engineering Bengaluru', minResults: 1 },
    { query: 'Yaragatti', minResults: 1 },
  ];

  for (const { query, minResults } of testQueries) {
    it(`resolves "${query}" to verified local place coordinates`, () => {
      const hits = searchInstitutionalCatalog(query);
      expect(hits.length).toBeGreaterThanOrEqual(minResults);
      const top = hits[0];
      expect(Number.isFinite(top.lat)).toBe(true);
      expect(Number.isFinite(top.lng)).toBe(true);
      expect(top.name.length).toBeGreaterThan(0);
      expect(top.context.length).toBeGreaterThan(0);
    });
  }

  it('keeps the two Hubballi Prerana institutions distinct (does not conflate them)', () => {
    const res = searchInstitutionalCatalog('Prerana');
    const names = res.map((r) => r.name);
    // Both institutions must be returned distinctly
    expect(names.some((n) => n.includes('Kundgol Cross') || n.includes('Residential'))).toBe(true);
    expect(names.some((n) => n.includes('Vidyanagar'))).toBe(true);

    const kundgol = res.find((r) => r.name.includes('Kundgol') || r.name.includes('Residential'))!;
    const vidyanagar = res.find((r) => r.name.includes('Vidyanagar'))!;

    // Must have different geographical coordinates
    expect(kundgol.lat).not.toBe(vidyanagar.lat);
    expect(kundgol.lng).not.toBe(vidyanagar.lng);
  });
});
