import musicService, { type RipTracks } from '../services/musicService';
import { player, type PlayerAlbum, type PlayOptions, type PlayerTrack } from '../services/player';
import { ripFileFor } from './trackDetail';
import { openListen } from './navidrome';

interface AlbumLike {
  id: number | string;
  title: string;
  artist?: string | string[];
  cover?: string | null;
  discs?: Array<{ number: number; tracks: Array<{ no?: number | string; title: string; durationSec?: number }> }>;
}

/** The album as the player names it: on the bar, on the Mac's controls; its rip ties it to Navidrome's. */
export const playerAlbumOf = (album: AlbumLike, rip?: RipTracks | null): PlayerAlbum => ({
  id: Number(album.id),
  navidromeId: rip?.album?.id ?? null,
  url: rip?.album?.url ?? null,
  title: album.title,
  artist: Array.isArray(album.artist) ? album.artist.join(', ') : album.artist || '',
  cover: musicService.getImageUrl(album.cover),
});

/**
 * The CD's tracks that have a file in the rip, in the CD's order, with its
 * titles. An album DexVault knows no tracks of (a wish, say, whose files
 * Navidrome has) plays the rip as it is, in its order, with its titles.
 */
export const playerTracksOf = (album: AlbumLike, rip: RipTracks | null | undefined): PlayerTrack[] => {
  if (!rip?.found) return [];
  const known = (album.discs || []).some(disc => disc.tracks.length > 0);
  if (!known) {
    return rip.tracks
      .filter(file => file.id)
      .sort((a, b) => a.discNumber - b.discNumber || a.track - b.track)
      .map(file => ({ songId: file.id!, title: file.title, disc: file.discNumber, no: file.track, durationSec: file.durationSec ?? null, starred: file.starred }));
  }
  return (album.discs || []).flatMap(disc => disc.tracks.flatMap(track => {
    const file = ripFileFor(rip.tracks, disc.number, Number(track.no));
    return file?.id
      ? [{ songId: file.id, title: track.title, disc: disc.number, no: Number(track.no), durationSec: file.durationSec ?? track.durationSec ?? null, starred: file.starred }]
      : [];
  }));
};

/** An album as the player would play it: named, with its tracks that have a file in the rip. */
export const loadPlayable = async (albumId: number | string): Promise<{ album: PlayerAlbum; tracks: PlayerTrack[] }> => {
  const [album, rip] = await Promise.all([
    musicService.getAlbumById(albumId) as Promise<AlbumLike>,
    musicService.getNavidromeTracks(albumId).catch(() => null),
  ]);
  return { album: playerAlbumOf(album, rip), tracks: playerTracksOf(album, rip) };
};

/**
 * Plays an album from the start, or from its track `index`, from wherever a ▶
 * stands without its card open: its tracks and its rip are asked for first.
 * False when it has no rip to play, for the caller to offer something else.
 */
export const playAlbumById = async (albumId: number | string, options?: PlayOptions, index = 0): Promise<boolean> => {
  const { album, tracks } = await loadPlayable(albumId);
  if (tracks.length === 0) return false;
  player.playAlbum(album, tracks, index, 0, options);
  return true;
};

/**
 * On an iPhone, the album plays in Amperfy, as its card's Listen does: false
 * when it has no rip to play.
 */
export const listenAlbumById = async (albumId: number | string): Promise<boolean> => {
  const rip = await musicService.getNavidromeTracks(albumId).catch(() => null);
  if (!rip?.found || !rip.album) return false;
  openListen(rip.album);
  return true;
};
