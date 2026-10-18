/**
 * Cover Scan unit tests: no LLM, no network.
 *
 * How well the vision model reads a sleeve is measured apart, by the evalsets in
 * evals/ (`npm run eval`): a misread cover is a judgement about the model, not
 * a regression in this code, and must not redden `npm test`.
 */

const { parseResponse, normalizeFormat, rankResults } = require('../src/services/coverScanService').default;

describe('normalizeFormat', () => {
  test('maps 4K variants to Blu-ray 4K', () => {
    expect(normalizeFormat('4K')).toBe('Blu-ray 4K');
    expect(normalizeFormat('4k UHD')).toBe('Blu-ray 4K');
    expect(normalizeFormat('Ultra HD')).toBe('Blu-ray 4K');
    expect(normalizeFormat('4K Ultra HD Blu-ray')).toBe('Blu-ray 4K');
  });

  test('maps Blu-ray variants', () => {
    expect(normalizeFormat('Blu-ray')).toBe('Blu-ray');
    expect(normalizeFormat('Bluray')).toBe('Blu-ray');
    expect(normalizeFormat('blu-ray disc')).toBe('Blu-ray');
  });

  test('maps DVD variants', () => {
    expect(normalizeFormat('DVD')).toBe('DVD');
    expect(normalizeFormat('dvd')).toBe('DVD');
  });

  test('maps Digital variants', () => {
    expect(normalizeFormat('Digital')).toBe('Digital');
    expect(normalizeFormat('streaming')).toBe('Digital');
  });

  test('returns null for unknown formats', () => {
    expect(normalizeFormat('VHS')).toBeNull();
    expect(normalizeFormat('')).toBeNull();
    expect(normalizeFormat(null)).toBeNull();
  });
});

describe('parseResponse', () => {
  test('parses clean JSON', () => {
    const result = parseResponse('{"title": "The Matrix", "year": 1999, "format": "Blu-ray"}');
    expect(result.title).toBe('The Matrix');
    expect(result.year).toBe(1999);
  });

  test('handles code fences', () => {
    const result = parseResponse('```json\n{"title": "Inception", "year": 2010}\n```');
    expect(result.title).toBe('Inception');
    expect(result.year).toBe(2010);
  });

  test('handles <think> tags', () => {
    const result = parseResponse('<think>Let me analyze this cover...</think>\n{"title": "Alien", "year": 1979}');
    expect(result.title).toBe('Alien');
    expect(result.year).toBe(1979);
  });

  test('handles code fences with think tags', () => {
    const result = parseResponse('<think>analyzing...</think>\n```json\n{"title": "Jaws", "year": 1975}\n```');
    expect(result.title).toBe('Jaws');
  });

  test('extracts JSON from surrounding text', () => {
    const result = parseResponse('Here is the info: {"title": "Blade Runner", "year": 1982} hope that helps!');
    expect(result.title).toBe('Blade Runner');
  });

  test('falls back to regex extraction', () => {
    const result = parseResponse('title: "Terminator 2", year: 1991, format: "DVD"');
    expect(result.title).toBe('Terminator 2');
    expect(result.year).toBe(1991);
    expect(result.format).toBe('DVD');
  });

  test('returns null for empty input', () => {
    expect(parseResponse('')).toBeNull();
    expect(parseResponse(null)).toBeNull();
  });

  test('returns null for unparseable text', () => {
    expect(parseResponse('I cannot determine the movie from this image.')).toBeNull();
  });
});

describe('rankResults', () => {
  const mockResults = [
    { id: 1, title: 'The Matrix', release_date: '1999-03-31', popularity: 80 },
    { id: 2, title: 'The Matrix Reloaded', release_date: '2003-05-15', popularity: 60 },
    { id: 3, title: 'Matrix', release_date: '1993-01-01', popularity: 5 },
  ];

  test('ranks exact title match highest', () => {
    const ranked = rankResults(mockResults, { title: 'The Matrix', year: 1999 });
    expect(ranked[0].id).toBe(1);
  });

  test('ranks by year match', () => {
    const ranked = rankResults(mockResults, { title: 'Matrix', year: 1993 });
    expect(ranked[0].id).toBe(3);
  });

  test('returns empty array for empty input', () => {
    expect(rankResults([], { title: 'Test' })).toEqual([]);
  });

  test('returns results unchanged when no LLM result', () => {
    const ranked = rankResults(mockResults, null);
    expect(ranked).toEqual(mockResults);
  });
});
