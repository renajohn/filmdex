import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AlbumEnd, PlayOptions } from './player';

const list = vi.hoisted(() => ({ ids: [] as number[], ripped: new Set<number>() }));
const plays = vi.hoisted(() => [] as Array<{ id: number; options: PlayOptions }>);

vi.mock('./musicService', () => ({
  default: { getListenNextAlbums: vi.fn(async () => list.ids.map(id => ({ id }))) },
}));
vi.mock('../utils/playAlbum', () => ({
  playAlbumById: vi.fn(async (id: number, options: PlayOptions) => {
    if (!list.ripped.has(id)) return false;
    plays.push({ id, options });
    return true;
  }),
}));

import { albumsAfter, listenNextQueue, resetListenNextQueue, withCurrent } from './listenNextQueue';

const playing = () => plays[plays.length - 1];
/** The album playing ends as `how` says; true when another one starts. */
const end = (how: Parameters<AlbumEnd>[0]) => playing().options.onAlbumEnd!(how);

beforeEach(() => {
  resetListenNextQueue();
  plays.length = 0;
  list.ids = [1, 2, 3];
  list.ripped = new Set([1, 2, 3]);
});

describe('the turn of Listen Next', () => {
  it('goes on after the album playing, from the top after the last; with Repeat, itself last', () => {
    expect(albumsAfter([1, 2, 3, 4], 2, false)).toEqual([3, 4, 1]);
    expect(albumsAfter([1, 2, 3], 2, true)).toEqual([3, 1, 2]);
    expect(albumsAfter([1, 2], null, false)).toEqual([1, 2]);
  });

  it('keeps an album that left the list at its place, after the one before it still there', () => {
    expect(withCurrent([1, 3, 4], [1, 2, 3, 4], 2)).toEqual([1, 2, 3, 4]);
    expect(withCurrent([3, 4], [1, 2, 3, 4], 2)).toEqual([2, 3, 4]);
    expect(withCurrent([1, 2], [1, 2], 2)).toEqual([1, 2]);
  });
});

describe('listenNextQueue', () => {
  it('plays from the top, skipping an album with no rip, and plays the next one when an album ends', async () => {
    list.ripped.delete(1);
    expect(await listenNextQueue.start()).toBe(true);
    expect(playing().id).toBe(2);
    expect(playing().options.queue).toBe('listenNext');

    list.ids = [1, 3];
    expect(await end('ended')).toBe(true);
    expect(playing().id).toBe(3);
  });

  it('starts from the album asked for, and puts the ones before it at the end of the turn', async () => {
    await listenNextQueue.start(2);
    expect(playing().id).toBe(2);
    list.ids = [1, 3];
    await end('ended');
    expect(playing().id).toBe(3);
    list.ids = [1];
    await end('ended');
    expect(playing().id).toBe(1);
  });

  it('plays an album added before the one playing at the end of the turn', async () => {
    await listenNextQueue.start(2);
    list.ids = [9, 2, 3];
    list.ripped.add(9);
    await end('skipped');
    expect(playing().id).toBe(3);
    await end('skipped');
    expect(playing().id).toBe(9);
  });

  it('stops when the turn comes back to an album skipped, Repeat off', async () => {
    await listenNextQueue.start();
    await end('skipped');
    expect(playing().id).toBe(2);
    list.ids = [1];
    expect(await end('ended')).toBe(false);
  });

  it('goes round for ever with Repeat on', async () => {
    listenNextQueue.setRepeat(true);
    list.ids = [1];
    await listenNextQueue.start();
    expect(await end('ended')).toBe(true);
    expect(plays.map(play => play.id)).toEqual([1, 1]);
  });

  it('leaves an album taken out by hand once its track ends, not one that left once played', async () => {
    await listenNextQueue.start();
    const { leaveAfterTrack } = playing().options;
    expect(leaveAfterTrack!()).toBe(false);
    const { player } = await import('./player');
    vi.spyOn(player, 'getState').mockReturnValue({ ...player.getState(), queue: 'listenNext' });

    listenNextQueue.noteList([2, 3]);
    expect(leaveAfterTrack!()).toBe(true);

    window.dispatchEvent(new CustomEvent('dexvault:listen-next-left', { detail: { albumId: 1 } }));
    expect(leaveAfterTrack!()).toBe(false);
  });
});
