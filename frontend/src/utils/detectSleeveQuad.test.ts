import { describe, it, expect } from 'vitest';
import { detectSleeveQuad, defaultQuad, DEFAULT_QUAD, type Quad } from './detectSleeveQuad';

/**
 * Scenes built pixel by pixel, so the corners are known exactly rather than
 * eyeballed. The detector is allowed to fail -- a dark sleeve on a dark table
 * genuinely cannot be separated -- but it must say so instead of guessing.
 */

const SIZE = 320;

/** A filled rotated square on a plain ground, as a photograph would show it. */
const scene = (opts: {
  background: [number, number, number];
  sleeve: [number, number, number];
  side?: number;
  tilt?: number;
  noise?: number;
}): ImageData => {
  const { background, sleeve, side = 190, tilt = 0, noise = 0 } = opts;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const a = (tilt * Math.PI) / 180;
  const cos = Math.cos(-a);
  const sin = Math.sin(-a);
  const c = SIZE / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Rotate the point back and test against the upright square.
      const dx = x - c;
      const dy = y - c;
      const ux = dx * cos - dy * sin;
      const uy = dx * sin + dy * cos;
      const inside = Math.abs(ux) <= side / 2 && Math.abs(uy) <= side / 2;
      const [r, g, b] = inside ? sleeve : background;
      const jitter = noise ? (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * noise : 0;

      const i = (y * SIZE + x) * 4;
      data[i] = r + jitter;
      data[i + 1] = g + jitter;
      data[i + 2] = b + jitter;
      data[i + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE, colorSpace: 'srgb' } as ImageData;
};

/** Worst corner error, as a fraction of the image. */
const maxError = (quad: Quad, expected: Quad): number =>
  (Object.keys(expected) as Array<keyof Quad>).reduce((worst, key) => {
    const [gx, gy] = quad[key];
    const [ex, ey] = expected[key];
    return Math.max(worst, Math.hypot(gx - ex, gy - ey));
  }, 0);

const uprightQuad = (side = 190): Quad => {
  const half = side / 2 / SIZE;
  return {
    topLeft: [0.5 - half, 0.5 - half],
    topRight: [0.5 + half, 0.5 - half],
    bottomRight: [0.5 + half, 0.5 + half],
    bottomLeft: [0.5 - half, 0.5 + half]
  };
};

describe('detectSleeveQuad', () => {
  it('finds a dark sleeve on a light table', () => {
    const found = detectSleeveQuad(scene({ background: [200, 168, 120], sleeve: [20, 20, 24] }));

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.03);
    expect(found!.confidence).toBeGreaterThan(0.6);
  });

  it('finds a light sleeve on a dark table', () => {
    const found = detectSleeveQuad(scene({ background: [24, 24, 28], sleeve: [230, 228, 220] }));

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.03);
  });

  it('follows the sleeve when the photo is taken at an angle', () => {
    const found = detectSleeveQuad(
      scene({ background: [200, 168, 120], sleeve: [20, 20, 24], tilt: 12, side: 170 })
    );

    expect(found).not.toBeNull();
    // The corners should describe a tilted square, not an upright bounding box.
    const { topLeft, topRight } = found!.quad;
    const angle = (Math.atan2(topRight[1] - topLeft[1], topRight[0] - topLeft[0]) * 180) / Math.PI;
    expect(Math.abs(angle - 12)).toBeLessThan(3);
  });

  it('survives the noise a JPEG leaves behind', () => {
    const found = detectSleeveQuad(
      scene({ background: [200, 168, 120], sleeve: [20, 20, 24], noise: 14 })
    );

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.05);
  });

  it('finds a dark sleeve on a dark table, which colour alone cannot', () => {
    // Separating by brightness fails here -- 20 against 26 is noise. The edges
    // are still there, and they are what a rectangle is made of.
    const found = detectSleeveQuad(scene({ background: [26, 26, 30], sleeve: [20, 20, 24] }));

    expect(found).not.toBeNull();
    expect(maxError(found!.quad, uprightQuad())).toBeLessThan(0.03);
  });

  it('declines a photo with no sleeve in it at all', () => {
    const found = detectSleeveQuad(scene({ background: [140, 140, 140], sleeve: [140, 140, 140] }));

    expect(found === null || found.confidence < 0.6).toBe(true);
  });

  it('declines when the sleeve fills the whole frame, which is probably not a sleeve', () => {
    const found = detectSleeveQuad(
      scene({ background: [200, 168, 120], sleeve: [20, 20, 24], side: SIZE })
    );

    expect(found === null || found.confidence < 0.6).toBe(true);
  });

  it('offers a centred square to start from when it declines', () => {
    // A square photo: the default covers 80% of it, centred.
    expect(DEFAULT_QUAD.topLeft).toEqual([0.1, 0.1]);
    expect(DEFAULT_QUAD.bottomRight).toEqual([0.9, 0.9]);
  });

  it('keeps that starting square square on a photo that is not', () => {
    // A fixed inset of a portrait frame is a tall rectangle, which looks
    // nothing like the sleeve it is meant to land on.
    const portrait = defaultQuad(3 / 4);
    const width = portrait.topRight[0] - portrait.topLeft[0];
    const height = portrait.bottomLeft[1] - portrait.topLeft[1];

    // Equal in pixels: width fractions span a narrower axis.
    expect(width * 3).toBeCloseTo(height * 4, 2);
  });
});

describe('detectSleeveQuad on a photo that is not square', () => {
  /** A sleeve filling most of a 3:4 frame, as a phone photograph gives. */
  const portraitScene = (): ImageData => {
    const W = 750, H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // A true square: 600px on both sides, centred.
        const inside = x > 75 && x < 675 && y > 200 && y < 800;
        const v = inside ? 30 : 190;
        const i = (y * W + x) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    return { data, width: W, height: H, colorSpace: 'srgb' } as ImageData;
  };

  it('does not mark a square sleeve down for the shape of the photo', () => {
    // Judged in fractions, this square spans 0.8 of the width against 0.6 of
    // the height and looks half again too wide. Every phone photo is 3:4, so
    // every honest detection was being scored as doubtful.
    const found = detectSleeveQuad(portraitScene());

    expect(found).not.toBeNull();
    expect(found!.confidence).toBeGreaterThan(0.6);
  });

  it('places the corners where the sleeve actually is', () => {
    const found = detectSleeveQuad(portraitScene());

    expect(found!.quad.topLeft[0]).toBeCloseTo(0.1, 1);
    expect(found!.quad.topLeft[1]).toBeCloseTo(0.2, 1);
    expect(found!.quad.bottomRight[0]).toBeCloseTo(0.9, 1);
    expect(found!.quad.bottomRight[1]).toBeCloseTo(0.8, 1);
  });
});
