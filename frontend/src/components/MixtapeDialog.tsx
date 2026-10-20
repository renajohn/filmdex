import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BsBoxArrowUpRight, BsCassetteFill, BsCheck2, BsGripVertical, BsHeadphones, BsPauseFill, BsPencil, BsPlayFill, BsShuffle, BsThreeDots, BsTrash, BsX } from 'react-icons/bs';
import Dialog from './shared/Dialog';
import Menu from './shared/Menu';
import Button, { IconButton } from './shared/Button';
import TextField from './shared/TextField';
import NowPlayingBars from './shared/NowPlayingBars';
import { Loading } from './shared/Spinner';
import Notice from './shared/Notice';
import toast from './shared/Toast';
import { confirm } from './shared/ConfirmDialog';
import musicService, { type MixtapeDetails } from '../services/musicService';
import { player, usePlayer } from '../services/player';
import { playAlbumById } from '../utils/playAlbum';
import { mixtapeArtists } from '../utils/mixtape';
import { forgetMixtape, noteMixtape } from '../utils/mixtapeStore';
import './MixtapeDialog.css';

interface MixtapeDialogProps {
  albumId: number;
  onClose: () => void;
  /** A song's CD, opened over the mixtape. */
  onOpenAlbum: (albumId: number) => void;
  /** In or out of Listen Next, renamed, its songs changed or deleted: the page reads again. */
  onChange?: () => void;
}

