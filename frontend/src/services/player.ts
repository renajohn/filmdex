import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../utils/safeStorage';

/** A file of the rip, as the player plays it. */
export interface PlayerTrack {
  songId: string;
  title: string;
  disc: number;
  no: number;
  durationSec: number | null;
  /** Hearted in Navidrome when the album was started: the bar's ♥ until it knows better. */
  starred?: boolean;
}

/** The album a play belongs to, for the bar, the cards and the Mac's own controls. */
export interface PlayerAlbum {
  /** The CD in DexVault; null for an album Navidrome has and the collection does not. */
  id: number | null;
  /** The album in Navidrome, and its page there, when known. */
  navidromeId?: string | null;
  url?: string | null;
  /** Where it was started, for the bar to lead back there: the Digital page's tab, say. */
  from?: string | null;
  title: string;
  artist: string;
  cover: string | null;
}

/** Where a play was left, kept in the browser: Navidrome's own saved queue is shared with Amperfy. */
export interface PlayerResume {
  album: PlayerAlbum;
  tracks: PlayerTrack[];
  index: number;
  position: number;
  /** The bar was out: a reload brings it back, paused there. False once ✕ took it away. */
  barOpen?: boolean;
  /** The list the album was played from, to go on with once it is over. */
  queue?: PlayerQueue | null;
}

/** A list the player goes on with once an album is over: Listen Next. */
export type PlayerQueue = 'listenNext';

/**
 * What a list does when an album is over: played to its end, skipped with ⏭
 * on its last track, or taken out of the list by hand while it played. True
 * when it went on with another album.
 */
export type AlbumEnd = (how: 'ended' | 'skipped' | 'removed') => Promise<boolean>;

export interface PlayOptions {
  queue?: PlayerQueue;
  onAlbumEnd?: AlbumEnd;
  /** Asked at the end of each track: the album is to be left there, taken out of its list. */
  leaveAfterTrack?: () => boolean;
  /** A track of the album was counted as played, as Navidrome is told. */
  onCounted?: () => void;
}

export interface PlayerState {
  album: PlayerAlbum | null;
  /** The list the album is played from, null for an album played alone. */
  queue: PlayerQueue | null;
  tracks: PlayerTrack[];
  index: number;
  playing: boolean;
  /** Seconds into the track, and its length once the file says it. */
  position: number;
  duration: number;
  /** Whether the bar at the foot of the screen is out. */
  barShown: boolean;
  /** What ✕ or a reload left, to resume from the album's card. */
  resume: PlayerResume | null;
  error: string | null;
  /** The words of the track, in their panel along the left edge, on a desktop. */
  lyricsOpen: boolean;
}

const RESUME_KEY = 'dexvault.player.resume';
/** The words were out: they come out again with the next play, in this browser. */
const LYRICS_KEY = 'dexvault.player.lyrics';
/** A play counts once half the track is heard, or four minutes of it, as the other players count it. */
const SCROBBLE_AFTER_SEC = 240;
/** ⏮ goes back to the start of the track past this many seconds, to the one before within them. */
const RESTART_AFTER_SEC = 3;

const streamUrl = (songId: string) => `/api/music/navidrome/stream/${encodeURIComponent(songId)}`;

