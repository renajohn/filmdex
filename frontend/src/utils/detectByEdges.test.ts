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
