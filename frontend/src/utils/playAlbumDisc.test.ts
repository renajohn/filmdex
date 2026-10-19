import { describe, it, expect, vi } from 'vitest';

const file = (discNumber: number, track: number) => ({
  id: `s${discNumber}-${track}`, url: null, discNumber, track, title: `${discNumber}-${track}`, durationSec: 200,
  suffix: 'flac', bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: null,
});

vi.mock('../services/musicService', () => ({
  default: {
    getAlbumById: vi.fn(async () => ({
      id: 5, title: 'Echoes', artist: ['Pink Floyd'], cover: null,
      discs: [1, 2].map(number => ({ number, tracks: [1, 2].map(no => ({ no, title: `Disc ${number} track ${no}` })) })),
    })),
    getNavidromeTracks: vi.fn(async () => ({
      configured: true, found: true, album: { id: 'nd-5', name: 'Echoes' }, tracks: [file(1, 1), file(1, 2), file(2, 1), file(2, 2)],
    })),
    getImageUrl: vi.fn(() => null),
  },
}));

import { loadPlayable } from './playAlbum';

describe('one disc of an album, as Listen Next plays it', () => {
  it('has the tracks of that disc alone, and says which disc it is', async () => {
    const { album, tracks } = await loadPlayable(5, { listenNext: true, disc: 2 });
    expect(album).toMatchObject({ id: 5, disc: 2 });
    expect(tracks.map(track => track.title)).toEqual(['Disc 2 track 1', 'Disc 2 track 2']);
  });

  it('has every disc for the whole album', async () => {
    const { album, tracks } = await loadPlayable(5, { listenNext: true });
    expect(album.disc).toBeUndefined();
    expect(tracks).toHaveLength(4);
  });
});
