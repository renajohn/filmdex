import { getDatabase } from '../database';
import PlaylistHistory from '../models/playlistHistory';
import Collection from '../models/collection';
import AlbumCollection from '../models/albumCollection';
import logger from '../logger';

const ALBUMS_PER_SUGGESTION = 1;
const RECENT_SUGGESTION_DAYS = 14;

interface AlbumForSelection {
  id: number;
  title: string;
  cover: string | null;
  artists: string[];
  genres: string[];
  isClassical: boolean;
}

interface CollectionRecord {
  id: number;
  name: string;
  type: string;
}

interface CollectionAlbum {
  id: number;
  [key: string]: unknown;
}

interface AlbumCollectionEntry {
  id: number;
  album_id: number;
  collection_id: number;
  collection_order: number | null;
}

interface SmartFillResult {
  added: AlbumForSelection[];
  message: string;
}

interface ShuffleResult {
  success: boolean;
  removed?: { id: number };
  added?: AlbumForSelection;
  message: string;
}

interface PlaylistStats {
  topArtists: Array<{ artist: string; albumCount: number }>;
  suggestionHistory: Array<{ album_id: number; suggestion_count: number }>;
}

// Ensure the table exists (for databases created before this feature)
let tableInitialized = false;
const ensureTableExists = async (): Promise<void> => {
  if (tableInitialized) return;
  try {
    await PlaylistHistory.createTable();
    tableInitialized = true;
  } catch (_error) {
    // Table might already exist, that's fine
    tableInitialized = true;
  }
};

/**
 * Smart Playlist Service
 *
 * Selects albums intelligently based on:
 * 1. Artist distribution - more albums by an artist = higher chance of selection
 * 2. Recent suggestion history - avoid repeating recently suggested albums
 * 3. Current Listen Next content - fill up to 3 albums
 */
