import type { Quad, Point } from './detectSleeveQuad';

/**
 * Finding a sleeve by its edges rather than by its colour.
 *
 * Separating a sleeve from its background works when the two differ. It fails
 * completely on the case that matters most -- a case held in the hand over a
 * floor, a blanket and a sleeve of clothing -- because there is no single
 * background colour to subtract.
 *
 * A sleeve is however a rectangle, and a rectangle has four long straight
 * edges. That is a different signal, and it survives a busy background.
 *
 * Two stages. Lines are proposed, two ways: a Hough transform in which each
 * edge pixel votes for exactly one line, and a search for long straight runs
 * of edge. Every rectangle those lines can make is then checked against the
 * picture: a side counts only for the stretch of it where there really is an
 * edge running that way. That second stage is what real photographs demanded.
 * A line is infinite, and one gathered from a floorboard, a table edge or the
 * top of a gadget will happily close a rectangle whose side is not there.
 *
 * Tuned against the photographs in evalsets/handheld-cd, which is where to
 * look -- and what to run -- before changing any of the numbers below.
 */

/** Everything is measured on the photo shrunk to this many pixels on its long side. */
const WORK = 400;
/** Lines are binned this finely in angle; 1 degree is finer than we can trust. */
const THETA_STEPS = 180;
/** Lines proposed by the vote. Nested edges -- case, booklet, spine -- need room. */
const VOTED_LINES = 32;
/** Lines proposed as long straight runs. */
const RUN_LINES = 16;
/** A side lying within this many pixels of the frame is taken to be on it. */
const FRAME_BAND = 8;

const DEGREE = Math.PI / 180;

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
  w: number;
  h: number;
}

/**
 * The photo in grey, at exactly WORK pixels on its long side.
 *
 * Exactly, and not merely near it: every distance below -- how far apart two
 * sides must be, how far a side may drift -- is counted in these pixels, and
 * a phone's 4032-pixel photo and the same photo at 1024 used to land on grids
 * a tenth apart and come to different conclusions. Larger photos are
 * box-averaged, since aliasing invents edges; smaller ones are interpolated.
 */
const shrink = (image: ImageData): Grey => {
  const { width, height, data } = image;
  const scale = Math.max(width, height) / WORK;
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
  return { magnitude, angle, w, h };
};

/** The gradient magnitude only the strongest `keepFraction` of pixels reach. */
const magnitudeCutoff = (magnitude: Float32Array, keepFraction: number): number => {
  const sorted = Array.from(magnitude).filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return Infinity;
  const index = Math.floor(sorted.length * (1 - keepFraction));
  return sorted[Math.min(sorted.length - 1, index)];
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
  const order: number[] = [];
  for (let i = 0; i < w * h; i++) if (magnitude[i] >= minMagnitude) order.push(i);
  order.sort((a, b) => magnitude[b] - magnitude[a]);

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

/**
 * The fraction of a segment along which the picture really has an edge
 * running that way.
 *
 * Each sample looks `reach` pixels either side of the segment, since a line
 * found at one-degree resolution drifts off a long edge by about that much,
 * and accepts a pixel only if its gradient faces across the segment. Right
 * against the frame nothing can be measured -- Sobel needs a pixel either
 * side -- and such samples count for `unknown`.
 */
const segmentSupport = (
  edges: Edges,
  threshold: number,
  a: Point,
  b: Point,
  unknown = 0.5,
  reach = 2
): number => {
  const { magnitude, angle, w, h } = edges;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 4) return 0;

  const dx = (b[0] - a[0]) / length;
  const dy = (b[1] - a[1]) / length;
  const normal = Math.atan2(dx, -dy);
  const nx = -dy;
  const ny = dx;

  // The ends are left out: corners are where two edges blur into each other.
  const from = length * 0.04;
  const to = length * 0.96;
  let hits = 0;
  let samples = 0;

  for (let t = from; t <= to; t += 1) {
    samples++;
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    if (px < 3 || py < 3 || px > w - 4 || py > h - 4) {
      hits += unknown;
      continue;
    }
    for (let k = -reach; k <= reach; k++) {
      const x = Math.round(px + nx * k);
      const y = Math.round(py + ny * k);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      if (magnitude[i] < threshold) continue;
      if (angleBetween(angle[i], normal) > 20 * DEGREE) continue;
      hits++;
      break;
    }
  }
  return samples ? hits / samples : 0;
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
 * How much four corners look like a sleeve photographed from in front of it,
 * perspective allowed: 0 to 1, or null if not at all.
 */
const plausibleShape = (pts: Point[], w: number, h: number): number | null => {
  // All four in the picture: a sleeve cut off by the frame cannot be
  // straightened, only guessed at.
  const margin = 0.02;
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
    // Past this it is not a sleeve at an angle but a sleeve edge-on.
    if (Math.abs(degrees - 90) > 40) return null;
  }

  // Too small to be what the photo is of; so large it is the photo itself.
  const coverage = areaOf(pts) / (w * h);
  if (coverage < 0.08 || coverage > 0.88) return null;

  // Perspective shortens the far side, but not to half.
  const [s0, s1, s2, s3] = sides;
  if (Math.min(s0, s2) / Math.max(s0, s2) < 0.55 || Math.min(s1, s3) / Math.max(s1, s3) < 0.55) return null;

  // A booklet or card sleeve is square, a jewel case 1.14 times as wide as it
  // is tall, a digipak 1.10, the back of a case with its spines 1.28. Nothing
  // a CD comes in is further from square than that.
  const stretch = Math.abs(Math.log(flatAspect(pts, w, h)));
  const fits = Math.log(1.2);
  const limit = Math.log(1.45);
  if (!(stretch <= limit)) return null;
  return stretch <= fits ? 1 : 1 - (stretch - fits) / (limit - fits);
};

