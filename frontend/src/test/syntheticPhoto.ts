/**
 * Photographs made up pixel by pixel, with their corners known exactly.
 *
 * Real photographs of sleeves and books are other people's, and annotating
 * them by eye is good to a percent or so. A scene painted here -- a cover
 * warped into perspective over wood, tiles, a cloth or a cluttered table, a
 * thumb over one edge, glare, a shadow, grain -- has corners that are known
 * to the pixel, so the detector's error can be measured rather than judged.
 *
 * Used by the unit tests and by evalsets/synthetic-covers, which adds real
 * cover images, a blur and a JPEG round trip through sharp.
 */

export type Pt = [number, number];
/** Clockwise from the cover's top left, in pixels of the photograph. */
export type Corners = [Pt, Pt, Pt, Pt];

/** RGBA pixels, as a canvas hands them over. */
export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type BackgroundKind = 'plain' | 'wood' | 'tiles' | 'fabric' | 'carpet' | 'clutter';

export interface Background {
  kind: BackgroundKind;
  /** Its overall brightness, 0 to 255. */
  level: number;
  /** A hue, as RGB weights around the level. */
  tint?: [number, number, number];
}

export interface Scene {
  width: number;
  height: number;
  cover: Raster;
  corners: Corners;
  background: Background;
  /** 0 to 1: how dark the shadow the cover casts on the table is. */
  shadow?: number;
  /** A book's block of pages showing past its cover, in pixels. */
  pages?: number;
  /** A thumb from the nearest edge of the frame, holding the cover on one side. */
  finger?: { side: 0 | 1 | 2 | 3; along: number; width: number };
  /** A reflection on the cover: where (fractions of it), how wide, how strong. */
  glare?: { x: number; y: number; rx: number; ry: number; strength: number };
  /** Light falling off across the frame: direction in radians, how much (0 to 1). */
  lighting?: { angle: number; range: number };
  /** Gaussian grain, in levels. */
  noise?: number;
  seed: number;
}

/** A small deterministic generator, so a scene can be rebuilt from its seed. */
export const random = (seed: number) => {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (lo: number, hi: number) => lo + (hi - lo) * next(),
    pick: <T>(items: T[]): T => items[Math.floor(next() * items.length) % items.length],
    gaussian: () => {
      const u = Math.max(1e-12, next());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    }
  };
};

type Rng = ReturnType<typeof random>;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Maps the unit square onto the quad; the inverse maps the photo back onto the cover. */
const homography = (q: Corners) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  // Row-major 3x3, taking (u, v, 1) to (x, y, w).
  const m = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  const [a, b, c, d, e, f, gg, hh, i] = m;
  const det = a * (e * i - f * hh) - b * (d * i - f * gg) + c * (d * hh - e * gg);
  const inv = [
    (e * i - f * hh) / det, (c * hh - b * i) / det, (b * f - c * e) / det,
    (f * gg - d * i) / det, (a * i - c * gg) / det, (c * d - a * f) / det,
    (d * hh - e * gg) / det, (b * gg - a * hh) / det, (a * e - b * d) / det
  ];
  return (x: number, y: number): [number, number] => {
    const w = inv[6] * x + inv[7] * y + inv[8];
    return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w];
  };
};

