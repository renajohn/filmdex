const { getDatabase } = require('../database');
const cacheService = require('../services/cacheService');

const Album = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS albums (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist TEXT NOT NULL,
          title TEXT NOT NULL,
          release_year INTEGER,
          labels TEXT,
          catalog_number TEXT,
          barcode TEXT,
          country TEXT,
          edition_notes TEXT,
          genres TEXT,
          moods TEXT,
          tags TEXT,
          rating REAL,
          total_duration INTEGER,
          format TEXT,
          packaging TEXT,
          status TEXT,
          release_events TEXT,
          recording_quality TEXT CHECK(recording_quality IN ('demo', 'reference', 'good', 'average')),
          cover TEXT,
          back_cover TEXT,
          musicbrainz_release_id TEXT,
          musicbrainz_release_group_id TEXT,
          release_group_first_release_date INTEGER,
          release_group_type TEXT,
          release_group_secondary_types TEXT,
          condition TEXT CHECK(condition IN ('M', 'NM', 'VG+', 'VG')),
          ownership_notes TEXT,
          purchased_at TEXT,
          price_chf REAL,
          producer TEXT,
          engineer TEXT,
          recording_location TEXT,
          language TEXT,
          urls TEXT,
          isrc_codes TEXT,
          annotation TEXT,
          title_status TEXT DEFAULT 'owned' CHECK(title_status IN ('owned', 'wish')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // Add new columns if they don't exist (for existing databases)
          const alterTablePromises = [
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN producer TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN engineer TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN recording_location TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN language TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN urls TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN isrc_codes TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN annotation TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN back_cover TEXT`, () => resolve());
            }),
            new Promise((resolve) => {
              db.run(`ALTER TABLE albums ADD COLUMN title_status TEXT DEFAULT 'owned'`, () => resolve());
            })
          ];

          // Wait for all ALTER TABLE statements (ignore errors for existing columns)
          Promise.all(alterTablePromises).then(() => {
            // Create indexes for better performance
            const indexPromises = [
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
              db.run(`CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title)`, (err) => {
                if (err) reject(err); else resolve();
              });
            }),
            new Promise((resolve, reject) => {
              db.run(`CREATE INDEX IF NOT EXISTS idx_albums_barcode ON albums(barcode)`, (err) => {
                if (err) reject(err); else resolve();
              });
            }),
            new Promise((resolve, reject) => {
              db.run(`CREATE INDEX IF NOT EXISTS idx_albums_musicbrainz_id ON albums(musicbrainz_release_id)`, (err) => {
                if (err) reject(err); else resolve();
              });
            })
            ];
            
            Promise.all(indexPromises)
              .then(() => resolve())
              .catch(reject);
          });
        }
      });
    });
  },

  create: (cdData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const cd = {
        artist: JSON.stringify(cdData.artist || []),
        title: cdData.title,
        release_year: cdData.releaseYear || null,
        labels: JSON.stringify(cdData.labels || []),
        catalog_number: cdData.catalogNumber || null,
        barcode: cdData.barcode || null,
        country: cdData.country || null,
        edition_notes: cdData.editionNotes || null,
        genres: JSON.stringify(cdData.genres || []),
        moods: JSON.stringify([]), // Keep column but don't populate
        tags: JSON.stringify(cdData.tags || []),
        rating: cdData.rating || null,
        total_duration: cdData.totalDuration || null,
        format: cdData.format || null,
        packaging: cdData.packaging || null,
        status: cdData.status || null,
        release_events: JSON.stringify(cdData.releaseEvents || []),
        recording_quality: cdData.recordingQuality || null,
        cover: cdData.cover || null,
        back_cover: cdData.backCover || null,
        musicbrainz_release_id: cdData.musicbrainzReleaseId || null,
        musicbrainz_release_group_id: cdData.musicbrainzReleaseGroupId || null,
        release_group_first_release_date: cdData.releaseGroupFirstReleaseDate || null,
        release_group_type: cdData.releaseGroupType || null,
        release_group_secondary_types: JSON.stringify(cdData.releaseGroupSecondaryTypes || []),
        condition: cdData.ownership?.condition || null,
        ownership_notes: cdData.ownership?.notes || null,
        purchased_at: cdData.ownership?.purchasedAt || null,
        price_chf: cdData.ownership?.priceChf || null,
        producer: JSON.stringify(cdData.producer || []),
        engineer: JSON.stringify(cdData.engineer || []),
        recording_location: cdData.recordingLocation || null,
        language: cdData.language || null,
        urls: JSON.stringify(cdData.urls || {}),
        isrc_codes: JSON.stringify(cdData.isrcCodes || []),
        annotation: cdData.annotation || null,
        title_status: cdData.titleStatus || 'owned',
        created_at: now,
        updated_at: now
      };

      const sql = `
        INSERT INTO albums (
          artist, title, release_year, labels, catalog_number, barcode,
          country, edition_notes, genres, moods, tags, rating, total_duration,
          format, packaging, status, release_events, recording_quality, cover, back_cover,
          musicbrainz_release_id, musicbrainz_release_group_id, release_group_first_release_date,
          release_group_type, release_group_secondary_types, condition, ownership_notes, purchased_at,
          price_chf, producer, engineer, recording_location, language, urls, isrc_codes, annotation, title_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        cd.artist, cd.title, cd.release_year, cd.labels, cd.catalog_number,
        cd.barcode, cd.country, cd.edition_notes, cd.genres, cd.moods, cd.tags,
        cd.rating, cd.total_duration, cd.format, cd.packaging, cd.status, cd.release_events,
        cd.recording_quality, cd.cover, cd.back_cover, cd.musicbrainz_release_id, cd.musicbrainz_release_group_id,
        cd.release_group_first_release_date, cd.release_group_type, cd.release_group_secondary_types,
        cd.condition, cd.ownership_notes, cd.purchased_at, cd.price_chf, 
        cd.producer, cd.engineer, cd.recording_location, cd.language, cd.urls, cd.isrc_codes, cd.annotation, cd.title_status,
        cd.created_at, cd.updated_at
      ];

      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when album is created
          await cacheService.invalidateAnalytics();
          
          // Get the created album with proper formatting
          db.get('SELECT * FROM albums WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(Album.formatRow(row));
            }
          });
        }
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM albums WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Album.formatRow(row));
        }
      });
    });
  },

  findAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM albums WHERE (title_status = ? OR title_status IS NULL) ORDER BY artist, title';
      
      db.all(sql, ['owned'], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Album.formatRow));
        }
      });
    });
  },

  findByBarcode: (barcode) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM albums WHERE barcode = ?';
      
      db.get(sql, [barcode], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Album.formatRow(row));
        }
      });
    });
  },

  findByMusicbrainzId: (musicbrainzId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM albums WHERE musicbrainz_release_id = ?';
      
      db.get(sql, [musicbrainzId], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Album.formatRow(row));
        }
      });
    });
  },

  findByStatus: (status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM albums WHERE title_status = ? ORDER BY artist, title';
      
      db.all(sql, [status], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Album.formatRow));
        }
      });
    });
  },

  updateStatus: (id, status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE albums SET title_status = ?, updated_at = ? WHERE id = ?';
      const now = new Date().toISOString();
      
      db.run(sql, [status, now, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, title_status: status });
        }
      });
    });
  },

  search: (query) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      // Parse filter syntax (e.g., artist:"Dire Straits" title:"Brothers in Arms" genre:"rock" mood:"calm" track:"Money for Nothing")
      const filters = [];
      const params = [];
      let whereClauses = [];
      let hasTrackFilter = false;
      
      // Extract filters like artist:"value" or title:"value" or genre:"value" or mood:"value" or track:"value" or year:2020 or label:"Columbia"
      const filterRegex = /(artist|title|genre|mood|track|year|label):"([^"]+)"|(year):(>=|<=|>|<)?(\d+)/g;
      let match;
      let hasFilters = false;
      
      while ((match = filterRegex.exec(query)) !== null) {
        hasFilters = true;
        
        // Handle quoted filters (artist:"value", title:"value", etc.)
        if (match[1] && match[2]) {
          const field = match[1];
          const value = match[2];
          
          if (field === 'track') {
            // Track filter requires a JOIN with the tracks table
            hasTrackFilter = true;
            whereClauses.push(`EXISTS (SELECT 1 FROM tracks WHERE tracks.album_id = albums.id AND tracks.title LIKE ?)`);
            params.push(`%${value}%`);
          } else {
            // Map singular field names to plural column names where needed
            const columnMap = {
              'artist': 'artist',
              'title': 'title',
              'genre': 'genres',
              'label': 'labels'
            };
            const column = columnMap[field];
            
            if (column) {
              whereClauses.push(`${column} LIKE ?`);
              params.push(`%${value}%`);
            }
          }
        }
        // Handle year filters (year:2020, year:>=2020, etc.)
        else if (match[3] === 'year' && match[5]) {
          const operator = match[4] || '=';
          const year = parseInt(match[5]);
          
          if (operator === '>=') {
            whereClauses.push(`release_year >= ?`);
            params.push(year);
          } else if (operator === '<=') {
            whereClauses.push(`release_year <= ?`);
            params.push(year);
          } else if (operator === '>') {
            whereClauses.push(`release_year > ?`);
            params.push(year);
          } else if (operator === '<') {
            whereClauses.push(`release_year < ?`);
            params.push(year);
          } else {
            whereClauses.push(`release_year = ?`);
            params.push(year);
          }
        }
      }
      
      // If no filters found, do a general search
      if (!hasFilters) {
        const sql = `
          SELECT * FROM albums 
          WHERE (title LIKE ? OR artist LIKE ? OR labels LIKE ? OR genres LIKE ?)
          AND (title_status = ? OR title_status IS NULL)
          ORDER BY artist, title
        `;
        const searchTerm = `%${query}%`;
        
        db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm, 'owned'], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Album.formatRow));
          }
        });
      } else {
        // Build filtered query
        const sql = `
          SELECT ${hasTrackFilter ? 'DISTINCT' : ''} albums.* FROM albums 
          WHERE ${whereClauses.join(' AND ')}
          AND (title_status = ? OR title_status IS NULL)
          ORDER BY artist, title
        `;
        
        db.all(sql, [...params, 'owned'], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Album.formatRow));
          }
        });
      }
    });
  },

  update: (id, cdData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sql = `
        UPDATE albums SET
          artist = ?, title = ?, release_year = ?, labels = ?, catalog_number = ?,
          barcode = ?, country = ?, edition_notes = ?, genres = ?, moods = ?,
          recording_quality = ?, cover = ?, back_cover = ?, format = ?, musicbrainz_release_id = ?,
          musicbrainz_release_group_id = ?, release_group_first_release_date = ?,
          release_group_type = ?, release_group_secondary_types = ?,
          condition = ?, ownership_notes = ?, purchased_at = ?, price_chf = ?,
          producer = ?, engineer = ?, recording_location = ?, language = ?, urls = ?, isrc_codes = ?, annotation = ?, title_status = ?,
          updated_at = ?
        WHERE id = ?
      `;

      const params = [
        JSON.stringify(cdData.artist || []),
        cdData.title,
        cdData.releaseYear || null,
        JSON.stringify(cdData.labels || []),
        cdData.catalogNumber || null,
        cdData.barcode || null,
        cdData.country || null,
        cdData.editionNotes || null,
        JSON.stringify(cdData.genres || []),
        JSON.stringify([]), // Keep column but don't populate
        cdData.recordingQuality || null,
        cdData.cover || null,
        cdData.backCover || null,
        cdData.format || 'CD',
        cdData.musicbrainzReleaseId || null,
        cdData.musicbrainzReleaseGroupId || null,
        cdData.releaseGroupFirstReleaseDate || null,
        cdData.releaseGroupType || null,
        JSON.stringify(cdData.releaseGroupSecondaryTypes || []),
        cdData.ownership?.condition || null,
        cdData.ownership?.notes || null,
        cdData.ownership?.purchasedAt || null,
        cdData.ownership?.priceChf || null,
        JSON.stringify(cdData.producer || []),
        JSON.stringify(cdData.engineer || []),
        cdData.recordingLocation || null,
        cdData.language || null,
        JSON.stringify(cdData.urls || {}),
        JSON.stringify(cdData.isrcCodes || []),
        cdData.annotation || null,
        cdData.titleStatus || 'owned',
        now,
        id
      ];

      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when album is updated
          await cacheService.invalidateAnalytics();
          resolve({ id, ...cdData, updated_at: now });
        }
      });
    });
  },

  updateBackCover: (id, backCoverPath) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sql = 'UPDATE albums SET back_cover = ?, updated_at = ? WHERE id = ?';
      
      db.run(sql, [backCoverPath, now, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, backCover: backCoverPath, updated_at: now });
        }
      });
    });
  },

  updateFrontCover: (id, frontCoverPath) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sql = 'UPDATE albums SET cover = ?, updated_at = ? WHERE id = ?';
      
      db.run(sql, [frontCoverPath, now, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, cover: frontCoverPath, updated_at: now });
        }
      });
    });
  },

  updateUrls: (id, newUrls) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // First fetch existing urls to merge
      db.get('SELECT urls FROM albums WHERE id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        const existingUrls = row && row.urls ? JSON.parse(row.urls) : {};
        const merged = { ...existingUrls, ...newUrls };

        const sql = 'UPDATE albums SET urls = ?, updated_at = ? WHERE id = ?';
        db.run(sql, [JSON.stringify(merged), now, id], function(updateErr) {
          if (updateErr) {
            reject(updateErr);
          } else {
            resolve({ id, urls: merged, updated_at: now });
          }
        });
      });
    });
  },

  delete: (id) => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM albums WHERE id = ?';
      
      db.run(sql, [id], async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when album is deleted
          await cacheService.invalidateAnalytics();
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  },

  formatRow: (row) => {
    if (!row) return null;
    
    return {
      id: row.id,
      artist: JSON.parse(row.artist || '[]'),
      title: row.title,
      releaseYear: row.release_year,
      labels: JSON.parse(row.labels || '[]'),
      catalogNumber: row.catalog_number,
      barcode: row.barcode,
      country: row.country,
      editionNotes: row.edition_notes,
      genres: JSON.parse(row.genres || '[]'),
      moods: JSON.parse(row.moods || '[]'), // Keep in response but will be empty
      tags: JSON.parse(row.tags || '[]'),
      rating: row.rating,
      totalDuration: row.total_duration,
      format: row.format,
      packaging: row.packaging,
      status: row.status,
      releaseEvents: JSON.parse(row.release_events || '[]'),
      recordingQuality: row.recording_quality,
      cover: row.cover,
      backCover: row.back_cover,
      musicbrainzReleaseId: row.musicbrainz_release_id,
      musicbrainzReleaseGroupId: row.musicbrainz_release_group_id,
      releaseGroupFirstReleaseDate: row.release_group_first_release_date,
      releaseGroupType: row.release_group_type,
      releaseGroupSecondaryTypes: JSON.parse(row.release_group_secondary_types || '[]'),
      ownership: {
        condition: row.condition,
        notes: row.ownership_notes,
        purchasedAt: row.purchased_at,
        priceChf: row.price_chf
      },
      producer: JSON.parse(row.producer || '[]'),
      engineer: JSON.parse(row.engineer || '[]'),
      recordingLocation: row.recording_location,
      language: row.language,
      urls: JSON.parse(row.urls || '{}'),
      isrcCodes: JSON.parse(row.isrc_codes || '[]'),
      annotation: row.annotation,
      titleStatus: row.title_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  autocomplete: (field, value) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      // Validate field to prevent SQL injection (accept singular forms)
      const allowedFields = ['title', 'artist', 'genre', 'track', 'label'];
      if (!allowedFields.includes(field)) {
        return reject(new Error(`Invalid field: ${field}`));
      }
      
      // Handle track autocomplete separately (from tracks table)
      if (field === 'track') {
        const sql = `
          SELECT DISTINCT title 
          FROM tracks 
          WHERE title LIKE ?
          ORDER BY title
          LIMIT 20
        `;
        const searchTerm = `%${value}%`;
        
        db.all(sql, [searchTerm], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Return rows with 'track' as the field name
            resolve(rows.map(row => ({ track: row.title })));
          }
        });
        return;
      }
      
      // Map 'genre' to its plural database column name
      const columnMap = {
        'title': 'title',
        'artist': 'artist',
        'genre': 'genres',
        'label': 'labels'
      };
      const column = columnMap[field] || field;
      
      const sql = `
        SELECT DISTINCT ${column} 
        FROM albums 
        WHERE ${column} LIKE ?
        ORDER BY ${column}
        LIMIT 20
      `;
      const searchTerm = `%${value}%`;
      
      db.all(sql, [searchTerm], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Return rows with the requested field name (not the column name)
          resolve(rows.map(row => ({ [field]: row[column] })));
        }
      });
    });
  }
};

module.exports = Album;