/** What the edge search makes of one candidate outline. */
export interface Candidate {
  corners: Point[];
  support: number[];
  overrun: number;
  shape: number;
  score: number;
  confidence: number;
}

const scoreQuad = (edges: Edges, threshold: number, pts: Point[]): Candidate | null => {
  const { w, h } = edges;
  const shape = plausibleShape(pts, w, h);
  if (shape === null) return null;

  // Which sides lie along the edge of the photograph itself.
  const band = (v: number, size: number) => (v < FRAME_BAND ? -1 : v > size - 1 - FRAME_BAND ? 1 : 0);
  const onFrame = [0, 1, 2, 3].map(i => {
    const [a, b] = [pts[i], pts[(i + 1) % 4]];
    return (band(a[0], w) !== 0 && band(a[0], w) === band(b[0], w)) ||
      (band(a[1], h) !== 0 && band(a[1], h) === band(b[1], h));
  });
  const framed = onFrame.filter(Boolean).length;
  // A sleeve can run off one edge of the photo. A rectangle leaning on two or
  // three of them is the photo -- or a border printed around it.
  if (framed > 1) return null;
  // And one that touches the frame is a sleeve photographed to fill it, not a
  // small thing in the corner of a picture of something else.
  if (framed && areaOf(pts) / (w * h) < 0.3) return null;

  const support = [0, 1, 2, 3].map(i => {
    if (!onFrame[i]) return segmentSupport(edges, threshold, pts[i], pts[(i + 1) % 4]);
    // Nothing can be measured along the frame, so judge that side by its
    // neighbours instead: a sleeve cut off there has both of them running
    // right into it, while a rectangle closed off by the frame for want of a
    // fourth side has them stop short.
    const into = (from: Point, to: Point) =>
      segmentSupport(edges, threshold, [to[0] + (from[0] - to[0]) * 0.2, to[1] + (from[1] - to[1]) * 0.2], to, 1);
    return 0.8 * Math.min(into(pts[(i + 3) % 4], pts[i]), into(pts[(i + 2) % 4], pts[(i + 1) % 4]));
  });
  const mean = support.reduce((s, v) => s + v, 0) / 4;
  const worst = Math.min(...support);

  // A sleeve's edge stops at its corner. One that runs on past it belongs to
  // something bigger -- a table, a floorboard, the sleeve behind -- and the
  // corner is only where two unrelated lines happen to cross.
  let overrun = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const ahead: Point = [b[0] + (b[0] - a[0]) * 0.2, b[1] + (b[1] - a[1]) * 0.2];
    const behind: Point = [a[0] - (b[0] - a[0]) * 0.2, a[1] - (b[1] - a[1]) * 0.2];
    overrun += segmentSupport(edges, threshold, b, ahead, 0) + segmentSupport(edges, threshold, a, behind, 0);
  }
  overrun /= 8;

  // One side may be half hidden by the thumb holding it; a side that is not
  // there at all means this is not a rectangle anyone photographed.
  const evidence = 0.6 * mean + 0.4 * worst - 0.5 * overrun;

  return {
    corners: pts,
    support,
    overrun,
    shape,
    score: evidence * (0.5 + 0.5 * shape),
    // Measured on the evalset, a right answer leaves evidence well above 0.8
    // and the plausible wrong ones below 0.65. A sleeve against the frame
    // pays for its shape twice, since that is where the lookalikes live.
    confidence: Math.max(0, Math.min(1, (evidence - 0.45) / 0.35)) * shape * (framed ? shape : 1)
  };
};

