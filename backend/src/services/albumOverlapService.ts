import Album from '../models/album';
import Track from '../models/track';

export interface AlbumOverlap {
  id: number;
  title: string;
  artist: string[];
  cover: string | null;
  titleStatus: string;
  format: string | null;
  /** How many of this album's tracks it holds too, and how many tracks it has. */
  shared: number;
  trackCount: number;
  /** This album's tracks it holds, in their order. */
  tracks: Array<{ disc: number; no: number; title: string }>;
}

/**
 * The other albums of the collection holding some of an album's tracks, the most first: what "Also on" shows on
 * an album's card, to tell an album another one makes redundant. A track is the same by its recording.
 */
const overlaps = async (albumId: number): Promise<AlbumOverlap[]> => {
  const rows = await Track.sharedWith(albumId);
  const byAlbum = new Map<number, typeof rows>();
  for (const row of rows) byAlbum.set(row.album_id, [...(byAlbum.get(row.album_id) || []), row]);
  if (byAlbum.size === 0) return [];

  const counts = new Map<number, number>();
  for (const track of await Track.findByAlbumIds([...byAlbum.keys()])) {
    counts.set(track.albumId, (counts.get(track.albumId) || 0) + 1);
  }
  const albums = await Promise.all([...byAlbum].map(async ([id, shared]) => {
    const album = await Album.findById(id);
    if (!album) return null;
    const overlap: AlbumOverlap = {
      id,
      title: album.title,
      artist: album.artist,
      cover: album.cover,
      titleStatus: album.titleStatus || 'owned',
      format: album.format,
      shared: shared.length,
      trackCount: counts.get(id) || shared.length,
      tracks: shared.map(row => ({ disc: row.disc_number, no: row.track_number, title: row.track_title })),
    };
    return overlap;
  }));
  return albums
    .filter((album): album is AlbumOverlap => album !== null)
    .sort((a, b) => b.shared - a.shared || a.title.localeCompare(b.title));
};

export default { overlaps };