const readResume = (): PlayerResume | null => {
  try {
    const raw = readStored(RESUME_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && Array.isArray(value.tracks) && value.album ? value : null;
  } catch {
    return null;
  }
};

/** A private window keeps nothing: Resume is a convenience. An empty value stands for none. */
const writeResume = (resume: PlayerResume | null) => writeStored(RESUME_KEY, resume ? JSON.stringify(resume) : '');

const readLyricsOpen = (): boolean => readStored(LYRICS_KEY) === '1';

let state: PlayerState = {
  album: null, queue: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false,
  resume: typeof window !== 'undefined' ? readResume() : null, error: null,
  lyricsOpen: typeof window !== 'undefined' ? readLyricsOpen() : false,
};
const listeners = new Set<() => void>();
const set = (changes: Partial<PlayerState>) => {
  state = { ...state, ...changes };
  listeners.forEach(listener => listener());
};

/*
 * Two audio elements: the one playing, and the next track loading in the
 * other, so the step from one to the next is as short as a browser allows.
 */
let audios: HTMLAudioElement[] = [];
let active = 0;
let scrobbled = false;
let announced = false;
let lastSaved = 0;
let waitingForBar: MutationObserver | null = null;
let options: PlayOptions = {};

/** An album of Listen Next that left it once played, as the server answered a scrobble. */
export const LISTEN_NEXT_LEFT_EVENT = 'dexvault:listen-next-left';

const current = (): HTMLAudioElement => audios[active];
const spare = (): HTMLAudioElement => audios[1 - active];

const post = (songId: string, submission: boolean) => {
  fetch(`/api/music/navidrome/scrobble/${encodeURIComponent(songId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submission }),
  })
    .then(response => (response.ok ? response.json() : null))
    .then(body => {
      if (body?.left) window.dispatchEvent(new CustomEvent(LISTEN_NEXT_LEFT_EVENT, { detail: body.left }));
    })
    .catch(() => undefined);
};

/** The album is over: the list it is played from goes on, or it waits on its first track to be played again. */
const endAlbum = (how: 'ended' | 'skipped' | 'removed') => {
  const finish = () => {
    if (!state.album || state.tracks.length === 0) return;
    writeResume(here(0, 0));
    set({ playing: false, position: 0, index: 0, resume: readResume() });
    current().src = streamUrl(state.tracks[0].songId);
    preloadNext();
  };
  const goOn = options.onAlbumEnd;
  if (!goOn) {
    if (how !== 'skipped') finish();
    return;
  }
  const album = state.album;
  goOn(how).then(played => { if (!played && state.album === album) finish(); }, () => { if (state.album === album) finish(); });
};

/** Where the play is, kept: the bar is out while an album is in the player. */
const here = (index: number, position: number, barOpen = true): PlayerResume | null =>
  state.album ? { album: state.album, tracks: state.tracks, index, position: Math.floor(position), barOpen, queue: state.queue } : null;

const saveResume = (barOpen = true) => {
  if (!state.album || state.tracks.length === 0) return;
  writeResume(here(state.index, current()?.currentTime || state.position, barOpen));
};

/** Whether a track heard up to `at` seconds was counted already: half of it, or four minutes. */
const countedAt = (track: PlayerTrack, at: number) =>
  at >= SCROBBLE_AFTER_SEC || (Boolean(track.durationSec) && at >= (track.durationSec as number) / 2);

/** Loads the track after the current one into the spare element, ready to take over. */
const preloadNext = () => {
  const next = state.tracks[state.index + 1];
  const other = spare();
  if (!other) return;
  if (!next) {
    other.removeAttribute('src');
    return;
  }
  const url = streamUrl(next.songId);
  if (!other.src.endsWith(url)) {
    other.src = url;
    other.preload = 'auto';
    other.load();
  }
};

const updateMediaSession = () => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !state.album) return;
  const track = state.tracks[state.index];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.title || '',
      artist: state.album.artist,
      album: state.album.title,
      artwork: state.album.cover ? [{ src: new URL(state.album.cover, window.location.href).href }] : [],
    });
    navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
  } catch { /* an older browser: the keys still work through the audio element */ }
};

/** Starts the track at `index` from `at` seconds, on the element already holding it when it is the spare. */
const start = (index: number, at = 0) => {
  const track = state.tracks[index];
  if (!track) return;
  const url = streamUrl(track.songId);
  current().pause();
  if (spare().src.endsWith(url)) active = 1 - active;
  const audio = current();
  if (!audio.src.endsWith(url)) audio.src = url;
  // Played on from where it was left: counted then already if far enough in.
  scrobbled = countedAt(track, at);
  announced = false;
  set({ index, position: at, duration: track.durationSec || 0, playing: true, error: null });
  const play = () => {
    if (at > 0) audio.currentTime = at;
    audio.play().catch(error => set({ playing: false, error: (error as Error).message }));
  };
  if (at > 0 && audio.readyState < 1) audio.addEventListener('loadedmetadata', play, { once: true });
  else play();
  preloadNext();
  updateMediaSession();
  // Where it starts, kept at once: a reload right away still offers Resume.
  writeResume(here(index, at));
};

/**
 * The bar comes out as soon as something plays, unless an album's card is
 * open: its foot would jump under the pointer, so the bar waits for the card
 * to close. Once out, it stays, cards or not.
 */
const revealBar = () => {
  if (state.barShown) return;
  const blocked = () => document.body.classList.contains('modal-open');
  if (!blocked()) {
    set({ barShown: true });
    return;
  }
  if (waitingForBar) return;
  waitingForBar = new MutationObserver(() => {
    if (blocked() || !state.album) return;
    waitingForBar?.disconnect();
    waitingForBar = null;
    set({ barShown: true });
  });
  waitingForBar.observe(document.body, { attributes: true, attributeFilter: ['class'] });
};

const setUp = () => {
  if (audios.length > 0 || typeof Audio === 'undefined') return;
  audios = [new Audio(), new Audio()];
  audios.forEach((audio, which) => {
    audio.preload = 'auto';
    const mine = () => which === active;
    audio.addEventListener('timeupdate', () => {
      if (!mine()) return;
      const position = audio.currentTime;
      const duration = Number.isFinite(audio.duration) ? audio.duration : state.duration;
      set({ position, duration });
      const track = state.tracks[state.index];
      if (track && !scrobbled && duration > 0 && (position >= duration / 2 || position >= SCROBBLE_AFTER_SEC)) {
        scrobbled = true;
        post(track.songId, true);
        options.onCounted?.();
      }
      if (Math.abs(position - lastSaved) >= 5) {
        lastSaved = position;
        saveResume();
      }
    });
    audio.addEventListener('playing', () => {
      if (!mine()) return;
      const track = state.tracks[state.index];
      if (track && !announced) {
        announced = true;
        post(track.songId, false);
      }
      set({ playing: true });
      updateMediaSession();
    });
    audio.addEventListener('pause', () => {
      if (!mine() || audio.ended) return;
      set({ playing: false });
      saveResume();
      updateMediaSession();
    });
    audio.addEventListener('ended', () => {
      if (!mine()) return;
      if (options.leaveAfterTrack?.()) endAlbum('removed');
      else if (state.index + 1 < state.tracks.length) start(state.index + 1);
      // The album is over: its list goes on, or it can be played again from its card, from the start.
      else endAlbum('ended');
    });
    audio.addEventListener('error', () => {
      if (!mine() || !audio.src) return;
      set({ playing: false, error: 'Could not play this track from Navidrome' });
    });
  });
  if ('mediaSession' in navigator) {
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => player.toggle(true)],
      ['pause', () => player.toggle(false)],
      ['nexttrack', () => player.next()],
      ['previoustrack', () => player.previous()],
      ['seekto', details => { if (details.seekTime != null) player.seek(details.seekTime); }],
    ];
    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* not every action everywhere */ }
    }
  }
};

export const player = {
  /** Plays an album's tracks from `index`, the rest of the album after it; a list goes on after it when given. */
  playAlbum: (album: PlayerAlbum, tracks: PlayerTrack[], index = 0, at = 0, playOptions: PlayOptions = {}) => {
    if (tracks.length === 0) return;
    setUp();
    options = playOptions;
    set({ album, queue: playOptions.queue ?? null, tracks, resume: null });
    writeResume(null);
    spare().removeAttribute('src');
    start(Math.max(0, Math.min(index, tracks.length - 1)), at);
    revealBar();
  },

  /** Pauses or plays on; `playing` forces one or the other, as the Mac's keys ask. */
  toggle: (playing?: boolean) => {
    if (!state.album) return;
    const audio = current();
    const want = playing ?? audio.paused;
    if (want) audio.play().catch(error => set({ error: (error as Error).message }));
    else audio.pause();
  },

  /** The next track; on the last one, the next album of the list it is played from. */
  next: () => {
    if (state.index + 1 < state.tracks.length) start(state.index + 1);
    else if (options.onAlbumEnd) endAlbum('skipped');
  },

  /** Another track of the album playing, from its start, the list it is played from kept. */
  playTrack: (index: number) => {
    if (!state.album || !state.tracks[index]) return;
    start(index);
  },

  /** Back to the start of the track, or to the one before in its first seconds. */
  previous: () => {
    if (current().currentTime > RESTART_AFTER_SEC || state.index === 0) player.seek(0);
    else start(state.index - 1);
  },

  seek: (seconds: number) => {
    const audio = current();
    if (!audio) return;
    audio.currentTime = Math.max(0, seconds);
    set({ position: audio.currentTime });
  },

  /** ✕: stops, keeps where it was for Resume, and takes the bar away: a reload does not bring it back. */
  stop: () => {
    if (!state.album) return;
    saveResume(false);
    audios.forEach(audio => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
    waitingForBar?.disconnect();
    waitingForBar = null;
    options = {};
    set({ album: null, queue: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false, resume: readResume() });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  },

  /** Plays on from where ✕ or a reload left it. */
  resume: () => {
    const saved = state.resume;
    if (!saved) return;
    player.playAlbum(saved.album, saved.tracks, saved.index, saved.position);
  },

  /** Shows or hides the words; without `open`, the other way from now. */
  showLyrics: (open?: boolean) => {
    const lyricsOpen = open ?? !state.lyricsOpen;
    writeStored(LYRICS_KEY, lyricsOpen ? '1' : '');
    set({ lyricsOpen });
  },

  /** Seconds into the track now, finer than `position`, which the audio element updates a few times a second. */
  currentTime: (): number => current()?.currentTime ?? state.position,

  getState: (): PlayerState => state,
};

/**
 * A list that goes on once an album is over registers how to pick it up
 * again after a reload: the player cannot import the list, the list imports
 * the player.
 */
const queues = new Map<PlayerQueue, (albumId: number) => PlayOptions>();
let waitingQueue: { queue: PlayerQueue; album: PlayerAlbum } | null = null;

export const registerQueue = (queue: PlayerQueue, restore: (albumId: number) => PlayOptions): void => {
  queues.set(queue, restore);
  if (waitingQueue?.queue === queue && state.album === waitingQueue.album && waitingQueue.album.id != null) {
    options = restore(waitingQueue.album.id);
    waitingQueue = null;
  }
};

/**
 * After a reload: the bar comes back, paused where the play was, its track in
 * the audio element at its moment. No sound until ▶: a browser plays nothing
 * a click has not asked for.
 */
export const restorePlayer = (): void => {
  const saved = readResume();
  if (!saved?.barOpen || saved.tracks.length === 0 || typeof Audio === 'undefined') return;
  setUp();
  const index = Math.max(0, Math.min(saved.index, saved.tracks.length - 1));
  const track = saved.tracks[index];
  const queue = saved.queue ?? null;
  options = {};
  waitingQueue = null;
  if (queue && saved.album.id != null) {
    const restore = queues.get(queue);
    if (restore) options = restore(saved.album.id);
    else waitingQueue = { queue, album: saved.album };
  }
  set({ album: saved.album, queue, tracks: saved.tracks, index, playing: false, position: saved.position,
    duration: track.durationSec || 0, barShown: true, resume: null, error: null });
  if (waitingQueue) waitingQueue.album = state.album!;
  const audio = current();
  audio.src = streamUrl(track.songId);
  if (saved.position > 0) {
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = saved.position; }, { once: true });
    audio.currentTime = saved.position;
  }
  scrobbled = countedAt(track, saved.position);
  announced = false;
  preloadNext();
  updateMediaSession();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** A slice of the player's state; a component re-renders only when its slice changes. */
export function usePlayer<T>(select: (state: PlayerState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

/** For tests: back to nothing playing. */
export const resetPlayer = () => {
  audios = [];
  active = 0;
  waitingForBar?.disconnect();
  waitingForBar = null;
  options = {};
  waitingQueue = null;
  state = { album: null, queue: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false, resume: readResume(), error: null,
    lyricsOpen: readLyricsOpen() };
  listeners.forEach(listener => listener());
};

if (typeof window !== 'undefined') restorePlayer();
