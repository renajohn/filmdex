import request from 'supertest';
import app from '../../index';
import coverScanService from '../../src/services/coverScanService';
import type { SleeveTranscription } from '../../src/services/coverScanService';

const IMAGE = 'aGVsbG8=';

const post = (body: Record<string, unknown>) =>
  request(app).post('/api/music/transcribe-sleeve').send(body);

const sleeve = (over: Partial<SleeveTranscription> = {}): SleeveTranscription => ({
  title: null, artist: [], label: [], catalogNumber: null, barcode: null,
  year: null, country: null, format: null, genres: [], tracks: [], truncated: false,
  ...over
});

const backReturns = (value: Partial<SleeveTranscription>) =>
  jest.spyOn(coverScanService, 'transcribeSleeveBack').mockResolvedValue(sleeve(value));

const frontReturns = (value: Partial<SleeveTranscription>) =>
  jest.spyOn(coverScanService, 'transcribeSleeveFront').mockResolvedValue(sleeve(value));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/music/transcribe-sleeve', () => {
  it('refuses a request carrying no photograph', async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });

  it('fills the draft from the back alone', async () => {
    backReturns({
      title: 'Atlas of Small Things',
      artist: ['The Paper Kites Ensemble'],
      catalogNumber: 'HN-4471-2',
      format: 'Compact Disc',
      tracks: [{ disc: 1, n: 1, title: 'Prelude in C Minor', duration: '3:42' }]
    });

    const res = await post({ back: { image: IMAGE, mimeType: 'image/jpeg' } });

    expect(res.status).toBe(200);
    expect(res.body.draft.title).toBe('Atlas of Small Things');
    expect(res.body.draft.catalogNumber).toBe('HN-4471-2');
    expect(res.body.draft.format).toBe('CD');
    expect(res.body.draft.discs[0].tracks[0].durationSec).toBe(222);
    expect(res.body.sources).toEqual({ front: 'absent', back: 'ok' });
  });

  it('does not ask the model about a photograph it was not given', async () => {
    backReturns({ title: 'X' });
    const front = frontReturns({ title: 'Y' });

    await post({ back: { image: IMAGE, mimeType: 'image/jpeg' } });

    expect(front).not.toHaveBeenCalled();
  });

  it('lets the back win, because the front is artwork', async () => {
    // A front is stylised, sometimes wordless, and on a classical sleeve names
    // the composer where the back names the performer.
    backReturns({ title: 'Nocturnes Completes', artist: ['Orchestre du Leman'] });
    frontReturns({ title: 'NOCTURNES', artist: ['Chopin'] });

    const res = await post({
      front: { image: IMAGE, mimeType: 'image/jpeg' },
      back: { image: IMAGE, mimeType: 'image/jpeg' }
    });

    expect(res.body.draft.title).toBe('Nocturnes Completes');
    expect(res.body.draft.artist).toEqual(['Orchestre du Leman']);
  });

  it('lets the front fill what the back left blank', async () => {
    backReturns({ title: null, artist: [], catalogNumber: 'HN-1' });
    frontReturns({ title: 'From The Front', artist: ['Someone'] });

    const res = await post({
      front: { image: IMAGE, mimeType: 'image/jpeg' },
      back: { image: IMAGE, mimeType: 'image/jpeg' }
    });

    expect(res.body.draft.title).toBe('From The Front');
    expect(res.body.draft.artist).toEqual(['Someone']);
    expect(res.body.draft.catalogNumber).toBe('HN-1');
  });

  it('still fills the form when one of the two photographs fails', async () => {
    backReturns({ title: 'Read From The Back', tracks: [{ disc: 1, n: 1, title: 'One', duration: '1:00' }] });
    jest.spyOn(coverScanService, 'transcribeSleeveFront').mockRejectedValue(new Error('Network error: ECONNRESET'));

    const res = await post({
      front: { image: IMAGE, mimeType: 'image/jpeg' },
      back: { image: IMAGE, mimeType: 'image/jpeg' }
    });

    expect(res.status).toBe(200);
    expect(res.body.draft.title).toBe('Read From The Back');
    expect(res.body.sources).toEqual({ front: 'failed', back: 'ok' });
  });

  it('reports a model it could not reach as unavailable, not as a bad photo', async () => {
    jest.spyOn(coverScanService, 'transcribeSleeveBack')
      .mockRejectedValue(new Error('Network error: UNABLE_TO_VERIFY_LEAF_SIGNATURE'));

    const res = await post({ back: { image: IMAGE, mimeType: 'image/jpeg' } });

    expect(res.status).toBe(503);
    expect(res.body.details).toMatch(/UNABLE_TO_VERIFY_LEAF_SIGNATURE/);
  });

  it('reports an unreadable sleeve as such', async () => {
    jest.spyOn(coverScanService, 'transcribeSleeveBack')
      .mockRejectedValue(new Error('Could not parse the sleeve transcription'));

    const res = await post({ back: { image: IMAGE, mimeType: 'image/jpeg' } });

    expect(res.status).toBe(422);
  });

  it('says when the track list was cut short rather than pretending it is complete', async () => {
    backReturns({
      title: 'Long Box',
      truncated: true,
      tracks: [{ disc: 1, n: 1, title: 'One', duration: '1:00' }]
    });

    const res = await post({ back: { image: IMAGE, mimeType: 'image/jpeg' } });

    expect(res.body.truncated).toBe(true);
    expect(res.body.draft.discs[0].tracks).toHaveLength(1);
  });
});
