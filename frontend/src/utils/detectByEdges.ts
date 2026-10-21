import type { Quad, Point } from './detectSleeveQuad';

/**
 * Finding a sleeve or a book by its edges rather than by its colour.
 *
 * Separating a cover from its background works when the two differ. It fails
 * completely on the case that matters most -- a case held in the hand over a
 * floor, a blanket and a sleeve of clothing -- because there is no single
 * background colour to subtract.
 *
 * A cover is however a rectangle, and a rectangle has four long straight
 * edges. That is a different signal, and it survives a busy background.
 *
 * Two stages. Lines are proposed, two ways: a Hough transform in which each
 * edge pixel votes for exactly one line, and a search for long straight runs
 * of edge. Every rectangle those lines can make is then checked against the
 * picture, side by side, two ways: whether there really is an edge running
 * along the side, and whether the picture actually changes across it. The
 * second is what wood floors and tiled tables demanded. A plank's seam and a
 * grout line are edges too, long and straight, and they will happily close a
 * rectangle whose side is not there; but the same wood lies on both sides of
 * a seam, while a cover's edge has the cover on one side and the table on
 * the other.
 *
 * Tuned against the photographs in evalsets/handheld-cd and the made-up ones
 * in evalsets/synthetic-covers, which is where to look -- and what to run --
 * before changing any of the numbers below.
 */

/** Everything is measured on the photo shrunk to this many pixels on its long side. */
const WORK = 400;
/** The sides are settled on a sharper copy, this much larger, at the end. */
const FINE = 2;
/** Lines are binned this finely in angle; 1 degree is finer than we can trust. */
const THETA_STEPS = 180;
/** Lines proposed by the vote. Nested edges -- case, booklet, spine -- need room. */
const VOTED_LINES = 32;
/** Lines proposed as long straight runs. */
const RUN_LINES = 16;
/** A side lying within this many pixels of the frame is taken to be on it. */
const FRAME_BAND = 8;
/** The picture is compared this far either side of a side, in working pixels. */
const STEP_REACH = [4, 7];

const DEGREE = Math.PI / 180;

/** What is being looked for, which only changes the proportions expected. */
export type Subject = 'sleeve' | 'book';

export interface EdgeOptions {
  subject?: Subject;
}

interface Line {
  /** Radians, the direction of the line's normal. */
  theta: number;
  /** Distance from the origin along that normal, in working pixels. */
  rho: number;
}

interface Grey {
  data: Float32Array;
  w: number;
  h: number;
}

interface Edges {
  magnitude: Float32Array;
  /** Gradient direction per pixel, radians. */
  angle: Float32Array;
  /** The blurred grey the gradient was taken of, for looking across an edge. */
  grey: Float32Array;
  w: number;
  h: number;
}

/**
 * The photo in grey, at exactly `long` pixels on its long side.
 *
 * Exactly, and not merely near it: every distance below -- how far apart two
 * sides must be, how far a side may drift -- is counted in these pixels, and
 * a phone's 4032-pixel photo and the same photo at 1024 used to land on grids
 * a tenth apart and come to different conclusions. Larger photos are
 * box-averaged, since aliasing invents edges; smaller ones are interpolated.
 */
const shrink = (image: ImageData, long: number): Grey => {
  const { width, height, data } = image;
  const scale = Math.max(width, height) / long;
  const w = Math.max(1, Math.round(width / scale));
  const h = Math.max(1, Math.round(height / scale));
  const out = new Float32Array(w * h);
  const luma = (i: number) => (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (scale >= 1) {
        const x0 = Math.floor(x * scale);
        const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
        const y0 = Math.floor(y * scale);
        const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
        let sum = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) sum += luma((sy * width + sx) * 4);
        }
        out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
      } else {
        const fx = Math.min(width - 1, Math.max(0, (x + 0.5) * scale - 0.5));
        const fy = Math.min(height - 1, Math.max(0, (y + 0.5) * scale - 0.5));
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const jx = Math.min(width - 1, ix + 1);
        const jy = Math.min(height - 1, iy + 1);
        const ax = fx - ix;
        const ay = fy - iy;
        const at = (sx: number, sy: number) => luma((sy * width + sx) * 4);
        out[y * w + x] =
          (at(ix, iy) * (1 - ax) + at(jx, iy) * ax) * (1 - ay) +
          (at(ix, jy) * (1 - ax) + at(jx, jy) * ax) * ay;
      }
    }
  }
  return { data: out, w, h };
};

/** A 3x3 blur. Grain votes as strongly as a real border otherwise. */
const blur = ({ data, w, h }: Grey): Grey => {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
          sum += data[ny * w + nx];
          n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return { data: out, w, h };
};

const sobel = ({ data, w, h }: Grey): Edges => {
  const magnitude = new Float32Array(w * h);
  const angle = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1] +
        data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
        data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];

      magnitude[i] = Math.hypot(gx, gy);
      angle[i] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, angle, grey: data, w, h };
};

/** Sobel on 8-bit grey never exceeds this; a histogram that wide holds every value. */
const MAGNITUDE_BINS = 1500;

