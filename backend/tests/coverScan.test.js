/**
 * Cover Scan Tests
 *
 * Unit tests run standalone. Integration tests require a live LLM server.
 * Pipeline tests require both LLM + TMDB.
 *
 * Run unit tests only (no database required):
 *   npx jest tests/coverScan.test.js --setupFilesAfterEnv=''
 *
 * Run all including pipeline tests:
 *   RUN_PIPELINE_TESTS=1 npx jest tests/coverScan.test.js --setupFilesAfterEnv=''
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { analyzeImage, parseResponse, normalizeFormat, rankResults, checkHealth } = require('../src/services/coverScanService');

// Load evalsets
const EVALSET_DIR = path.join(__dirname, '../../evalsets/movie import');
const evalsets = [];

const evalFiles = fs.readdirSync(EVALSET_DIR).filter(f => f.endsWith('.yml'));
for (const ymlFile of evalFiles) {
  const ymlPath = path.join(EVALSET_DIR, ymlFile);
  const data = yaml.load(fs.readFileSync(ymlPath, 'utf8'));
  const imageFile = data.image;
  const imagePath = path.join(EVALSET_DIR, imageFile);

  if (fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imageFile).toLowerCase();
    const mimeMap = { '.webp': 'image/webp', '.png': 'image/png', '.heic': 'image/heic', '.heif': 'image/heif' };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    evalsets.push({
      name: ymlFile.replace('.yml', ''),
      image: imageBuffer.toString('base64'),
      mimeType,
      expected: data.expected
    });
  }
}

// ===== Unit Tests =====

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

// ===== Integration Tests (require live LLM) =====

describe('LLM Integration Tests', () => {
  let llmAvailable = false;

  beforeAll(async () => {
    const health = await checkHealth();
    llmAvailable = health.available;
    if (!llmAvailable) {
      console.warn('LLM server not available - skipping integration tests');
    }
  });

  describe('LLM extraction tests', () => {
    evalsets.forEach((evalset) => {
      const isWebp = evalset.mimeType === 'image/webp';

      test(`extracts title from ${evalset.name}${isWebp ? ' (webp - may not be supported)' : ''}`, async () => {
        if (!llmAvailable) return; // gracefully skip

        try {
          const result = await analyzeImage(evalset.image, evalset.mimeType, 'movie');

          // Must return a title
          expect(result.title).toBeTruthy();

          // If expected year is known and LLM returned a year, it should be close
          if (evalset.expected.year && result.year) {
            expect(Math.abs(result.year - evalset.expected.year)).toBeLessThanOrEqual(2);
          }
        } catch (e) {
          // WebP images may not be supported by the vision model
          if (isWebp) {
            console.warn(`  ⚠ ${evalset.name}: webp not supported by LLM (${e.message})`);
            return;
          }
          throw e;
        }
      }, 60000);
    });
  });
});

// ===== Full Pipeline Tests (require live LLM + TMDB) =====
// These tests are skipped by default. To run them, set RUN_PIPELINE_TESTS=1
// and ensure both the LLM server and TMDB API key are available.

const runPipeline = process.env.RUN_PIPELINE_TESTS === '1';

(runPipeline ? describe : describe.skip)('Full Pipeline Tests', () => {
  let llmAvailable = false;
  let tmdbAvailable = false;

  beforeAll(async () => {
    const health = await checkHealth();
    llmAvailable = health.available;

    try {
      const configManager = require('../src/config');
      const keys = configManager.getApiKeys();
      tmdbAvailable = !!keys.tmdb;
    } catch (e) {
      tmdbAvailable = false;
    }
  });

  evalsets.forEach((evalset) => {
    const expectedTmdbId = evalset.expected.tmdb_id;
    if (!expectedTmdbId) return;

    test(`pipeline finds correct TMDB match for ${evalset.name} (tmdb_id: ${expectedTmdbId})`, async () => {
      if (!llmAvailable || !tmdbAvailable) return;

      const llmResult = await analyzeImage(evalset.image, evalset.mimeType, 'movie');
      expect(llmResult.title).toBeTruthy();

      const tmdbService = require('../src/services/tmdbService');
      const tmdbResults = await tmdbService.searchAll(llmResult.title, llmResult.year);
      expect(tmdbResults.length).toBeGreaterThan(0);

      const ranked = rankResults(tmdbResults, llmResult);
      const top3Ids = ranked.slice(0, 3).map(r => r.id);
      expect(top3Ids).toContain(expectedTmdbId);
    }, 60000);
  });
});
