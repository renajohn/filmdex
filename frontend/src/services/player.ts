import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../utils/safeStorage';

/** A file of the rip, as the player plays it. */
export interface PlayerTrack {
  songId: string;
  title: string;
  disc: number;
  no: number;
  durationSec: number | null;
}

/** The album a play belongs to, for the bar, the cards and the Mac's own controls. */
export interface PlayerAlbum {
  /** The CD in DexVault; null for an album Navidrome has and the collection does not. */
  id: number | null;
  /** The album in Navidrome, and its page there, when known. */
  navidromeId?: string | null;
  url?: string | null;
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
}

export interface PlayerState {
  album: PlayerAlbum | null;
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
}

const RESUME_KEY = 'dexvault.player.resume';
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

let state: PlayerState = {
  album: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false,
  resume: typeof window !== 'undefined' ? readResume() : null, error: null,
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

const current = (): HTMLAudioElement => audios[active];
const spare = (): HTMLAudioElement => audios[1 - active];

const post = (songId: string, submission: boolean) => {
  fetch(`/api/music/navidrome/scrobble/${encodeURIComponent(songId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submission }),
  }).catch(() => undefined);
};

const saveResume = () => {
  if (!state.album || state.tracks.length === 0) return;
  const resume = { album: state.album, tracks: state.tracks, index: state.index, position: Math.floor(current()?.currentTime || state.position) };
  writeResume(resume);
};

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
  scrobbled = false;
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
  if (state.album) writeResume({ album: state.album, tracks: state.tracks, index, position: Math.floor(at) });
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
      if (state.index + 1 < state.tracks.length) start(state.index + 1);
      else {
        // The album is over: it can be played again from its card, from the start.
        writeResume({ album: state.album!, tracks: state.tracks, index: 0, position: 0 });
        set({ playing: false, position: 0, index: 0, resume: readResume() });
        current().src = streamUrl(state.tracks[0].songId);
        preloadNext();
      }
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
  /** Plays an album's tracks from `index`, the rest of the album after it. */
  playAlbum: (album: PlayerAlbum, tracks: PlayerTrack[], index = 0, at = 0) => {
    if (tracks.length === 0) return;
    setUp();
    set({ album, tracks, resume: null });
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

  next: () => {
    if (state.index + 1 < state.tracks.length) start(state.index + 1);
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

  /** ✕: stops, keeps where it was for Resume, and takes the bar away. */
  stop: () => {
    if (!state.album) return;
    saveResume();
    audios.forEach(audio => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
    waitingForBar?.disconnect();
    waitingForBar = null;
    set({ album: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false, resume: readResume() });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  },

  /** Plays on from where ✕ or a reload left it. */
  resume: () => {
    const saved = state.resume;
    if (!saved) return;
    player.playAlbum(saved.album, saved.tracks, saved.index, saved.position);
  },

  getState: (): PlayerState => state,
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
  state = { album: null, tracks: [], index: 0, playing: false, position: 0, duration: 0, barShown: false, resume: readResume(), error: null };
  listeners.forEach(listener => listener());
};
