import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LISTEN_NEXT_LEFT_EVENT, player, resetPlayer } from './player';

const album = { id: 7, title: 'Come Away With Me', artist: 'Norah Jones', cover: null };
const tracks = [
  { songId: 's1', title: 'Don’t Know Why', disc: 1, no: 1, durationSec: 186 },
  { songId: 's2', title: 'Seven Years', disc: 1, no: 2, durationSec: 145 },
];

/** The audio element DexVault plays through now. */
const playingAudio = (): HTMLAudioElement => {
  const audio = created.find(element => element.src.endsWith(`/stream/${player.getState().tracks[player.getState().index].songId}`));
  return audio!;
};
let created: HTMLAudioElement[] = [];

beforeEach(() => {
  created = [];
  const RealAudio = window.Audio;
  vi.stubGlobal('Audio', function Audio() {
    const element = new RealAudio();
    created.push(element);
    return element;
  });
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))));
  // This test environment has no localStorage of its own: a plain one stands in.
  const stored = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
  });
  document.body.classList.remove('modal-open');
  resetPlayer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('player', () => {
  it('plays an album from a track, from Navidrome through DexVault, the next one loading beside it', () => {
    player.playAlbum(album, tracks, 0);

    expect(player.getState()).toMatchObject({ album, index: 0, playing: true, barShown: true });
    expect(created.map(audio => audio.src)).toEqual([
      expect.stringContaining('/api/music/navidrome/stream/s1'),
      expect.stringContaining('/api/music/navidrome/stream/s2'),
    ]);
  });

  it('tells Navidrome the track is playing, then counts it once half of it is heard', () => {
    player.playAlbum(album, tracks, 0);
    const audio = playingAudio();
    audio.dispatchEvent(new Event('playing'));
    Object.defineProperty(audio, 'duration', { value: 186, configurable: true });
    audio.currentTime = 100;
    audio.dispatchEvent(new Event('timeupdate'));
    audio.dispatchEvent(new Event('timeupdate'));

    const calls = vi.mocked(fetch).mock.calls.map(([url, init]) => [url, JSON.parse(String(init?.body)).submission]);
    expect(calls).toEqual([['/api/music/navidrome/scrobble/s1', false], ['/api/music/navidrome/scrobble/s1', true]]);
  });

  it('waits for an album’s card to close before bringing the bar out, and keeps it out after', async () => {
    document.body.classList.add('modal-open');
    player.playAlbum(album, tracks, 1);
    expect(player.getState().barShown).toBe(false);

    document.body.classList.remove('modal-open');
    await Promise.resolve();
    expect(player.getState().barShown).toBe(true);

    document.body.classList.add('modal-open');
    await Promise.resolve();
    expect(player.getState().barShown).toBe(true);
  });

  it('stops on ✕, keeps the place for Resume, and plays on from it', () => {
    player.playAlbum(album, tracks, 1);
    playingAudio().currentTime = 42;
    player.stop();

    expect(player.getState()).toMatchObject({ album: null, barShown: false, resume: { album, index: 1, position: 42 } });
    player.resume();
    expect(player.getState()).toMatchObject({ album, index: 1, position: 42, resume: null });
  });

  it('goes back to the start of a track, or to the one before in its first seconds', () => {
    player.playAlbum(album, tracks, 1);
    playingAudio().currentTime = 30;
    player.previous();
    expect(player.getState()).toMatchObject({ index: 1, position: 0 });
    player.previous();
    expect(player.getState().index).toBe(0);
  });
  it('goes on with its list once the album is over, or once ⏭ skips its last track', async () => {
    const onAlbumEnd = vi.fn(() => Promise.resolve(true));
    player.playAlbum(album, tracks, 1, 0, { queue: 'listenNext', onAlbumEnd });
    expect(player.getState().queue).toBe('listenNext');

    player.next();
    expect(onAlbumEnd).toHaveBeenLastCalledWith('skipped');

    playingAudio().dispatchEvent(new Event('ended'));
    expect(onAlbumEnd).toHaveBeenLastCalledWith('ended');
  });

  it('leaves an album taken out of its list once its track ends', () => {
    const onAlbumEnd = vi.fn(() => Promise.resolve(true));
    player.playAlbum(album, tracks, 0, 0, { queue: 'listenNext', onAlbumEnd, leaveAfterTrack: () => true });

    playingAudio().dispatchEvent(new Event('ended'));

    expect(onAlbumEnd).toHaveBeenCalledWith('removed');
  });

  it('waits on the first track of an album played alone once it is over, and ⏭ does nothing on its last', () => {
    player.playAlbum(album, tracks, 1);
    player.next();
    expect(player.getState().index).toBe(1);

    playingAudio().dispatchEvent(new Event('ended'));

    expect(player.getState()).toMatchObject({ index: 0, playing: false, queue: null });
  });

  it('tells the page an album of Listen Next left it, as the server answers a scrobble', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, left: { id: 3, albumId: 7 } })))));
    const heard = vi.fn();
    window.addEventListener(LISTEN_NEXT_LEFT_EVENT, heard);
    player.playAlbum(album, tracks, 0);
    const audio = playingAudio();
    Object.defineProperty(audio, 'duration', { value: 186, configurable: true });
    audio.currentTime = 100;
    audio.dispatchEvent(new Event('timeupdate'));

    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 3, albumId: 7 });
    window.removeEventListener(LISTEN_NEXT_LEFT_EVENT, heard);
  });
});
