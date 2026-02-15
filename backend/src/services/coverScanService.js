const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_URL = 'http://p-cloud.local:8001';
const DEFAULT_MODEL = 'Qwen3-VL-8B-Instruct-Q4_K_M';

function getConfig() {
  let baseUrl = DEFAULT_BASE_URL;
  let model = DEFAULT_MODEL;

  try {
    const configManager = require('../config');
    const dataConfig = configManager.getDataConfig();
    if (dataConfig.llm_base_url) baseUrl = dataConfig.llm_base_url;
    if (dataConfig.llm_model) model = dataConfig.llm_model;
  } catch (e) {
    // Config not loaded yet, use defaults
  }

  return { baseUrl, model };
}

/**
 * Make an HTTP request using curl.
 * macOS Sequoia blocks Node.js from LAN access, but curl (a system binary)
 * has implicit local network permission.
 */
function curlPost(url, body, timeoutSec = 60) {
  // Write body to temp file to avoid shell escaping issues with large payloads
  const tmpFile = path.join(os.tmpdir(), `coverscan-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(body));
    const output = execFileSync('curl', [
      '-s', '-S',
      '--max-time', String(timeoutSec),
      '-H', 'Content-Type: application/json',
      '-d', `@${tmpFile}`,
      url
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(output);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
  }
}

function curlGet(url, timeoutSec = 5) {
  const output = execFileSync('curl', [
    '-s', '-S',
    '--max-time', String(timeoutSec),
    url
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

/**
 * Prepare an image for the LLM: convert to JPEG and resize to max 1024px.
 * Handles JPEG, PNG, WebP, and HEIC input formats.
 * Returns { base64, mimeType } ready for the vision model.
 */
function prepareImage(base64Image, mimeType) {
  const ts = Date.now();
  const extMap = { 'image/webp': 'webp', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' };
  const ext = extMap[mimeType] || 'jpg';
  const tmpIn = path.join(os.tmpdir(), `coverscan-${ts}-in.${ext}`);
  const tmpOut = path.join(os.tmpdir(), `coverscan-${ts}-out.jpg`);

  try {
    fs.writeFileSync(tmpIn, Buffer.from(base64Image, 'base64'));

    try {
      // macOS sips: resample to max 1024px on longest side, output as JPEG
      execFileSync('sips', [
        '-s', 'format', 'jpeg',
        '-s', 'formatOptions', '80',
        '--resampleHeightWidthMax', '1024',
        tmpIn, '--out', tmpOut
      ], { stdio: 'pipe' });
    } catch (e) {
      // Fallback to ffmpeg
      execFileSync('ffmpeg', [
        '-y', '-i', tmpIn,
        '-vf', 'scale=1024:1024:force_original_aspect_ratio=decrease',
        '-q:v', '4',
        tmpOut
      ], { stdio: 'pipe' });
    }

    const jpgBuffer = fs.readFileSync(tmpOut);
    return { base64: jpgBuffer.toString('base64'), mimeType: 'image/jpeg' };
  } finally {
    try { fs.unlinkSync(tmpIn); } catch (e) { /* ignore */ }
    try { fs.unlinkSync(tmpOut); } catch (e) { /* ignore */ }
  }
}

/**
 * Send a cover image to the local LLM and extract title/year/format.
 */
async function analyzeImage(base64Image, mimeType, mediaType = 'movie') {
  const { baseUrl, model } = getConfig();

  // Convert to JPEG and resize to 1024px max for faster LLM processing
  ({ base64: base64Image, mimeType } = prepareImage(base64Image, mimeType));

  const prompt = mediaType === 'movie'
    ? 'Look at this movie cover image. Extract the movie title exactly as shown, the original title if the cover is not in English (e.g. the English title), the release year, and the physical media format (e.g. DVD, Blu-ray, 4K/UHD). Respond with ONLY a JSON object like: {"title": "Titre du Film", "original_title": "Original Movie Title", "year": 2020, "format": "Blu-ray"}. If the title is already in English, omit original_title. If you cannot determine a field, omit it. Do not include any other text.'
    : 'Look at this media cover image. Extract the title exactly as shown, the original title if not in English, the release year, and the physical media format. Respond with ONLY a JSON object like: {"title": "Title", "original_title": "Original Title", "year": 2020, "format": "Blu-ray"}. If the title is already in English, omit original_title. If you cannot determine a field, omit it. Do not include any other text.';

  const response = curlPost(`${baseUrl}/v1/chat/completions`, {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }
    ],
    max_tokens: 256,
    temperature: 0.1
  }, 60);

  const text = response.choices?.[0]?.message?.content;
  if (!text) {
    // Include response detail for debugging (e.g. webp not supported)
    const detail = response.error?.message || response.choices?.[0]?.finish_reason || 'empty content';
    throw new Error(`No response from LLM (${detail})`);
  }

  try { require('../logger').debug('LLM raw response:', text); } catch (e) { /* noop */ }

  const parsed = parseResponse(text);
  if (!parsed || !parsed.title) {
    throw new Error('Could not extract title from cover image');
  }

  return {
    title: parsed.title,
    original_title: parsed.original_title || null,
    year: parsed.year || null,
    format: parsed.format ? normalizeFormat(parsed.format) : null
  };
}

/**
 * Parse LLM response text into a JSON object.
 * Handles code fences, <think> tags, and fallback regex extraction.
 */
function parseResponse(text) {
  if (!text) return null;

  // Strip <think>...</think> tags (Qwen thinking mode)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON object in the text
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Fall through to regex
      }
    }
  }

  // Fallback: regex extraction
  const titleMatch = cleaned.match(/["']?title["']?\s*[:=]\s*["']([^"']+)["']/i);
  const yearMatch = cleaned.match(/["']?year["']?\s*[:=]\s*(\d{4})/i);
  const formatMatch = cleaned.match(/["']?format["']?\s*[:=]\s*["']([^"']+)["']/i);

  if (titleMatch) {
    return {
      title: titleMatch[1],
      year: yearMatch ? parseInt(yearMatch[1]) : undefined,
      format: formatMatch ? formatMatch[1] : undefined
    };
  }

  return null;
}

/**
 * Normalize LLM format strings to app format values.
 */
function normalizeFormat(llmFormat) {
  if (!llmFormat) return null;

  const lower = llmFormat.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 4K variants
  if (lower.includes('4k') || lower.includes('uhd') || lower.includes('ultrahd')) {
    return 'Blu-ray 4K';
  }

  // Blu-ray variants
  if (lower.includes('bluray') || lower.includes('blu')) {
    return 'Blu-ray';
  }

  // DVD
  if (lower.includes('dvd')) {
    return 'DVD';
  }

  // Digital
  if (lower.includes('digital') || lower.includes('stream')) {
    return 'Digital';
  }

  return null;
}

/**
 * Rank TMDB results by how well they match the LLM extraction.
 * Returns the results array sorted by match quality (best first).
 */
function rankResults(tmdbResults, llmResult) {
  if (!tmdbResults || tmdbResults.length === 0) return [];
  if (!llmResult) return tmdbResults;

  const llmTitle = llmResult.title?.toLowerCase().trim() || '';
  const llmOriginalTitle = llmResult.original_title?.toLowerCase().trim() || '';
  const llmYear = llmResult.year;

  const scored = tmdbResults.map((result, originalIndex) => {
    let score = 0;
    const resultTitle = (result.title || result.name || '').toLowerCase().trim();
    const resultOrigTitle = (result.original_title || result.original_name || '').toLowerCase().trim();
    const resultYear = result.release_date
      ? parseInt(result.release_date.substring(0, 4))
      : null;

    // Score against both LLM title and original_title, take the best
    const titlesToCheck = [llmTitle];
    if (llmOriginalTitle) titlesToCheck.push(llmOriginalTitle);
    const resultTitles = [resultTitle];
    if (resultOrigTitle && resultOrigTitle !== resultTitle) resultTitles.push(resultOrigTitle);

    let bestTitleScore = 0;
    for (const lt of titlesToCheck) {
      for (const rt of resultTitles) {
        let s = 0;
        if (rt === lt) {
          s = 100;
        } else if (rt.includes(lt) || lt.includes(rt)) {
          s = 50;
        } else {
          const llmWords = lt.split(/\s+/).filter(w => w.length > 2);
          const resultWords = rt.split(/\s+/).filter(w => w.length > 2);
          const overlap = llmWords.filter(w => resultWords.includes(w)).length;
          s = overlap * 15;
        }
        if (s > bestTitleScore) bestTitleScore = s;
      }
    }
    score += bestTitleScore;

    // Year match
    if (llmYear && resultYear) {
      if (resultYear === llmYear) {
        score += 50;
      } else if (Math.abs(resultYear - llmYear) === 1) {
        score += 20;
      }
    }

    // Popularity tiebreaker
    score += Math.min((result.popularity || 0) / 100, 5);

    return { ...result, _score: score, _originalIndex: originalIndex };
  });

  scored.sort((a, b) => b._score - a._score);

  // Remove scoring metadata
  return scored.map(({ _score, _originalIndex, ...rest }) => rest);
}

/**
 * Check if the LLM server is available.
 */
async function checkHealth() {
  const { baseUrl } = getConfig();

  try {
    const data = curlGet(`${baseUrl}/v1/models`);
    return {
      available: true,
      models: data?.data?.map(m => m.id) || []
    };
  } catch (e) {
    return {
      available: false,
      error: e.message
    };
  }
}

module.exports = {
  analyzeImage,
  parseResponse,
  normalizeFormat,
  rankResults,
  checkHealth
};