const bilinear = (r: Raster, fx: number, fy: number, out: number[]) => {
  const x = Math.min(r.width - 1, Math.max(0, fx * r.width - 0.5));
  const y = Math.min(r.height - 1, Math.max(0, fy * r.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(r.width - 1, x0 + 1), y1 = Math.min(r.height - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  for (let c = 0; c < 3; c++) {
    const p00 = r.data[(y0 * r.width + x0) * 4 + c];
    const p10 = r.data[(y0 * r.width + x1) * 4 + c];
    const p01 = r.data[(y1 * r.width + x0) * 4 + c];
    const p11 = r.data[(y1 * r.width + x1) * 4 + c];
    const top = p00 + (p10 - p00) * tx;
    const bottom = p01 + (p11 - p01) * tx;
    out[c] = top + (bottom - top) * ty;
  }
};

/**
 * Paint a quad with `fill` (a raster stretched onto it, or a flat colour), its
 * edge anti-aliased with four samples a pixel so the border is as a camera
 * would see it, neither a staircase nor a blur.
 */
const paintQuad = (
  photo: Float32Array,
  width: number,
  height: number,
  quad: Corners,
  fill: Raster | [number, number, number],
  shade?: (u: number, v: number) => number
) => {
  const back = homography(quad);
  const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const sample = [0, 0, 0];
  const offsets = [0.25, 0.75];

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let inside = 0;
      let r = 0, g = 0, b = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const [u, v] = back(x + ox, y + oy);
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          inside++;
          if (Array.isArray(fill)) {
            sample[0] = fill[0]; sample[1] = fill[1]; sample[2] = fill[2];
          } else {
            bilinear(fill, u, v, sample);
          }
          const k = shade ? shade(u, v) : 1;
          r += sample[0] * k; g += sample[1] * k; b += sample[2] * k;
        }
      }
      if (!inside) continue;
      const cover = inside / 4;
      const i = (y * width + x) * 3;
      photo[i] = photo[i] * (1 - cover) + (r / inside) * cover;
      photo[i + 1] = photo[i + 1] * (1 - cover) + (g / inside) * cover;
      photo[i + 2] = photo[i + 2] * (1 - cover) + (b / inside) * cover;
    }
  }
};

/** Three passes of a box blur, which is near enough a Gaussian. */
const blurMask = (mask: Float32Array, width: number, height: number, radius: number) => {
  const tmp = new Float32Array(mask.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += mask[y * width + Math.min(width - 1, Math.max(0, x))];
      for (let x = 0; x < width; x++) {
        tmp[y * width + x] = sum / (2 * radius + 1);
        sum += mask[y * width + Math.min(width - 1, x + radius + 1)] - mask[y * width + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
      for (let y = 0; y < height; y++) {
        mask[y * width + x] = sum / (2 * radius + 1);
        sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
      }
    }
  }
};

/** Smooth noise at a given scale: random values on a coarse grid, interpolated. */
const smoothNoise = (rng: Rng, width: number, height: number, cell: number): Float32Array => {
  const gw = Math.ceil(width / cell) + 2, gh = Math.ceil(height / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = y / cell, iy = Math.floor(gy), ty = gy - iy;
    for (let x = 0; x < width; x++) {
      const gx = x / cell, ix = Math.floor(gx), tx = gx - ix;
      const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1];
      const c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
      out[y * width + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
};

const paintBackground = (photo: Float32Array, width: number, height: number, background: Background, rng: Rng) => {
  const { kind, level } = background;
  const tint = background.tint || [1, 1, 1];
  const set = (i: number, v: number, dr = 0, dg = 0, db = 0) => {
    photo[i * 3] = clamp(v * tint[0] + dr);
    photo[i * 3 + 1] = clamp(v * tint[1] + dg);
    photo[i * 3 + 2] = clamp(v * tint[2] + db);
  };
  // A soft unevenness every table has under a lamp.
  const blotch = smoothNoise(rng, width, height, Math.max(40, Math.round(Math.min(width, height) / 5)));

  if (kind === 'plain' || kind === 'clutter') {
    for (let i = 0; i < width * height; i++) set(i, level + (blotch[i] - 0.5) * 24 + rng.gaussian() * 2);
  } else if (kind === 'wood') {
    const angle = rng.between(-0.35, 0.35) + (rng.next() < 0.5 ? 0 : Math.PI / 2);
    const plank = rng.between(70, 140);
    const grain = smoothNoise(rng, width, height, 6);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const across = x * cos + y * sin;
        const along = -x * sin + y * cos;
        const p = Math.floor(across / plank);
        const seam = across - p * plank;
        const shade = ((p * 7919) % 13) / 13 - 0.5;
        let v = level + shade * 18 + (blotch[y * width + x] - 0.5) * 20;
        // Grain: streaks along the plank, wavering slowly.
        v += Math.sin(across * 0.9 + along * 0.02 + grain[y * width + x] * 6) * 5;
        if (seam < 2) v -= 35;
        set(y * width + x, v + rng.gaussian() * 2, 6, 0, -8);
      }
    }
  } else if (kind === 'tiles') {
    const angle = rng.between(-0.12, 0.12);
    const tile = rng.between(140, 260);
    const grout = level > 128 ? -40 : 40;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const u = x * cos + y * sin, v = -x * sin + y * cos;
        const su = ((u % tile) + tile) % tile, sv = ((v % tile) + tile) % tile;
        const onGrout = su < 3 || sv < 3;
        set(y * width + x, level + (onGrout ? grout : 0) + (blotch[y * width + x] - 0.5) * 16 + rng.gaussian() * 2);
      }
    }
  } else if (kind === 'fabric') {
    const folds = smoothNoise(rng, width, height, Math.round(Math.min(width, height) / 3));
    const weave = smoothNoise(rng, width, height, 3);
    for (let i = 0; i < width * height; i++) {
      set(i, level + (folds[i] - 0.5) * 70 + (weave[i] - 0.5) * 14 + rng.gaussian() * 3);
    }
  } else if (kind === 'carpet') {
    for (let i = 0; i < width * height; i++) set(i, level + (blotch[i] - 0.5) * 30 + rng.gaussian() * 22);
  }

  if (kind === 'clutter') {
    // Other things on the table: a paper, a dark gadget, a pen, each a
    // rectangle of its own, some of them running off the frame.
    const count = 2 + Math.floor(rng.next() * 3);
    for (let k = 0; k < count; k++) {
      const long = rng.between(0.25, 0.7) * Math.max(width, height);
      const short = rng.next() < 0.3 ? rng.between(8, 20) : long * rng.between(0.5, 0.8);
      const cx = rng.between(-0.1, 1.1) * width, cy = rng.between(-0.1, 1.1) * height;
      const a = rng.between(0, Math.PI);
      const cos = Math.cos(a), sin = Math.sin(a);
      const corner = (dx: number, dy: number): Pt => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
      const quad: Corners = [corner(-long / 2, -short / 2), corner(long / 2, -short / 2), corner(long / 2, short / 2), corner(-long / 2, short / 2)];
      const v = rng.next() < 0.5 ? rng.between(15, 60) : rng.between(180, 245);
      paintQuad(photo, width, height, quad, [v, v * rng.between(0.85, 1), v * rng.between(0.8, 1)]);
    }
  }
};

