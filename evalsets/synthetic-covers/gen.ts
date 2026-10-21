/**
 * Make up photographs of CD sleeves and books, with their corners known.
 *
 *   backend/node_modules/.bin/tsx evalsets/synthetic-covers/gen.ts [--count 120] [--seed 1] [--phone 6]
 *
 * Covers come from .cache/covers (a JPEG per cover, named cd-* or book-*),
 * plus a few drawn here. Each is warped into perspective over a table, a
 * floor or a cloth, with a shadow, a thumb, glare, grain, a blur and a JPEG
 * round trip, at the size a phone's photo reaches the detector. The scenes go
 * to .cache/img and their corners to .cache/manifest.json, for run.ts.
 *
 * --phone adds that many scenes at a phone's full 3024x4032, for timing.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  paintScene, proceduralCover, perspectiveCorners, random,
  type Background, type Corners, type Raster, type Scene
} from '../../frontend/src/test/syntheticPhoto';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../backend/package.json'));
const sharp = require('sharp');

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const count = option('--count', 120);
const seed = option('--seed', 1);
const phone = option('--phone', 0);

const cache = join(here, '.cache');
mkdirSync(join(cache, 'img'), { recursive: true });

type Kind = 'cd' | 'book';
interface Cover { name: string; kind: Kind; raster: Raster }

const loadCovers = async (): Promise<Cover[]> => {
  const covers: Cover[] = [];
  const dir = join(cache, 'covers');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort()) {
      const { data, info } = await sharp(join(dir, file)).rotate().resize(900, 900, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      covers.push({
        name: file.replace(/\.\w+$/, ''),
        kind: file.startsWith('book') ? 'book' : 'cd',
        raster: { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }
      });
    }
  }
  const drawn: Array<[string, Kind, number, number, 'dark' | 'pale' | 'busy' | 'comic']> = [
    ['drawn-cd-dark', 'cd', 600, 600, 'dark'],
    ['drawn-cd-pale', 'cd', 600, 600, 'pale'],
    ['drawn-cd-busy', 'cd', 600, 600, 'busy'],
    ['drawn-case-busy', 'cd', 680, 600, 'busy'],
    ['drawn-book-pale', 'book', 600, 900, 'pale'],
    ['drawn-book-dark', 'book', 600, 900, 'dark'],
    ['drawn-book-busy', 'book', 600, 900, 'busy'],
    ['drawn-pocket-busy', 'book', 600, 990, 'busy'],
    ['drawn-comic', 'book', 600, 800, 'comic'],
    ['drawn-comic-pale', 'book', 600, 800, 'pale']
  ];
  drawn.forEach(([name, kind, width, height, style], i) => {
    covers.push({ name, kind, raster: proceduralCover({ width, height, style, seed: 100 + i }) });
  });
  return covers;
};

interface Entry {
  name: string;
  file: string;
  width: number;
  height: number;
  kind: Kind;
  cover: string;
  corners: Corners;
  background: string;
  level: number;
  span: number;
  finger: boolean;
  glare: boolean;
  crossing: boolean;
  blur: number;
  quality: number;
}

const makeScene = (index: number, covers: Cover[], size?: [number, number]): { scene: Scene; entry: Omit<Entry, 'file'> } => {
  const rng = random(seed * 100000 + index);
  const cover = rng.pick(covers);
  const [width, height] = size || (rng.next() < 0.65 ? [768, 1024] : rng.next() < 0.6 ? [1024, 768] : [1024, 1024]);
  const scale = Math.min(width, height) / 768;

  const aspect = cover.raster.width / cover.raster.height;
  const span = rng.between(0.45, 0.95);
  const gentle = rng.next() < 0.7;
  let corners = perspectiveCorners({
    width, height, aspect, span,
    tilt: gentle ? rng.between(-0.1, 0.1) : rng.between(-0.45, 0.45),
    pitch: rng.between(-0.1, 0.5) * (rng.next() < 0.5 ? 1 : -1),
    yaw: rng.between(-0.4, 0.4),
    at: [rng.between(0.42, 0.58), rng.between(0.42, 0.58)]
  });

  // Now and then the cover runs off one edge of the frame, by a little.
  const crossing = rng.next() < 0.15;
  if (crossing) {
    const side = Math.floor(rng.next() * 4);
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    const over = rng.between(0.01, 0.05);
    const dx = side === 1 ? width * (1 + over) - Math.max(...xs) : side === 3 ? -width * over - Math.min(...xs) : 0;
    const dy = side === 2 ? height * (1 + over) - Math.max(...ys) : side === 0 ? -height * over - Math.min(...ys) : 0;
    corners = corners.map(([x, y]) => [x + dx, y + dy]) as Corners;
  }

  const kinds: Background['kind'][] = ['plain', 'plain', 'wood', 'wood', 'tiles', 'fabric', 'fabric', 'carpet', 'clutter', 'clutter'];
  const background: Background = {
    kind: rng.pick(kinds),
    level: rng.between(30, 235),
    tint: [rng.between(0.9, 1.05), rng.between(0.9, 1.05), rng.between(0.85, 1.05)]
  };
  const finger = rng.next() < 0.35;
  const glare = rng.next() < 0.35;
  const scene: Scene = {
    width, height,
    cover: cover.raster,
    corners,
    background,
    shadow: rng.next() < 0.7 ? rng.between(0.3, 1) : 0,
    pages: cover.kind === 'book' && rng.next() < 0.6 ? rng.between(3, 10) * scale : 0,
    finger: finger ? { side: Math.floor(rng.next() * 4) as 0 | 1 | 2 | 3, along: rng.between(0.2, 0.8), width: rng.between(50, 110) * scale } : undefined,
    glare: glare ? { x: rng.between(0.2, 0.8), y: rng.between(0.2, 0.8), rx: rng.between(0.15, 0.5), ry: rng.between(0.1, 0.4), strength: rng.between(0.3, 0.85) } : undefined,
    lighting: rng.next() < 0.7 ? { angle: rng.between(0, Math.PI * 2), range: rng.between(0.1, 0.45) } : undefined,
    noise: rng.between(1.5, 8),
    seed: seed * 100000 + index + 7
  };
  const entry = {
    name: `${String(index).padStart(3, '0')}-${cover.kind}-${background.kind}${finger ? '-finger' : ''}${glare ? '-glare' : ''}${crossing ? '-crossing' : ''}`,
    width, height, kind: cover.kind, cover: cover.name, corners,
    background: background.kind, level: Math.round(background.level), span: +span.toFixed(2),
    finger, glare, crossing,
    blur: rng.next() < 0.8 ? +rng.between(0.3, 1.4).toFixed(2) : 0,
    quality: Math.round(rng.between(70, 92))
  };
  return { scene, entry };
};

const main = async () => {
  const covers = await loadCovers();
  console.log(`${covers.length} covers (${covers.filter(c => c.kind === 'book').length} books)`);
  const entries: Entry[] = [];
  const sizes: Array<[number, number] | undefined> = [];
  for (let i = 0; i < count; i++) sizes.push(undefined);
  for (let i = 0; i < phone; i++) sizes.push(i % 2 ? [4032, 3024] : [3024, 4032]);

  for (let i = 0; i < sizes.length; i++) {
    const { scene, entry } = makeScene(i, covers, sizes[i]);
    const raster = paintScene(scene);
    const file = `${entry.name}.jpg`;
    let pipeline = sharp(Buffer.from(raster.data.buffer), { raw: { width: raster.width, height: raster.height, channels: 4 } });
    if (entry.blur) pipeline = pipeline.blur(entry.blur);
    await pipeline.jpeg({ quality: entry.quality }).toFile(join(cache, 'img', file));
    entries.push({ ...entry, file });
    process.stdout.write(`\r${i + 1}/${sizes.length} ${entry.name}          `);
  }
  writeFileSync(join(cache, 'manifest.json'), JSON.stringify({ seed, count: entries.length, photos: entries }, null, 1));
  console.log(`\n${entries.length} scenes in ${join(cache, 'img')}`);
};

void main();
