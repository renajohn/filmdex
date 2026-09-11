import type { Quad, Point } from './detectSleeveQuad';

/**
 * Straighten the region inside a quad, in the browser.
 *
 * The same mapping the server does, moved here for the one path that needs the
 * result before there is anything to upload to: the import step shows the
 * photograph it is about to keep, and a thumbnail of the uncropped original
 * tells the user nothing about the framing they just set.
 *
 * Sending pixels rather than corners also means what is shown is what is
 * stored, with no second interpretation at the other end.
 */

interface Homography {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  g: number; h: number;
}

/** Maps the unit square onto the quad: for each output pixel, where it came from. */
const squareToQuad = (q: Quad): Homography => {
  const [x0, y0] = q.topLeft;
  const [x1, y1] = q.topRight;
  const [x2, y2] = q.bottomRight;
  const [x3, y3] = q.bottomLeft;

  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  // A parallelogram needs no perspective term, and the general form divides by
  // zero for it.
  if (Math.abs(sx) < 1e-10 && Math.abs(sy) < 1e-10) {
    return { a: x1 - x0, b: x2 - x1, c: x0, d: y1 - y0, e: y2 - y1, f: y0, g: 0, h: 0 };
  }

  const dx1 = x1 - x2, dx2 = x3 - x2;
  const dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) throw new Error('Degenerate quad: its corners are collinear');

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

/**
 * The framed region's shape in source pixels.
 *
 * Opposite sides differ under perspective, so each dimension is the average of
 * its two. Without this the result would be square whatever was framed.
 */
const extentOf = (quad: Quad, sw: number, sh: number) => {
  const px = ([x, y]: Point): Point => [x * sw, y * sh];
  const span = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [tl, tr, br, bl] = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map(px);
  return {
    width: (span(tl, tr) + span(bl, br)) / 2,
    height: (span(tl, bl) + span(tr, br)) / 2
  };
};

/**
 * Warp the region inside `quad` out of `image`, longest edge `maxEdge`.
 *
 * Walks the destination and samples the source bilinearly. Pushing source
 * pixels forward instead leaves holes wherever the source is stretched.
 */
export const warpQuad = async (image: HTMLImageElement, quad: Quad, maxEdge = 1600): Promise<Blob> => {
  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;
  if (!naturalW || !naturalH) throw new Error('image has no dimensions');

  // Read the source at no more than this. A 12MP phone photo is 48MB of pixel
  // data, which is more than a phone browser will reliably hand over -- and the
  // result is at most maxEdge across, so the detail would be thrown away anyway.
  const cap = Math.max(maxEdge * 1.5, 2048);
  const scale = Math.min(1, cap / Math.max(naturalW, naturalH));
  const sw = Math.max(1, Math.round(naturalW * scale));
  const sh = Math.max(1, Math.round(naturalH * scale));

  const source = document.createElement('canvas');
  source.width = sw;
  source.height = sh;
  const sctx = source.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('no canvas context');
  sctx.drawImage(image, 0, 0, sw, sh);
  const src = sctx.getImageData(0, 0, sw, sh).data;

  const extent = extentOf(quad, sw, sh);
  const longest = Math.max(extent.width, extent.height) || 1;
  const outW = Math.max(1, Math.round((extent.width / longest) * maxEdge));
  const outH = Math.max(1, Math.round((extent.height / longest) * maxEdge));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no canvas context');
  const dest = octx.createImageData(outW, outH);

  const m = squareToQuad(quad);
  const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

  for (let dy = 0; dy < outH; dy++) {
    // Pixel centres, so the edges are not half a pixel off.
    const v = (dy + 0.5) / outH;
    for (let dx = 0; dx < outW; dx++) {
      const u = (dx + 0.5) / outW;

      const w = m.g * u + m.h * v + 1;
      const fx = ((m.a * u + m.b * v + m.c) / w) * sw - 0.5;
      const fy = ((m.d * u + m.e * v + m.f) / w) * sh - 0.5;

      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const cx0 = clamp(x0, sw - 1), cy0 = clamp(y0, sh - 1);
      const cx1 = clamp(x0 + 1, sw - 1), cy1 = clamp(y0 + 1, sh - 1);

      const di = (dy * outW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(cy0 * sw + cx0) * 4 + c];
        const p10 = src[(cy0 * sw + cx1) * 4 + c];
        const p01 = src[(cy1 * sw + cx0) * 4 + c];
        const p11 = src[(cy1 * sw + cx1) * 4 + c];
        const top = p00 + (p10 - p00) * tx;
        const bottom = p01 + (p11 - p01) * tx;
        dest.data[di + c] = Math.round(top + (bottom - top) * ty);
      }
      dest.data[di + 3] = 255;
    }
  }

  octx.putImageData(dest, 0, 0);

  const blob = await new Promise<Blob | null>(resolve =>
    out.toBlob(resolve, 'image/jpeg', 0.92)
  );
  if (!blob) throw new Error('canvas produced nothing');
  return blob;
};

export default warpQuad;
