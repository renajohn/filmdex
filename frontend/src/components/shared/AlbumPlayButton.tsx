import React, { useState } from 'react';
import { BsPauseFill, BsPlayFill } from 'react-icons/bs';
import { player, usePlayer } from '../../services/player';
import { playAlbumById } from '../../utils/playAlbum';
import NowPlayingBars from './NowPlayingBars';
import './AlbumPlayButton.css';

interface AlbumPlayButtonProps {
  albumId: number | string;
  title: string;
  /** Offers ▶ on an album that is not playing; without it, only the album playing wears the button. */
  offerPlay?: boolean;
  /** An album with no rip to play: its card, say, opens instead. */
  onUnripped?: () => void;
  className?: string;
}

/**
 * The round button on an album's cover: the album DexVault plays shows its
 * bars, ⏸ or ▶ under the pointer; another one shows ▶ on hover, when offered,
 * which plays it from the start.
 */
const AlbumPlayButton: React.FC<AlbumPlayButtonProps> = ({ albumId, title, offerPlay = false, onUnripped, className = '' }) => {
  const here = usePlayer(state => state.album?.id === Number(albumId));
  const playing = usePlayer(state => state.playing);
  const [loading, setLoading] = useState(false);

  if (!here && !offerPlay) return null;

  const click = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (here) {
      player.toggle();
      return;
    }
    setLoading(true);
    try {
      if (!(await playAlbumById(albumId))) onUnripped?.();
    } catch {
      onUnripped?.();
    } finally {
      setLoading(false);
    }
  };

  const label = here ? (playing ? `Pause ${title}` : `Play ${title} on`) : `Play ${title}`;
  return (
    <button type="button" className={`album-play-button${here ? ' album-play-button-here' : ''}${loading ? ' album-play-button-loading' : ''} ${className}`}
      onClick={click} aria-label={label} title={here ? (playing ? 'Pause' : 'Play on') : 'Play'} disabled={loading}>
      {here && <span className="album-play-button-bars"><NowPlayingBars playing={playing} /></span>}
      <span className="album-play-button-action" aria-hidden="true">
        {loading ? <span className="spinner-border spinner-border-sm" /> : here && playing ? <BsPauseFill /> : <BsPlayFill />}
      </span>
    </button>
  );
};

export default AlbumPlayButton;
