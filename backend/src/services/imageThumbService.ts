import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Request, Response } from 'express';
import configManager from '../config';
import logger from '../logger';

/**
 * Serves a stored image, or a smaller copy of it when the request asks for one
 * with ?w=<pixels>, for the lists: a grid shows a cover 150 to 250px wide and
 * has no use for the 1000px one the card shows.
 *
 * A width is rounded up to one of a few, so that the cache holds a handful of
 * copies per image and not one per pixel. A copy is made on the first request,
 * kept beside the images (not among them: a backup leaves it out), and made
 * again when the image is newer than it, for a cover is sometimes rewritten
 * under the same name (straightened, resized).
 */

const WIDTHS = [120, 240, 360, 480, 720];
const RESIZABLE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Two requests for the same copy at once make it once.
const pending = new Map<string, Promise<void>>();

const thumbsRoot = (): string => path.join(path.dirname(configManager.getImagesPath()), 'thumbs');

/** The width to make: the first of WIDTHS at least as wide as asked, or null. */
export const snapWidth = (raw: unknown): number | null => {
  const asked = Number(raw);
  if (!Number.isFinite(asked) || asked <= 0) return null;
  return WIDTHS.find(w => w >= asked) ?? WIDTHS[WIDTHS.length - 1];
};

const makeThumb = async (source: string, dest: string, width: number): Promise<void> => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = `${dest}.${process.pid}.tmp`;
  await sharp(source)
    .rotate()
    .resize(width, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(temp);
  fs.renameSync(temp, dest);
};

const thumbFor = async (source: string, relative: string, width: number): Promise<string> => {
  const dest = path.join(thumbsRoot(), `w${width}`, `${relative}.webp`);
  const sourceTime = fs.statSync(source).mtimeMs;
  const fresh = fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= sourceTime;
  if (!fresh) {
    let job = pending.get(dest);
    if (!job) {
      job = makeThumb(source, dest, width).finally(() => pending.delete(dest));
      pending.set(dest, job);
    }
    await job;
  }
  return dest;
};

/**
 * Sends the image at `relative` (inside the images directory), at the width
 * asked for if any. Answers 404 when it is not there or lies outside.
 */
export const sendImage = async (req: Request, res: Response, relative: string): Promise<void> => {
  const root = configManager.getImagesPath();
  const source = path.resolve(root, relative);
  if (!source.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  // Revalidated on every use (an ETag makes it a 304): a cover can be
  // rewritten under the same name, and its URL would not tell.
  res.setHeader('Cache-Control', 'no-cache');

  const width = snapWidth(req.query.w);
  if (width && RESIZABLE.has(path.extname(source).toLowerCase())) {
    try {
      const thumb = await thumbFor(source, path.relative(root, source), width);
      res.sendFile(thumb);
      return;
    } catch (error) {
      logger.warn(`Could not make a ${width}px copy of ${relative}, sending the image itself:`, (error as Error).message);
    }
  }
  res.sendFile(source);
};

export default { sendImage, snapWidth };
