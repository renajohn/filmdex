import { describe, it, expect, vi, beforeEach } from 'vitest';

const server = vi.hoisted(() => ({ songs: ['a', 'b'] as string[], calls: [] as unknown[] }));

vi.mock('../services/musicService', () => ({
  default: {
    getMixtapes: vi.fn(async () => ({ configured: true, mixtapes: [{ album: { id: 7, title: 'Sunday mix', artist: [], titleStatus: 'playlist' }, playlistId: 'p', songIds: server.songs }] })),
    updateMixtape: vi.fn(async (_id: number, change: Record<string, string[]>) => {
      server.calls.push(change);
      if (change.add) server.songs = [...server.songs, ...change.add.filter(id => !server.songs.includes(id))];
      if (change.remove) server.songs = server.songs.filter(id => !change.remove.includes(id));
      if (change.songs) server.songs = change.songs;
      return { album: { id: 7, title: 'Sunday mix', artist: [], titleStatus: 'playlist' }, playlistId: 'p', url: '', songs: server.songs.map(songId => ({ songId })) };
    }),
  },
}));
vi.mock('../components/shared/Toast', () => ({ toast: vi.fn() }));

import { heldIn, reloadMixtapes, resetMixtapes, toggleInMixtape, useMixtapes } from './mixtapeStore';
import { mixtapeArtists } from './mixtape';
import { renderHook, waitFor } from '@testing-library/react';

beforeEach(() => {
  server.songs = ['a', 'b'];
  server.calls = [];
  resetMixtapes();
});

describe('mixtapes', () => {
  it('names two artists, then how many more', () => {
    expect(mixtapeArtists(['A'])).toBe('A');
    expect(mixtapeArtists(['A', 'B'])).toBe('A & B');
    expect(mixtapeArtists(['A', 'B', 'C', 'D'])).toBe('A, B & 2 more');
    expect(mixtapeArtists([])).toBe('Empty mixtape');
  });

  it('takes out songs all held, adds those missing otherwise', async () => {
    await reloadMixtapes();
    const { result } = renderHook(() => useMixtapes());
    const mixtape = () => result.current.mixtapes[0];
    expect(heldIn(mixtape(), ['a', 'c'])).toBe(1);

    await toggleInMixtape(mixtape(), ['a', 'c']);
    expect(server.calls.pop()).toEqual({ add: ['a', 'c'] });
    await waitFor(() => expect(mixtape().songIds).toEqual(['a', 'b', 'c']));

    await toggleInMixtape(mixtape(), ['a', 'c', 'c']);
    expect(server.calls.pop()).toEqual({ remove: ['a', 'c'] });
    await waitFor(() => expect(mixtape().songIds).toEqual(['b']));
  });
});
