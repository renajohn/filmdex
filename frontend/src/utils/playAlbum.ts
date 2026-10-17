import musicService, { type RipTracks } from '../services/musicService';
import { player, type PlayerAlbum, type PlayerTrack } from '../services/player';
import { ripFileFor } from './trackDetail';

interface AlbumLike {
  id: number | string;
  title: string;
  artist?: string | string[];
  cover?: string | null;
  discs?: Array<{ number: number; tracks: Array<{ no?: number | string; title: string; durationSec?: number }> }>;
}

/** The album as the player names it: on the bar, on the Mac's controls. */
export const playerAlbumOf = (album: AlbumLike): PlayerAlbum => ({
  id: Number(album.id),
  title: album.title,
  artist: Array.isArray(album.artist) ? album.artist.join(', ') : album.artist || '',
  cover: musicService.getImageUrl(album.cover),
});

/** The CD's tracks that have a file in the rip, in the CD's order, with its titles. */
export const playerTracksOf = (album: AlbumLike, rip: RipTracks | null | undefined): PlayerTrack[] =>
  (album.discs || []).flatMap(disc => disc.tracks.flatMap(track => {
    const file = rip?.found ? ripFileFor(rip.tracks, disc.number, Number(track.no)) : null;
    return file?.id
      ? [{ songId: file.id, title: track.title, disc: disc.number, no: Number(track.no), durationSec: file.durationSec ?? track.durationSec ?? null }]
      : [];
  }));

/**
 * Plays an album from the start, from wherever a ▶ stands without its card
 * open: its tracks and its rip are asked for first. False when it has no rip
 * to play, for the caller to offer something else.
 */
export const playAlbumById = async (albumId: number | string): Promise<boolean> => {
  const [album, rip] = await Promise.all([
    musicService.getAlbumById(albumId) as Promise<AlbumLike>,
    musicService.getNavidromeTracks(albumId).catch(() => null),
  ]);
  const tracks = playerTracksOf(album, rip);
  if (tracks.length === 0) return false;
  player.playAlbum(playerAlbumOf(album), tracks, 0);
  return true;
};
