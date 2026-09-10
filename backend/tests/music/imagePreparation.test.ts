import sharp from 'sharp';
import coverScanService from '../../src/services/coverScanService';

const toBase64 = async (image: sharp.Sharp): Promise<string> =>
  (await image.toBuffer()).toString('base64');

const metaOf = async (base64: string) => sharp(Buffer.from(base64, 'base64')).metadata();

describe('prepareImage', () => {
  it('converts a large PNG to a JPEG no wider than 1024px', async () => {
    const png = await toBase64(
      sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#3366cc' } }).png()
    );

    const prepared = await coverScanService.prepareImage(png, 'image/png');

    expect(prepared.mimeType).toBe('image/jpeg');
    const meta = await metaOf(prepared.base64);
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1024);
  });

  it('applies EXIF orientation so a portrait phone photo is not sent sideways', async () => {
    // Orientation 6 means "rotate 90° clockwise on display".
    const rotated = await toBase64(
      sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#cc3366' } })
        .withMetadata({ orientation: 6 })
        .jpeg()
    );

    const prepared = await coverScanService.prepareImage(rotated, 'image/jpeg');

    const meta = await metaOf(prepared.base64);
    // After baking the rotation in, the stored pixels must be portrait.
    expect(meta.height).toBeGreaterThan(meta.width!);
  });

  it('leaves a small JPEG alone instead of recompressing it', async () => {
    const small = await toBase64(
      sharp({ create: { width: 600, height: 600, channels: 3, background: '#22aa55' } }).jpeg()
    );

    const prepared = await coverScanService.prepareImage(small, 'image/jpeg');

    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.base64).toBe(small);
  });

  it('does not need any external binary to be installed', async () => {
    const png = await toBase64(
      sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' } }).png()
    );

    // sips is macOS-only and ffmpeg is not guaranteed in the container, so this
    // must go through sharp.
    await expect(coverScanService.prepareImage(png, 'image/png')).resolves.toBeDefined();
  });
});
