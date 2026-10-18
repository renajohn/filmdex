import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/musicService', () => ({
  default: {
    getAlbumById: vi.fn(async () => ({ id: 7, title: 'Running', titleStatus: 'playlist', artist: ['A'], cover: null })),
    getNavidromeTracks: vi.fn(async () => null),
    getMixtape: vi.fn(async () => ({
      album: {}, playlistId: 'pl-7', url: 'https://music/pl-7',
      songs: ['a', 'b', 'c'].map(id => ({ songId: id, title: id, artist: 'A', album: 'B', albumId: null, durationSec: 100, cover: null })),
      listenNextOrder: [2, 0, 1],
    })),
    getImageUrl: vi.fn(() => null),
  },
}));

import { loadPlayable } from './playAlbum';

describe('a mixtape shuffled in Listen Next', () => {
  it('plays from Listen Next in the order drawn there, each song keeping its place', async () => {
    const { tracks } = await loadPlayable(7, { listenNext: true });
    expect(tracks.map(track => [track.songId, track.no, track.place])).toEqual([['c', 1, 2], ['a', 2, 0], ['b', 3, 1]]);
  });

  it('plays from its card in its own order', async () => {
    const { tracks } = await loadPlayable(7);
    expect(tracks.map(track => track.songId)).toEqual(['a', 'b', 'c']);
  });
});
