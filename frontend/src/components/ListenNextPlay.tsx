import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BsArrowCounterclockwise, BsCheckLg, BsPauseFill, BsPlayFill, BsRepeat } from 'react-icons/bs';
import musicService, { type AlbumLength, type ListenNextDeparture, type ListenNextPlayState } from '../services/musicService';
import { LISTEN_NEXT_LEFT_EVENT, player, usePlayer, type PlayerState } from '../services/player';
import { listenNextQueue } from '../services/listenNextQueue';
import { amperfyUrl, isAppleMobile } from '../utils/navidrome';
import { readStored, writeStored } from '../utils/safeStorage';
import CoverButton from './shared/CoverButton';
import './ListenNextPlay.css';

/** How long an album played to its end stays on the page, greyed, to be kept. */
export const GRACE_MS = 10_000;
const COLLAPSE_MS = 600;
/** Played in Amperfy: the page finds out when it is looked at again, or within a minute while it is. */
const POLL_MS = 60_000;
const SEEN_KEY = 'dexvault.listenNext.seenDepartures';

interface ListAlbum {
  id: number;
  title?: string;
  titleStatus?: string;
  [key: string]: unknown;
}

/** An album leaving the list, as the banner shows it. */
type LeavingItem = ListAlbum & { departureId: number };

