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
 * see the detector at the resolution a phone actually hands it. --crops also
 * writes the straightened cover for every confident detection to .cache/crops.
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
const crops = args.includes('--crops');
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

/**
 * The crop the app would store, for looking at: the same square-to-quad
 * mapping warpQuad uses in the browser, sampled nearest-pixel.
 */
const crop = async (image: Buffer, width: number, height: number, quad: Corners, name: string) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad.map(([x, y]) => [x * width, y * height]);
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  const span = (p: number, q: number, r: number, t: number) => Math.hypot(r - p, t - q);
  const qw = (span(x0, y0, x1, y1) + span(x3, y3, x2, y2)) / 2;
  const qh = (span(x0, y0, x3, y3) + span(x1, y1, x2, y2)) / 2;
  const scale = 400 / Math.max(qw, qh);
  const ow = Math.max(1, Math.round(qw * scale)), oh = Math.max(1, Math.round(qh * scale));
  const out = Buffer.alloc(ow * oh * 3);
  for (let v = 0; v < oh; v++) {
    for (let u = 0; u < ow; u++) {
      const U = (u + 0.5) / ow, V = (v + 0.5) / oh;
      const z = g * U + h * V + 1;
      const px = Math.min(width - 1, Math.max(0, Math.round((a * U + b * V + x0) / z)));
      const py = Math.min(height - 1, Math.max(0, Math.round((d * U + e * V + y0) / z)));
      const i = (py * width + px) * 4, o = (v * ow + u) * 3;
      out[o] = image[i]; out[o + 1] = image[i + 1]; out[o + 2] = image[i + 2];
    }
  }
  mkdirSync(join(cache, 'crops'), { recursive: true });
  await sharp(out, { raw: { width: ow, height: oh, channels: 3 } }).jpeg({ quality: 85 }).toFile(join(cache, 'crops', `${name}.jpg`));
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
    if (crops && corners && confident) await crop(data, info.width, info.height, corners, photo.name);
  }

  console.log(`\n${found}/${wanted} sleeves found, ${failures} failure(s) in ${photos.length} photos`);
  process.exitCode = failures ? 1 : 0;
};

void main();