/**
 * The gradient magnitude only the strongest `keepFraction` of pixels reach.
 *
 * Counted into whole-number bins rather than sorted: a sort of half a million
 * floats was a third of the time spent, and a level's precision is plenty.
 */
const magnitudeCutoff = (magnitude: Float32Array, keepFraction: number): number => {
  const bins = new Uint32Array(MAGNITUDE_BINS + 1);
  let nonZero = 0;
  for (let i = 0; i < magnitude.length; i++) {
    const m = magnitude[i];
    if (m <= 0) continue;
    nonZero++;
    bins[m >= MAGNITUDE_BINS ? MAGNITUDE_BINS : m | 0]++;
  }
  if (!nonZero) return Infinity;
  let below = Math.floor(nonZero * (1 - keepFraction));
  for (let b = 0; b <= MAGNITUDE_BINS; b++) {
    if (below < bins[b]) return b;
    below -= bins[b];
  }
  return MAGNITUDE_BINS;
};

/** Half the size, each pixel the mean of four: the coarse copy from the fine one. */
const halve = ({ data, w, h }: Grey): Grey => {
  const hw = Math.max(1, Math.round(w / 2));
  const hh = Math.max(1, Math.round(h / 2));
  const out = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) {
    const y0 = Math.min(h - 1, 2 * y), y1 = Math.min(h - 1, 2 * y + 1);
    for (let x = 0; x < hw; x++) {
      const x0 = Math.min(w - 1, 2 * x), x1 = Math.min(w - 1, 2 * x + 1);
      out[y * hw + x] = (data[y0 * w + x0] + data[y0 * w + x1] + data[y1 * w + x0] + data[y1 * w + x1]) / 4;
    }
  }
  return { data: out, w: hw, h: hh };
};

/**
 * How much the picture varies on its own, a few pixels apart: the grain of a
 * carpet, the figure of wood. A change across a side must beat this to count
 * as the cover ending and the table beginning.
 */
const textureLevel = (grey: Float32Array, w: number, h: number): number => {
  const diffs: number[] = [];
  const step = Math.max(2, Math.floor(Math.sqrt((w * h) / 4000)));
  const reach = STEP_REACH[1];
  for (let y = reach; y < h - reach; y += step) {
    for (let x = reach; x < w - reach; x += step) {
      const i = y * w + x;
      diffs.push(Math.abs(grey[i] - grey[i + reach]), Math.abs(grey[i] - grey[i + reach * w]));
    }
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length * 0.7)] || 0;
};

/**
 * How often a band across nothing in particular still finds an "edge".
 *
 * On a carpet or a towel the grain is all gradient, and two pixels in five
 * clear the threshold facing roughly the right way. Measured against that, a
 * side that is really there still reads as one; a stretch of nothing no
 * longer reads as half a side, which is what used to make a cover's own edges
 * look as if they ran on past its corners.
 */
const baselineEdgeRate = (edges: Edges, threshold: number): number => {
  const { magnitude, w, h } = edges;
  let above = 0;
  let total = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      total++;
      if (magnitude[y * w + x] >= threshold) above++;
    }
  }
  const rate = total ? above / total : 0;
  // Five pixels looked at, each facing the right way two times in nine.
  return 1 - Math.pow(1 - rate * (40 / 180), 5);
};

/** Smallest angle between two line directions, both folded into [0, pi). */
const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

/**
 * Accumulate one vote per strong edge pixel, for the line through it.
 *
 * theta comes from the pixel's own gradient, so a pixel on a straight edge
 * votes for that edge and a pixel in a texture votes for whatever direction it
 * happens to face -- which cancels out.
 */
const votedLines = (edges: Edges, cutoff: number, wanted: number): Line[] => {
  const { magnitude, angle, w, h } = edges;
  const diagonal = Math.hypot(w, h);
  const rhoSteps = Math.ceil(diagonal * 2) + 1;
  const accumulator = new Float32Array(THETA_STEPS * rhoSteps);

  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] < cutoff) continue;
    const x = i % w;
    const y = (i / w) | 0;

    // Normal direction, folded into [0, pi): a line and its reverse are one line.
    let theta = angle[i];
    if (theta < 0) theta += Math.PI;
    if (theta >= Math.PI) theta -= Math.PI;

    const t = Math.min(THETA_STEPS - 1, Math.round((theta / Math.PI) * THETA_STEPS));
    const exact = (t / THETA_STEPS) * Math.PI;
    const rho = x * Math.cos(exact) + y * Math.sin(exact);
    const r = Math.round(rho + diagonal);
    if (r < 0 || r >= rhoSteps) continue;

    accumulator[t * rhoSteps + r] += magnitude[i];
  }

  // Peaks, with the neighbourhood of each suppressed so one edge yields one
  // line -- but narrowly, because a jewel case's edge and its booklet's edge
  // sit a few pixels apart and both are wanted.
  const peaks: Line[] = [];
  const taken = new Uint8Array(accumulator.length);
  const thetaGuard = 3;
  const rhoGuard = Math.max(3, Math.round(diagonal * 0.015));

  for (let pick = 0; pick < wanted; pick++) {
    let best = 0;
    let bestIndex = -1;
    for (let i = 0; i < accumulator.length; i++) {
      if (taken[i]) continue;
      if (accumulator[i] > best) { best = accumulator[i]; bestIndex = i; }
    }
    if (bestIndex < 0 || best <= 0) break;

    const t = (bestIndex / rhoSteps) | 0;
    const r = bestIndex % rhoSteps;
    peaks.push({ theta: (t / THETA_STEPS) * Math.PI, rho: r - diagonal });

    for (let dt = -thetaGuard; dt <= thetaGuard; dt++) {
      // Wrapping past 0 or pi reverses the normal, and with it the sign of rho.
      const raw = t + dt;
      const wraps = raw < 0 || raw >= THETA_STEPS;
      const tt = (raw + THETA_STEPS) % THETA_STEPS;
      const centre = wraps ? Math.round(2 * diagonal - r) : r;
      for (let dr = -rhoGuard; dr <= rhoGuard; dr++) {
        const rr = centre + dr;
        if (rr >= 0 && rr < rhoSteps) taken[tt * rhoSteps + rr] = 1;
      }
    }
  }
  return peaks;
};