/** The corner of a quad pushed out along both its sides, for a block of pages or a shadow. */
const offsetQuad = (q: Corners, dx: number, dy: number): Corners =>
  q.map(([x, y]) => [x + dx, y + dy]) as Corners;

/**
 * Paint the scene. The cover is `scene.cover` laid exactly on `scene.corners`.
 */
export const paintScene = (scene: Scene): Raster => {
  const { width, height, cover, corners } = scene;
  const rng = random(scene.seed);
  const photo = new Float32Array(width * height * 3);

  paintBackground(photo, width, height, scene.background, rng);

  if (scene.shadow) {
    // A soft shadow a little down and to the right, as a lamp above and to
    // the left would throw, feathered so its edge is nothing like the cover's.
    const mask = new Float32Array(width * height);
    const shadowPhoto = new Float32Array(width * height * 3);
    const spread = Math.round(Math.min(width, height) * 0.012);
    paintQuad(shadowPhoto, width, height, offsetQuad(corners, spread * 1.5, spread * 2), [255, 255, 255]);
    for (let i = 0; i < mask.length; i++) mask[i] = shadowPhoto[i * 3] / 255;
    blurMask(mask, width, height, spread);
    for (let i = 0; i < mask.length; i++) {
      const k = 1 - mask[i] * scene.shadow * 0.6;
      photo[i * 3] *= k; photo[i * 3 + 1] *= k; photo[i * 3 + 2] *= k;
    }
  }

  if (scene.pages) {
    // A paperback's pages: a pale block showing beyond the right and bottom
    // edges, with the faint lines of the leaves.
    const pages = offsetQuad(corners, scene.pages * 0.8, scene.pages);
    paintQuad(photo, width, height, pages, [228, 222, 208], (u, v) => 0.9 + 0.1 * Math.sin((u + v) * 400));
  }

  const lighting = scene.lighting;
  const shade = lighting
    ? (u: number, v: number) => 1 - lighting.range * (0.5 + 0.5 * (Math.cos(lighting.angle) * (u - 0.5) + Math.sin(lighting.angle) * (v - 0.5)) * 2)
    : undefined;
  paintQuad(photo, width, height, corners, cover, shade);

  if (scene.glare) {
    const { x, y, rx, ry, strength } = scene.glare;
    const toPhoto = (() => {
      // Where a point of the cover lands in the photo: the forward homography.
      const back = homography(corners);
      // Found by solving numerically; the glare only needs to be near the right place.
      return (u: number, v: number): Pt => {
        let px = corners[0][0] + (corners[1][0] - corners[0][0]) * u + (corners[3][0] - corners[0][0]) * v;
        let py = corners[0][1] + (corners[1][1] - corners[0][1]) * u + (corners[3][1] - corners[0][1]) * v;
        for (let k = 0; k < 8; k++) {
          const [bu, bv] = back(px, py);
          px += (u - bu) * (corners[1][0] - corners[0][0]) + (v - bv) * (corners[3][0] - corners[0][0]);
          py += (u - bu) * (corners[1][1] - corners[0][1]) + (v - bv) * (corners[3][1] - corners[0][1]);
        }
        return [px, py];
      };
    })();
    const [gx, gy] = toPhoto(x, y);
    const side = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
    const prx = rx * side, pry = ry * side;
    const angle = Math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0]);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    for (let py = Math.max(0, Math.floor(gy - prx - pry)); py < Math.min(height, gy + prx + pry); py++) {
      for (let px = Math.max(0, Math.floor(gx - prx - pry)); px < Math.min(width, gx + prx + pry); px++) {
        const dx = px - gx, dy = py - gy;
        const ax = dx * cos - dy * sin, ay = dx * sin + dy * cos;
        const d = (ax * ax) / (prx * prx) + (ay * ay) / (pry * pry);
        if (d > 1) continue;
        const k = strength * Math.exp(-3 * d);
        const i = (py * width + px) * 3;
        photo[i] += (255 - photo[i]) * k;
        photo[i + 1] += (255 - photo[i + 1]) * k;
        photo[i + 2] += (255 - photo[i + 2]) * k;
      }
    }
  }

  if (scene.finger) {
    // A thumb: a capsule from the frame's nearest edge to a point on the side
    // it holds, skin-coloured, a shade darker along its edge.
    const { side, along, width: fw } = scene.finger;
    const a = corners[side], b = corners[(side + 1) % 4];
    const tip: Pt = [a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along];
    // The corners run clockwise on a screen whose y grows downwards, so the
    // outward normal of a side is its direction turned anticlockwise.
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const nl = Math.hypot(nx, ny) || 1;
    // The frame's edge the thumb comes from: the side's outward normal says which.
    const outward: Pt = [nx / nl, ny / nl];
    const toEdge = Math.max(
      outward[0] > 0 ? (width - tip[0]) / outward[0] : outward[0] < 0 ? -tip[0] / outward[0] : Infinity,
      0
    );
    const toEdgeY = outward[1] > 0 ? (height - tip[1]) / outward[1] : outward[1] < 0 ? -tip[1] / outward[1] : Infinity;
    const reach = Math.min(toEdge, toEdgeY) + fw;
    const root: Pt = [tip[0] + outward[0] * reach, tip[1] + outward[1] * reach];
    const press: Pt = [tip[0] - outward[0] * fw * 0.35, tip[1] - outward[1] * fw * 0.35];
    const skin: [number, number, number] = [rng.between(190, 225), rng.between(140, 170), rng.between(115, 145)];
    const x0 = Math.max(0, Math.floor(Math.min(root[0], press[0]) - fw)), x1 = Math.min(width - 1, Math.ceil(Math.max(root[0], press[0]) + fw));
    const y0 = Math.max(0, Math.floor(Math.min(root[1], press[1]) - fw)), y1 = Math.min(height - 1, Math.ceil(Math.max(root[1], press[1]) + fw));
    const vx = press[0] - root[0], vy = press[1] - root[1];
    const vv = vx * vx + vy * vy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - root[0]) * vx + (y - root[1]) * vy) / vv));
        const d = Math.hypot(x - (root[0] + vx * t), y - (root[1] + vy * t));
        const r = fw / 2;
        if (d > r + 1) continue;
        const edge = Math.max(0, Math.min(1, r + 0.5 - d));
        const dark = 1 - 0.35 * Math.pow(d / r, 4);
        const i = (y * width + x) * 3;
        for (let c = 0; c < 3; c++) photo[i + c] = photo[i + c] * (1 - edge) + skin[c] * dark * edge;
      }
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const grain = scene.noise || 0;
  for (let i = 0; i < width * height; i++) {
    const n = grain ? rng.gaussian() * grain : 0;
    out[i * 4] = clamp(photo[i * 3] + n);
    out[i * 4 + 1] = clamp(photo[i * 3 + 1] + n);
    out[i * 4 + 2] = clamp(photo[i * 3 + 2] + n);
    out[i * 4 + 3] = 255;
  }
  return { data: out, width, height };
};