const readSeen = (): Set<number> => {
  try {
    const value = JSON.parse(readStored(SEEN_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.filter((id: unknown) => typeof id === 'number') : []);
  } catch {
    return new Set();
  }
};

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Seconds left of the album the player plays from Listen Next, with its id; null otherwise. */
const remainingOf = (state: PlayerState): string | null => {
  if (state.queue !== 'listenNext' || !state.album?.id) return null;
  const after = state.tracks.slice(state.index + 1).reduce((sum, track) => sum + (track.durationSec || 0), 0);
  const left = Math.max(0, (state.duration || 0) - state.position) + after;
  // By the minute: the banner need not draw again at each tick.
  return `${state.album.id}:${Math.ceil(left / 60) * 60}`;
};

/**
 * Playing Listen Next from its banner: Repeat, the albums leaving it once
 * played, kept here or not, and their lengths. The list itself stays the
 * page's (`albums`), read again with `refreshAlbums`.
 */
export const useListenNextPlay = (albums: ListAlbum[], refreshAlbums: () => Promise<unknown>, setAlbums: (albums: ListAlbum[]) => void) => {
  const [play, setPlay] = useState<ListenNextPlayState | null>(null);
  const [seen, setSeen] = useState<Set<number>>(readSeen);
  const [startedAt, setStartedAt] = useState<Record<number, number>>({});
  const [collapsing, setCollapsing] = useState<Set<number>>(() => new Set());
  const playingId = usePlayer(state => (state.playing ? state.album?.id ?? null : null));

  const load = useCallback(async () => {
    try {
      const state = await musicService.getListenNextPlay();
      setPlay(state);
      listenNextQueue.setRepeat(state.repeat);
    } catch {
      // Without it the banner is the list alone, as before.
    }
  }, []);

  const reload = useCallback(() => Promise.all([refreshAlbums(), load()]), [refreshAlbums, load]);

  useEffect(() => {
    const looked = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', looked);
    window.addEventListener('focus', looked);
    window.addEventListener(LISTEN_NEXT_LEFT_EVENT, reload);
    const timer = setInterval(looked, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', looked);
      window.removeEventListener('focus', looked);
      window.removeEventListener(LISTEN_NEXT_LEFT_EVENT, reload);
      clearInterval(timer);
    };
  }, [load, reload]);

  // Listen Next can change while it plays here: the player goes by the list as it now is.
  // A new album has a length to tell, and maybe no rip.
  const ids = albums.map(album => album.id).join(',');
  useEffect(() => {
    listenNextQueue.noteList(ids ? ids.split(',').map(Number) : []);
    load();
  }, [ids, load]);

  const markSeen = useCallback((departureId: number) => {
    setSeen(previous => {
      const next = new Set(previous).add(departureId);
      writeStored(SEEN_KEY, JSON.stringify([...next].slice(-100)));
      return next;
    });
  }, []);

  /** Departures to show: not seen in this browser, and not back in the list. */
  const departures = useMemo(() => (play?.departures || [])
    .filter(departure => !seen.has(departure.id) && !albums.some(album => album.id === departure.albumId)),
  [play, seen, albums]);

  // The grace starts once the album is no longer playing: its last track goes on to its end first.
  useEffect(() => {
    const now = Date.now();
    const waiting = departures.filter(departure => startedAt[departure.id] == null && departure.albumId !== playingId);
    if (waiting.length > 0) setStartedAt(previous => ({ ...previous, ...Object.fromEntries(waiting.map(departure => [departure.id, now])) }));
  }, [departures, playingId, startedAt]);

  useEffect(() => {
    const timers = departures
      .filter(departure => startedAt[departure.id] != null && !collapsing.has(departure.id))
      .map(departure => setTimeout(() => {
        setCollapsing(previous => new Set(previous).add(departure.id));
        setTimeout(() => markSeen(departure.id), reduceMotion() ? 0 : COLLAPSE_MS);
      }, Math.max(0, startedAt[departure.id] + GRACE_MS - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [departures, startedAt, collapsing, markSeen]);

  /** The list with the albums leaving it at their places. */
  const items = useMemo(() => {
    const list: Array<ListAlbum | LeavingItem> = [...albums];
    for (const departure of departures) {
      const item: LeavingItem = { ...(departure.album as ListAlbum), departureId: departure.id };
      const at = departure.beforeAlbumId == null ? -1 : list.findIndex(album => album.id === departure.beforeAlbumId);
      if (at < 0) list.push(item);
      else list.splice(at, 0, item);
    }
    return list;
  }, [albums, departures]);

  const departureOf = useCallback((albumId: number): ListenNextDeparture | undefined =>
    departures.find(departure => departure.albumId === albumId), [departures]);

  const keep = useCallback(async (departureId: number) => {
    try {
      const result = await musicService.keepListenNextDeparture(departureId);
      setAlbums(result.albums as ListAlbum[]);
    } finally {
      markSeen(departureId);
      load();
    }
  }, [setAlbums, markSeen, load]);

  const setRepeat = useCallback(async (repeat: boolean) => {
    setPlay(previous => (previous ? { ...previous, repeat } : previous));
    listenNextQueue.setRepeat(repeat);
    try {
      await musicService.setListenNextRepeat(repeat);
    } catch {
      load();
    }
  }, [load]);

  return {
    play, items, departureOf, keep, setRepeat,
    /** An album leaving: greyed, its ring running down; one still playing its last track is not yet. */
    leavingState: (albumId: number): { departureId: number; startedAt: number; collapsing: boolean } | null => {
      const departure = departureOf(albumId);
      if (!departure || startedAt[departure.id] == null) return null;
      return { departureId: departure.id, startedAt: startedAt[departure.id], collapsing: collapsing.has(departure.id) };
    },
    /** Taken out of the banner at once, as ✕ on a card leaving already. */
    dismiss: markSeen,
  };
};

interface ControlsProps {
  count: number;
  play: ListenNextPlayState | null;
  onRepeat: (repeat: boolean) => void;
}

/** ▶ and Repeat, in the banner's header in place of its count. */
export const ListenNextControls: React.FC<ControlsProps> = ({ count, play, onRepeat }) => {
  const here = usePlayer(state => state.queue === 'listenNext' && state.album !== null);
  const playing = usePlayer(state => state.playing);
  const [starting, setStarting] = useState(false);
  const appleMobile = isAppleMobile();
  const repeat = play?.repeat ?? false;
  const nothing = play !== null && (appleMobile ? !play.playlistId : play.ripped.length === 0);
  const albums = `${count} album${count === 1 ? '' : 's'}`;

  const click = async () => {
    if (appleMobile) {
      if (play?.playlistId) window.location.href = amperfyUrl(play.playlistId, 'playlist', { repeat });
      return;
    }
    if (here) {
      player.toggle();
      return;
    }
    setStarting(true);
    try {
      await listenNextQueue.start();
    } finally {
      setStarting(false);
    }
  };

  const pause = here && playing;
  const title = nothing ? 'Nothing ripped yet' : pause ? 'Pause Listen Next' : `Play Listen Next · ${albums}${appleMobile ? ' in Amperfy' : ''}`;
  return (
    <span className="listen-next-controls">
      <CoverButton className="listen-next-controls__play" reveal="always" active={here || undefined}
        onClick={click} disabled={nothing || starting} title={title} label={title}>
        {starting ? <span className="spinner-border spinner-border-sm" /> : pause ? <BsPauseFill /> : <BsPlayFill />}
      </CoverButton>
      <button type="button" className={`listen-next-controls__repeat${repeat ? ' listen-next-controls__repeat--on' : ''}`}
        onClick={() => onRepeat(!repeat)} aria-pressed={repeat}
        title={repeat ? 'Repeat: keep albums once played' : 'Albums leave the list once played'}
        aria-label="Repeat">
        <BsRepeat />
      </button>
    </span>
  );
};

interface LeavingProps {
  title: string;
  startedAt: number;
  onKeep: () => void;
}

/** On a cover leaving the list: Played, and Keep here in a ring that runs down clockwise. */
export const LeavingOverlay: React.FC<LeavingProps> = ({ title, startedAt, onKeep }) => {
  // A card drawn again mid-way goes on where the ring was.
  const elapsed = Math.min(GRACE_MS, Date.now() - startedAt);
  return (
    <div className="listen-next-leaving" onClick={event => event.stopPropagation()}>
      <span className="cover-tag listen-next-leaving__played"><BsCheckLg aria-hidden="true" />Played</span>
      <CoverButton className="listen-next-leaving__keep" size="large" reveal="always" onClick={onKeep}
        title="Keep here" label={`Keep ${title} in Listen Next`}>
        <BsArrowCounterclockwise className="listen-next-leaving__icon" aria-hidden="true" />
        <svg className="listen-next-leaving__ring" viewBox="0 0 40 40" aria-hidden="true"
          style={{ '--leave-ms': `${GRACE_MS}ms`, '--leave-delay': `-${elapsed}ms` } as React.CSSProperties}>
          <circle className="listen-next-leaving__ring-track" cx="20" cy="20" r="18" />
          <circle className="listen-next-leaving__ring-left" cx="20" cy="20" r="18" />
        </svg>
      </CoverButton>
      <span className="listen-next-leaving__label">Keep here</span>
    </div>
  );
};

const formatLength = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
};

/** The words of the line under the cards: `5 CDs · 63 tracks · ~4 h 10`, or the time left while it plays. */
export const summaryOf = (
  albums: ListAlbum[], lengths: Record<number, AlbumLength>, playing: { albumId: number; leftSec: number } | null, repeat: boolean,
): string | null => {
  let discs = 0;
  let digital = 0;
  let tracks = 0;
  let seconds = 0;
  let missing = false;
  for (const album of albums) {
    const length = lengths[album.id];
    if (album.titleStatus === 'digital') digital++;
    else discs += Math.max(1, length?.discs || 0);
    if (!length) {
      missing = true;
      continue;
    }
    tracks += length.tracks;
    if (length.missing > 0) missing = true;
    if (!(playing && playing.albumId === album.id && !repeat)) seconds += length.durationSec;
  }
  const left = Boolean(playing) && !repeat;
  if (left && playing) seconds += playing.leftSec;
  const parts = [
    discs > 0 && `${discs} CD${discs === 1 ? '' : 's'}`,
    digital > 0 && `${digital} digital`,
    tracks > 0 && `${tracks} track${tracks === 1 ? '' : 's'}`,
    seconds > 0 && `${missing || left ? '~' : ''}${formatLength(seconds)}${left ? ' left' : ''}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
};

interface SummaryProps {
  albums: ListAlbum[];
  play: ListenNextPlayState | null;
}

export const ListenNextSummary: React.FC<SummaryProps> = ({ albums, play }) => {
  const remaining = usePlayer(remainingOf);
  if (!play) return null;
  const [albumId, leftSec] = remaining ? remaining.split(':').map(Number) : [];
  const text = summaryOf(albums, play.lengths, remaining ? { albumId, leftSec } : null, play.repeat);
  return text ? <div className="listen-next-summary">{text}</div> : null;
};
