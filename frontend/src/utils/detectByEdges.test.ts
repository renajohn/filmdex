import { describe, it, expect } from 'vitest';
import { detectSleeveQuad, type Quad } from './detectSleeveQuad';

/**
 * The case colour separation cannot do: a sleeve over a background made of
 * several different things, none of which is "the background". Edges do not
 * care what is behind, only that a rectangle has four straight sides.
 */

const SIZE = 320;

/** A sleeve on a background of bands, texture and noise -- a floor, a blanket, a hand. */
const busyScene = (opts: {
  sleeve: [number, number, number];
  tilt?: number;
  side?: number;
  bands?: Array<[number, number, number]>;
}): ImageData => {
  const { sleeve, tilt = 0, side = 190, bands = [[150, 110, 70], [40, 60, 120], [30, 140, 130]] } = opts;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const a = (-tilt * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const c = SIZE / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - c;
      const dy = y - c;
      const ux = dx * cos - dy * sin;
      const uy = dx * sin + dy * cos;
      const inside = Math.abs(ux) <= side / 2 && Math.abs(uy) <= side / 2;

      let r: number, g: number, b: number;
      if (inside) {
        [r, g, b] = sleeve;
      } else {
        // Diagonal bands with grain: no single background level to subtract.
        const band = bands[Math.floor(((x + y * 1.7) / 70) % bands.length)];
        const grain = ((Math.sin(x * 3.1) + Math.cos(y * 2.7)) * 18) | 0;
        [r, g, b] = [band[0] + grain, band[1] + grain, band[2] + grain];
      }

      const i = (y * SIZE + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE, colorSpace: 'srgb' } as ImageData;
};

const uprightQuad = (side = 190): Quad => {
  const half = side / 2 / SIZE;
  return {
    topLeft: [0.5 - half, 0.5 - half],
    topRight: [0.5 + half, 0.5 - half],
    bottomRight: [0.5 + half, 0.5 + half],
    bottomLeft: [0.5 - half, 0.5 + half]
  };
};

const maxError = (quad: Quad, expected: Quad): number =>
  (Object.keys(expected) as Array<keyof Quad>).reduce((worst, key) => {
    const [gx, gy] = quad[key];
    const [ex, ey] = expected[key];
    return Math.max(worst, Math.hypot(gx - ex, gy - ey));
  }, 0);

describe('detectSleeveQuad over a background it cannot subtract', () => {
  it('still finds a pale sleeve on bands of colour', () => {
    const found = detectSleeveQuad(busyScene({ sleeve: [225, 222, 214] }));

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.06);
  });

  it('still finds a dark sleeve there', () => {
    // Colour separation reports the frame here, because the bands reach it.
    const found = detectSleeveQuad(busyScene({ sleeve: [22, 22, 26] }));

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.06);
  });

  it('follows a tilted sleeve over that background', () => {
    const found = detectSleeveQuad(busyScene({ sleeve: [225, 222, 214], tilt: 10, side: 170 }));

    expect(found).not.toBeNull();
    const { topLeft, topRight } = found!.quad;
    const angle = (Math.atan2(topRight[1] - topLeft[1], topRight[0] - topLeft[0]) * 180) / Math.PI;
    expect(Math.abs(angle - 10)).toBeLessThan(4);
  });

  it('declines a photo of nothing but background', () => {
    const found = detectSleeveQuad(busyScene({ sleeve: [150, 110, 70], side: 0 }));

    expect(found === null || found.confidence < 0.6).toBe(true);
  });
});

/**
 * Lessons from real photographs (evalsets/handheld-cd), redrawn so the
 * corners are known exactly.
 */
describe('detectSleeveQuad on what real photographs threw at it', () => {
  const W = 400;
  const H = 300;

  /** Paints convex polygons, in order, over a flat ground. */
  const paint = (ground: number, shapes: Array<{ points: Array<[number, number]>; value: number }>): ImageData => {
    const data = new Uint8ClampedArray(W * H * 4);
    const inside = (pts: Array<[number, number]>, x: number, y: number) => {
      let sign = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        if (cross !== 0) {
          if (sign && Math.sign(cross) !== sign) return false;
          sign = Math.sign(cross);
        }
      }
      return true;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = ground;
        for (const shape of shapes) if (inside(shape.points, x + 0.5, y + 0.5)) v = shape.value;
        // Grain, so that nothing is perfectly flat.
        v += ((x * 7 + y * 13) % 5) - 2;
        const i = (y * W + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
  };

  const worst = (quad: Quad, pts: Array<[number, number]>) => {
    const found = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map(([x, y]) => [x * W, y * H]);
    let best = Infinity;
    for (let shift = 0; shift < 4; shift++) {
      let err = 0;
      for (let i = 0; i < 4; i++) {
        const [fx, fy] = found[(i + shift) % 4];
        err = Math.max(err, Math.hypot(fx - pts[i][0], fy - pts[i][1]));
      }
      best = Math.min(best, err);
    }
    return best;
  };

  it('finds a square sleeve foreshortened by the angle it was shot from', () => {
    // A square on a table, tipped 50 degrees away and seen through a lens
    // like a phone's: a wide trapezoid in the picture.
    const focal = 360;
    const tilt = (50 * Math.PI) / 180;
    const project = (x: number, y: number): [number, number] => {
      const depth = 4 + y * Math.sin(tilt);
      return [W / 2 + (focal * x) / depth, H / 2 + (focal * y * Math.cos(tilt)) / depth];
    };
    const sleeve: Array<[number, number]> = [project(-1, -1), project(1, -1), project(1, 1), project(-1, 1)];
    const found = detectSleeveQuad(paint(170, [{ points: sleeve, value: 40 }]));

    expect(found).not.toBeNull();
    expect(found!.confidence).toBeGreaterThan(0.6);
    expect(worst(found!.quad, sleeve)).toBeLessThan(12);
  });

  it('frames the sleeve and not a border printed around the photograph', () => {
    // Instagram's black frame is a rectangle too, and a bigger one.
    const found = detectSleeveQuad(paint(20, [
      { points: [[12, 12], [388, 12], [388, 288], [12, 288]], value: 190 },
      { points: [[120, 60], [280, 60], [280, 220], [120, 220]], value: 70 }
    ]));

    expect(found).not.toBeNull();
    expect(found!.confidence).toBeGreaterThan(0.6);
    expect(worst(found!.quad, [[120, 60], [280, 60], [280, 220], [120, 220]])).toBeLessThan(12);
  });

  it('declines a small sleeve cut off by the edge of the photo', () => {
    // Nothing says where its fourth side is.
    const found = detectSleeveQuad(paint(170, [{ points: [[240, 190], [360, 190], [360, 300], [240, 300]], value: 40 }]));

    expect(found === null || found.confidence < 0.6).toBe(true);
  });

  it('declines a rectangle whose sides are borrowed from lines running past it', () => {
    // Four long seams, as between floor tiles: a square in the middle, but
    // every side of it carries on well beyond its corners.
    const found = detectSleeveQuad(paint(170, [
      { points: [[0, 88], [400, 88], [400, 90], [0, 90]], value: 60 },
      { points: [[0, 210], [400, 210], [400, 212], [0, 212]], value: 60 },
      { points: [[138, 0], [140, 0], [140, 300], [138, 300]], value: 60 },
      { points: [[260, 0], [262, 0], [262, 300], [260, 300]], value: 60 }
    ]));

    expect(found === null || found.confidence < 0.6).toBe(true);
  });
});
