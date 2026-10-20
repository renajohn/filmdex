import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import musicService from '../services/musicService';
import { player, resetPlayer } from '../services/player';
import { GRACE_MS, summaryOf, useListenNextPlay } from './ListenNextPlay';

const lengths = {
  '1:0': { discs: 1, tracks: 10, durationSec: 2400, missing: 0 },
  '2:0': { discs: 3, tracks: 50, durationSec: 13200, missing: 0 },
  '2:2': { discs: 1, tracks: 16, durationSec: 4200, missing: 0 },
  '3:0': { discs: 1, tracks: 8, durationSec: 1800, missing: 2 },
};

describe('the line under Listen Next', () => {
  it('counts the discs, the tracks and the length', () => {
    expect(summaryOf([{ id: 1 }, { id: 2 }], lengths, null, false)).toBe('4 discs · 60 tracks · 4 h 20');
  });

  it('says the length is about when some tracks have none, and counts a digital album apart', () => {
    expect(summaryOf([{ id: 1 }, { id: 3, titleStatus: 'digital' }], lengths, null, false)).toBe('1 disc · 1 digital · 18 tracks · ~1 h 10');
  });

  it('tells the time left while it plays, the album playing by what is left of it', () => {
    expect(summaryOf([{ id: 1 }, { id: 2 }], lengths, { key: '1:0', leftSec: 600 }, false)).toBe('4 discs · 60 tracks · ~3 h 50 left');
    // With Repeat on it never ends: the whole length.
    expect(summaryOf([{ id: 1 }, { id: 2 }], lengths, { key: '1:0', leftSec: 600 }, true)).toBe('4 discs · 60 tracks · 4 h 20');
  });

  it('counts one disc of an album as one disc, of its own length', () => {
    expect(summaryOf([{ id: 1 }, { id: 2, disc: 2 }], lengths, null, false)).toBe('2 discs · 26 tracks · 1 h 50');
  });
});

describe('useListenNextPlay', () => {
  const departure = { id: 9, albumId: 2, disc: 0, collectionOrder: 2, leftAt: 1, beforeKey: '3:0', album: { id: 2, title: 'Two' } };
  const state = { repeat: false, playlistId: 'pl', departures: [departure], ripped: [1, 3], lengths: {} };

  beforeEach(() => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    });
    vi.spyOn(musicService, 'getListenNextPlay').mockResolvedValue(state);
    vi.spyOn(musicService, 'keepListenNextDeparture').mockResolvedValue({ albums: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    resetPlayer();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mount = (albums: Array<{ id: number }>, setAlbums = vi.fn()) =>
    renderHook(({ list }) => useListenNextPlay(list, async () => undefined, setAlbums), { initialProps: { list: albums } });

  it('shows an album that left at its place, greyed for its grace, then takes it off for good', async () => {
    const { result } = mount([{ id: 1 }, { id: 3 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.items.map(item => item.id)).toEqual([1, 2, 3]);
    expect(result.current.leavingState('2:0')).toMatchObject({ departureId: 9, collapsing: false });

    await act(async () => { await vi.advanceTimersByTimeAsync(GRACE_MS); });
    expect(result.current.leavingState('2:0')?.collapsing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.items.map(item => item.id)).toEqual([1, 3]);
    expect(window.localStorage.getItem('dexvault.listenNext.seenDepartures')).toBe('[9]');
  });

  it('Keep here puts it back in the list', async () => {
    const setAlbums = vi.fn();
    const { result } = mount([{ id: 1 }, { id: 3 }], setAlbums);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    await act(async () => { await result.current.keep(9); });

    expect(musicService.keepListenNextDeparture).toHaveBeenCalledWith(9);
    expect(setAlbums).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('waits for the album to stop playing before its grace starts', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))));
    player.playAlbum({ id: 2, title: 'Two', artist: '', cover: null }, [{ songId: 's', title: 's', disc: 1, no: 1, durationSec: 10 }]);
    const { result } = mount([{ id: 1 }, { id: 3 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.items.map(item => item.id)).toEqual([1, 2, 3]);
    expect(result.current.leavingState('2:0')).toBeNull();

    act(() => player.stop());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.leavingState('2:0')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