/**
 * A cover drawn rather than photographed: a ground, a block of artwork, lines
 * of lettering, and for a comic a printed border -- the strong short edges a
 * real cover is full of, which is what fools a detector that counts edges.
 */
export const proceduralCover = (opts: {
  width: number;
  height: number;
  style: 'dark' | 'pale' | 'busy' | 'comic';
  seed: number;
}): Raster => {
  const { width, height, style } = opts;
  const rng = random(opts.seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const ground: [number, number, number] =
    style === 'dark' ? [rng.between(10, 40), rng.between(10, 40), rng.between(15, 50)]
      : style === 'pale' ? [rng.between(225, 250), rng.between(220, 245), rng.between(210, 240)]
        : [rng.between(60, 220), rng.between(60, 220), rng.between(60, 220)];
  const ink: [number, number, number] = style === 'dark' || (style === 'busy' && ground[0] + ground[1] < 250) ? [240, 240, 235] : [20, 20, 25];
  const fill = (x0: number, y0: number, x1: number, y1: number, colour: [number, number, number]) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(height, y1 | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(width, x1 | 0); x++) {
        const i = (y * width + x) * 4;
        data[i] = colour[0]; data[i + 1] = colour[1]; data[i + 2] = colour[2]; data[i + 3] = 255;
      }
    }
  };
  fill(0, 0, width, height, ground);

  // Artwork: a block with a gradient and a few shapes in it.
  const art = { x0: width * rng.between(0.05, 0.15), y0: height * rng.between(0.25, 0.4), x1: width * rng.between(0.85, 0.95), y1: height * rng.between(0.7, 0.9) };
  for (let y = art.y0 | 0; y < art.y1; y++) {
    for (let x = art.x0 | 0; x < art.x1; x++) {
      const t = (x - art.x0) / (art.x1 - art.x0), s = (y - art.y0) / (art.y1 - art.y0);
      const i = (y * width + x) * 4;
      data[i] = clamp(ground[0] * (1 - t) + 200 * t + Math.sin(s * 9) * 30);
      data[i + 1] = clamp(ground[1] * (1 - s) + 120 * s);
      data[i + 2] = clamp(ground[2] + 80 * t * s);
    }
  }
  for (let k = 0; k < 4; k++) {
    const cx = rng.between(art.x0, art.x1), cy = rng.between(art.y0, art.y1), r = rng.between(10, 50);
    const colour: [number, number, number] = [rng.between(0, 255), rng.between(0, 255), rng.between(0, 255)];
    fill(cx - r, cy - r, cx + r, cy + r, colour);
  }

  // Lettering: rows of words, each word a run of letter-sized blocks.
  const rows = style === 'busy' ? 7 : 4;
  for (let row = 0; row < rows; row++) {
    const size = row === 0 ? height * rng.between(0.06, 0.1) : height * rng.between(0.02, 0.04);
    const y = row === 0 ? height * 0.08 : height * (0.08 + 0.12 + row * 0.035);
    if (y + size > art.y0 && y < art.y1 && style !== 'busy') continue;
    let x = width * rng.between(0.08, 0.15);
    while (x < width * 0.9) {
      const letters = 2 + Math.floor(rng.next() * 7);
      for (let l = 0; l < letters && x < width * 0.9; l++) {
        const lw = size * rng.between(0.4, 0.7);
        fill(x, y + size * rng.between(0, 0.2), x + lw * 0.8, y + size, ink);
        x += lw;
      }
      x += size * 0.6;
    }
  }

  if (style === 'comic') {
    // A printed border inside the edge, the rectangle a detector loves.
    const m = Math.round(width * 0.04);
    const t = Math.max(2, Math.round(width * 0.008));
    fill(m, m, width - m, m + t, ink);
    fill(m, height - m - t, width - m, height - m, ink);
    fill(m, m, m + t, height - m, ink);
    fill(width - m - t, m, width - m, height - m, ink);
  }
  return { data, width, height };
};

