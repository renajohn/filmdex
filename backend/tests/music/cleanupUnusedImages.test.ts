import fs from 'fs';
import path from 'path';
import imageService from '../../src/services/imageService';

const cdDir = () => path.join(imageService.getLocalImagesDir(), 'cd');

const write = (name: string) => {
  const dir = cdDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), 'x');
};

const exists = (name: string) => fs.existsSync(path.join(cdDir(), name));

beforeEach(() => {
  fs.rmSync(cdDir(), { recursive: true, force: true });
});

describe('imageService.cleanupUnusedImages', () => {
  it('keeps an image that is still referenced by an album', async () => {
    write('album_keep.jpg');

    // This is the shape stored in the database.
    await imageService.cleanupUnusedImages(['/api/images/cd/album_keep.jpg']);

    expect(exists('album_keep.jpg')).toBe(true);
  });

  it('deletes an image nothing references any more', async () => {
    write('album_keep.jpg');
    write('album_orphan.jpg');

    await imageService.cleanupUnusedImages(['/api/images/cd/album_keep.jpg']);

    expect(exists('album_keep.jpg')).toBe(true);
    expect(exists('album_orphan.jpg')).toBe(false);
  });

  it('refuses to run on an empty reference list rather than wiping everything', async () => {
    write('album_keep.jpg');

    await expect(imageService.cleanupUnusedImages([])).rejects.toThrow(/refus/i);

    expect(exists('album_keep.jpg')).toBe(true);
  });

  it('also walks the custom upload subdirectory', async () => {
    const customDir = path.join(cdDir(), 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'cd_1_keep.jpg'), 'x');
    fs.writeFileSync(path.join(customDir, 'cd_1_orphan.jpg'), 'x');

    await imageService.cleanupUnusedImages(['/api/images/cd/custom/cd_1_keep.jpg']);

    expect(fs.existsSync(path.join(customDir, 'cd_1_keep.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(customDir, 'cd_1_orphan.jpg'))).toBe(false);
  });
});
