import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsChatQuote, BsHeart, BsHeartFill, BsMusicNoteList, BsPauseFill, BsPlayFill, BsSkipBackwardFill, BsSkipForwardFill, BsX } from 'react-icons/bs';
import { player, usePlayer } from '../services/player';
import { seedFavourite, setFavourite, useFavourite } from '../services/favourites';
import toast from './shared/Toast';
import PlayerTracks from './PlayerTracks';
// Listen Next registers itself with the player, to go on after a reload whatever the page; the bar asks it what comes next.
import { listenNextQueue } from '../services/listenNextQueue';
import musicService from '../services/musicService';
import { loadPlayable } from '../utils/playAlbum';
import './PlayerBar.css';

/** The bar's height, which the rest of the app gives up while it is out. */
const BAR_HEIGHT = 54;

const time = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The next track is announced this long before the one playing ends. */
const ANNOUNCE_SEC = 10;

/** What comes after the album playing in Listen Next: the albums' length, the first track of the next. */
interface Ahead {
  seconds: number;
  first: { title: string; artist: string } | null;
}

/**
 * Of Listen Next, what is left after the album playing: read as an album
 * starts (`started`, its tracks, change even when the same album starts
 * again) and as it plays on after a pause, the list having moved meanwhile.
 */
const useListenNextAhead = (albumId: number | null | undefined, fromListenNext: boolean, started: unknown, playing: boolean): Ahead | null => {
  const [ahead, setAhead] = useState<Ahead | null>(null);
  useEffect(() => {
    // Kept while read again, for the time left not to jump; gone out of Listen Next.
    if (!fromListenNext || albumId == null) {
      setAhead(null);
      return undefined;
    }
    let live = true;
    const ids = listenNextQueue.upcoming(albumId);
    Promise.all([
      musicService.getListenNextPlay().catch(() => null),
      ids.length > 0 ? loadPlayable(ids[0], { listenNext: true }).catch(() => null) : Promise.resolve(null),
    ]).then(([play, next]) => {
      if (!live) return;
      const seconds = ids.reduce((sum, id) => sum + (play?.lengths[id]?.durationSec || 0), 0);
      const track = next?.tracks[0];
      setAhead({ seconds, first: track ? { title: track.title, artist: track.artist ?? next!.album.artist } : null });
    });
    return () => { live = false; };
  }, [albumId, fromListenNext, started, playing]);
  return ahead;
};

/** A time left: "38 min", "1 h 12". */
const leftText = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};

/**
 * What DexVault plays, at the foot of every page: the cover, the track and
 * its album, ♥ and the words; ⏮ ⏯ ⏭ and the track's time; what is left
 * of the album, the tracks and ✕. It takes its own room, so nothing goes
 * under it: the pages and the album's card end above it.
 */