/**
 * Long straight runs of edge, found by growing regions of pixels that face
 * the same way -- the idea of Grompone von Gioi's LSD, without its statistics.
 *
 * The vote is a popularity contest the whole picture takes part in: a busy
 * cover throws up dozens of strong short strokes, and they crowd out the one
 * faint, long, perfectly straight side where a dark sleeve meets a dark sofa
 * or a grey one meets beige wood. Here length is what counts, and neither
 * texture nor handwriting grows long.
 */
const runLines = (edges: Edges, minMagnitude: number, wanted: number): Line[] => {
  const { magnitude, angle, w, h } = edges;
  const used = new Uint8Array(w * h);
  // The strongest first, by counting: a sort with a comparator took longer
  // than everything else here.
  const bins = new Uint32Array(MAGNITUDE_BINS + 2);
  const bin = (m: number) => (m >= MAGNITUDE_BINS ? MAGNITUDE_BINS : m | 0);
  let count = 0;
  for (let i = 0; i < w * h; i++) if (magnitude[i] >= minMagnitude) { bins[bin(magnitude[i])]++; count++; }
  // Starting offsets, strongest bin first.
  let at = 0;
  for (let b = MAGNITUDE_BINS; b >= 0; b--) { const n = bins[b]; bins[b] = at; at += n; }
  const order = new Int32Array(count);
  for (let i = 0; i < w * h; i++) if (magnitude[i] >= minMagnitude) order[bins[bin(magnitude[i])]++] = i;

  const minLength = 0.12 * Math.min(w, h);
  const tolerance = 22.5 * DEGREE;
  const found: Array<Line & { length: number }> = [];
  const region: number[] = [];

  for (const seed of order) {
    if (used[seed]) continue;
    region.length = 0;
    region.push(seed);
    used[seed] = 1;
    // Mean orientation in doubled angles, so that a line and its reverse agree.
    let c2 = Math.cos(2 * angle[seed]);
    let s2 = Math.sin(2 * angle[seed]);
    let regionAngle = angle[seed];

    for (let k = 0; k < region.length; k++) {
      const p = region[k];
      const px = p % w;
      const py = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
          const q = ny * w + nx;
          if (used[q] || magnitude[q] < minMagnitude) continue;
          if (angleBetween(angle[q], regionAngle) > tolerance) continue;
          used[q] = 1;
          region.push(q);
          c2 += Math.cos(2 * angle[q]);
          s2 += Math.sin(2 * angle[q]);
          regionAngle = Math.atan2(s2, c2) / 2;
        }
      }
    }
    if (region.length < minLength) continue;

    // Its axis, from the spread of its pixels.
    let mx = 0, my = 0;
    for (const p of region) { mx += p % w; my += (p / w) | 0; }
    mx /= region.length;
    my /= region.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of region) {
      const dx = (p % w) - mx, dy = ((p / w) | 0) - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ax = Math.cos(axis), ay = Math.sin(axis);
    let lo = Infinity, hi = -Infinity, across = 0;
    for (const p of region) {
      const dx = (p % w) - mx, dy = ((p / w) | 0) - my;
      const along = dx * ax + dy * ay;
      lo = Math.min(lo, along);
      hi = Math.max(hi, along);
      across += Math.abs(-dx * ay + dy * ax);
    }
    const length = hi - lo;
    const width = (2 * across) / region.length + 1;
    // A blob is not a line, however many pixels it has.
    if (length < minLength || length / width < 5) continue;

    const theta = (((axis + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI;
    found.push({ theta, rho: mx * Math.cos(theta) + my * Math.sin(theta), length });
  }

  found.sort((a, b) => b.length - a.length);
  const lines: Line[] = [];
  for (const line of found) {
    // A side interrupted by a thumb arrives as two runs of one line.
    const duplicate = lines.some(l => {
      if (angleBetween(l.theta, line.theta) > 2 * DEGREE) return false;
      const flipped = Math.abs(l.theta - line.theta) > Math.PI / 2;
      return Math.abs(l.rho - (flipped ? -line.rho : line.rho)) < 2;
    });
    if (!duplicate) lines.push({ theta: line.theta, rho: line.rho });
    if (lines.length >= wanted) break;
  }
  return lines;
};

const intersect = (a: Line, b: Line): Point | null => {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null;
  return [
    (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det
  ];
};

/** Where two lines, each given by two points on it, cross. */
const meet = (a1: Point, a2: Point, b1: Point, b2: Point): Point | null => {
  const d = (a1[0] - a2[0]) * (b1[1] - b2[1]) - (a1[1] - a2[1]) * (b1[0] - b2[0]);
  if (Math.abs(d) < 1e-9) return null;
  const s = a1[0] * a2[1] - a1[1] * a2[0];
  const t = b1[0] * b2[1] - b1[1] * b2[0];
  return [
    (s * (b1[0] - b2[0]) - (a1[0] - a2[0]) * t) / d,
    (s * (b1[1] - b2[1]) - (a1[1] - a2[1]) * t) / d
  ];
};

const areaOf = (pts: Point[]): number => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
};

/** Clockwise on screen, where y grows downwards. */
const isClockwise = (pts: Point[]): boolean => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum > 0;
};

/** What one sample along a side says: is there an edge here, and a change across it? */
const sampleSide = (
  edges: Edges,
  threshold: number,
  texture: number,
  px: number,
  py: number,
  nx: number,
  ny: number,
  normal: number,
  reach: number
): { edge: number; step: number; unseen: boolean } => {
  const { magnitude, angle, grey, w, h } = edges;
  // Right against the frame nothing can be measured: Sobel needs a pixel
  // either side.
  if (px < 3 || py < 3 || px > w - 4 || py > h - 4) return { edge: 0, step: 0, unseen: true };

  let edge = 0;
  for (let k = -reach; k <= reach; k++) {
    const x = Math.round(px + nx * k);
    const y = Math.round(py + ny * k);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const i = y * w + x;
    if (magnitude[i] < threshold) continue;
    if (angleBetween(angle[i], normal) > 20 * DEGREE) continue;
    edge = 1;
    break;
  }

  // The picture a little way to either side: a cover's edge has the cover on
  // one side and the table on the other, where a seam or a printed line has
  // the same thing on both.
  let change = 0;
  for (const d of STEP_REACH) {
    const ax = Math.round(px + nx * d), ay = Math.round(py + ny * d);
    const bx = Math.round(px - nx * d), by = Math.round(py - ny * d);
    const a = grey[Math.min(h - 1, Math.max(0, ay)) * w + Math.min(w - 1, Math.max(0, ax))];
    const b = grey[Math.min(h - 1, Math.max(0, by)) * w + Math.min(w - 1, Math.max(0, bx))];
    change += Math.abs(a - b);
  }
  change /= STEP_REACH.length;
  // Soft, so that a faint but real difference still counts for something.
  const step = change / (change + Math.max(6, 1.5 * texture));

  return { edge, step, unseen: false };
};

/** How much of a stretch of one particular line is a side: edge and step, 0 to 1 each. */
type Measure = (a: Point, b: Point, unknown: number) => { edge: number; step: number };

/**
 * sampleSide for every stretch of one line at once.
 *
 * Thousands of rectangles are built from a few dozen lines, and each asks
 * about stretches of the same lines over and over. Sampling each line once,
 * end to end, and keeping running totals answers any stretch in constant time.
 */
const lineMeasure = (edges: Edges, threshold: number, texture: number, line: Line): Measure => {
  const { w, h } = edges;
  const reach = Math.ceil(Math.hypot(w, h));
  const count = 2 * reach + 1;
  const dx = -Math.sin(line.theta);
  const dy = Math.cos(line.theta);
  const ox = line.rho * Math.cos(line.theta);
  const oy = line.rho * Math.sin(line.theta);
  const normal = Math.atan2(dx, -dy);
  const nx = -dy;
  const ny = dx;
  const edgeSum = new Float32Array(count + 1);
  const stepSum = new Float32Array(count + 1);
  const blind = new Float32Array(count + 1);

  for (let k = 0; k < count; k++) {
    const t = k - reach;
    const sample = sampleSide(edges, threshold, texture, ox + dx * t, oy + dy * t, nx, ny, normal, 2);
    edgeSum[k + 1] = edgeSum[k] + sample.edge;
    stepSum[k + 1] = stepSum[k] + sample.step;
    blind[k + 1] = blind[k] + (sample.unseen ? 1 : 0);
  }

  return (a, b, unknown) => {
    const ta = (a[0] - ox) * dx + (a[1] - oy) * dy;
    const tb = (b[0] - ox) * dx + (b[1] - oy) * dy;
    const lo = Math.min(ta, tb);
    const hi = Math.max(ta, tb);
    const length = hi - lo;
    if (length < 4) return { edge: 0, step: 0 };
    // The ends are left out: corners are where two edges blur into each other.
    const first = Math.ceil(lo + length * 0.04) + reach;
    const last = Math.floor(hi - length * 0.04) + reach;
    const samples = last - first + 1;
    if (samples <= 0) return { edge: 0, step: 0 };
    // Anything beyond the sampled stretch is beyond the frame too.
    const from = Math.max(0, Math.min(count, first));
    const to = Math.max(from, Math.min(count, last + 1));
    const outside = samples - (to - from);
    const unseen = blind[to] - blind[from] + outside;
    return {
      edge: (edgeSum[to] - edgeSum[from] + unknown * unseen) / samples,
      step: (stepSum[to] - stepSum[from] + unknown * unseen) / samples
    };
  };
};

/** The same measure for a segment that lies on no proposed line. */
const segmentMeasure = (edges: Edges, threshold: number, texture: number): Measure => (a, b, unknown) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 4) return { edge: 0, step: 0 };
  const dx = (b[0] - a[0]) / length;
  const dy = (b[1] - a[1]) / length;
  const normal = Math.atan2(dx, -dy);
  const nx = -dy;
  const ny = dx;
  let edge = 0, step = 0, samples = 0;
  for (let t = length * 0.04; t <= length * 0.96; t += 1) {
    samples++;
    const sample = sampleSide(edges, threshold, texture, a[0] + dx * t, a[1] + dy * t, nx, ny, normal, 2);
    if (sample.unseen) { edge += unknown; step += unknown; continue; }
    edge += sample.edge;
    step += sample.step;
  }
  return samples ? { edge: edge / samples, step: step / samples } : { edge: 0, step: 0 };
};

