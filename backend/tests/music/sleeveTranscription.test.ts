import axios from 'axios';
import coverScanService from '../../src/services/coverScanService';

/**
 * Transcribing a sleeve is not identifying a record. These albums are absent
 * from Discogs and MusicBrainz by premise, so the model does not know them
 * either: anything it completes from memory is invention, and a plausible but
 * wrong track list survives proofreading in a way an empty field does not.
 */

const reply = (content: string, finishReason = 'stop') =>
  jest.spyOn(axios, 'post').mockResolvedValue({
    data: { choices: [{ message: { content }, finish_reason: finishReason }] }
  } as never);

let sleeveJpeg: string;

beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  sleeveJpeg = (
    await sharp({ create: { width: 400, height: 400, channels: 3, background: '#101010' } })
      .jpeg()
      .toBuffer()
  ).toString('base64');
});

afterEach(() => {
  jest.restoreAllMocks();
});

const BACK = JSON.stringify({
  title: 'Atlas of Small Things',
  artist: ['The Paper Kites Ensemble'],
  label: ['Harmonia Nova'],
  catalogNumber: 'HN-4471-2',
  barcode: '7619931044712',
  year: 2003,
  country: 'Austria',
  format: 'CD',
  genres: ['Classical'],
  tracks: [
    { disc: 1, n: 1, title: 'Prelude in C Minor', duration: '3:42' },
    { disc: 1, n: 2, title: 'The Longest Winter', duration: '5:18' }
  ]
});

describe('transcribeSleeveBack', () => {
  it('reads the printed record off the back', async () => {
    reply(BACK);

    const result = await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    expect(result.title).toBe('Atlas of Small Things');
    expect(result.artist).toEqual(['The Paper Kites Ensemble']);
    expect(result.catalogNumber).toBe('HN-4471-2');
    expect(result.barcode).toBe('7619931044712');
    expect(result.year).toBe(2003);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toMatchObject({ disc: 1, n: 1, title: 'Prelude in C Minor', duration: '3:42' });
  });

  it('tells the model to transcribe and not to recall', async () => {
    const post = reply(BACK);

    await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    const body = post.mock.calls[0][1] as { messages: Array<{ content: Array<{ text?: string }> }> };
    const prompt = body.messages[0].content.map(p => p.text || '').join(' ');
    expect(prompt).toMatch(/do not use.*knowledge/i);
    expect(prompt).toMatch(/omit/i);
  });

  it('leaves room for a double album', async () => {
    const post = reply(BACK);

    await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    // Twelve tracks already cost around 700 tokens.
    const body = post.mock.calls[0][1] as { max_tokens: number };
    expect(body.max_tokens).toBeGreaterThanOrEqual(1500);
  });

  it('reads through code fences and thinking blocks', async () => {
    reply(`<think>the sleeve is dark</think>\n\`\`\`json\n${BACK}\n\`\`\``);

    const result = await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    expect(result.title).toBe('Atlas of Small Things');
    expect(result.tracks).toHaveLength(2);
  });

  it('keeps the tracks that parsed when the answer is cut off mid-list', async () => {
    // What a max_tokens ceiling actually does to a long track list.
    const truncated =
      '{"title":"Nocturnes","artist":["Orchestre du Leman"],"tracks":[' +
      '{"disc":1,"n":1,"title":"Ouverture","duration":"2:11"},' +
      '{"disc":1,"n":2,"title":"Le Jardin Perdu","duration":"4:38"},' +
      '{"disc":1,"n":3,"title":"Symphonie';
    reply(truncated, 'length');

    const result = await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    expect(result.truncated).toBe(true);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[1].title).toBe('Le Jardin Perdu');
  });

  it('reports an unreadable answer rather than inventing an empty album', async () => {
    reply('I am unable to read this image.');

    await expect(coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg')).rejects.toThrow(
      /could not|unreadable|parse/i
    );
  });

  it('normalises a single artist string into a list', async () => {
    reply('{"title":"X","artist":"Solo Artist","tracks":[]}');

    const result = await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    expect(result.artist).toEqual(['Solo Artist']);
  });

  it('defaults a track with no printed disc to the first one', async () => {
    reply('{"title":"X","tracks":[{"n":1,"title":"Only Song","duration":"1:00"}]}');

    const result = await coverScanService.transcribeSleeveBack(sleeveJpeg, 'image/jpeg');

    expect(result.tracks[0].disc).toBe(1);
  });
});

describe('transcribeSleeveFront', () => {
  it('reads only what the front carries', async () => {
    reply('{"title":"Atlas of Small Things","artist":["The Paper Kites Ensemble"],"format":"CD"}');

    const result = await coverScanService.transcribeSleeveFront(sleeveJpeg, 'image/jpeg');

    expect(result.title).toBe('Atlas of Small Things');
    expect(result.artist).toEqual(['The Paper Kites Ensemble']);
    expect(result.format).toBe('CD');
  });

  it('stays cheap: the front has no track list to hold', async () => {
    const post = reply('{"title":"X"}');

    await coverScanService.transcribeSleeveFront(sleeveJpeg, 'image/jpeg');

    const body = post.mock.calls[0][1] as { max_tokens: number };
    expect(body.max_tokens).toBeLessThanOrEqual(400);
  });
});
