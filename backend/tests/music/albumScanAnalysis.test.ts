import axios from 'axios';
import coverScanService from '../../src/services/coverScanService';

const llmReplying = (content: string) =>
  jest.spyOn(axios, 'post').mockResolvedValue({
    data: { choices: [{ message: { content } }] }
  } as any);

let coverJpeg: string;

beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  coverJpeg = (
    await sharp({ create: { width: 640, height: 640, channels: 3, background: '#204060' } })
      .jpeg()
      .toBuffer()
  ).toString('base64');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('analyzeAlbumImage', () => {
  it('extracts artist, title, year and format from the model reply', async () => {
    llmReplying('{"artist": "Miles Davis", "title": "Kind of Blue", "year": 1959, "format": "CD"}');

    const result = await coverScanService.analyzeAlbumImage(coverJpeg, 'image/jpeg');

    expect(result.artist).toBe('Miles Davis');
    expect(result.title).toBe('Kind of Blue');
    expect(result.year).toBe(1959);
  });

  it('asks the model for the artist', async () => {
    const spy = llmReplying('{"artist": "A", "title": "B"}');

    await coverScanService.analyzeAlbumImage(coverJpeg, 'image/jpeg');

    const body = spy.mock.calls[0][1] as any;
    const promptText = body.messages[0].content.find((c: any) => c.type === 'text').text;
    expect(promptText).toMatch(/artist/i);
  });

  it('survives a reply wrapped in markdown fences and thinking tags', async () => {
    llmReplying(
      '<think>the sleeve says...</think>\n```json\n{"artist": "Talk Talk", "title": "Spirit of Eden", "year": 1988}\n```'
    );

    const result = await coverScanService.analyzeAlbumImage(coverJpeg, 'image/jpeg');

    expect(result.artist).toBe('Talk Talk');
    expect(result.title).toBe('Spirit of Eden');
    expect(result.year).toBe(1988);
  });

  it('accepts a cover whose artist it could not read', async () => {
    llmReplying('{"title": "Unknown Sleeve"}');

    const result = await coverScanService.analyzeAlbumImage(coverJpeg, 'image/jpeg');

    expect(result.title).toBe('Unknown Sleeve');
    expect(result.artist).toBeNull();
    expect(result.year).toBeNull();
  });

  it('fails loudly when no title could be read', async () => {
    llmReplying('{"artist": "Someone"}');

    await expect(
      coverScanService.analyzeAlbumImage(coverJpeg, 'image/jpeg')
    ).rejects.toThrow(/title/i);
  });
});