/**
 * The proportions of the flat rectangle four corners are a photograph of.
 *
 * A quad's shape in the picture says little by itself: a square sleeve on a
 * desk shot from a chair is a wide trapezoid, while three sleeves fanned in a
 * hand can cross in something far squarer. Undoing the perspective tells them
 * apart. This is Zhang and He's whiteboard construction, with the one thing a
 * photograph does not say -- the focal length -- assumed to be a phone's:
 * roughly the long side of the frame.
 */
const flatAspect = (pts: Point[], w: number, h: number): number => {
  const focal = 0.9 * Math.max(w, h);
  const at = ([x, y]: Point) => [x - w / 2, y - h / 2, 1];
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
  ];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const m1 = at(pts[0]);
  const m2 = at(pts[1]);
  const m4 = at(pts[2]);
  const m3 = at(pts[3]);
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  if (!Number.isFinite(k2) || !Number.isFinite(k3)) return Infinity;

  const n2 = m2.map((v, i) => v * k2 - m1[i]);
  const n3 = m3.map((v, i) => v * k3 - m1[i]);
  const f2 = focal * focal;
  const along = (n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2];
  const across = (n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2];
  return across > 0 ? Math.sqrt(along / across) : Infinity;
};

/**
 * The proportions a subject can have, longer side over shorter: what fits
 * outright, and the limit past which it is something else.
 *
 * A booklet or card sleeve is square, a jewel case 1.14 times as wide as it
 * is tall, a digipak 1.10, the back of a case with its spines 1.28. A pocket
 * paperback is 1.6 to 1.7, a novel 1.5, a comic album 1.33, an art book
 * anything down to square. Not knowing, anything from square to a tall book.
 */
