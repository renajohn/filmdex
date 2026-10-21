/**
 * Run detectSleeveQuad over the made-up photographs and say how it did.
 *
 *   backend/node_modules/.bin/tsx evalsets/synthetic-covers/run.ts [--quiet] [--no-hint] [name ...]
 *
 * gen.ts first. Each scene's corners are known exactly, so the error is the
 * worst corner's distance from the truth as a fraction of the photo's
 * diagonal. Under 2% the user has only to nudge; under 4% to adjust; beyond
 * that they might as well have dragged from scratch. An overlay per photo
 * goes to .cache/out: green is the truth, red what was detected.
 *
 * --no-hint runs the detector without being told whether the photo is of a
 * sleeve or a book, as a caller that does not know would. DETECTOR=path runs
 * another copy of detectSleeveQuad.ts, for comparing against this one.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerError, type Corners } from '../../frontend/src/test/syntheticPhoto';

type Detector = typeof import('../../frontend/src/utils/detectSleeveQuad');

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../backend/package.json'));
const sharp = require('sharp');

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const noHint = args.includes('--no-hint');
const only = args.filter(a => !a.startsWith('--'));

const cache = join(here, '.cache');
mkdirSync(join(cache, 'out'), { recursive: true });

interface Entry {
  name: string;
  file: string;
  width: number;
  height: number;
  kind: 'cd' | 'book';
  corners: Corners;
  background: string;
  finger: boolean;
  glare: boolean;
  crossing: boolean;
}

interface Result {
  entry: Entry;
  found: boolean;
  confidence: number;
  mean: number;
  max: number;
  ms: number;
}

/** The photo shrunk to at most 1024 px, the truth dashed green, the detection red. */
const overlay = async (image: Buffer, entry: Entry, found: Corners | null, label: string) => {
  const scale = Math.min(1, 1024 / Math.max(entry.width, entry.height));
  const width = Math.round(entry.width * scale);
  const height = Math.round(entry.height * scale);
  const poly = (c: Corners, colour: string, dash = '') =>
    `<polygon points="${c.map(([x, y]) => `${x * scale},${y * scale}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${Math.max(2, width / 300)}" ${dash}/>`;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${poly(entry.corners, '#0f0', `stroke-dasharray="${width / 60}"`)}
    ${found ? poly(found, '#f00') : ''}
    <rect x="0" y="0" width="${width}" height="${Math.max(24, width / 30)}" fill="#000" opacity="0.7"/>
    <text x="6" y="${Math.max(18, width / 40)}" font-size="${Math.max(16, width / 45)}" fill="#ff0">${label}</text>
  </svg>`;
  const shrunk = await sharp(image, { raw: { width: entry.width, height: entry.height, channels: 4 } })
    .resize(width, height).toBuffer();
  await sharp(shrunk, { raw: { width, height, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 80 })
    .toFile(join(cache, 'out', `${entry.name}.jpg`));
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const summarise = (title: string, results: Result[], CONFIDENT: number) => {
  if (!results.length) return;
  const found = results.filter(r => r.found);
  const nudge = found.filter(r => r.max <= 0.02).length;
  const adjust = found.filter(r => r.max <= 0.04).length;
  const means = found.map(r => r.mean);
  const maxes = found.map(r => r.max);
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const confident = results.filter(r => r.found && r.confidence >= CONFIDENT);
  const rightWhenConfident = confident.filter(r => r.max <= 0.04).length;
  const unsure = results.filter(r => r.found && r.confidence < CONFIDENT);
  const rightWhenUnsure = unsure.filter(r => r.max <= 0.04).length;
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  console.log(
    `${title.padEnd(22)} n=${String(results.length).padStart(3)}  found ${pct(found.length / results.length).padStart(6)}` +
    `  nudge(<=2%) ${pct(nudge / results.length).padStart(6)}  ok(<=4%) ${pct(adjust / results.length).padStart(6)}` +
    `  err mean ${pct(avg(means)).padStart(5)} / worst-corner mean ${pct(avg(maxes)).padStart(5)} max ${pct(Math.max(0, ...maxes)).padStart(5)}` +
    `  confident ${confident.length} (${rightWhenConfident} right)  unsure ${unsure.length} (${rightWhenUnsure} right)` +
    `  ms median ${times[times.length >> 1]?.toFixed(0)} max ${times[times.length - 1]?.toFixed(0)}`
  );
};

const main = async () => {
  // DETECTOR=/path/to/detectSleeveQuad.ts runs another copy, for comparing.
  const { detectSleeveQuad, CONFIDENT }: Detector = await import(process.env.DETECTOR || '../../frontend/src/utils/detectSleeveQuad');
  const manifest = JSON.parse(readFileSync(join(cache, 'manifest.json'), 'utf8'));
  const entries: Entry[] = manifest.photos.filter((p: Entry) => !only.length || only.some(o => p.name.includes(o)));
  const results: Result[] = [];

  if (!quiet) console.log(`${'photo'.padEnd(44)} ${'conf'.padStart(5)} ${'mean'.padStart(6)} ${'max'.padStart(6)}   ms`);
  for (const entry of entries) {
    const { data, info } = await sharp(join(cache, 'img', entry.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const imageData = { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, colorSpace: 'srgb' } as ImageData;

    const started = performance.now();
    const detection = noHint ? detectSleeveQuad(imageData) : detectSleeveQuad(imageData, { subject: entry.kind === 'book' ? 'book' : 'sleeve' });
    const ms = performance.now() - started;

    const error = detection ? cornerError(detection.quad, entry.corners, info.width, info.height) : { mean: Infinity, max: Infinity };
    const result: Result = { entry, found: Boolean(detection), confidence: detection?.confidence ?? 0, mean: error.mean, max: error.max, ms };
    results.push(result);

    const verdict = !detection ? 'NONE' : error.max <= 0.02 ? 'nudge' : error.max <= 0.04 ? 'ok' : 'WRONG';
    const label = `${entry.name} conf ${result.confidence.toFixed(2)} max ${Number.isFinite(error.max) ? pct(error.max) : '-'} ${verdict}`;
    if (!quiet) {
      console.log(`${entry.name.padEnd(44)} ${result.confidence.toFixed(2).padStart(5)} ${(Number.isFinite(error.mean) ? pct(error.mean) : '-').padStart(6)} ${(Number.isFinite(error.max) ? pct(error.max) : '-').padStart(6)} ${ms.toFixed(0).padStart(4)}  ${verdict}`);
    }
    const found = detection
      ? ([detection.quad.topLeft, detection.quad.topRight, detection.quad.bottomRight, detection.quad.bottomLeft]
          .map(([x, y]) => [x * info.width, y * info.height]) as Corners)
      : null;
    await overlay(data, entry, found, label);
  }

  console.log('');
  summarise('all', results, CONFIDENT);
  summarise('cd', results.filter(r => r.entry.kind === 'cd'), CONFIDENT);
  summarise('book', results.filter(r => r.entry.kind === 'book'), CONFIDENT);
  summarise('finger', results.filter(r => r.entry.finger), CONFIDENT);
  summarise('glare', results.filter(r => r.entry.glare), CONFIDENT);
  summarise('crossing the frame', results.filter(r => r.entry.crossing), CONFIDENT);
  for (const kind of ['plain', 'wood', 'tiles', 'fabric', 'carpet', 'clutter']) {
    summarise(`on ${kind}`, results.filter(r => r.entry.background === kind), CONFIDENT);
  }
  summarise('phone-sized', results.filter(r => Math.max(r.entry.width, r.entry.height) > 2000), CONFIDENT);
};

void main();