/**
 * Where a flat cover of the given proportions lands in a photograph taken
 * from somewhat off to one side: a rectangle scaled, turned and tipped away.
 */
export const perspectiveCorners = (opts: {
  width: number;
  height: number;
  /** The cover's width over its height. */
  aspect: number;
  /** How much of the shorter side of the frame the cover's longer side spans. */
  span: number;
  /** Radians, in the picture plane. */
  tilt: number;
  /** Tipped away from the camera about the horizontal axis, radians (positive: the top is further). */
  pitch: number;
  /** And about the vertical axis. */
  yaw: number;
  /** Centre, as fractions of the frame. */
  at: Pt;
  /** Lens: focal length in multiples of the frame's longer side. */
  focal?: number;
}): Corners => {
  const { width, height, aspect, span, tilt, pitch, yaw, at, focal = 0.9 } = opts;
  const long = Math.min(width, height) * span;
  const cw = aspect >= 1 ? long : long * aspect;
  const ch = aspect >= 1 ? long / aspect : long;
  const f = focal * Math.max(width, height);
  const depth = f * 1.0;
  const flat: Array<[number, number]> = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]];
  return flat.map(([x, y]) => {
    // Tip about the horizontal axis then the vertical, project, then turn in the plane.
    const y1 = y * Math.cos(pitch), z1 = y * Math.sin(pitch);
    const x2 = x * Math.cos(yaw), z2 = z1 + x * Math.sin(yaw);
    const px = (x2 * f) / (depth + z2), py = (y1 * f) / (depth + z2);
    return [
      at[0] * width + px * Math.cos(tilt) - py * Math.sin(tilt),
      at[1] * height + px * Math.sin(tilt) + py * Math.cos(tilt)
    ] as Pt;
  }) as Corners;
};