const proportions = (subject?: Subject): { fits: [number, number]; limit: [number, number] } =>
  subject === 'sleeve' ? { fits: [1, 1.2], limit: [1, 1.5] }
    : subject === 'book' ? { fits: [1.25, 1.75], limit: [1, 2.1] }
      : { fits: [1, 1.75], limit: [1, 2.1] };

/**
 * How much four corners look like the subject photographed from in front of
 * it, perspective allowed: 0 to 1, or null if not at all.
 */
const plausibleShape = (pts: Point[], w: number, h: number, subject?: Subject, aspectKnown = true): number | null => {
  // All four in the picture, or nearly: a cover cut off by the frame cannot be
  // straightened, only guessed at.
  const margin = 0.03;
  for (const [x, y] of pts) {
    if (x < -margin * w || x > (1 + margin) * w || y < -margin * h || y > (1 + margin) * h) return null;
  }

  let turn = 0;
  const sides: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = pts[(i + 3) % 4];
    const c = pts[i];
    const n = pts[(i + 1) % 4];
    const z = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]);
    if (turn && Math.sign(z) !== Math.sign(turn)) return null;
    turn = z || turn;
    sides.push(Math.hypot(n[0] - c[0], n[1] - c[1]));

    const v1 = [p[0] - c[0], p[1] - c[1]];
    const v2 = [n[0] - c[0], n[1] - c[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
    const degrees = Math.acos(Math.max(-1, Math.min(1, cos))) / DEGREE;
    // Past this it is not a cover at an angle but a cover edge-on.
    if (Math.abs(degrees - 90) > 40) return null;
  }

  // Too small to be what the photo is of; so large it is the photo itself,
  // or a border printed round it -- the straightening would change nothing.
  const coverage = areaOf(pts) / (w * h);
  if (coverage < 0.06 || coverage > 0.92) return null;

  // Perspective shortens the far side, but not to half.
  const [s0, s1, s2, s3] = sides;
  if (Math.min(s0, s2) / Math.max(s0, s2) < 0.5 || Math.min(s1, s3) / Math.max(s1, s3) < 0.5) return null;

  // A cover cut off by the frame has lost a corner, and the quad that is
  // left says nothing about its proportions.
  if (!aspectKnown) return 1;

  const ratio = flatAspect(pts, w, h);
  const long = Math.max(ratio, 1 / ratio);
  if (!Number.isFinite(long)) return null;
  const { fits, limit } = proportions(subject);
  if (long > limit[1]) return null;
  // Logarithmic: 1.5 against 1.2 is as far off as 1.2 against 0.96.
  const over = long > fits[1] ? Math.log(long / fits[1]) / Math.log(limit[1] / fits[1]) : 0;
  const under = long < fits[0] ? Math.log(fits[0] / long) / Math.log(fits[0] / limit[0] || 1) : 0;
  return Math.max(0, 1 - Math.max(over, under));
};

