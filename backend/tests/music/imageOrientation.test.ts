import sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import imageService from '../../src/services/imageService';

/**
 * A phone writes the sensor's pixels and an EXIF tag saying which way up they
 * go. Resizing strips that tag, so unless the rotation is baked into the
 * pixels first, every cover photographed in portrait is stored -- and shown --
 * lying on its side.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orientation-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** `orientation: 6` is what a phone held sideways writes: rotate 90° clockwise. */
const write = async (name: string, width: number, height: number, orientation?: number) => {
  const file = path.join(dir, name);
  let image = sharp({ create: { width, height, channels: 3, background: '#3070c0' } });
  if (orientation) image = image.withMetadata({ orientation });
  await image.jpeg().toFile(file);
  return file;
};

describe('resizeImage and EXIF orientation', () => {
  it('bakes the rotation into a photo big enough to be resized', async () => {
    const file = await write('big.jpg', 1050, 1400, 6);

    await imageService.resizeImage(file, file, 1200, 1200);

    const after = await sharp(file).metadata();
    // Tagged sideways, so the upright image is wider than it is tall.
    expect(after.width).toBeGreaterThan(after.height!);
  });

  it('bakes it in even when the photo is small enough to skip the resize', async () => {
    // The early return used to leave the file untouched, tag and all.
    const file = await write('small.jpg', 600, 800, 6);

    await imageService.resizeImage(file, file, 1200, 1200);

    const after = await sharp(file).metadata();
    expect(after.width).toBeGreaterThan(after.height!);
  });

  it('leaves an already upright photo alone', async () => {
    const file = await write('upright.jpg', 600, 400);
    const before = fs.readFileSync(file);

    await imageService.resizeImage(file, file, 1200, 1200);

    // No needless second generation of JPEG loss.
    expect(fs.readFileSync(file).equals(before)).toBe(true);
  });

  it('still reports whether it resized', async () => {
    const big = await write('b.jpg', 2000, 1500);
    const small = await write('s.jpg', 400, 300);

    expect(await imageService.resizeImage(big, big, 1200, 1200)).toBe(true);
    expect(await imageService.resizeImage(small, small, 1200, 1200)).toBe(false);
  });

  it('does not leave its temporary file behind', async () => {
    const file = await write('temp.jpg', 1050, 1400, 6);

    await imageService.resizeImage(file, file, 1200, 1200);

    expect(fs.existsSync(file + '.tmp')).toBe(false);
  });
});
