import { describe, it, expect } from 'vitest';
import { playerTracksOf } from './playAlbum';
import type { RipTracks } from '../services/musicService';

const file = (discNumber: number, track: number, title: string) => ({
  id: `s${discNumber}-${track}`, url: null, discNumber, track, title, durationSec: 200,
  suffix: 'flac', bitRate: null, bitDepth: 16, samplingRate: 44100, channelCount: 2, size: null, path: null,
});

const rip = (tracks: ReturnType<typeof file>[]): RipTracks =>
  ({ configured: true, found: true, album: { id: 'nd-1', name: 'This Is the Life' }, tracks } as unknown as RipTracks);

describe('playerTracksOf', () => {
  it('plays the CD’s tracks that have a file, with the CD’s titles', () => {
    const album = { id: 1, title: 'A', discs: [{ number: 1, tracks: [{ no: 1, title: 'One' }, { no: 2, title: 'Two' }] }] };

    expect(playerTracksOf(album, rip([file(1, 2, 'two.flac')])).map(track => [track.songId, track.title]))
      .toEqual([['s1-2', 'Two']]);
  });

  it('plays the rip as it is when DexVault knows no tracks of the album, a wish say', () => {
    const wish = { id: 249, title: 'This Is the Life', discs: [] };

    expect(playerTracksOf(wish, rip([file(1, 2, 'This Is the Life'), file(1, 1, 'Mr. Rock & Roll')])).map(track => [track.no, track.title]))
      .toEqual([[1, 'Mr. Rock & Roll'], [2, 'This Is the Life']]);
  });

  it('has nothing to play without a rip', () => {
    expect(playerTracksOf({ id: 1, title: 'A', discs: [] }, null)).toEqual([]);
  });
});
