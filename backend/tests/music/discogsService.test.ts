import axios from 'axios';
import discogsService from '../../src/services/discogsService';

const SEARCH_HIT = {
  id: 7156458,
  type: 'release',
  title: 'Muse - Drones',
  year: '2015',
  country: 'Europe',
  format: ['CD', 'Album'],
  label: ['Helium-3', 'Warner Bros. Records'],
  catno: '825646121229',
  barcode: ['0 825646 121229'],
  cover_image: 'https://i.discogs.com/abc/drones.jpg'
};

const RELEASE = {
  id: 7156458,
  title: 'Drones',
  artists: [{ name: 'Muse', id: 1003 }],
  year: 2015,
  released: '2015-06-08',
  country: 'Europe',
  labels: [{ name: 'Helium-3', catno: 'HELIUM3-001' }],
  formats: [{ name: 'CD', qty: '1', descriptions: ['Album'] }],
  identifiers: [
    { type: 'Barcode', value: '0825646121229' },
    { type: 'Matrix / Runout', value: 'XYZ' }
  ],
  tracklist: [
    { position: '1', title: 'Dead Inside', duration: '4:19', type_: 'track' },
    { position: '2', title: 'Drill Sergeant', duration: '0:22', type_: 'track' },
    { position: '', title: 'Bonus disc', type_: 'heading' }
  ],
  images: [
    { type: 'primary', uri: 'https://i.discogs.com/front.jpg' },
    { type: 'secondary', uri: 'https://i.discogs.com/back.jpg' }
  ],
  genres: ['Rock'],
  styles: ['Alternative Rock']
};

afterEach(() => {
  jest.restoreAllMocks();
});

const mockGet = (data: unknown) => jest.spyOn(axios, 'get').mockResolvedValue({ data } as any);

describe('discogsService.isConfigured', () => {
  it('sees the token from the environment even before the config is loaded', () => {
    const previous = process.env.DISCOGS_TOKEN;
    process.env.DISCOGS_TOKEN = 'from-env';
    try {
      // getApiKeys() throws until loadDataConfig() has run, which would
      // otherwise make the token look absent in any standalone script.
      expect(discogsService.isConfigured()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DISCOGS_TOKEN;
      else process.env.DISCOGS_TOKEN = previous;
    }
  });
});

describe('discogsService.search', () => {
  it('asks Discogs for physical releases matching artist and title', async () => {
    const get = mockGet({ results: [SEARCH_HIT] });

    await discogsService.search({ artist: 'Muse', title: 'Drones' });

    const [url, config] = get.mock.calls[0] as [string, any];
    expect(url).toContain('/database/search');
    expect(config.params.artist).toBe('Muse');
    expect(config.params.release_title).toBe('Drones');
    expect(config.params.type).toBe('release');
  });

  it('sends the token in the Authorization header, never in the URL', async () => {
    const get = mockGet({ results: [] });

    await discogsService.search({ title: 'Drones' });

    const [, config] = get.mock.calls[0] as [string, any];
    // A token in the query string leaks into access logs and error messages.
    expect(config.params.token).toBeUndefined();
    expect(config.headers.Authorization).toMatch(/^Discogs token=/);
  });

  it('identifies itself, as Discogs requires', async () => {
    const get = mockGet({ results: [] });

    await discogsService.search({ title: 'Drones' });

    const [, config] = get.mock.calls[0] as [string, any];
    expect(config.headers['User-Agent']).toMatch(/DexVault/i);
  });

  it('returns an empty list rather than failing when nothing matches', async () => {
    mockGet({ results: [] });

    await expect(discogsService.search({ title: 'Nothing' })).resolves.toEqual([]);
  });
});

describe('discogsService.searchByBarcode', () => {
  it('queries the barcode field, which is what a scanned code is', async () => {
    const get = mockGet({ results: [SEARCH_HIT] });

    await discogsService.searchByBarcode('0825646121229');

    const [, config] = get.mock.calls[0] as [string, any];
    expect(config.params.barcode).toBe('0825646121229');
  });
});

describe('discogsService.formatRelease', () => {
  it('maps a Discogs release onto the shape the app already stores', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.discogsReleaseId).toBe('7156458');
    expect(formatted.title).toBe('Drones');
    expect(formatted.artist).toEqual(['Muse']);
    expect(formatted.releaseYear).toBe(2015);
    expect(formatted.country).toBe('Europe');
    expect(formatted.format).toBe('CD');
    expect(formatted.labels).toEqual(['Helium-3']);
    expect(formatted.catalogNumber).toBe('HELIUM3-001');
  });

  it('picks the barcode out of the identifiers list', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.barcode).toBe('0825646121229');
  });

  it('keeps real tracks and drops headings', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.discs).toHaveLength(1);
    expect(formatted.discs[0].tracks).toHaveLength(2);
    expect(formatted.discs[0].tracks[0]).toMatchObject({ trackNumber: 1, title: 'Dead Inside' });
  });

  it('converts durations from mm:ss to seconds', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.discs[0].tracks[0].durationSec).toBe(259);
    expect(formatted.discs[0].tracks[1].durationSec).toBe(22);
  });

  it('exposes the front and back cover', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.coverArt.front).toBe('https://i.discogs.com/front.jpg');
    expect(formatted.coverArt.back).toBe('https://i.discogs.com/back.jpg');
  });

  it('merges genres and styles, which the app stores as one list', () => {
    const formatted = discogsService.formatRelease(RELEASE as any);

    expect(formatted.genres).toEqual(expect.arrayContaining(['Rock', 'Alternative Rock']));
  });

  it('survives a sparse release with almost nothing filled in', () => {
    const formatted = discogsService.formatRelease({ id: 1, title: 'Bare' } as any);

    expect(formatted.title).toBe('Bare');
    expect(formatted.artist).toEqual([]);
    expect(formatted.discs).toEqual([]);
    expect(formatted.barcode).toBeNull();
  });

  it('handles a multi-disc release', () => {
    const formatted = discogsService.formatRelease({
      id: 2,
      title: 'Double',
      tracklist: [
        { position: '1-1', title: 'A', duration: '1:00', type_: 'track' },
        { position: '2-1', title: 'B', duration: '2:00', type_: 'track' }
      ]
    } as any);

    expect(formatted.discs).toHaveLength(2);
    expect(formatted.discs[0].number).toBe(1);
    expect(formatted.discs[1].number).toBe(2);
    expect(formatted.discs[1].tracks[0].title).toBe('B');
  });
});