/**
 * Settle each side onto the edge it was found near.
 *
 * Lines come out of the vote a degree and a pixel or so off, which over a
 * long side is enough to start on a case's rim and finish on the thumb under
 * it. Each side's two ends are nudged independently, half a pixel at a time,
 * to wherever the narrowest band along it is most completely an edge.
 */
const refine = (edges: Edges, threshold: number, corners: Point[]): Point[] => {
  let pts = corners;
  for (let round = 0; round < 2; round++) {
    const sides: Array<[Point, Point]> = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / length;
      const ny = (b[0] - a[0]) / length;

      let best: [Point, Point] = [a, b];
      let bestSupport = segmentSupport(edges, threshold, a, b, 0.5, 1);
      for (let da = -3; da <= 3; da += 0.5) {
        for (let db = -3; db <= 3; db += 0.5) {
          if (!da && !db) continue;
          const a2: Point = [a[0] + nx * da, a[1] + ny * da];
          const b2: Point = [b[0] + nx * db, b[1] + ny * db];
          const support = segmentSupport(edges, threshold, a2, b2, 0.5, 1);
          // Only a clear improvement moves it: flat ground has no best spot.
          if (support > bestSupport + 0.02) { bestSupport = support; best = [a2, b2]; }
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
 * Locate a sleeve by its four edges.
 *
 * `proposals` are outlines found some other way -- by colour, say -- to be
 * judged by the same evidence as the ones found here. `inspect`, if given,
 * sees every candidate that was scored, in working pixels; it is for the
 * evalset's tools. Returns the corners in image fractions, or null when no
 * rectangle is borne out by the picture.
 */
export const detectByEdges = (
  image: ImageData,
  proposals: Quad[] = [],
  inspect?: (candidate: Candidate, size: { w: number; h: number }) => void
): EdgeDetection | null => {
  const grey = shrink(image);
  const { w, h } = grey;
  if (w < 24 || h < 24) return null;

  const edges = sobel(blur(grey));
  const cutoff = magnitudeCutoff(edges.magnitude, 0.12);
  if (!Number.isFinite(cutoff)) return null;
  // Voting takes only the strongest edges; checking a side accepts fainter
  // ones, since the rim of a clear plastic case is rarely the strongest thing
  // in the picture.
  const threshold = Math.max(12, cutoff * 0.5);

  const lines: Line[] = [
    ...votedLines(edges, cutoff, VOTED_LINES),
    ...runLines(edges, magnitudeCutoff(edges.magnitude, 0.35), RUN_LINES),
    // The frame itself, for a sleeve photographed right up to the edge of it.
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

  let best: Candidate | null = null;
  const consider = (corners: Point[]) => {
    const candidate = scoreQuad(edges, threshold, corners);
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
      consider(corners as Point[]);
    }
  }

  for (const proposal of proposals) {
    consider([proposal.topLeft, proposal.topRight, proposal.bottomRight, proposal.bottomLeft]
      .map(([x, y]) => [x * w, y * h] as Point));
  }

  const found = best as Candidate | null;
  if (!found) return null;

  const settled = refine(edges, threshold, found.corners);
  // A refinement that wanders off into something implausible is ignored.
  const corners = plausibleShape(settled, w, h) === null ? found.corners : settled;

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
  const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3]
    .map(i => clockwise[(start + i) % 4])
    .map(([x, y]) => [x / w, y / h] as Point);

  return { quad: { topLeft, topRight, bottomRight, bottomLeft }, confidence: found.confidence };
};

export default detectByEdges;
