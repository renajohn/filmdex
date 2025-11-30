const { getDatabase } = require('../database');
const cacheService = require('../services/cacheService');

const Book = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = `
          CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            isbn TEXT,
            isbn13 TEXT,
            title TEXT NOT NULL,
            subtitle TEXT,
            authors TEXT,
            artists TEXT,
            publisher TEXT,
            published_year INTEGER,
            language TEXT,
            format TEXT,
            filetype TEXT,
            drm TEXT,
            narrator TEXT,
            runtime INTEGER,
            series TEXT,
            series_number INTEGER,
            genres TEXT,
            tags TEXT,
            rating REAL,
            cover TEXT,
            owner TEXT,
            borrowed BOOLEAN DEFAULT 0,
            borrowed_date DATE,
            returned_date DATE,
            borrowed_notes TEXT,
            page_count INTEGER,
            description TEXT,
            urls TEXT,
            annotation TEXT,
            ebook_file TEXT,
            title_status TEXT DEFAULT 'owned' CHECK(title_status IN ('owned', 'wish', 'borrowed')),
            read_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `;
        console.log('Creating books table...');
        db.run(sql, (err) => {
          if (err) {
            console.error('Error creating books table:', err);
            reject(err);
          } else {
            console.log('Books table created successfully');
          
          // Check if artists column exists and add it if missing (for existing databases)
          db.all("PRAGMA table_info(books)", (err, columns) => {
            if (err) {
              console.error('Error checking table info:', err);
              return reject(err);
            }
            
            const hasArtistsColumn = columns.some(col => col.name === 'artists');
            const hasEbookFileColumn = columns.some(col => col.name === 'ebook_file');
            const hasBorrowedColumn = columns.some(col => col.name === 'borrowed');
            const hasReadDateColumn = columns.some(col => col.name === 'read_date');
            
            // If artists column doesn't exist, add it
            if (!hasArtistsColumn) {
              console.log('Adding missing artists column to books table...');
              db.run(`ALTER TABLE books ADD COLUMN artists TEXT`, (alterErr) => {
                if (alterErr) {
                  console.error('Error adding artists column:', alterErr);
                  return reject(alterErr);
                }
                console.log('Added artists column successfully');
                checkEbookFileColumn();
              });
            } else {
              checkEbookFileColumn();
            }
            
            function checkEbookFileColumn() {
              // If ebook_file column doesn't exist, add it
              if (!hasEbookFileColumn) {
                console.log('Adding missing ebook_file column to books table...');
                db.run(`ALTER TABLE books ADD COLUMN ebook_file TEXT`, (alterErr) => {
                  if (alterErr) {
                    console.error('Error adding ebook_file column:', alterErr);
                    return reject(alterErr);
                  }
                  console.log('Added ebook_file column successfully');
                  migrateBorrowedToReadDate();
                });
              } else {
                migrateBorrowedToReadDate();
              }
            }
            
            function migrateBorrowedToReadDate() {
              // Migration: Replace borrowed columns with read_date and update title_status
              if (hasBorrowedColumn) {
                // Need to recreate table first (to update CHECK constraint), then migrate data
                console.log('Starting migration: borrowed -> read_date and title_status...');
                recreateTableWithoutBorrowed();
              } else {
                // No migration needed - just ensure read_date exists and constraint is updated
                if (!hasReadDateColumn) {
                  // Add read_date if it doesn't exist
                  db.run(`ALTER TABLE books ADD COLUMN read_date DATE`, (alterErr) => {
                    if (alterErr) {
                      console.error('Error adding read_date column:', alterErr);
                      return reject(alterErr);
                    }
                    console.log('Added read_date column successfully');
                    updateTitleStatusConstraint();
                  });
                } else {
                  updateTitleStatusConstraint();
                }
              }
            }
            
            function recreateTableWithoutBorrowed() {
              console.log('Recreating table without borrowed columns...');
              
              // Create new table with updated schema
              db.run(`
                CREATE TABLE books_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  isbn TEXT,
                  isbn13 TEXT,
                  title TEXT NOT NULL,
                  subtitle TEXT,
                  authors TEXT,
                  artists TEXT,
                  publisher TEXT,
                  published_year INTEGER,
                  language TEXT,
                  format TEXT,
                  filetype TEXT,
                  drm TEXT,
                  narrator TEXT,
                  runtime INTEGER,
                  series TEXT,
                  series_number INTEGER,
                  genres TEXT,
                  tags TEXT,
                  rating REAL,
                  cover TEXT,
                  owner TEXT,
                  page_count INTEGER,
                  description TEXT,
                  urls TEXT,
                  annotation TEXT,
                  ebook_file TEXT,
                  title_status TEXT DEFAULT 'owned' CHECK(title_status IN ('owned', 'wish', 'borrowed')),
                  read_date DATE,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `, (createErr) => {
                if (createErr) {
                  console.error('Error creating new books table:', createErr);
                  return reject(createErr);
                }
                
                // Copy data (excluding borrowed columns) and migrate title_status/read_date
                db.run(`
                  INSERT INTO books_new (
                    id, isbn, isbn13, title, subtitle, authors, artists, publisher, published_year,
                    language, format, filetype, drm, narrator, runtime, series, series_number,
                    genres, tags, rating, cover, owner, page_count, description, urls, annotation,
                    ebook_file, title_status, read_date, created_at, updated_at
                  )
                  SELECT 
                    id, isbn, isbn13, title, subtitle, authors, artists, publisher, published_year,
                    language, format, filetype, drm, narrator, runtime, series, series_number,
                    genres, tags, rating, cover, owner, page_count, description, urls, annotation,
                    ebook_file,
                    CASE 
                      WHEN borrowed = 1 THEN 'borrowed'
                      ELSE COALESCE(title_status, 'owned')
                    END as title_status,
                    CASE
                      WHEN borrowed_date IS NOT NULL THEN borrowed_date
                      ELSE NULL
                    END as read_date,
                    created_at, updated_at
                  FROM books
                `, (copyErr) => {
                  if (copyErr) {
                    console.error('Error copying data to new table:', copyErr);
                    return reject(copyErr);
                  }
                  
                  // Drop old table
                  db.run(`DROP TABLE books`, (dropErr) => {
                    if (dropErr) {
                      console.error('Error dropping old books table:', dropErr);
                      return reject(dropErr);
                    }
                    
                    // Rename new table
                    db.run(`ALTER TABLE books_new RENAME TO books`, (renameErr) => {
                      if (renameErr) {
                        console.error('Error renaming new books table:', renameErr);
                        return reject(renameErr);
                      }
                      
                      console.log('Successfully recreated books table without borrowed columns');
                      updateTitleStatusConstraint();
                    });
                  });
                });
              });
            }
            
            function updateTitleStatusConstraint() {
              // Check if title_status constraint needs updating
              // SQLite doesn't support modifying CHECK constraints directly,
              // but since we're recreating the table, the constraint should already be updated
              // Just verify and create indexes
              createIndexes();
            }
          });
          
          function createIndexes() {
            // Create indexes for better performance
            const indexPromises = [
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON books(isbn13)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_authors ON books(authors)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_artists ON books(artists)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_language ON books(language)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_format ON books(format)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_title_status ON books(title_status)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_read_date ON books(read_date)`, (err) => {
                  if (err) reject(err); else resolve();
                });
              })
            ];
            
            Promise.all(indexPromises)
              .then(() => {
                console.log('Books table indexes created successfully');
                resolve();
              })
              .catch((indexErr) => {
                console.error('Error creating books table indexes:', indexErr);
                reject(indexErr);
              });
          }
        }
      });
      } catch (error) {
        console.error('Error in Book.createTable():', error);
        reject(error);
      }
    });
  },

  create: (bookData) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sanitizeUrls = (urls) => {
        try {
          const obj = urls && typeof urls === 'object' ? urls : {};
          const cleaned = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v === null) {
              continue;
            }
            if (typeof v === 'string' && v.trim() === '') {
              continue;
            }
            cleaned[k] = v;
          }
          return cleaned;
        } catch (_) { return {}; }
      };

      const book = {
        isbn: bookData.isbn || null,
        isbn13: bookData.isbn13 || null,
        title: bookData.title,
        subtitle: bookData.subtitle || null,
        authors: JSON.stringify(bookData.authors || []),
        artists: JSON.stringify(bookData.artists || []),
        publisher: bookData.publisher || null,
        published_year: bookData.publishedYear || null,
        language: bookData.language || null,
        format: bookData.format || 'physical',
        filetype: bookData.filetype || null,
        drm: bookData.drm || null,
        narrator: bookData.narrator || null,
        runtime: bookData.runtime || null,
        series: bookData.series || null,
        series_number: bookData.seriesNumber || null,
        genres: JSON.stringify(bookData.genres || []),
        tags: JSON.stringify(bookData.tags || []),
        rating: bookData.rating || null,
        cover: bookData.cover || null,
        owner: bookData.owner || null,
        read_date: bookData.readDate || null,
        page_count: bookData.pageCount || null,
        description: bookData.description || null,
        urls: JSON.stringify(sanitizeUrls(bookData.urls || {})),
        annotation: bookData.annotation || null,
        title_status: bookData.titleStatus || 'owned',
        book_type: bookData.bookType || 'book',
        created_at: now,
        updated_at: now
      };

      const sql = `
        INSERT INTO books (
          isbn, isbn13, title, subtitle, authors, artists, publisher, published_year,
          language, format, filetype, drm, narrator, runtime, series, series_number,
          genres, tags, rating, cover, owner, read_date, page_count, description, urls, annotation, ebook_file, title_status, book_type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        book.isbn, book.isbn13, book.title, book.subtitle, book.authors, book.artists, book.publisher,
        book.published_year, book.language, book.format, book.filetype, book.drm,
        book.narrator, book.runtime, book.series, book.series_number, book.genres,
        book.tags, book.rating, book.cover, book.owner, book.read_date, book.page_count, book.description,
        book.urls, book.annotation, bookData.ebookFile || null, book.title_status, book.book_type, book.created_at, book.updated_at
      ];

      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when book is created
          await cacheService.invalidateAnalytics();
          
          // Get the created book with proper formatting
          db.get('SELECT * FROM books WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(Book.formatRow(row));
            }
          });
        }
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Book.formatRow(row));
        }
      });
    });
  },

  findAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      // Sort by: author A-Z, then series name, then series number (NULL series goes after, sorted by author)
      // Return owned and borrowed books (exclude wish)
      const sql = `
        SELECT * FROM books 
        WHERE (title_status IN ('owned', 'borrowed') OR title_status IS NULL) 
        ORDER BY 
          authors ASC,
          CASE WHEN series IS NULL THEN 1 ELSE 0 END,
          series ASC,
          CASE WHEN series_number IS NULL THEN 999999 ELSE series_number END ASC,
          title ASC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow));
        }
      });
    });
  },

  findByIsbn: (isbn) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE isbn = ? OR isbn13 = ?';
      
      db.get(sql, [isbn, isbn], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Book.formatRow(row));
        }
      });
    });
  },

  findByStatus: (status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE title_status = ? ORDER BY title';
      
      db.all(sql, [status], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow));
        }
      });
    });
  },

  findBySeriesAndNumber: (series, seriesNumber) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE series = ? AND series_number = ? AND (title_status IN (\'owned\', \'borrowed\') OR title_status IS NULL)';
      
      db.get(sql, [series, seriesNumber], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(Book.formatRow(row));
        }
      });
    });
  },

  findBySeries: (series) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      // Use case-insensitive comparison for series name
      // Return owned and borrowed books (exclude wish)
      const sql = 'SELECT * FROM books WHERE LOWER(TRIM(series)) = LOWER(TRIM(?)) AND (title_status IN (\'owned\', \'borrowed\') OR title_status IS NULL) ORDER BY series_number';
      
      db.all(sql, [series], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow));
        }
      });
    });
  },

  updateStatus: (id, status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE books SET title_status = ?, updated_at = ? WHERE id = ?';
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
      
      // Parse filter syntax (e.g., title:"Book Title" author:"Author Name" isbn:"123456" series:"Series Name" owner:"Renault" format:"ebook" language:"en" title_status:owned year:2020 rating:4.5)
      const params = [];
      let whereClauses = [];
      let titleStatusFilter = null; // Track title_status filter separately to override default
      
      // Extract filters like title:"value" or author:"value" or artist:"value" or isbn:"value" or series:"value" or owner:"value" or format:"value" or language:"value" or subtitle:"value" or type:"graphic-novel" or title_status:owned or year:2020 or rating:4.5 or has_ebook:true
      const filterRegex = /(title|author|artist|isbn|series|owner|format|language|genre|tag|subtitle|title_status|type|book_type):"([^"]+)"|(title_status|year|rating|has_ebook|type|book_type):(>=|<=|>|<)?(\S+)/g;
      let match;
      let hasFilters = false;
      let cleanedQuery = query; // Will be cleaned of title_status filters
      
      while ((match = filterRegex.exec(query)) !== null) {
        hasFilters = true;
        
        // Handle quoted filters (title:"value", author:"value", etc.)
        if (match[1] && match[2]) {
          const field = match[1];
          const value = match[2];
          
          // Special handling for title_status
          if (field === 'title_status') {
            if (['owned', 'borrowed', 'wish'].includes(value)) {
              titleStatusFilter = value;
              // Remove this filter from the query string
              cleanedQuery = cleanedQuery.replace(match[0], '').trim();
            }
            continue;
          }
          
          const columnMap = {
            'title': 'title',
            'subtitle': 'subtitle',
            'author': 'authors',
            'artist': 'artists',
            'isbn': 'isbn',
            'series': 'series',
            'owner': 'owner',
            'format': 'format',
            'language': 'language',
            'genre': 'genres',
            'tag': 'tags',
            'type': 'book_type',
            'book_type': 'book_type'
          };
          const column = columnMap[field];
          
          if (column) {
            if (column === 'authors' || column === 'artists' || column === 'genres' || column === 'tags') {
              // For JSON arrays, search within the JSON string
              whereClauses.push(`${column} LIKE ?`);
              params.push(`%${value}%`);
            } else if (column === 'owner') {
              // For owner, use case-insensitive exact match
              whereClauses.push(`LOWER(${column}) = LOWER(?)`);
              params.push(value);
            } else {
              whereClauses.push(`${column} LIKE ?`);
              params.push(`%${value}%`);
            }
            // Remove this filter from the query string
            cleanedQuery = cleanedQuery.replace(match[0], '').trim();
          }
        }
        // Handle title_status without quotes (title_status:owned, title_status:borrowed)
        else if (match[3] === 'title_status' && match[5]) {
          const value = match[5].trim();
          if (['owned', 'borrowed', 'wish'].includes(value)) {
            titleStatusFilter = value;
            // Remove this filter from the query string
            cleanedQuery = cleanedQuery.replace(match[0], '').trim();
          }
        }
        // Handle has_ebook filter (has_ebook:true)
        else if (match[3] === 'has_ebook' && match[5]) {
          const value = match[5].trim().toLowerCase();
          if (value === 'true') {
            whereClauses.push('ebook_file IS NOT NULL AND ebook_file != ""');
          } else if (value === 'false') {
            whereClauses.push('(ebook_file IS NULL OR ebook_file = "")');
          }
          // Remove this filter from the query string
          cleanedQuery = cleanedQuery.replace(match[0], '').trim();
        }
        // Handle type/book_type filter without quotes (type:book, type:score, type:graphic-novel)
        else if ((match[3] === 'type' || match[3] === 'book_type') && match[5]) {
          const value = match[5].trim().toLowerCase();
          if (['book', 'score', 'graphic-novel'].includes(value)) {
            whereClauses.push('book_type = ?');
            params.push(value);
          }
          // Remove this filter from the query string
          cleanedQuery = cleanedQuery.replace(match[0], '').trim();
        }
        // Handle numeric filters (year:2020, year:>=2020, rating:4.5, etc.)
        else if ((match[3] === 'year' || match[3] === 'rating') && match[5]) {
          const field = match[3];
          const operator = match[4] || '=';
          const value = parseFloat(match[5]);
          
          const columnMap = {
            'year': 'published_year',
            'rating': 'rating'
          };
          const column = columnMap[field];
          
          if (column) {
            if (operator === '>=') {
              whereClauses.push(`${column} >= ?`);
              params.push(value);
            } else if (operator === '<=') {
              whereClauses.push(`${column} <= ?`);
              params.push(value);
            } else if (operator === '>') {
              whereClauses.push(`${column} > ?`);
              params.push(value);
            } else if (operator === '<') {
              whereClauses.push(`${column} < ?`);
              params.push(value);
            } else {
              whereClauses.push(`${column} = ?`);
              params.push(value);
            }
          }
          // Remove this filter from the query string
          cleanedQuery = cleanedQuery.replace(match[0], '').trim();
        }
      }
      
      // Build title_status filter clause
      let titleStatusClause = "(title_status IN ('owned', 'borrowed') OR title_status IS NULL)";
      let titleStatusParams = [];
      if (titleStatusFilter) {
        titleStatusClause = "title_status = ?";
        titleStatusParams = [titleStatusFilter];
      }
      
      // Use cleaned query for general search (without title_status filter)
      const generalSearchText = cleanedQuery.trim();
      
      // If no filters found, do a general search
      if (!hasFilters && !titleStatusFilter) {
        const sql = `
          SELECT * FROM books 
          WHERE (title LIKE ? OR subtitle LIKE ? OR authors LIKE ? OR artists LIKE ? OR isbn LIKE ? OR isbn13 LIKE ? OR series LIKE ? OR description LIKE ?)
          AND ${titleStatusClause}
          ORDER BY 
            CASE 
              WHEN language IN ('en', 'eng', 'fr', 'fre', 'fra') THEN 1
              ELSE 2
            END,
            title
        `;
        const searchTerm = `%${query}%`;
        
        db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Book.formatRow));
          }
        });
      } else {
        // Build filtered query
        // If we have filters but no general search text, we still need a WHERE clause
        let searchClause = '';
        let searchParams = [];
        
        if (generalSearchText && generalSearchText.length > 0) {
          // We have search text (after removing title_status filter)
          searchClause = '(title LIKE ? OR subtitle LIKE ? OR authors LIKE ? OR artists LIKE ? OR isbn LIKE ? OR isbn13 LIKE ? OR series LIKE ? OR description LIKE ?)';
          const searchTerm = `%${generalSearchText}%`;
          searchParams = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
        }
        
        const whereParts = [];
        if (searchClause) {
          whereParts.push(searchClause);
        }
        if (whereClauses.length > 0) {
          whereParts.push(...whereClauses);
        }
        whereParts.push(titleStatusClause);
        
        const sql = `
          SELECT * FROM books 
          WHERE ${whereParts.join(' AND ')}
          ORDER BY 
            CASE 
              WHEN language IN ('en', 'eng', 'fr', 'fre', 'fra') THEN 1
              ELSE 2
            END,
            title
        `;
        
        db.all(sql, [...searchParams, ...params, ...titleStatusParams], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Book.formatRow));
          }
        });
      }
    });
  },

  update: (id, bookData) => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sanitizeUrls = (urls) => {
        try {
          const obj = urls && typeof urls === 'object' ? urls : {};
          const cleaned = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v === null) {
              continue;
            }
            if (typeof v === 'string' && v.trim() === '') {
              continue;
            }
            cleaned[k] = v;
          }
          return cleaned;
        } catch (_) { return {}; }
      };

      // Get existing book to preserve ebook_file if not provided
      let existingBook = null;
      try {
        existingBook = await Book.findById(id);
      } catch (err) {
        console.warn('Could not fetch existing book to preserve ebook_file:', err.message);
      }

      const sql = `
        UPDATE books SET
          isbn = ?, isbn13 = ?, title = ?, subtitle = ?, authors = ?, artists = ?, publisher = ?,
          published_year = ?, language = ?, format = ?, filetype = ?, drm = ?,
          narrator = ?, runtime = ?, series = ?, series_number = ?, genres = ?,
          tags = ?, rating = ?, cover = ?, owner = ?, read_date = ?, page_count = ?, description = ?,
          urls = ?, annotation = ?, ebook_file = ?, title_status = ?, book_type = ?, updated_at = ?
        WHERE id = ?
      `;

      // Preserve ebook_file if not provided in bookData (undefined means preserve, null means clear)
      const ebookFile = bookData.ebookFile !== undefined 
        ? (bookData.ebookFile || null)
        : (existingBook?.ebookFile || existingBook?.ebook_file || null);

      console.log(`Book.update - book ${id}: ebookFile in bookData: ${bookData.ebookFile}, preserving: ${ebookFile}`);

      const params = [
        bookData.isbn || null,
        bookData.isbn13 || null,
        bookData.title,
        bookData.subtitle || null,
        JSON.stringify(bookData.authors || []),
        JSON.stringify(bookData.artists || []),
        bookData.publisher || null,
        bookData.publishedYear || null,
        bookData.language || null,
        bookData.format || 'physical',
        bookData.filetype || null,
        bookData.drm || null,
        bookData.narrator || null,
        bookData.runtime || null,
        bookData.series || null,
        bookData.seriesNumber || null,
        JSON.stringify(bookData.genres || []),
        JSON.stringify(bookData.tags || []),
        bookData.rating || null,
        bookData.cover || null,
        bookData.owner || null,
        bookData.readDate || null,
        bookData.pageCount || null,
        bookData.description || null,
        JSON.stringify(sanitizeUrls(bookData.urls || {})),
        bookData.annotation || null,
        ebookFile,
        bookData.titleStatus || 'owned',
        bookData.bookType || 'book',
        now,
        id
      ];

      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when book is updated
          await cacheService.invalidateAnalytics();
          resolve({ id, ...bookData, updated_at: now });
        }
      });
    });
  },

  updateCover: (id, coverPath) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sql = 'UPDATE books SET cover = ?, updated_at = ? WHERE id = ?';
      
      db.run(sql, [coverPath, now, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, cover: coverPath, updated_at: now });
        }
      });
    });
  },

  updateEbookFile: (id, ebookFilePath) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();
      
      const sql = 'UPDATE books SET ebook_file = ?, updated_at = ? WHERE id = ?';
      
      console.log(`Updating ebook_file for book ${id} with filename: ${ebookFilePath}`);
      
      db.run(sql, [ebookFilePath, now, id], function(err) {
        if (err) {
          console.error(`Error updating ebook_file for book ${id}:`, err);
          reject(err);
        } else {
          console.log(`Successfully updated ebook_file for book ${id}. Changes: ${this.changes}`);
          if (this.changes === 0) {
            console.warn(`Warning: No rows updated for book ${id}. Book may not exist.`);
          }
          resolve({ id, ebook_file: ebookFilePath, updated_at: now, changes: this.changes });
        }
      });
    });
  },

  updateUrls: (id, newUrls) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // First fetch existing urls to merge
      db.get('SELECT urls FROM books WHERE id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        const existingUrls = row && row.urls ? JSON.parse(row.urls) : {};
        const merged = { ...existingUrls, ...newUrls };

        const sql = 'UPDATE books SET urls = ?, updated_at = ? WHERE id = ?';
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
      const sql = 'DELETE FROM books WHERE id = ?';
      
      db.run(sql, [id], async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when book is deleted
          await cacheService.invalidateAnalytics();
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  },

  // Helper function to safely parse array fields (handles both JSON arrays and comma-separated strings)
  parseArrayField: (value) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // If parsed value is not an array, treat as single item
      return parsed ? [parsed] : [];
    } catch (e) {
      // If JSON parsing fails, treat as comma-separated string
      if (typeof value === 'string') {
        return value.split(',').map(item => item.trim()).filter(item => item);
      }
      return [];
    }
  },

  formatRow: (row) => {
    if (!row) return null;
    
    return {
      id: row.id,
      isbn: row.isbn,
      isbn13: row.isbn13,
      title: row.title,
      subtitle: row.subtitle,
      authors: Book.parseArrayField(row.authors),
      artists: Book.parseArrayField(row.artists),
      publisher: row.publisher,
      publishedYear: row.published_year,
      language: row.language,
      format: row.format,
      filetype: row.filetype,
      drm: row.drm,
      narrator: row.narrator,
      runtime: row.runtime,
      series: row.series,
      seriesNumber: row.series_number,
      genres: Book.parseArrayField(row.genres),
      tags: Book.parseArrayField(row.tags),
      rating: row.rating,
      cover: row.cover,
      owner: row.owner,
      readDate: row.read_date,
      pageCount: row.page_count,
      description: row.description,
      urls: JSON.parse(row.urls || '{}'),
      annotation: row.annotation,
      ebookFile: row.ebook_file,
      titleStatus: row.title_status,
      bookType: row.book_type || 'book',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  },

  autocomplete: (field, value) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      // Validate field to prevent SQL injection
      const allowedFields = ['title', 'author', 'artist', 'series', 'publisher', 'genre', 'tag', 'owner'];
      if (!allowedFields.includes(field)) {
        return reject(new Error(`Invalid field: ${field}`));
      }
      
      // Map field names to column names
      const columnMap = {
        'title': 'title',
        'author': 'authors',
        'artist': 'artists',
        'series': 'series',
        'publisher': 'publisher',
        'genre': 'genres',
        'tag': 'tags',
        'owner': 'owner'
      };
      const column = columnMap[field];
      
      // For owner field, show all owners when query is empty (better for look-ahead)
      let sql;
      let params;
      
      // Handle undefined, null, or empty string values
      const trimmedValue = value ? String(value).trim() : '';
      
      if (!trimmedValue) {
        // Return all distinct owners (or other fields) when query is empty
        sql = `
          SELECT DISTINCT ${column} 
          FROM books 
          WHERE ${column} IS NOT NULL AND ${column} != ''
          ORDER BY ${column}
          LIMIT 50
        `;
        params = [];
      } else {
        // Search for matching values
        sql = `
          SELECT DISTINCT ${column} 
          FROM books 
          WHERE ${column} LIKE ?
          ORDER BY ${column}
          LIMIT 50
        `;
        params = [`%${trimmedValue}%`];
      }
      
      db.all(sql, params, (err, rows) => {
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

module.exports = Book;