export const toFractions = (corners: Corners, width: number, height: number) =>
  corners.map(([x, y]) => [x / width, y / height] as Pt) as Corners;

/** The corners as the detector's Quad. */
export const asQuad = (corners: Corners, width: number, height: number) => {
  const [topLeft, topRight, bottomRight, bottomLeft] = toFractions(corners, width, height);
  return { topLeft, topRight, bottomRight, bottomLeft };
};

/** Sutherland-Hodgman: the part of a convex polygon inside the frame. */
const clipToFrame = (poly: Pt[], width: number, height: number): Pt[] => {
  const edges: Array<(p: Pt) => number> = [p => p[0], p => width - p[0], p => p[1], p => height - p[1]];
  let out = poly;
  for (const inside of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const a = inside(prev), b = inside(cur);
      if (b >= 0) {
        if (a < 0) out.push(cross(prev, cur, a, b));
        out.push(cur);
      } else if (a >= 0) {
        out.push(cross(prev, cur, a, b));
      }
    }
    if (!out.length) break;
  }
  return out;
};

const cross = (p: Pt, q: Pt, a: number, b: number): Pt => {
  const t = a / (a - b);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
};

const distanceToSegment = ([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

const distanceToOutline = (p: Pt, poly: Pt[]): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
};

/**
 * How far the found outline is from the true one, in fractions of the
 * photo's diagonal: the worst of each polygon's corners against the other's
 * outline, so that a corner slid along a side still counts, and the mean.
 *
 * The truth is first cut to the frame: a cover that runs off the photo has
 * corners no detector can place, and the quad cut off where the frame is
 * is the right answer there.
 */
export const cornerError = (
  found: { topLeft: Pt; topRight: Pt; bottomRight: Pt; bottomLeft: Pt },
  truth: Corners,
  width: number,
  height: number
) => {
  const diagonal = Math.hypot(width, height);
  const f: Pt[] = [found.topLeft, found.topRight, found.bottomRight, found.bottomLeft].map(([x, y]) => [x * width, y * height]);
  const t = clipToFrame(truth, width, height);
  if (!t.length) return { mean: Infinity, max: Infinity };
  const distances = [
    ...f.map(p => distanceToOutline(p, t)),
    ...t.map(p => distanceToOutline(p, f))
  ].map(d => d / diagonal);
  return {
    mean: distances.reduce((s, d) => s + d, 0) / distances.length,
    max: Math.max(...distances)
  };
};