/** What the edge search makes of one candidate outline. */
export interface Candidate {
  corners: Point[];
  /** Per side: how much of it is edge, and how much of it the picture changes across. */
  edge: number[];
  step: number[];
  overrun: number;
  shape: number;
  framed: number;
  score: number;
  confidence: number;
}

const scoreQuad = (
  edges: Edges,
  pts: Point[],
  measures: Measure[],
  baseline: number,
  subject?: Subject
): Candidate | null => {
  const { w, h } = edges;

  // Which sides lie along the edge of the photograph itself.
  const band = (v: number, size: number) => (v < FRAME_BAND ? -1 : v > size - 1 - FRAME_BAND ? 1 : 0);
  const onFrame = [0, 1, 2, 3].map(i => {
    const [a, b] = [pts[i], pts[(i + 1) % 4]];
    return (band(a[0], w) !== 0 && band(a[0], w) === band(b[0], w)) ||
      (band(a[1], h) !== 0 && band(a[1], h) === band(b[1], h));
  });
  const framed = onFrame.filter(Boolean).length;
  // A cover can run off one edge of the photo, or two at a corner when it is
  // held close. A rectangle leaning on three of them is the photo itself --
  // or a border printed around it -- and one leaning on two opposite edges
  // is a strip across the photo, not a thing in it.
  if (framed > 2) return null;
  if (framed === 2 && ((onFrame[0] && onFrame[2]) || (onFrame[1] && onFrame[3]))) return null;
  const shape = plausibleShape(pts, w, h, subject, framed === 0);
  if (shape === null) return null;
  const coverage = areaOf(pts) / (w * h);
  // And one that touches the frame is a cover photographed to fill it, not a
  // small thing in the corner of a picture of something else.
  if (framed && coverage < 0.3) return null;

  // What is left of an edge measure once the grain's share is taken off.
  const net = (edge: number) => Math.max(0, (edge - baseline) / (1 - baseline || 1));

  // Side i runs from corner i to corner i + 1.
  const sides = [0, 1, 2, 3].map(i => {
    if (!onFrame[i]) {
      const m = measures[i](pts[i], pts[(i + 1) % 4], 0.5);
      return { edge: net(m.edge), step: m.step };
    }
    // Nothing can be measured along the frame, so judge that side by its
    // neighbours instead: a cover cut off there has both of them running
    // right into it, while a rectangle closed off by the frame for want of a
    // fourth side has them stop short.
    const into = (side: number, from: Point, to: Point) =>
      measures[side]([to[0] + (from[0] - to[0]) * 0.2, to[1] + (from[1] - to[1]) * 0.2], to, 1);
    const before = into((i + 3) % 4, pts[(i + 3) % 4], pts[i]);
    const after = into((i + 1) % 4, pts[(i + 2) % 4], pts[(i + 1) % 4]);
    return { edge: 0.8 * net(Math.min(before.edge, after.edge)), step: 0.8 * Math.min(before.step, after.step) };
  });
  // A side counts for the edge along it, discounted when nothing changes
  // across it: a seam in a floor is all edge and no step.
  const support = sides.map(s => s.edge * (0.3 + 0.7 * s.step));
  const mean = support.reduce((s, v) => s + v, 0) / 4;
  const worst = Math.min(...support);

  // A cover's edge stops at its corner. One that runs on past it belongs to
  // something bigger -- a table, a floorboard, the sleeve behind -- and the
  // corner is only where two unrelated lines happen to cross.
  let overrun = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const ahead: Point = [b[0] + (b[0] - a[0]) * 0.2, b[1] + (b[1] - a[1]) * 0.2];
    const behind: Point = [a[0] - (b[0] - a[0]) * 0.2, a[1] - (b[1] - a[1]) * 0.2];
    overrun += net(measures[i](b, ahead, 0).edge) + net(measures[i](a, behind, 0).edge);
  }
  overrun /= 8;

  // One side may be half hidden by the thumb holding it; a side that is not
  // there at all means this is not a rectangle anyone photographed.
  const evidence = 0.6 * mean + 0.4 * worst - 0.75 * overrun;

  // Between two outlines the picture bears out alike, the larger: the
  // artwork printed on a cover is a rectangle too, and the cover is wanted.
  const size = 0.85 + 0.15 * Math.sqrt(coverage);
  // A cover that nearly fills the frame may be the frame, or a border printed
  // round the photo; and straightening it would change little anyway.
  const filling = coverage > 0.8 ? 1 - (coverage - 0.8) / 0.12 : 1;

  return {
    corners: pts,
    edge: sides.map(s => s.edge),
    step: sides.map(s => s.step),
    overrun,
    shape,
    framed,
    score: evidence * (0.5 + 0.5 * shape) * size * filling,
    // Measured on the evalsets, a right answer leaves evidence above 0.6 and
    // the plausible wrong ones below 0.45. A cover against the frame pays
    // for its shape twice, since that is where the lookalikes live.
    confidence: Math.max(0, Math.min(1, (evidence - 0.4) / 0.3)) * shape * 0.85 ** framed * filling
  };
};

