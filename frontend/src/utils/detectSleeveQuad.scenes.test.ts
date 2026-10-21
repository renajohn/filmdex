import { describe, it, expect } from 'vitest';
import { detectSleeveQuad, CONFIDENT } from './detectSleeveQuad';
import {
  paintScene, proceduralCover, perspectiveCorners, cornerError,
  type Corners, type Raster, type Scene
} from '../test/syntheticPhoto';

/**
 * Photographs made up to look like the ones a phone takes -- a cover in
 * perspective on wood, tiles or a carpet, a thumb over one edge, a shadow,
 * glare, grain -- with corners known to the pixel. The larger set of these in
 * evalsets/synthetic-covers is where the numbers come from; these few lock in
 * what it taught, and run in a second.
 */

const W = 480;
const H = 640;

const asImage = (raster: Raster): ImageData =>
  ({ data: raster.data, width: raster.width, height: raster.height, colorSpace: 'srgb' } as ImageData);

const cd = proceduralCover({ width: 300, height: 300, style: 'busy', seed: 3 });
const book = proceduralCover({ width: 300, height: 450, style: 'pale', seed: 4 });
const darkBook = proceduralCover({ width: 300, height: 450, style: 'dark', seed: 5 });

const place = (cover: Raster, span: number, tilt = 0.08, pitch = 0.25, yaw = 0.15): Corners =>
  perspectiveCorners({ width: W, height: H, aspect: cover.width / cover.height, span, tilt, pitch, yaw, at: [0.5, 0.5] });

const photo = (scene: Omit<Scene, 'width' | 'height' | 'seed'> & { seed?: number }) =>
  paintScene({ width: W, height: H, seed: 11, ...scene });

describe('detectSleeveQuad on photographs made to look real', () => {
  it('lands on a sleeve lying on wood, shadow and all', () => {
    const corners = place(cd, 0.75);
    const found = detectSleeveQuad(asImage(photo({
      cover: cd, corners, background: { kind: 'wood', level: 150, tint: [1.05, 0.95, 0.85] }, shadow: 0.8, noise: 3
    })), { subject: 'sleeve' });

    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.02);
    expect(found!.confidence).toBeGreaterThanOrEqual(CONFIDENT);
  });

  it('takes the whole book, not the artwork printed on it, with a thumb over one side', () => {
    // A book is half again as tall as it is wide, which used to be past what
    // the detector allowed; it then cut the cover to the squarest rectangle
    // its lettering and artwork offered.
    const corners = place(book, 0.8);
    const found = detectSleeveQuad(asImage(photo({
      cover: book, corners, background: { kind: 'clutter', level: 120 }, shadow: 0.5,
      finger: { side: 3, along: 0.5, width: 60 }, pages: 4, noise: 4
    })), { subject: 'book' });

    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.03);
    expect(found!.confidence).toBeGreaterThanOrEqual(CONFIDENT);
  });

  it('is not put off by the grain of a carpet', () => {
    // Grain is all gradient: two pixels in five read as an edge wherever one
    // looks, and the book's own edges seemed to run on past its corners.
    const corners = place(darkBook, 0.7, -0.1);
    const found = detectSleeveQuad(asImage(photo({
      cover: darkBook, corners, background: { kind: 'carpet', level: 130 }, shadow: 0.4,
      glare: { x: 0.5, y: 0.4, rx: 0.4, ry: 0.3, strength: 0.5 }, noise: 8
    })), { subject: 'book' });

    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.03);
  });

  it('keeps to the sleeve on a tiled table, whose grout lines are edges too', () => {
    // A grout line has the same tile on both sides of it; a sleeve's edge has
    // the sleeve on one side and the table on the other.
    const corners = place(cd, 0.6, 0.15, 0.2, -0.2);
    const found = detectSleeveQuad(asImage(photo({
      cover: cd, corners, background: { kind: 'tiles', level: 200 }, shadow: 0.6, noise: 3
    })), { subject: 'sleeve' });

    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.025);
  });

  it('finds a book without being told it is one', () => {
    const corners = place(book, 0.7, 0.05, 0.1, 0.1);
    const found = detectSleeveQuad(asImage(photo({
      cover: book, corners, background: { kind: 'plain', level: 90 }, shadow: 0.7, noise: 3
    })));

    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.03);
  });

  it('frames what is left of a book that runs off the bottom of the photo', () => {
    const placed = place(book, 0.85, 0, 0.1, 0);
    const corners = placed.map(([x, y]) => [x, y + H * 0.2]) as Corners;
    const found = detectSleeveQuad(asImage(photo({
      cover: book, corners, background: { kind: 'fabric', level: 170 }, noise: 3
    })), { subject: 'book' });

    // The outline it gives follows the book's three visible sides and the
    // frame; the corners it cannot see are not held against it.
    expect(found).not.toBeNull();
    expect(cornerError(found!.quad, corners, W, H).max).toBeLessThan(0.04);
  });

  it('is not sure of a table with nothing on it', () => {
    // The cover is placed well outside the frame, so only the table shows.
    const corners = place(cd, 0.5).map(([x, y]) => [x - 2 * W, y]) as Corners;
    const found = detectSleeveQuad(asImage(photo({
      cover: cd, corners, background: { kind: 'wood', level: 160 }, noise: 4
    })), { subject: 'sleeve' });

    expect(found === null || found.confidence < CONFIDENT).toBe(true);
  });
});
