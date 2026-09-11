/**
 * Run detectSleeveQuad over real photographs and say how it did.
 *
 *   backend/node_modules/.bin/tsx evalsets/handheld-cd/run.ts [--long 3024] [name ...]
 *
 * Photos are fetched into .cache/img on first use (they are other people's
 * pictures, so only their addresses are committed). An overlay per photo goes
 * to .cache/out: green is the annotation, red what was detected.
 *
 * --long resizes each photo so its longer side is that many pixels first, to
 * see the detector at the resolution a phone actually hands it.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectSleeveQuad, CONFIDENT, type Quad, type Point } from '../../frontend/src/utils/detectSleeveQuad';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../backend/package.json'));
const sharp = require('sharp');

type Corners = [Point, Point, Point, Point];

interface Photo {
  name: string;
  source: string | null;
  expect: 'sleeve' | 'optional';
  quads: Record<string, Corners>;
}

const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8'));
const tolerance: number = manifest.tolerance;

const args = process.argv.slice(2);
const longIndex = args.indexOf('--long');
const long = longIndex >= 0 ? Number(args[longIndex + 1]) : 0;
const verbose = args.includes('--verbose');
const only = args.filter((a, i) => !a.startsWith('--') && (longIndex < 0 || i !== longIndex + 1));

const cache = join(here, '.cache');
mkdirSync(join(cache, 'img'), { recursive: true });
mkdirSync(join(cache, 'out'), { recursive: true });

const fetchPhoto = async (photo: Photo): Promise<string | null> => {
  const path = join(cache, 'img', `${photo.name}.jpg`);
  if (existsSync(path)) return path;
  if (!photo.source) return null;
  const response = await fetch(photo.source, { headers: { 'User-Agent': 'filmdex-evalset/1.0' } });
  if (!response.ok) return null;
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
};

const asCorners = (q: Quad): Corners => [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];

/**
 * Worst corner distance over the sleeve's side, in pixels.
 *
 * Tried at every rotation of the corner order: a sleeve lying at 45 degrees
 * has no agreed top left, and that is not what is being measured.
 */
const cornerError = (found: Corners, expected: Corners, width: number, height: number): number => {
  const px = ([x, y]: Point) => [x * width, y * height];
  const e = expected.map(px);
  let area = 0;
  for (let i = 0; i < 4; i++) area += e[i][0] * e[(i + 1) % 4][1] - e[(i + 1) % 4][0] * e[i][1];
  const side = Math.sqrt(Math.abs(area) / 2);

  let best = Infinity;
  for (let shift = 0; shift < 4; shift++) {
    let worst = 0;
    for (let i = 0; i < 4; i++) {
      const [fx, fy] = px(found[(i + shift) % 4]);
      worst = Math.max(worst, Math.hypot(fx - e[i][0], fy - e[i][1]));
    }
    best = Math.min(best, worst);
  }
  return best / side;
};

const overlay = async (image: Buffer, width: number, height: number, photo: Photo, found: Corners | null, label: string) => {
  const poly = (c: Corners, colour: string, dash = '') =>
    `<polygon points="${c.map(([x, y]) => `${x * width},${y * height}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="${Math.max(2, width / 300)}" ${dash}/>`;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${Object.values(photo.quads).map(q => poly(q, '#0f0', `stroke-dasharray="${width / 60}"`)).join('')}
    ${found ? poly(found, '#f00') : ''}
    <rect x="0" y="0" width="${width}" height="${Math.max(24, width / 30)}" fill="#000" opacity="0.7"/>
    <text x="6" y="${Math.max(18, width / 40)}" font-size="${Math.max(16, width / 45)}" fill="#ff0">${label}</text>
  </svg>`;
  await sharp(image, { raw: { width, height, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 80 })
    .toFile(join(cache, 'out', `${photo.name}.jpg`));
};

const main = async () => {
  const photos: Photo[] = manifest.photos.filter((p: Photo) => !only.length || only.includes(p.name));
  let failures = 0;
  let found = 0;
  let wanted = 0;

  console.log(`${'photo'.padEnd(20)} ${'expect'.padEnd(8)} ${'conf'.padStart(5)} ${'error'.padStart(6)}  match      verdict`);

  for (const photo of photos) {
    const path = await fetchPhoto(photo);
    if (!path) {
      console.log(`${photo.name.padEnd(20)} (missing, skipped)`);
      continue;
    }

    let pipeline = sharp(path).rotate();
    if (long) pipeline = pipeline.resize(long, long, { fit: 'inside' });
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const imageData = { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, colorSpace: 'srgb' } as ImageData;

    const started = performance.now();
    const detection = detectSleeveQuad(imageData);
    const elapsed = performance.now() - started;

    const confident = Boolean(detection && detection.confidence >= CONFIDENT);
    const corners = detection ? asCorners(detection.quad) : null;

    let bestName = '-';
    let bestError = Infinity;
    if (corners) {
      for (const [name, quad] of Object.entries(photo.quads)) {
        const error = cornerError(corners, quad, info.width, info.height);
        if (error < bestError) { bestError = error; bestName = name; }
      }
    }

    const matches = bestError <= tolerance;
    let verdict: string;
    if (photo.expect === 'sleeve') {
      wanted++;
      if (confident && matches) { verdict = 'ok'; found++; }
      else if (confident) verdict = 'FAIL wrong';
      else verdict = 'FAIL declined';
    } else {
      verdict = !confident ? 'ok (declined)' : matches ? 'ok' : 'FAIL wrong';
    }
    if (verdict.startsWith('FAIL')) failures++;

    const conf = detection ? detection.confidence.toFixed(2) : '  -  ';
    const err = Number.isFinite(bestError) ? bestError.toFixed(3) : '   -  ';
    console.log(`${photo.name.padEnd(20)} ${photo.expect.padEnd(8)} ${conf.padStart(5)} ${err.padStart(6)}  ${bestName.padEnd(10)} ${verdict}  (${info.width}x${info.height}, ${elapsed.toFixed(0)}ms)`);
    if (verbose && corners) console.log(`    found ${JSON.stringify(corners.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]))}`);

    await overlay(data, info.width, info.height, photo, corners, `${photo.name} conf ${conf} err ${err} ${verdict}`);
  }

  console.log(`\n${found}/${wanted} sleeves found, ${failures} failure(s) in ${photos.length} photos`);
  process.exitCode = failures ? 1 : 0;
};

void main();