/**
 * Settle each side onto the edge it was found near.
 *
 * Lines come out of the vote a degree and a pixel or so off, which over a
 * long side is enough to start on a case's rim and finish on the thumb under
 * it. Each side's two ends are nudged independently, half a pixel at a time,
 * to where the gradient across the side is strongest -- strongest, not
 * merely present, since a cover's edge is sharp and the shadow it casts
 * beside it is soft, and a count of edge pixels cannot tell them apart.
 */
const refine = (edges: Edges, cutoff: number, corners: Point[], reach: number, rounds: number): Point[] => {
  const { magnitude, angle, w, h } = edges;
  const strength = (a: Point, b: Point): number => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 4) return 0;
    const dx = (b[0] - a[0]) / length;
    const dy = (b[1] - a[1]) / length;
    const normal = Math.atan2(dx, -dy);
    const nx = -dy;
    const ny = dx;
    let sum = 0;
    let samples = 0;
    for (let t = length * 0.04; t <= length * 0.96; t += 1) {
      samples++;
      const px = a[0] + dx * t;
      const py = a[1] + dy * t;
      let best = 0;
      for (let k = -1; k <= 1; k++) {
        const x = Math.round(px + nx * k);
        const y = Math.round(py + ny * k);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = y * w + x;
        if (angleBetween(angle[i], normal) > 20 * DEGREE) continue;
        // Capped: one blazing stretch must not outweigh a whole faint side.
        best = Math.max(best, Math.min(magnitude[i], 2 * cutoff));
      }
      sum += best;
    }
    return samples ? sum / samples : 0;
  };

  let pts = corners;
  for (let round = 0; round < rounds; round++) {
    const sides: Array<[Point, Point]> = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / length;
      const ny = (b[0] - a[0]) / length;

      let best: [Point, Point] = [a, b];
      let bestStrength = strength(a, b);
      for (let da = -reach; da <= reach; da += 0.5) {
        for (let db = -reach; db <= reach; db += 0.5) {
          if (!da && !db) continue;
          const a2: Point = [a[0] + nx * da, a[1] + ny * da];
          const b2: Point = [b[0] + nx * db, b[1] + ny * db];
          const s = strength(a2, b2);
          // Only a clear improvement moves it: flat ground has no best spot.
          if (s > bestStrength * 1.03) { bestStrength = s; best = [a2, b2]; }
        }
      }
      sides.push(best);
    }

    const next: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const before = sides[(i + 3) % 4];
      const after = sides[i];
      next.push(meet(before[0], before[1], after[0], after[1]) || pts[i]);
    }
    pts = next;
  }
  return pts;
};

export interface EdgeDetection {
  quad: Quad;
  /** 0 to 1, from how much of the outline the picture actually shows. */
  confidence: number;
}

/**
 * Locate a cover by its four edges.
 *
 * `proposals` are outlines found some other way -- by colour, say -- to be
 * judged by the same evidence as the ones found here. `inspect`, if given,
 * sees every candidate that was scored, in working pixels; it is for the
 * evalsets' tools. Returns the corners in image fractions, with a confidence
 * that says how far to trust them, or null when no rectangle at all is borne
 * out by the picture.
 */
