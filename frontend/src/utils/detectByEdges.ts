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
 * The one thing that makes this tractable: each edge pixel votes for exactly
 * one line, the one perpendicular to its own gradient, rather than for all 180
 * orientations. The accumulator stays sharp and a texture with no straight
 * edges contributes noise spread thin instead of a ridge.
 */

const WORK = 260;
/** Lines are binned this finely in angle; 1 degree is finer than we can trust. */
const THETA_STEPS = 180;

interface Line {
  /** Radians, the direction of the line's normal. */
  theta: number;
  /** Distance from the origin along that normal, in working pixels. */
  rho: number;
  votes: number;
}

interface Grey {
  data: Float32Array;
  w: number;
  h: number;
}

const toGrey = (image: ImageData): Grey => {
  const { width, height, data } = image;
  const scale = Math.max(1, Math.round(Math.max(width, height) / WORK));
  const w = Math.max(1, Math.floor(width / scale));
  const h = Math.max(1, Math.floor(height / scale));
  const out = new Float32Array(w * h);

  // Box-average the pixels that collapse into one, or aliasing invents edges
  // that are not there.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let sy = y * scale; sy < Math.min(height, (y + 1) * scale); sy++) {
        for (let sx = x * scale; sx < Math.min(width, (x + 1) * scale); sx++) {
          const i = (sy * width + sx) * 4;
          sum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
          n++;
        }
      }
      out[y * w + x] = n ? sum / n : 0;
    }
  }
  return { data: out, w, h };
};

interface Edges {
  magnitude: Float32Array;
  /** Gradient direction per pixel, radians. */
  angle: Float32Array;
  w: number;
  h: number;
}

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

/** The value below which a gradient is not worth voting with. */
const magnitudeCutoff = (magnitude: Float32Array, keepFraction: number): number => {
  const sorted = Array.from(magnitude).filter(v => v > 0).sort((a, b) => a - b);
  if (!sorted.length) return Infinity;
  const index = Math.floor(sorted.length * (1 - keepFraction));
  return sorted[Math.min(sorted.length - 1, index)];
};

/**
 * Accumulate one vote per strong edge pixel, for the line through it.
 *
 * theta comes from the pixel's own gradient, so a pixel on a straight edge
 * votes for that edge and a pixel in a texture votes for whatever direction it
 * happens to face -- which cancels out.
 */
const houghPeaks = (edges: Edges, cutoff: number, wanted: number): Line[] => {
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

  // Peaks, with the neighbourhood of each suppressed so one edge yields one line.
  const peaks: Line[] = [];
  const taken = new Uint8Array(accumulator.length);
  const thetaGuard = 4;
  const rhoGuard = Math.max(4, Math.round(diagonal * 0.04));

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
    peaks.push({ theta: (t / THETA_STEPS) * Math.PI, rho: r - diagonal, votes: best });

    for (let dt = -thetaGuard; dt <= thetaGuard; dt++) {
      const tt = (t + dt + THETA_STEPS) % THETA_STEPS;
      for (let dr = -rhoGuard; dr <= rhoGuard; dr++) {
        const rr = r + dr;
        if (rr >= 0 && rr < rhoSteps) taken[tt * rhoSteps + rr] = 1;
      }
    }
  }
  return peaks;
};

/** Smallest angle between two line directions, both folded into [0, pi). */
const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

