import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsPauseFill, BsPlayFill, BsSkipBackwardFill, BsSkipForwardFill, BsX } from 'react-icons/bs';
import { player, usePlayer } from '../services/player';
import './PlayerBar.css';

/** The bar's height, which the rest of the app gives up while it is out. */
const BAR_HEIGHT = 54;

const time = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * What DexVault plays, at the foot of every page: the cover, the track and
 * its album, the time, ⏮ ⏯ ⏭ and ✕. It takes its own room, so nothing goes
 * under it: the pages and the album's card end above it.
 */
const PlayerBar: React.FC = () => {
  const navigate = useNavigate();
  const album = usePlayer(state => state.album);
  const track = usePlayer(state => state.tracks[state.index]);
  const hasNext = usePlayer(state => state.index + 1 < state.tracks.length);
  const playing = usePlayer(state => state.playing);
  const position = usePlayer(state => state.position);
  const duration = usePlayer(state => state.duration);
  const shown = usePlayer(state => state.barShown);
  const error = usePlayer(state => state.error);

  // The room the bar takes, for the pages and the cards: --player-h on the root.
  useEffect(() => {
    document.documentElement.style.setProperty('--player-h', shown ? `${BAR_HEIGHT}px` : '0px');
  }, [shown]);

  // What the bar last showed, kept while it slides away after ✕.
  const last = useRef<{ album: NonNullable<typeof album>; track: NonNullable<typeof track> } | null>(null);
  if (album && track) last.current = { album, track };
  const out = Boolean(shown && album && track);
  const open = () => album && navigate(`/musicdex?album=${album.id}`);
  const length = duration || track?.durationSec || 0;
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (length > 0) player.seek(((event.clientX - box.left) / box.width) * length);
  };

  return (
    <div className={`player-bar${out ? ' player-bar-out' : ''}`} role="region" aria-label="Player" aria-hidden={!out}>
      {last.current && (() => {
        const { album, track } = last.current;
        return (
        <>
          <div className="player-bar-progress" role="slider" aria-label="Position in the track"
            aria-valuemin={0} aria-valuemax={Math.round(length)} aria-valuenow={Math.round(position)}
            aria-valuetext={`${time(position)} of ${time(length)}`} tabIndex={0} onClick={seek}
            onKeyDown={event => {
              if (event.key === 'ArrowRight') player.seek(position + 10);
              if (event.key === 'ArrowLeft') player.seek(position - 10);
            }}>
            <span style={{ width: `${length > 0 ? Math.min(100, (position / length) * 100) : 0}%` }} />
          </div>
          <div className="player-bar-inner">
            <button type="button" className="player-bar-album" onClick={open} title={`Open ${album.title}`}>
              {album.cover ? <img src={album.cover} alt="" /> : <span className="player-bar-nocover" aria-hidden="true" />}
              <span className="player-bar-meta">
                <span className="player-bar-track">{track.title}</span>
                <span className="player-bar-from">{error || `${album.title} · ${album.artist}`}</span>
              </span>
            </button>
            <span className="player-bar-time">{time(position)} / {time(length)}</span>
            <button type="button" className="player-bar-button player-bar-previous" onClick={() => player.previous()} aria-label="Previous">
              <BsSkipBackwardFill aria-hidden="true" />
            </button>
            <button type="button" className="player-bar-button player-bar-play" onClick={() => player.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <BsPauseFill aria-hidden="true" /> : <BsPlayFill aria-hidden="true" />}
            </button>
            <button type="button" className="player-bar-button" onClick={() => player.next()} disabled={!hasNext} aria-label="Next">
              <BsSkipForwardFill aria-hidden="true" />
            </button>
            <button type="button" className="player-bar-button player-bar-stop" onClick={() => player.stop()} aria-label="Stop" title="Stop">
              <BsX aria-hidden="true" />
            </button>
          </div>
        </>
        );
      })()}
    </div>
  );
};

export default PlayerBar;
