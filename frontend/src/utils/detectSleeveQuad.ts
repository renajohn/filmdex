/**
 * Finding the sleeve in a photograph.
 *
 * Two ways of looking. Colour separation -- the region that differs from the
 * border of the frame, cornered by its extremes along the diagonals -- is
 * exact on a plain table and hopeless on a busy one. The edge search in
 * detectByEdges does not care what is behind, only that a rectangle has four
 * straight sides. Colour's answer is handed to the edge search as one more
 * candidate, and every candidate is judged the same way: by whether the
 * picture really has an edge along each of its sides.
 *
 * Measured on real photographs in evalsets/handheld-cd. It reports a
 * confidence and declines rather than guessing, and the caller shows the
 * result for confirmation either way.
 */

import { detectByEdges } from './detectByEdges';

export type Point = [number, number];

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface Detection {
  quad: Quad;
  /** 0 to 1. Below roughly 0.6 the corners are a starting point, not an answer. */
  confidence: number;
}

/**
 * What to offer when nothing was found.
 *
 * A fixed inset of the frame is a rectangle on a portrait photo, which looks
 * nothing like the square sleeve it is meant to land on. Given the photo's
 * proportions this returns a centred square instead, so the first guess is at
 * least the right shape and usually needs only nudging.
 */
export const defaultQuad = (aspect = 1): Quad => {
  // aspect = width / height of the photo. The square covers 80% of the
  // shorter side, expressed as fractions of each axis.
  const w = aspect >= 1 ? 0.8 / aspect : 0.8;
  const h = aspect >= 1 ? 0.8 : 0.8 * aspect;
  // Rounded: these end up in a request body, and 0.09999999999999998 helps
  // nobody reading it.
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  const x0 = r((1 - w) / 2);
  const y0 = r((1 - h) / 2);
  return {
    topLeft: [x0, y0],
    topRight: [r(x0 + w), y0],
    bottomRight: [r(x0 + w), r(y0 + h)],
    bottomLeft: [x0, r(y0 + h)]
  };
};

/** The square-photo case, kept for callers with nothing better to go on. */
export const DEFAULT_QUAD: Quad = defaultQuad(1);

const WORK_SIZE = 200;

/** Above this a detection is trustworthy enough to use without asking again. */
export const CONFIDENT = 0.6;

/** Greyscale at a reduced size: detail only slows this down and adds noise. */
const toGrey = (image: ImageData): { grey: Uint8Array; w: number; h: number } => {
  const { width, height, data } = image;
  const scale = Math.max(1, Math.round(Math.max(width, height) / WORK_SIZE));
  const w = Math.max(1, Math.floor(width / scale));
  const h = Math.max(1, Math.floor(height / scale));
  const grey = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, x * scale);
      const sy = Math.min(height - 1, y * scale);
      const i = (sy * width + sx) * 4;
      // Rec. 601 luma, which is what "how light is this" means to an eye.
      grey[y * w + x] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    }
  }
  return { grey, w, h };
};