const time = (seconds: number | null): string => {
  if (seconds == null) return '';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const length = (mixtape: MixtapeDetails): string => {
  const seconds = mixtape.songs.reduce((total, song) => total + (song.durationSec || 0), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
};

/**
 * A mixtape's card: its mosaic, Play, Shuffle and Listen Next on the left; its songs
 * on the right, in order and without numbers, each with the cover of its CD
 * (a click opens the CD's card over this one). A song's title plays the
 * mixtape from there; its grip moves it, its ✕ takes that copy out. The name
 * is changed in place. Every change goes to Navidrome first.
 */
const MixtapeDialog: React.FC<MixtapeDialogProps> = ({ albumId, onClose, onOpenAlbum, onChange }) => {
  const [mixtape, setMixtape] = useState<MixtapeDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inListenNext, setInListenNext] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  // The player's tracks here, and the place in the mixtape of the one playing: shuffled, the two orders differ.
  const tracks = usePlayer(state => (state.album?.id === albumId ? state.tracks : null));
  const placeNow = usePlayer(state => {
    const track = state.album?.id === albumId ? state.tracks[state.index] : undefined;
    return track ? track.place ?? track.no - 1 : null;
  });
  const shuffledHere = Boolean(tracks?.some((track, at) => (track.place ?? at) !== at));
  const playing = usePlayer(state => state.playing);
  const nameField = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [details, listenNext] = await Promise.all([
        musicService.getMixtape(albumId),
        musicService.getListenNextAlbums().catch(() => []) as Promise<Array<{ id: number }>>,
      ]);
      setMixtape(details);
      noteMixtape(details);
      setInListenNext(listenNext.some(album => album.id === albumId));
    } catch {
      setError('This mixtape could not be read from Navidrome.');
    }
  }, [albumId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (renaming != null) nameField.current?.select(); }, [renaming != null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sends a change, the mixtape as Navidrome then has it in its place. */
  const change = async (edit: Parameters<typeof musicService.updateMixtape>[1], undoTo?: string[], said?: React.ReactNode) => {
    setBusy(true);
    try {
      const details = await musicService.updateMixtape(albumId, edit);
      setMixtape(details);
      noteMixtape(details);
      onChange?.();
      if (said) {
        toast(said, {
          tone: 'success',
          ...(undoTo ? { action: { label: 'Undo', onClick: () => { change({ songs: undoTo }); } } } : {}),
        });
      }
    } catch {
      toast('The mixtape was not changed: Navidrome did not answer', { tone: 'danger' });
      load();
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (!name || !mixtape || name === mixtape.album.title) return;
    await change({ name });
  };

  /**
   * From a song: playing here, shuffled or not, it is found in the player's
   * order, which goes on after it. Play starts again in the mixtape's order,
   * Shuffle in a new one.
   */
  const play = async (at: number, how: 'from' | 'inOrder' | 'shuffled' = 'from') => {
    const shuffle = how === 'shuffled';
    const there = how !== 'from' || !tracks ? -1 : tracks.findIndex((track, i) => (track.place ?? i) === at);
    if (there >= 0) {
      player.playTrack(there);
      return;
    }
    if (!(await playAlbumById(albumId, undefined, at, shuffle).catch(() => false))) toast(`Could not play ${mixtape?.album.title ?? 'the mixtape'}`, { tone: 'danger' });
  };

  const toggleListenNext = async () => {
    try {
      await musicService.toggleListenNext(albumId);
      setInListenNext(!inListenNext);
      onChange?.();
    } catch {
      toast('Listen Next was not changed', { tone: 'danger' });
    }
  };

  const remove = async () => {
    if (!mixtape) return;
    const yes = await confirm({
      title: `Delete ${mixtape.album.title}?`,
      message: `The mixtape goes from Navidrome too, and from Amperfy${inListenNext ? ', and leaves Listen Next' : ''}. Its tracks stay on their albums.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!yes) return;
    try {
      await musicService.deleteMixtape(albumId);
      forgetMixtape(albumId);
      onChange?.();
      onClose();
      toast(<><b>{mixtape.album.title}</b> deleted</>, { tone: 'success' });
    } catch {
      toast('The mixtape was not deleted: Navidrome did not answer', { tone: 'danger' });
    }
  };

  const drop = (to: number) => {
    const from = dragFrom;
    setDragFrom(null);
    setDropAt(null);
    if (from == null || !mixtape || to === from || to === from + 1) return;
    // Dropped before the song at `to`: once taken out, the songs after it move up by one.
    change({ move: { from, to: to > from ? to - 1 : to } });
  };

  const title = renaming != null ? (
    <span className="mixtape-rename">
      <TextField ref={nameField} size="sm" value={renaming} maxLength={200} aria-label="Name of the mixtape"
        onChange={event => setRenaming(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') saveName();
          if (event.key === 'Escape') { event.stopPropagation(); setRenaming(null); }
        }} />
      <IconButton label="Save the name" tone="confirm" onClick={saveName}><BsCheck2 /></IconButton>
      <IconButton label="Cancel" onClick={() => setRenaming(null)}><BsX /></IconButton>
    </span>
  ) : (
    <button type="button" className="mixtape-name" title="Rename" onClick={() => mixtape && setRenaming(mixtape.album.title)}>
      {mixtape?.album.title ?? 'Mixtape'}
    </button>
  );

  const more = mixtape && (
    <Menu align="end" label="More" trigger={props => (
      <IconButton {...props} label="More"><BsThreeDots /></IconButton>
    )}>
      <Menu.Item icon={<BsPencil />} onSelect={() => setRenaming(mixtape.album.title)}>Rename</Menu.Item>
      <Menu.Item icon={<BsBoxArrowUpRight />} hint="new tab" onSelect={() => window.open(mixtape.url, '_blank', 'noopener')}>Open in Navidrome</Menu.Item>
      <Menu.Separator />
      <Menu.Item icon={<BsTrash />} danger onSelect={remove}>Delete mixtape…</Menu.Item>
    </Menu>
  );

  return (
    <Dialog onClose={onClose} size="lg" className="mixtape-dialog above-player" backdropClassName="above-player-backdrop" icon={<BsCassetteFill />} title={title} aside={more}>
      {error ? (
        <Dialog.Body><Notice tone="warning">{error}</Notice></Dialog.Body>
      ) : !mixtape ? (
        <Dialog.Body><Loading>Reading the mixtape…</Loading></Dialog.Body>
      ) : (
        <Dialog.Body className="mixtape-body">
          <aside className="mixtape-side">
            <div className="mixtape-cover">
              {mixtape.album.cover
                ? <img src={musicService.getImageUrl(mixtape.album.cover) ?? undefined} alt="" />
                : <span className="mixtape-nocover"><BsCassetteFill aria-hidden="true" /></span>}
            </div>
            <div>
              <div className="mixtape-artists">{mixtapeArtists(mixtape.album.artist)}</div>
              <div className="mixtape-facts">{mixtape.songs.length} {mixtape.songs.length === 1 ? 'track' : 'tracks'} · {length(mixtape)} · in Navidrome</div>
            </div>
            <div className="mixtape-actions">
              <Button variant="primary" icon={<BsPlayFill />} disabled={mixtape.songs.length === 0} onClick={() => play(0, shuffledHere ? 'inOrder' : 'from')}>Play</Button>
              <Button active={shuffledHere} icon={<BsShuffle />} disabled={mixtape.songs.length < 2}
                title={shuffledHere ? 'Playing shuffled: shuffle again' : 'Play in an order drawn at random'} onClick={() => play(0, 'shuffled')}>Shuffle</Button>
              <Button active={inListenNext} icon={<BsHeadphones />} onClick={toggleListenNext}>
                {inListenNext ? 'In Listen Next' : 'Listen Next'}
              </Button>
            </div>
          </aside>
          <div className={`mixtape-songs${busy ? ' mixtape-songs--busy' : ''}`}>
            {mixtape.songs.length === 0 && <p className="mixtape-empty">No track yet: add some from an album's card, with its cassette.</p>}
            {mixtape.songs.map((song, at) => {
              const now = placeNow === at;
              const twice = mixtape.songs.filter(one => one.songId === song.songId).length > 1;
              return (
                <div key={`${song.songId}-${at}`}
                  className={`mixtape-song${now ? ' mixtape-song--now' : ''}${dragFrom === at ? ' mixtape-song--dragging' : ''}${dropAt === at ? ' mixtape-song--drop' : ''}`}
                  draggable={!busy}
                  onDragStart={event => { setDragFrom(at); event.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
                  onDragOver={event => { if (dragFrom == null) return; event.preventDefault(); setDropAt(at); }}
                  onDrop={event => { event.preventDefault(); drop(at); }}>
                  <span className="mixtape-grip" title="Drag to move" aria-hidden="true"><BsGripVertical /></span>
                  {/* As in Apple Music: ▶ on the cover plays the mixtape from here; the album's name opens the CD. */}
                  <button type="button" className={`mixtape-thumb${now ? ' mixtape-thumb--now' : ''}`}
                    title={now ? (playing ? 'Pause' : 'Play') : 'Play from here'}
                    aria-label={now ? (playing ? `Pause ${song.title}` : `Play ${song.title}`) : `Play from ${song.title}`}
                    onClick={() => (now ? player.toggle() : play(at))}>
                    {song.cover ? <img src={musicService.getImageUrl(song.cover) ?? undefined} alt="" /> : <BsCassetteFill aria-hidden="true" />}
                    <span className="mixtape-thumb-play" aria-hidden="true">{now && playing ? <BsPauseFill /> : <BsPlayFill />}</span>
                  </button>
                  <div className="mixtape-song-text">
                    <button type="button" className="mixtape-song-play" onClick={() => play(at)} aria-current={now ? 'true' : undefined}>
                      <span className="mixtape-song-title">
                        {now && <NowPlayingBars playing={playing} />}
                        {song.title}
                        {twice && <span className="mixtape-twice"> · twice</span>}
                      </span>
                    </button>
                    <span className="mixtape-song-from">
                      {song.artist} · {song.albumId != null ? (
                        <button type="button" className="mixtape-song-album" title={`Open ${song.album}`} onClick={() => onOpenAlbum(song.albumId!)}>
                          {song.album}
                        </button>
                      ) : song.album}
                    </span>
                  </div>
                  <span className="mixtape-song-time">{time(song.durationSec)}</span>
                  <IconButton size="sm" className="mixtape-song-remove" label={`Take ${song.title} out`} title="Take out" disabled={busy}
                    onClick={() => change({ removeAt: at }, mixtape.songs.map(one => one.songId), <><b>{song.title}</b> taken out</>)}>
                    <BsX />
                  </IconButton>
                </div>
              );
            })}
            {/* Dropped after the last song. */}
            {dragFrom != null && (
              <div className={`mixtape-drop-end${dropAt === mixtape.songs.length ? ' mixtape-song--drop' : ''}`}
                onDragOver={event => { event.preventDefault(); setDropAt(mixtape.songs.length); }}
                onDrop={event => { event.preventDefault(); drop(mixtape.songs.length); }} />
            )}
            {mixtape.songs.length > 0 && <div className="mixtape-total">{mixtape.songs.length} {mixtape.songs.length === 1 ? 'track' : 'tracks'} · {length(mixtape)}</div>}
          </div>
        </Dialog.Body>
      )}
    </Dialog>
  );
};

export default MixtapeDialog;
