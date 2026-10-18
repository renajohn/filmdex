/**
 * Movie cover evalset: how well the vision model reads a DVD or Blu-ray cover,
 * and whether the title it reads finds the right movie on TMDB.
 *
 * It needs the LLM server (LLM_BASE_URL, or the default) and, for the TMDB
 * step, TMDB_API_KEY. Run it with `npm run eval`; `npm test` never does.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { analyzeImage, rankResults, checkHealth } = require('../src/services/coverScanService').default;
const tmdbService = require('../src/services/tmdbService').default;

const EVALSET_DIR = path.join(__dirname, '../../evalsets/movie import');
const mimeMap = { '.webp': 'image/webp', '.png': 'image/png', '.heic': 'image/heic', '.heif': 'image/heif' };

const evalsets = fs.readdirSync(EVALSET_DIR)
  .filter(f => f.endsWith('.yml'))
  .map(ymlFile => {
    const data = yaml.load(fs.readFileSync(path.join(EVALSET_DIR, ymlFile), 'utf8'));
    const imagePath = path.join(EVALSET_DIR, data.image);
    if (!fs.existsSync(imagePath)) return null;
    return {
      name: ymlFile.replace('.yml', ''),
      image: fs.readFileSync(imagePath).toString('base64'),
      mimeType: mimeMap[path.extname(data.image).toLowerCase()] || 'image/jpeg',
      expected: data.expected
    };
  })
  .filter(Boolean);

beforeAll(async () => {
  const health = await checkHealth();
  if (!health.available) throw new Error(`LLM server not available: ${health.error}`);
});

describe('LLM extraction', () => {
  test.each(evalsets.map(e => [e.name, e]))('reads the title of %s', async (_name, evalset) => {
    const result = await analyzeImage(evalset.image, evalset.mimeType, 'movie');

    expect(result.title).toBeTruthy();
    if (evalset.expected.year && result.year) {
      expect(Math.abs(result.year - evalset.expected.year)).toBeLessThanOrEqual(2);
    }
  }, 60000);
});

describe('LLM + TMDB pipeline', () => {
  beforeAll(() => {
    if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');
  });

  const withTmdbId = evalsets.filter(e => e.expected.tmdb_id);
  test.each(withTmdbId.map(e => [e.name, e.expected.tmdb_id, e]))(
    'finds %s on TMDB (tmdb_id: %s)',
    async (_name, expectedTmdbId, evalset) => {
      const llmResult = await analyzeImage(evalset.image, evalset.mimeType, 'movie');
      expect(llmResult.title).toBeTruthy();

      const tmdbResults = await tmdbService.searchAll(llmResult.title, llmResult.year);
      expect(tmdbResults.length).toBeGreaterThan(0);

      const top3Ids = rankResults(tmdbResults, llmResult).slice(0, 3).map(r => r.id);
      expect(top3Ids).toContain(expectedTmdbId);
    },
    60000
  );
});