/** The surface the sleeve lies on shows at the edges of the frame. */
const backgroundLevel = (grey: Uint8Array, w: number, h: number) => {
  const ring: number[] = [];
  for (let x = 0; x < w; x++) ring.push(grey[x], grey[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) ring.push(grey[y * w], grey[y * w + w - 1]);
  ring.sort((a, b) => a - b);

  const median = ring[ring.length >> 1];
  const spread = ring.map(v => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(ring.length * 0.9)];
  // Never trust a threshold tighter than this: JPEG noise alone moves a few levels.
  return { median, threshold: Math.max(20, spread * 2) };
};

/**
 * The largest run of touching foreground pixels.
 *
 * Taking extremes over the whole mask instead reports the frame rather than
 * the sleeve, because a glare gradient lights up pixels right to the border.
 */
const largestRegion = (fg: Uint8Array, w: number, h: number): { mask: Uint8Array; size: number } => {
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let bestSize = 0;
  let bestLabel = -1;
  let next = 0;

  for (let start = 0; start < w * h; start++) {
    if (!fg[start] || label[start] !== -1) continue;
    const id = next++;
    let size = 0;
    stack.push(start);
    label[start] = id;

    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const px = p % w;
      const py = (p / w) | 0;
      if (px > 0 && fg[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (px < w - 1 && fg[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (py > 0 && fg[p - w] && label[p - w] === -1) { label[p - w] = id; stack.push(p - w); }
      if (py < h - 1 && fg[p + w] && label[p + w] === -1) { label[p + w] = id; stack.push(p + w); }
    }

    if (size > bestSize) { bestSize = size; bestLabel = id; }
  }

  const mask = new Uint8Array(w * h);
  if (bestLabel >= 0) {
    for (let i = 0; i < w * h; i++) if (label[i] === bestLabel) mask[i] = 1;
  }
  return { mask, size: bestSize };
};

/** Corners of a rotated rectangle are its extremes along the two diagonals. */
const cornersOf = (mask: Uint8Array, w: number, h: number): Quad | null => {
  const scores: Array<[keyof Quad, (x: number, y: number) => number]> = [
    ['topLeft', (x, y) => x + y],
    ['bottomRight', (x, y) => -(x + y)],
    ['topRight', (x, y) => y - x],
    ['bottomLeft', (x, y) => x - y]
  ];

  const found: Partial<Quad> = {};
  for (const [name, score] of scores) {
    let best = Infinity;
    let bx = -1;
    let by = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const s = score(x, y);
        if (s < best) { best = s; bx = x; by = y; }
      }
    }
    if (bx < 0) return null;
    found[name] = [bx / w, by / h];
  }
  return found as Quad;
};

/**
 * How much this looks like a rectangle photographed straight-ish on.
 *
 * Measured in pixels, not in fractions of the frame. On a 3:4 photograph -- so
 * on every photograph a phone takes -- a true square spans 0.8 of the width
 * against 0.6 of the height, and judging that shape by its fractions scores it
 * as half again too wide. Every honest detection was being marked down for the
 * shape of the photo it came from.
 */
const shapeConfidence = (quad: Quad, coverage: number, aspect = 1): number => {
  // Back into proportional pixels: x spans `aspect` for every 1 of y.
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
    .map(([x, y]) => [x * aspect, y] as Point);

  const sides: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 4];
    sides.push(Math.hypot(bx - ax, by - ay));
  }
  const shortest = Math.min(...sides);
  const longest = Math.max(...sides);
  if (shortest < 0.05) return 0;

  // A sleeve is square; perspective skews it but never to a sliver.
  const squareness = Math.max(0, 1 - (longest / shortest - 1));

  let cornersScore = 1;
  for (let i = 0; i < 4; i++) {
    const p = pts[(i + 3) % 4];
    const c = pts[i];
    const n = pts[(i + 1) % 4];
    const v1 = [p[0] - c[0], p[1] - c[1]];
    const v2 = [n[0] - c[0], n[1] - c[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    const degrees = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    cornersScore = Math.min(cornersScore, Math.max(0, 1 - Math.abs(degrees - 90) / 45));
  }

  // Too small to be the subject, or so large it is probably the frame itself.
  const framing = coverage < 0.08 || coverage > 0.95 ? 0 : 1;

  return squareness * cornersScore * framing;
};

/** Separating the sleeve from its background by colour. */
const detectByColour = (image: ImageData): Detection | null => {
  const { grey, w, h } = toGrey(image);
  if (w < 16 || h < 16) return null;

  const { median, threshold } = backgroundLevel(grey, w, h);

  const fg = new Uint8Array(w * h);
  for (let i = 0; i < grey.length; i++) {
    fg[i] = Math.abs(grey[i] - median) >= threshold ? 1 : 0;
  }

  const { mask, size } = largestRegion(fg, w, h);
  if (!size) return null;

  const quad = cornersOf(mask, w, h);
  if (!quad) return null;

  const confidence = shapeConfidence(quad, size / (w * h), w / h);
  return confidence > 0 ? { quad, confidence } : null;
};

/**
 * Push the corners out from the centre by a hair.
 *
 * A gradient peaks on the transition itself, and the search works on a
 * downscaled copy, so the quad lands a little inside the true border. Applied
 * blind that clips the artwork, which is worse than leaving a sliver of
 * background: one is a cover with a corner missing, the other is a cover.
 */
const expandQuad = (quad: Quad, by = 0.02): Quad => {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const out = (p: Point): Point => [
    Math.min(1, Math.max(0, cx + (p[0] - cx) * (1 + by))),
    Math.min(1, Math.max(0, cy + (p[1] - cy) * (1 + by)))
  ];
  return {
    topLeft: out(quad.topLeft),
    topRight: out(quad.topRight),
    bottomRight: out(quad.bottomRight),
    bottomLeft: out(quad.bottomLeft)
  };
};

/**
 * Locate the sleeve, or say it could not.
 *
 * Returns null, or a low confidence, rather than a poor guess; the caller
 * falls back to a centred square so there is always something to drag.
 */
export const detectSleeveQuad = (image: ImageData): Detection | null => {
  const byColour = detectByColour(image);

  // Whatever colour found is only a proposal. Judged by its shape alone it
  // passed for a sleeve when it was a sleeve and a gadget merged into one
  // blob; judged by whether the picture has an edge along each of its sides,
  // it does not.
  try {
    const byEdges = detectByEdges(image, byColour ? [byColour.quad] : []);
    if (byEdges) return { quad: expandQuad(byEdges.quad), confidence: byEdges.confidence };
  } catch (_) {
    // An edge search that blows up must not cost us the colour answer.
  }

  // Unconfirmed, so never confident: a starting point for dragging at most.
  return byColour
    ? { quad: expandQuad(byColour.quad), confidence: Math.min(byColour.confidence, CONFIDENT / 2) }
    : null;
};

export default detectSleeveQuad;
