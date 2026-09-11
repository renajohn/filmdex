import sharp from 'sharp';

/**
 * Straightening a sleeve photographed at an angle.
 *
 * The four corners arrive as fractions of the image, picked in the browser on
 * the image as it is displayed -- which is to say after the browser applied
 * EXIF orientation. So the pixels here are rotated upright first; skip that and
 * every corner addresses the wrong part of the photo.
 */

export type Point = [number, number];

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/** Maps the unit square onto the quad. Mapping that way round is what the */
/** per-pixel loop needs: for each output pixel, ask where it came from. */
interface Homography {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  g: number; h: number;
}

const squareToQuad = (q: Quad): Homography => {
  const [x0, y0] = q.topLeft;
  const [x1, y1] = q.topRight;
  const [x2, y2] = q.bottomRight;
  const [x3, y3] = q.bottomLeft;

  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  // A parallelogram needs no perspective term, and the general formula below
  // divides by zero for it.
  if (Math.abs(sx) < 1e-10 && Math.abs(sy) < 1e-10) {
    return { a: x1 - x0, b: x2 - x1, c: x0, d: y1 - y0, e: y2 - y1, f: y0, g: 0, h: 0 };
  }

  const dx1 = x1 - x2, dx2 = x3 - x2;
  const dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) {
    throw new Error('Degenerate quad: its corners are collinear');
  }

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h
  };
};

const isSaneQuad = (q: Quad): boolean => {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  if (pts.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v)))) {
    return false;
  }
  // Each side has to have some length, or there is no quadrilateral.
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 4];
    if (Math.hypot(bx - ax, by - ay) < 0.02) return false;
  }
  return true;
};

/**
 * Warp the region inside `quad` into a square image of `size` pixels.
 *
 * Walks the destination and asks where each pixel came from, sampling the
 * source bilinearly. Going the other way -- pushing source pixels forward --
 * leaves holes wherever the source is stretched.
 */
export const warpQuadToSquare = async (input: Buffer, quad: Quad, size: number): Promise<Buffer> => {
  if (!isSaneQuad(quad)) {
    throw new Error('Degenerate quad: four distinct corners are required');
  }

  // rotate() with no argument bakes in EXIF orientation: the corners were
  // picked on the upright image, so the pixels have to match it.
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sw = info.width, sh = info.height, channels = info.channels;
  const m = squareToQuad(quad);
  const out = Buffer.alloc(size * size * channels);

  for (let dy = 0; dy < size; dy++) {
    // Sample pixel centres, so the edges are not half a pixel off.
    const v = (dy + 0.5) / size;
    for (let dx = 0; dx < size; dx++) {
      const u = (dx + 0.5) / size;

      const w = m.g * u + m.h * v + 1;
      const fx = ((m.a * u + m.b * v + m.c) / w) * sw - 0.5;
      const fy = ((m.d * u + m.e * v + m.f) / w) * sh - 0.5;

      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;

      const clampX = (x: number) => (x < 0 ? 0 : x > sw - 1 ? sw - 1 : x);
      const clampY = (y: number) => (y < 0 ? 0 : y > sh - 1 ? sh - 1 : y);
      const x1 = clampX(x0 + 1), y1 = clampY(y0 + 1);
      const cx0 = clampX(x0), cy0 = clampY(y0);

      const di = (dy * size + dx) * channels;
      for (let c = 0; c < channels; c++) {
        const p00 = data[(cy0 * sw + cx0) * channels + c];
        const p10 = data[(cy0 * sw + x1) * channels + c];
        const p01 = data[(y1 * sw + cx0) * channels + c];
        const p11 = data[(y1 * sw + x1) * channels + c];

        const top = p00 + (p10 - p00) * tx;
        const bottom = p01 + (p11 - p01) * tx;
        out[di + c] = Math.round(top + (bottom - top) * ty);
      }
    }
  }

  return sharp(out, { raw: { width: size, height: size, channels: channels as 1 | 2 | 3 | 4 } })
    .jpeg({ quality: 92 })
    .toBuffer();
};

export default { warpQuadToSquare };
