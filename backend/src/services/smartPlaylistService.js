const { getDatabase } = require('../database');
const PlaylistHistory = require('../models/playlistHistory');
const Collection = require('../models/collection');
const AlbumCollection = require('../models/albumCollection');
const logger = require('../logger');

const ALBUMS_PER_SUGGESTION = 1; // Add 1 album per click
const RECENT_SUGGESTION_DAYS = 14; // Avoid albums suggested in last 2 weeks

// Ensure the table exists (for databases created before this feature)
let tableInitialized = false;
const ensureTableExists = async () => {
  if (tableInitialized) return;
  try {
    await PlaylistHistory.createTable();
    tableInitialized = true;
  } catch (error) {
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
  getArtistDistribution: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT artist, COUNT(*) as album_count
        FROM albums
        WHERE title_status = 'owned'
        GROUP BY artist
        ORDER BY album_count DESC
      `;
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse artists (stored as JSON array) and build distribution
          const distribution = new Map();
          
          for (const row of rows || []) {
            try {
              const artists = JSON.parse(row.artist);
              const artistList = Array.isArray(artists) ? artists : [artists];
              
              for (const artist of artistList) {
                if (artist && typeof artist === 'string') {
                  const current = distribution.get(artist) || 0;
                  distribution.set(artist, current + row.album_count);
                }
              }
            } catch (e) {
              // If not valid JSON, treat as single artist
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
  getAllAlbumsForSelection: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT id, artist, title, cover, genres
        FROM albums
        WHERE title_status = 'owned'
      `;
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse artists and genres for each album
          const albums = (rows || []).map(row => {
            let artists = [];
            let genres = [];
            try {
              const parsed = JSON.parse(row.artist);
              artists = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              artists = row.artist ? [row.artist] : [];
            }
            try {
              const parsedGenres = JSON.parse(row.genres);
              genres = Array.isArray(parsedGenres) ? parsedGenres : [];
            } catch (e) {
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
  isAlbumClassical: (albumId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `SELECT genres FROM albums WHERE id = ?`;
      db.get(sql, [albumId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(false);
        } else {
          try {
            const genres = JSON.parse(row.genres);
            const isClassical = Array.isArray(genres) && 
              genres.some(g => g && g.toLowerCase() === 'classical');
            resolve(isClassical);
          } catch (e) {
            resolve(false);
          }
        }
      });
    });
  },

  /**
   * Get current Listen Next album IDs
   */
  getCurrentListenNextIds: async () => {
    try {
      const listenNextCollection = await Collection.findByType('listen_next');
      if (!listenNextCollection) {
        return [];
      }
      
      const albums = await Collection.getAlbums(listenNextCollection.id);
      return albums.map(a => a.id);
    } catch (error) {
      logger.error('Error getting Listen Next albums:', error);
      return [];
    }
  },

  /**
   * Weighted random selection based on artist distribution
   * Albums by artists with more albums in the collection have higher probability
   */
  selectAlbumsWeighted: (candidates, artistDistribution, count) => {
    if (candidates.length === 0 || count <= 0) {
      return [];
    }

    // Calculate weights for each candidate based on their artists
    const weights = candidates.map(album => {
      // Sum up the distribution weight from all artists on this album
      let weight = 0;
      for (const artist of album.artists) {
        weight += artistDistribution.get(artist) || 1;
      }
      // Minimum weight of 1 to ensure all albums have a chance
      return Math.max(1, weight);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const selected = [];
    const usedIndices = new Set();

    // Select albums one by one using weighted random
    while (selected.length < count && usedIndices.size < candidates.length) {
      // Generate a random point in the total weight space
      let random = Math.random() * totalWeight;
      
      // Find which album this random point falls into
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
   * Returns the albums that were added
   */
  smartFillListenNext: async () => {
    try {
      // Ensure playlist history table exists
      await ensureTableExists();
      
      // 1. Get current Listen Next albums
      const currentIds = await smartPlaylistService.getCurrentListenNextIds();

      // 2. Get recently suggested albums to avoid
      const recentSuggestions = await PlaylistHistory.getRecentSuggestions(RECENT_SUGGESTION_DAYS);
      const excludeIds = new Set([...currentIds, ...recentSuggestions]);

      // 3. Get all albums and artist distribution
      const [allAlbums, artistDistribution] = await Promise.all([
        smartPlaylistService.getAllAlbumsForSelection(),
        smartPlaylistService.getArtistDistribution()
      ]);

      // 4. Filter to candidates (not in Listen Next, not recently suggested, NOT classical)
      let candidates = allAlbums.filter(album => 
        !excludeIds.has(album.id) && !album.isClassical
      );

      // If we filtered out too many, relax the recent suggestion constraint (still exclude classical)
      if (candidates.length < ALBUMS_PER_SUGGESTION) {
        candidates = allAlbums.filter(album => 
          !currentIds.includes(album.id) && !album.isClassical
        );
      }

      if (candidates.length === 0) {
        return { added: [], message: 'No albums available for suggestion' };
      }

      // 5. Select albums using weighted random based on artist distribution
      const selectedAlbums = smartPlaylistService.selectAlbumsWeighted(
        candidates,
        artistDistribution,
        ALBUMS_PER_SUGGESTION
      );

      // 6. Add selected albums to Listen Next
      const listenNextCollection = await Collection.findByType('listen_next');
      if (!listenNextCollection) {
        throw new Error('Listen Next collection not found');
      }

      const addedAlbums = [];
      for (const album of selectedAlbums) {
        try {
          const position = await AlbumCollection.getNextOrder(listenNextCollection.id);
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

      // 7. Record suggestions in history
      if (addedAlbums.length > 0) {
        try {
          await PlaylistHistory.recordSuggestions(addedAlbums.map(a => a.id));
        } catch (error) {
          logger.error('Error recording suggestion history:', error);
        }
      }

      // 8. Periodically clean up old history
      if (Math.random() < 0.1) { // 10% chance to clean up
        PlaylistHistory.cleanupOldHistory().catch(err => {
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
  getStats: async () => {
    try {
      const [artistDistribution, suggestionCounts] = await Promise.all([
        smartPlaylistService.getArtistDistribution(),
        PlaylistHistory.getSuggestionCounts()
      ]);

      // Convert distribution to sorted array
      const artistStats = Array.from(artistDistribution.entries())
        .map(([artist, count]) => ({ artist, albumCount: count }))
        .sort((a, b) => b.albumCount - a.albumCount)
        .slice(0, 20); // Top 20 artists

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
   * If the album being shuffled is classical, replace with another classical album
   * If it's non-classical, replace with another non-classical album
   */
  shuffleAlbum: async (albumIdToReplace) => {
    try {
      await ensureTableExists();
      
      // 1. Check if the album to replace is classical
      const isClassical = await smartPlaylistService.isAlbumClassical(albumIdToReplace);
      
      // 2. Get current Listen Next albums
      const currentIds = await smartPlaylistService.getCurrentListenNextIds();
      
      // 3. Get recently suggested albums to avoid
      const recentSuggestions = await PlaylistHistory.getRecentSuggestions(RECENT_SUGGESTION_DAYS);
      const excludeIds = new Set([...currentIds, ...recentSuggestions]);
      
      // 4. Get all albums and artist distribution
      const [allAlbums, artistDistribution] = await Promise.all([
        smartPlaylistService.getAllAlbumsForSelection(),
        smartPlaylistService.getArtistDistribution()
      ]);
      
      // 5. Filter candidates based on classical status
      // If shuffling classical -> only classical candidates
      // If shuffling non-classical -> only non-classical candidates
      let candidates = allAlbums.filter(album => 
        !excludeIds.has(album.id) && album.isClassical === isClassical
      );
      
      // Relax constraint if no candidates found
      if (candidates.length === 0) {
        candidates = allAlbums.filter(album => 
          !currentIds.includes(album.id) && album.isClassical === isClassical
        );
      }
      
      // If still no candidates with same classical status, allow any
      if (candidates.length === 0) {
        candidates = allAlbums.filter(album => !currentIds.includes(album.id));
      }
      
      if (candidates.length === 0) {
        return { 
          success: false, 
          message: 'No replacement albums available' 
        };
      }
      
      // 6. Select one album using weighted random
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
      
      // 7. Remove the old album and add the new one
      const listenNextCollection = await Collection.findByType('listen_next');
      if (!listenNextCollection) {
        throw new Error('Listen Next collection not found');
      }
      
      const { getDatabase } = require('../database');
      const db = getDatabase();
      
      // Get the position of the album being replaced
      const oldEntry = await AlbumCollection.findByAlbumAndCollection(
        albumIdToReplace, 
        listenNextCollection.id
      );
      
      const position = oldEntry ? oldEntry.collection_order : 
        await AlbumCollection.getNextOrder(listenNextCollection.id);
      
      // Remove old album
      if (oldEntry) {
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM album_collections WHERE id = ?', [oldEntry.id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      // Add new album at the same position
      await AlbumCollection.create({
        album_id: newAlbum.id,
        collection_id: listenNextCollection.id,
        collection_order: position
      });
      
      // 8. Record the new suggestion in history
      try {
        await PlaylistHistory.recordSuggestion(newAlbum.id);
      } catch (error) {
        logger.warn('Failed to record shuffle in history:', error.message);
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

module.exports = smartPlaylistService;

