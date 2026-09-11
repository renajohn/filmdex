import sharp from 'sharp';
import { warpQuadToSquare, type Quad } from '../../src/services/sleeveGeometry';

/**
 * Straightening a photographed sleeve.
 *
 * The corners are picked in the browser, on the image as it is displayed --
 * that is, after EXIF orientation has been applied. So the pixels this works
 * on must be upright too, or every corner lands somewhere else entirely.
 */

/** Four quadrants, so a flip or a quarter turn cannot pass unnoticed. */
const quadrants = async (size = 400) => {
  const half = size / 2;
  const block = (colour: string) =>
    sharp({ create: { width: half, height: half, channels: 3, background: colour } }).png().toBuffer();

  const [tl, tr, bl, br] = await Promise.all([
    block('#ff0000'), block('#00ff00'), block('#0000ff'), block('#ffff00')
  ]);

  return sharp({ create: { width: size, height: size, channels: 3, background: '#000000' } })
    .composite([
      { input: tl, left: 0, top: 0 },
      { input: tr, left: half, top: 0 },
      { input: bl, left: 0, top: half },
      { input: br, left: half, top: half }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
};

/** Which of the four colours sits at a relative position of the result. */
const colourAt = async (buffer: Buffer, u: number, v: number): Promise<string> => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(u * info.width);
  const y = Math.floor(v * info.height);
  const i = (y * info.width + x) * info.channels;
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];

  if (r > 150 && g < 100 && b < 100) return 'red';
  if (g > 150 && r < 100 && b < 100) return 'green';
  if (b > 150 && r < 100 && g < 100) return 'blue';
  if (r > 150 && g > 150 && b < 100) return 'yellow';
  return `other(${r},${g},${b})`;
};

const FULL_FRAME: Quad = {
  topLeft: [0, 0], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 1]
};

describe('warpQuadToSquare', () => {
  it('keeps the picture the right way round when the quad is the whole frame', async () => {
    const source = await quadrants();

    const out = await warpQuadToSquare(source, FULL_FRAME, 200);

    expect(await colourAt(out, 0.25, 0.25)).toBe('red');
    expect(await colourAt(out, 0.75, 0.25)).toBe('green');
    expect(await colourAt(out, 0.25, 0.75)).toBe('blue');
    expect(await colourAt(out, 0.75, 0.75)).toBe('yellow');
  });

  it('straightens a sleeve photographed at an angle', async () => {
    // The picture rotated inside a larger frame, and the corners of where it
    // actually landed. Warping by those corners must undo the rotation.
    const picture = await quadrants();
    const tilted = await sharp(picture)
      .resize(600, 600, { fit: 'fill' })
      .rotate(20, { background: '#808080' })
      .toBuffer();
    const meta = await sharp(tilted).metadata();
    const w = meta.width!, h = meta.height!;

    // Where a 20-degree rotation puts the picture's corners in the new canvas.
    const a = (20 * Math.PI) / 180;
    const s = 600;
    const cx = w / 2, cy = h / 2;
    const corner = (dx: number, dy: number): [number, number] => [
      (cx + (dx * Math.cos(a) - dy * Math.sin(a))) / w,
      (cy + (dx * Math.sin(a) + dy * Math.cos(a))) / h
    ];
    const quad: Quad = {
      topLeft: corner(-s / 2, -s / 2),
      topRight: corner(s / 2, -s / 2),
      bottomRight: corner(s / 2, s / 2),
      bottomLeft: corner(-s / 2, s / 2)
    };

    const out = await warpQuadToSquare(tilted, quad, 200);

    expect(await colourAt(out, 0.25, 0.25)).toBe('red');
    expect(await colourAt(out, 0.75, 0.25)).toBe('green');
    expect(await colourAt(out, 0.25, 0.75)).toBe('blue');
    expect(await colourAt(out, 0.75, 0.75)).toBe('yellow');
  });

  it('produces the square it was asked for', async () => {
    const out = await warpQuadToSquare(await quadrants(), FULL_FRAME, 512);
    const meta = await sharp(out).metadata();

    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('applies EXIF orientation first, since the corners were picked on the upright image', async () => {
    // Tagged sideways: without rotating first, the corners address the wrong
    // pixels and the quadrants come out in the wrong places.
    const upright = await quadrants();
    const tagged = await sharp(upright).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const out = await warpQuadToSquare(tagged, FULL_FRAME, 200);

    // Orientation 6 means "rotate 90 clockwise to display", so the quadrant
    // that was bottom-left ends up top-left.
    expect(await colourAt(out, 0.25, 0.25)).toBe('blue');
    expect(await colourAt(out, 0.75, 0.25)).toBe('red');
    expect(await colourAt(out, 0.75, 0.75)).toBe('green');
    expect(await colourAt(out, 0.25, 0.75)).toBe('yellow');
  });

  it('refuses a quad that is not four sane corners', async () => {
    const source = await quadrants();
    const degenerate = {
      topLeft: [0, 0], topRight: [0, 0], bottomRight: [0, 0], bottomLeft: [0, 0]
    } as Quad;

    await expect(warpQuadToSquare(source, degenerate, 200)).rejects.toThrow(/quad|corner/i);
  });
});