const PlayerBar: React.FC = () => {
  const navigate = useNavigate();
  const album = usePlayer(state => state.album);
  const track = usePlayer(state => state.tracks[state.index]);
  // From a list, ⏭ on an album's last track goes on to the next album.
  const hasNext = usePlayer(state => state.index + 1 < state.tracks.length || state.queue !== null);
  const playing = usePlayer(state => state.playing);
  const position = usePlayer(state => state.position);
  const duration = usePlayer(state => state.duration);
  const shown = usePlayer(state => state.barShown);
  const error = usePlayer(state => state.error);
  const lyricsOpen = usePlayer(state => state.lyricsOpen);
  const favourite = useFavourite(track?.songId);
  const [tracksOpen, setTracksOpen] = useState(false);

  // The heart the track had when the album was started, unless the card has told a newer one since.
  useEffect(() => { if (track) seedFavourite(track.songId, track.starred, true); }, [track]);

  // The room the bar takes, for the pages and the cards: --player-h on the root.
  useEffect(() => {
    document.documentElement.style.setProperty('--player-h', shown ? `${BAR_HEIGHT}px` : '0px');
  }, [shown]);

  // What the bar last showed, kept while it slides away after ✕.
  const last = useRef<{ album: NonNullable<typeof album>; track: NonNullable<typeof track> } | null>(null);
  if (album && track) last.current = { album, track };
  const out = Boolean(shown && album && track);
  // Back where the album was started (the Digital page's tab), else the CD's card, else the album in Navidrome.
  const open = () => {
    // A song of a mixtape: the CD it comes from.
    if (track?.albumId != null) navigate(`/musicdex?album=${track.albumId}`);
    else if (album?.from) navigate(album.from);
    else if (album?.id != null) navigate(`/musicdex?album=${album.id}`);
    else if (album?.url) window.open(album.url, '_blank', 'noopener');
  };
  const length = duration || track?.durationSec || 0;
  const tracks = usePlayer(state => state.tracks);
  const index = usePlayer(state => state.index);
  const fromListenNext = usePlayer(state => state.queue === 'listenNext');
  const ahead = useListenNextAhead(album?.id, fromListenNext, tracks, playing);
  // What is left: this track's end, the tracks after it, and of Listen Next the albums after this one.
  const left = Math.max(0, length - position) + tracks.slice(index + 1).reduce((sum, one) => sum + (one.durationSec || 0), 0)
    + (ahead?.seconds ?? 0);
  // The track after this one, in the album or, at its end, the next album of Listen Next.
  const following = tracks[index + 1]
    ? { title: tracks[index + 1].title, artist: tracks[index + 1].artist ?? album?.artist ?? '' }
    : ahead?.first ?? null;
  const announcing = Boolean(following && length > 0 && length - position <= ANNOUNCE_SEC);
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (length > 0) player.seek(((event.clientX - box.left) / box.width) * length);
  };

  return (
    <div className={`player-bar${out ? ' player-bar-out' : ''}`} role="region" aria-label="Player" aria-hidden={!out}>
      {last.current && (() => {
        const { album, track } = last.current;
        // A song of a mixtape shows the cover of its CD, and leads there.
        const cover = track.cover !== undefined ? { src: track.cover, title: `the CD of ${track.title}` } : { src: album.cover, title: album.title };
        return (
        <>
          <div className={`player-bar-progress${playing ? '' : ' player-bar-progress--paused'}`} role="slider" aria-label="Position in the track"
            aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(position)}
            aria-valuetext={`${time(position)} of ${time(length)}`} tabIndex={0} onClick={seek}
            onKeyDown={event => {
              if (event.key === 'ArrowRight') player.seek(position + 10);
              if (event.key === 'ArrowLeft') player.seek(position - 10);
            }}>
            <span style={{ width: `${length > 0 ? Math.min(100, (position / length) * 100) : 0}%` }} />
          </div>
          {/* Three parts: what plays, its words and its ♥; the transport and the track's time; what is left, the tracks and ✕. */}
          <div className="player-bar-inner">
            <div className="player-bar-now">
              {/* The cover opens the album's card (a mixtape's song: its CD's); the track's name, the tracks to jump to. */}
              <div className="player-bar-album">
                <button type="button" className="player-bar-cover" onClick={open} title={`Open ${cover.title}`} aria-label={`Open ${cover.title}`}>
                  {cover.src ? <img src={cover.src} alt="" /> : <span className="player-bar-nocover" aria-hidden="true" />}
                </button>
                {/* The name opens the tracks; a mixtape's name, under it, opens the mixtape's card. */}
                <div className="player-bar-meta" onClick={() => setTracksOpen(true)} title="Tracks">
                  <button type="button" className="player-bar-track" onClick={event => { event.stopPropagation(); setTracksOpen(true); }}>
                    {track.title}
                  </button>
                  <span className="player-bar-from">
                    {error || (track.artist != null ? (
                      <>
                        {track.artist} · <button type="button" className="player-bar-mixtape" title={`Open ${album.title}`}
                          onClick={event => { event.stopPropagation(); if (album.id != null) navigate(`/musicdex?album=${album.id}`); }}>
                          {album.title}
                        </button>
                      </>
                    ) : `${album.title} · ${album.artist}`)}
                  </span>
                </div>
              </div>
              {/* The words, in their panel on the left: of an album DexVault holds, on a desktop. */}
              {album.id != null && (
                <button type="button" className={`player-bar-button player-bar-lyrics${lyricsOpen ? ' player-bar-lyrics-on' : ''}`}
                  onClick={() => player.showLyrics()} aria-label="Lyrics" aria-pressed={lyricsOpen} title="Lyrics">
                  <BsChatQuote aria-hidden="true" />
                </button>
              )}
              {/* The track's heart, kept in Navidrome: the card's ♥ follows. */}
              <button type="button" className={`player-bar-button player-bar-favourite${favourite ? ' player-bar-favourite-on' : ''}`}
                onClick={() => setFavourite(track.songId, !favourite)
                  .catch(error => toast(`Could not change the favourite: ${(error as Error).message}`, { tone: 'danger' }))}
                aria-label={favourite ? 'Remove from the favourites' : 'Add to the favourites'} aria-pressed={favourite}
                title={favourite ? 'Favourite' : 'Add to the favourites'}>
                {favourite ? <BsHeartFill aria-hidden="true" /> : <BsHeart aria-hidden="true" />}
              </button>
            </div>
            <div className="player-bar-transport">
              <span className="player-bar-time player-bar-time--now">{time(position)}</span>
              <button type="button" className="player-bar-button player-bar-previous" onClick={() => player.previous()} aria-label="Previous">
                <BsSkipBackwardFill aria-hidden="true" />
              </button>
              <button type="button" className="player-bar-button player-bar-play" onClick={() => player.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <BsPauseFill aria-hidden="true" /> : <BsPlayFill aria-hidden="true" />}
              </button>
              <button type="button" className="player-bar-button" onClick={() => player.next()} disabled={!hasNext} aria-label="Next">
                <BsSkipForwardFill aria-hidden="true" />
              </button>
              <span className="player-bar-time">{time(length)}</span>
            </div>
            <div className="player-bar-tools">
              {/* What is left to hear, of the album or the mixtape, or of Listen Next; in a track's
                  last seconds, what comes next fades in before it, and out once it plays. */}
              <span className="player-bar-ahead">
                {following && (
                  <button type="button" className={`player-bar-next${announcing ? '' : ' player-bar-ahead--off'}`} tabIndex={announcing ? 0 : -1}
                    aria-hidden={!announcing} title="Play it now" onClick={() => player.next()}>
                    Up next: <b>{following.title}</b>{following.artist && <> by {following.artist}</>}
                  </button>
                )}
                {following && left > 0 && (
                  <span className={`player-bar-next-dot${announcing ? '' : ' player-bar-ahead--off'}`} aria-hidden="true">•</span>
                )}
                {left > 0 && (
                  <span className="player-bar-left" title={`${leftText(left)} left of ${fromListenNext ? 'Listen Next' : album.title}`}>{leftText(left)}</span>
                )}
              </span>
              {/* The tracks, to jump to one: of Listen Next, of its albums. */}
              <button type="button" className={`player-bar-button player-bar-tracks${tracksOpen ? ' player-bar-tracks-on' : ''}`}
                onClick={() => setTracksOpen(true)} aria-label="Tracks" aria-pressed={tracksOpen} title="Tracks">
                <BsMusicNoteList aria-hidden="true" />
              </button>
              <span className="player-bar-rule" aria-hidden="true" />
              <button type="button" className="player-bar-button player-bar-stop" onClick={() => player.stop()} aria-label="Stop" title="Stop">
                <BsX aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
        );
      })()}
      <PlayerTracks show={tracksOpen && out} onClose={() => setTracksOpen(false)} />
    </div>
  );
};

export default PlayerBar;
