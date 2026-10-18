import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFavourite, resetFavourites, seedFavourite, setFavourite } from './favourites';

describe('favourites', () => {
  afterEach(() => {
    resetFavourites();
    vi.unstubAllGlobals();
  });

  it('keeps a heart known unless told to take the newer one', () => {
    seedFavourite('song-1', true);
    seedFavourite('song-1', false, true);
    expect(isFavourite('song-1')).toBe(true);
    seedFavourite('song-1', false);
    expect(isFavourite('song-1')).toBe(false);
  });

  it('hearts a song in Navidrome', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ starred: true }) });
    vi.stubGlobal('fetch', fetch);
    await setFavourite('song-1', true);
    expect(fetch).toHaveBeenCalledWith('/api/music/navidrome/star/song-1', { method: 'PUT' });
    expect(isFavourite('song-1')).toBe(true);
  });

  it('puts the heart back when Navidrome refuses', async () => {
    seedFavourite('song-1', true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'down' }) }));
    await expect(setFavourite('song-1', false)).rejects.toThrow('down');
    expect(isFavourite('song-1')).toBe(true);
  });
});