const intersect = (a: Line, b: Line): Point | null => {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null;
  return [
    (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det,
    (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det
  ];
};

/**
 * Split the lines into the two families a rectangle has.
 *
 * The strongest line defines one; anything roughly parallel to it joins that
 * one, anything roughly perpendicular joins the other. A line at 45 degrees to
 * both belongs to neither and is dropped.
 */
const families = (lines: Line[]): [Line[], Line[]] | null => {
  if (lines.length < 4) return null;
  const first = lines[0];
  const parallel = lines.filter(l => angleBetween(l.theta, first.theta) < Math.PI / 6);
  const across = lines.filter(l => angleBetween(l.theta, first.theta) >= Math.PI / 3);
  return parallel.length >= 2 && across.length >= 2 ? [parallel, across] : null;
};

/** How rectangular four corners are, 0 to 1, before any framing judgement. */
const rectangleScore = (pts: Point[]): number => {
  const sides: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 4];
    sides.push(Math.hypot(bx - ax, by - ay));
  }
  const shortest = Math.min(...sides);
  if (shortest < 1e-6) return 0;

  let corners = 1;
  for (let i = 0; i < 4; i++) {
    const p = pts[(i + 3) % 4];
    const c = pts[i];
    const n = pts[(i + 1) % 4];
    const v1 = [p[0] - c[0], p[1] - c[1]];
    const v2 = [n[0] - c[0], n[1] - c[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    const degrees = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    corners = Math.min(corners, Math.max(0, 1 - Math.abs(degrees - 90) / 40));
  }
  return corners;
};

/**
 * The four lines that describe the best rectangle, weighted by their support.
 *
 * Taking the outermost of each family instead is what a single table edge or
 * floorboard defeats: it is always further out than the sleeve.
 */
const bestRectangle = (
  familyA: Line[],
  familyB: Line[],
  w: number,
  h: number
): Point[] | null => {
  let best: Point[] | null = null;
  let bestScore = 0;
  const totalVotes = [...familyA, ...familyB].reduce((s, l) => s + l.votes, 0) || 1;

  for (let i = 0; i < familyA.length; i++) {
    for (let j = i + 1; j < familyA.length; j++) {
      for (let k = 0; k < familyB.length; k++) {
        for (let l = k + 1; l < familyB.length; l++) {
          const cs = [
            intersect(familyA[i], familyB[k]), intersect(familyA[i], familyB[l]),
            intersect(familyA[j], familyB[l]), intersect(familyA[j], familyB[k])
          ];
          if (cs.some(c => !c)) continue;
          const pts = cs as Point[];

          const area = Math.abs(
            pts.reduce((sum, [x1, y1], n) => {
              const [x2, y2] = pts[(n + 1) % 4];
              return sum + (x1 * y2 - x2 * y1);
            }, 0) / 2
          ) / (w * h);
          if (area < 0.08 || area > 0.98) continue;

          const support =
            (familyA[i].votes + familyA[j].votes + familyB[k].votes + familyB[l].votes) / totalVotes;
          const score = rectangleScore(pts) * Math.sqrt(area) * (0.5 + 0.5 * support);

          if (score > bestScore) { bestScore = score; best = pts; }
        }
      }
    }
  }
  return best;
};

/**
 * Locate a sleeve by its four edges.
 *
 * Returns the corners in image fractions, or null when the lines found do not
 * make a plausible rectangle.
 */
export const detectByEdges = (image: ImageData): Quad | null => {
  const grey = toGrey(image);
  if (grey.w < 24 || grey.h < 24) return null;

  const edges = sobel(blur(grey));
  const cutoff = magnitudeCutoff(edges.magnitude, 0.12);
  if (!Number.isFinite(cutoff)) return null;

  const lines = houghPeaks(edges, cutoff, 14);
  const split = families(lines);
  if (!split) return null;

  // Try every pair from each family rather than assuming the outermost lines
  // are the sleeve's. On a wooden floor they are the planks, and on a printed
  // sleeve the outermost may be its own border rather than its edge.
  const best = bestRectangle(split[0], split[1], grey.w, grey.h);
  if (!best) return null;
  const corners = best;

  // Order them so topLeft really is the top left, whatever order the families
  // came out in.
  const points = (corners as Point[]).map(([x, y]) => [x / grey.w, y / grey.h] as Point);
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;

  const pick = (test: (p: Point) => boolean) => points.find(test);
  const topLeft = pick(p => p[0] <= cx && p[1] <= cy);
  const topRight = pick(p => p[0] > cx && p[1] <= cy);
  const bottomRight = pick(p => p[0] > cx && p[1] > cy);
  const bottomLeft = pick(p => p[0] <= cx && p[1] > cy);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;

  // Anything reaching well outside the frame is not the sleeve.
  const quad = { topLeft, topRight, bottomRight, bottomLeft };
  const outside = Object.values(quad).some(([x, y]) => x < -0.15 || x > 1.15 || y < -0.15 || y > 1.15);
  if (outside) return null;

  return quad;
};

export default detectByEdges;