const smartPlaylistService = {
  /**
   * Get artist distribution from the collection
   * Returns a map of artist -> count of albums
   */
  getArtistDistribution: (): Promise<Map<string, number>> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT artist, COUNT(*) as album_count
        FROM albums
        WHERE title_status = 'owned'
        GROUP BY artist
        ORDER BY album_count DESC
      `;
      db.all(sql, [], (err: Error | null, rows: Array<{ artist: string; album_count: number }>) => {
        if (err) {
          reject(err);
        } else {
          const distribution = new Map<string, number>();

          for (const row of rows || []) {
            try {
              const artists = JSON.parse(row.artist) as string | string[];
              const artistList = Array.isArray(artists) ? artists : [artists];

              for (const artist of artistList) {
                if (artist && typeof artist === 'string') {
                  const current = distribution.get(artist) || 0;
                  distribution.set(artist, current + row.album_count);
                }
              }
            } catch (_e) {
              if (row.artist) {
                const current = distribution.get(row.artist) || 0;
                distribution.set(row.artist, current + row.album_count);
              }
            }
          }

          resolve(distribution);
        }
      });
    });
  },

  /**
   * Get all albums with their artists and genres for selection
   */
  getAllAlbumsForSelection: (): Promise<AlbumForSelection[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT id, artist, title, cover, genres
        FROM albums
        WHERE title_status = 'owned'
      `;
      db.all(sql, [], (err: Error | null, rows: Array<{ id: number; artist: string; title: string; cover: string | null; genres: string | null }>) => {
        if (err) {
          reject(err);
        } else {
          const albums: AlbumForSelection[] = (rows || []).map(row => {
            let artists: string[] = [];
            let genres: string[] = [];
            try {
              const parsed = JSON.parse(row.artist) as string | string[];
              artists = Array.isArray(parsed) ? parsed : [parsed];
            } catch (_e) {
              artists = row.artist ? [row.artist] : [];
            }
            try {
              const parsedGenres = JSON.parse(row.genres || '[]') as string[];
              genres = Array.isArray(parsedGenres) ? parsedGenres : [];
            } catch (_e) {
              genres = [];
            }
            return {
              id: row.id,
              title: row.title,
              cover: row.cover,
              artists,
              genres,
              isClassical: genres.some(g => g && g.toLowerCase() === 'classical')
            };
          });
          resolve(albums);
        }
      });
    });
  },

  /**
   * Check if an album is classical based on its genres
   */
  isAlbumClassical: (albumId: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `SELECT genres FROM albums WHERE id = ?`;
      db.get(sql, [albumId], (err: Error | null, row: { genres: string | null } | undefined) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(false);
        } else {
          try {
            const genres = JSON.parse(row.genres || '[]') as string[];
            const isClassical = Array.isArray(genres) &&
              genres.some(g => g && g.toLowerCase() === 'classical');
            resolve(isClassical);
          } catch (_e) {
            resolve(false);
          }
        }
      });
    });
  },

  /**
   * Get current Listen Next album IDs
   */
  getCurrentListenNextIds: async (): Promise<number[]> => {
    try {
      const listenNextCollection = await Collection.findByType('listen_next') as CollectionRecord | null;
      if (!listenNextCollection) {
        return [];
      }

      const albums = await Collection.getAlbums(listenNextCollection.id) as unknown as CollectionAlbum[];
      return albums.map(a => a.id);
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      return [];
    }
  },

  /**
   * Weighted random selection based on artist distribution
   */
  selectAlbumsWeighted: (candidates: AlbumForSelection[], artistDistribution: Map<string, number>, count: number): AlbumForSelection[] => {
    if (candidates.length === 0 || count <= 0) {
      return [];
    }

    const weights = candidates.map(album => {
      let weight = 0;
      for (const artist of album.artists) {
        weight += artistDistribution.get(artist) || 1;
      }
      return Math.max(1, weight);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const selected: AlbumForSelection[] = [];
    const usedIndices = new Set<number>();

    while (selected.length < count && usedIndices.size < candidates.length) {
      let random = Math.random() * totalWeight;

      for (let i = 0; i < candidates.length; i++) {
        if (usedIndices.has(i)) continue;

        random -= weights[i];
        if (random <= 0) {
          selected.push(candidates[i]);
          usedIndices.add(i);
          break;
        }
      }

      // Fallback: if we didn't select anything, pick the first unused
      if (selected.length < usedIndices.size) {
        for (let i = 0; i < candidates.length; i++) {
          if (!usedIndices.has(i)) {
            selected.push(candidates[i]);
            usedIndices.add(i);
            break;
          }
        }
      }
    }

    return selected;
  },

  /**
   * Smart fill the Listen Next playlist
   */
  smartFillListenNext: async (): Promise<SmartFillResult> => {
    try {
      await ensureTableExists();

      const currentIds = await smartPlaylistService.getCurrentListenNextIds();
      const recentSuggestions = await PlaylistHistory.getRecentSuggestions(RECENT_SUGGESTION_DAYS) as number[];
      const excludeIds = new Set<number>([...currentIds, ...recentSuggestions]);

      const [allAlbums, artistDistribution] = await Promise.all([
        smartPlaylistService.getAllAlbumsForSelection(),
        smartPlaylistService.getArtistDistribution()
      ]);

      let candidates = allAlbums.filter(album =>
        !excludeIds.has(album.id) && !album.isClassical
      );

      if (candidates.length < ALBUMS_PER_SUGGESTION) {
        candidates = allAlbums.filter(album =>
          !currentIds.includes(album.id) && !album.isClassical
        );
      }

      if (candidates.length === 0) {
        return { added: [], message: 'No albums available for suggestion' };
      }

      const selectedAlbums = smartPlaylistService.selectAlbumsWeighted(
        candidates,
        artistDistribution,
        ALBUMS_PER_SUGGESTION
      );

      const listenNextCollection = await Collection.findByType('listen_next') as CollectionRecord | null;
      if (!listenNextCollection) {
        throw new Error('Listen Next collection not found');
      }

      const addedAlbums: AlbumForSelection[] = [];
      for (const album of selectedAlbums) {
        try {
          const position = await AlbumCollection.getNextOrder(listenNextCollection.id) as number;
          await AlbumCollection.create({
            album_id: album.id,
            collection_id: listenNextCollection.id,
            collection_order: position
          });
          addedAlbums.push(album);
        } catch (error) {
          logger.error(`Error adding album ${album.id} to Listen Next:`, error);
        }
      }

      if (addedAlbums.length > 0) {
        try {
          await PlaylistHistory.recordSuggestions(addedAlbums.map(a => a.id));
        } catch (error) {
          logger.error('Error recording suggestion history:', error);
        }
      }

      if (Math.random() < 0.1) {
        PlaylistHistory.cleanupOldHistory().catch((err: Error) => {
          logger.warn('Failed to cleanup playlist history:', err);
        });
      }

      return {
        added: addedAlbums,
        message: `Added ${addedAlbums.length} album${addedAlbums.length !== 1 ? 's' : ''} to Listen Next`
      };
    } catch (error) {
      logger.error('Error in smart fill:', error);
      throw error;
    }
  },

  /**
   * Get statistics about the smart playlist
   */
  getStats: async (): Promise<PlaylistStats> => {
    try {
      const [artistDistribution, suggestionCounts] = await Promise.all([
        smartPlaylistService.getArtistDistribution(),
        PlaylistHistory.getSuggestionCounts() as Promise<Array<{ album_id: number; suggestion_count: number }>>
      ]);

      const artistStats = Array.from(artistDistribution.entries())
        .map(([artist, count]) => ({ artist, albumCount: count }))
        .sort((a, b) => b.albumCount - a.albumCount)
        .slice(0, 20);

      return {
        topArtists: artistStats,
        suggestionHistory: suggestionCounts.slice(0, 20)
      };
    } catch (error) {
      logger.error('Error getting playlist stats:', error);
      throw error;
    }
  },

  /**
   * Shuffle a specific album in Listen Next - replace it with a new suggestion
   */
  shuffleAlbum: async (albumIdToReplace: number): Promise<ShuffleResult> => {
    try {
      await ensureTableExists();

      const isClassical = await smartPlaylistService.isAlbumClassical(albumIdToReplace);
      const currentIds = await smartPlaylistService.getCurrentListenNextIds();
      const recentSuggestions = await PlaylistHistory.getRecentSuggestions(RECENT_SUGGESTION_DAYS) as number[];
      const excludeIds = new Set<number>([...currentIds, ...recentSuggestions]);

      const [allAlbums, artistDistribution] = await Promise.all([
        smartPlaylistService.getAllAlbumsForSelection(),
        smartPlaylistService.getArtistDistribution()
      ]);

      let candidates = allAlbums.filter(album =>
        !excludeIds.has(album.id) && album.isClassical === isClassical
      );

      if (candidates.length === 0) {
        candidates = allAlbums.filter(album =>
          !currentIds.includes(album.id) && album.isClassical === isClassical
        );
      }

      if (candidates.length === 0) {
        candidates = allAlbums.filter(album => !currentIds.includes(album.id));
      }

      if (candidates.length === 0) {
        return {
          success: false,
          message: 'No replacement albums available'
        };
      }

      const selectedAlbums = smartPlaylistService.selectAlbumsWeighted(
        candidates,
        artistDistribution,
        1
      );

      if (selectedAlbums.length === 0) {
        return {
          success: false,
          message: 'Failed to select replacement'
        };
      }

      const newAlbum = selectedAlbums[0];

      const listenNextCollection = await Collection.findByType('listen_next') as CollectionRecord | null;
      if (!listenNextCollection) {
        throw new Error('Listen Next collection not found');
      }

      const db = getDatabase();

      const oldEntry = await AlbumCollection.findByAlbumAndCollection(
        albumIdToReplace,
        listenNextCollection.id
      ) as AlbumCollectionEntry | null;

      const position: number = oldEntry ? oldEntry.collection_order! :
        await AlbumCollection.getNextOrder(listenNextCollection.id) as number;

      if (oldEntry) {
        await new Promise<void>((resolve, reject) => {
          db.run('DELETE FROM album_collections WHERE id = ?', [oldEntry.id], (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      await AlbumCollection.create({
        album_id: newAlbum.id,
        collection_id: listenNextCollection.id,
        collection_order: position
      });

      try {
        await PlaylistHistory.recordSuggestion(newAlbum.id);
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn('Failed to record shuffle in history:', err.message);
      }

      return {
        success: true,
        removed: { id: albumIdToReplace },
        added: newAlbum,
        message: `Replaced with "${newAlbum.title}"`
      };
    } catch (error) {
      logger.error('Error shuffling album:', error);
      throw error;
    }
  }
};

export default smartPlaylistService;
