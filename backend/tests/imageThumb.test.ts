import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import configManager from '../src/config';
import { sendImage, snapWidth } from '../src/services/imageThumbService';

describe('imageThumbService', () => {
  let root: string;
  let images: string;
  const app = express();
  app.get('/api/images/:type/:filename', (req, res) => {
    void sendImage(req, res, path.join(req.params.type as string, req.params.filename as string));
  });

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
    images = path.join(root, 'images');
    fs.mkdirSync(path.join(images, 'cd'), { recursive: true });
    await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#a83' } })
      .jpeg().toFile(path.join(images, 'cd', 'cover.jpg'));
    fs.writeFileSync(path.join(root, 'secret.txt'), 'no');
    jest.spyOn(configManager, 'getImagesPath').mockReturnValue(images);
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('rounds a width up to one it keeps', () => {
    expect(snapWidth('200')).toBe(240);
    expect(snapWidth('240')).toBe(240);
    expect(snapWidth('5000')).toBe(720);
    expect(snapWidth('abc')).toBeNull();
    expect(snapWidth(undefined)).toBeNull();
  });

  it('sends the image itself without a width', async () => {
    const res = await request(app).get('/api/images/cd/cover.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('sends a smaller copy with a width, and keeps it outside the images', async () => {
    const res = await request(app).get('/api/images/cd/cover.jpg?w=200').buffer(true)
      .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect((await sharp(res.body as Buffer).metadata()).width).toBe(240);
    expect(fs.existsSync(path.join(root, 'thumbs', 'w240', 'cd', 'cover.jpg.webp'))).toBe(true);
  });

  it('makes the copy again when the image is rewritten', async () => {
    const thumb = path.join(root, 'thumbs', 'w240', 'cd', 'cover.jpg.webp');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(thumb, old, old);
    await request(app).get('/api/images/cd/cover.jpg?w=240');
    expect(fs.statSync(thumb).mtimeMs).toBeGreaterThan(old.getTime());
  });

  it('answers 404 for what is missing or outside the images', async () => {
    expect((await request(app).get('/api/images/cd/none.jpg?w=240')).status).toBe(404);
    expect((await request(app).get('/api/images/cd/..%2F..%2Fsecret.txt')).status).toBe(404);
  });
});
