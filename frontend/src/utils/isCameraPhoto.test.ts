import { describe, expect, it } from 'vitest';
import { isCameraPhoto } from './isCameraPhoto';

/** A JPEG's start: SOI, then an APP1 Exif with one IFD entry, Make (0x010F) of the length given. */
const jpegWithExif = (makeLength: number) => {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian, IFD at 8
    0x01, 0x00, // one entry
    0x0f, 0x01, 0x02, 0x00, makeLength, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, // Make, ASCII, count, offset
    0x00, 0x00, 0x00, 0x00];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xda, 0x00, 0x02]);
};
const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes], name, { type });

describe('a photograph or a picture from the web', () => {
  it('takes a HEIC, and a JPEG whose EXIF names its camera, for photographs', async () => {
    expect(await isCameraPhoto(file(new Uint8Array([0]), 'IMG_0001.HEIC', 'image/heic'))).toBe(true);
    expect(await isCameraPhoto(file(jpegWithExif(6), 'IMG_0002.jpg', 'image/jpeg'))).toBe(true);
  });

  it('keeps a JPEG without EXIF or without a maker, and a PNG, as pictures', async () => {
    expect(await isCameraPhoto(file(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0, 0, 0xff, 0xda]), 'cover.jpg', 'image/jpeg'))).toBe(false);
    expect(await isCameraPhoto(file(jpegWithExif(1), 'cover.jpg', 'image/jpeg'))).toBe(false);
    expect(await isCameraPhoto(file(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'cover.png', 'image/png'))).toBe(false);
  });
});