export const detectByEdges = (
  image: ImageData,
  proposals: Quad[] = [],
  inspect?: (candidate: Candidate, size: { w: number; h: number }) => void,
  options: EdgeOptions = {}
): EdgeDetection | null => {
  // One pass over the photo's pixels, which at a phone's resolution is most
  // of the time: the sharp copy for the end, and the working copy from it.
  const fineGrey = shrink(image, WORK * FINE);
  const grey = halve(fineGrey);
  const { w, h } = grey;
  if (w < 24 || h < 24) return null;

  const edges = sobel(blur(grey));
  const cutoff = magnitudeCutoff(edges.magnitude, 0.12);
  if (!Number.isFinite(cutoff)) return null;
  // Voting takes only the strongest edges; checking a side accepts fainter
  // ones, since the rim of a clear plastic case is rarely the strongest thing
  // in the picture.
  const threshold = Math.max(12, cutoff * 0.5);
  const texture = textureLevel(edges.grey, w, h);
  const baseline = baselineEdgeRate(edges, threshold);

  const lines: Line[] = [
    ...votedLines(edges, cutoff, VOTED_LINES),
    ...runLines(edges, magnitudeCutoff(edges.magnitude, 0.35), RUN_LINES),
    // The frame itself, for a cover photographed right up to the edge of it.
    { theta: 0, rho: 1 },
    { theta: 0, rho: w - 2 },
    { theta: Math.PI / 2, rho: 1 },
    { theta: Math.PI / 2, rho: h - 2 }
  ];

  // Pairs of roughly parallel lines far enough apart to be opposite sides.
  const cx = w / 2;
  const cy = h / 2;
  const offset = (l: Line) => l.rho - (cx * Math.cos(l.theta) + cy * Math.sin(l.theta));
  const minGap = 0.2 * Math.min(w, h);
  const pairs: Array<{ a: Line; b: Line; theta: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (angleBetween(a.theta, b.theta) > 20 * DEGREE) continue;
      // Normals more than a right angle apart point opposite ways.
      const flipped = Math.abs(a.theta - b.theta) > Math.PI / 2;
      const gap = Math.abs(offset(a) - (flipped ? -offset(b) : offset(b)));
      if (gap < minGap) continue;
      pairs.push({ a, b, theta: a.theta });
    }
  }

  const measures = new Map<Line, Measure>();
  const measureOf = (line: Line) => {
    let m = measures.get(line);
    if (!m) { m = lineMeasure(edges, threshold, texture, line); measures.set(line, m); }
    return m;
  };
  const free = segmentMeasure(edges, threshold, texture);

  let best: Candidate | null = null;
  const consider = (corners: Point[], sides?: Line[]) => {
    const candidate = scoreQuad(edges, corners, sides ? sides.map(measureOf) : [free, free, free, free], baseline, options.subject);
    if (!candidate) return;
    inspect?.(candidate, { w, h });
    if (!best || candidate.score > best.score) best = candidate;
  };

  for (let p = 0; p < pairs.length; p++) {
    for (let q = p + 1; q < pairs.length; q++) {
      const one = pairs[p];
      const two = pairs[q];
      if (angleBetween(one.theta, two.theta) < 58 * DEGREE) continue;

      const corners = [
        intersect(one.a, two.a), intersect(one.a, two.b),
        intersect(one.b, two.b), intersect(one.b, two.a)
      ];
      if (corners.some(c => !c)) continue;
      consider(corners as Point[], [one.a, two.b, one.b, two.a]);
    }
  }

  for (const proposal of proposals) {
    consider([proposal.topLeft, proposal.topRight, proposal.bottomRight, proposal.bottomLeft]
      .map(([x, y]) => [x * w, y * h] as Point));
  }

  const found = best as Candidate | null;
  if (!found) return null;

  // Settle the sides here, then once more on a sharper copy: a corner a pixel
  // off at this size is three off in the photo the user sees.
  let corners = refine(edges, cutoff, found.corners, 3, 2);
  if (plausibleShape(corners, w, h, options.subject) === null) corners = found.corners;
  const fine = sobel(blur(fineGrey));
  const fineCutoff = magnitudeCutoff(fine.magnitude, 0.12);
  if (Number.isFinite(fineCutoff)) {
    const scaled = corners.map(([x, y]) => [x * (fine.w / w), y * (fine.h / h)] as Point);
    const settled = refine(fine, fineCutoff, scaled, 3, 2).map(([x, y]) => [x * (w / fine.w), y * (h / fine.h)] as Point);
    // A refinement that wanders off into something implausible is ignored.
    if (plausibleShape(settled, w, h, options.subject) !== null) corners = settled;
  }

  // Name the corners so that the top edge is the one closest to level: a
  // sleeve lying at thirty degrees is a tilted sleeve, not one on its side.
  // Worked in pixels, since fractions of a portrait frame are not square.
  const clockwise = isClockwise(corners) ? corners : [...corners].reverse();
  let start = 0;
  let level = Infinity;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = clockwise[i];
    const [bx, by] = clockwise[(i + 1) % 4];
    const tilt = Math.abs(Math.atan2(by - ay, bx - ax));
    if (tilt < level) { level = tilt; start = i; }
  }
  const clampTo = (v: number) => Math.min(1, Math.max(0, v));
  const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3]
    .map(i => clockwise[(start + i) % 4])
    .map(([x, y]) => [clampTo(x / w), clampTo(y / h)] as Point);

  return { quad: { topLeft, topRight, bottomRight, bottomLeft }, confidence: found.confidence };
};

export default detectByEdges;
