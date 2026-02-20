import type sqlite3 from 'sqlite3';
import { getDatabase } from '../database';
import cacheService from '../services/cacheService';
import type { BookRow, BookFormatted, BookCreateData, BookSearchParsed } from '../types';

interface BookUpdateResult {
  id: number;
  updated_at: string;
  [key: string]: unknown;
}

interface BookCoverResult {
  id: number;
  cover: string;
  updated_at: string;
}

interface BookEbookFileResult {
  id: number;
  ebook_file: string | null;
  updated_at: string;
  changes: number;
}

interface BookUrlsResult {
  id: number;
  urls: Record<string, string>;
  updated_at: string;
}

interface BookStatusResult {
  id: number;
  title_status: string;
}

interface BookAutocompleteRow {
  [key: string]: string | number | null;
}

interface UrlsRow {
  urls: string | null;
}

interface PragmaColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

const sanitizeUrls = (urls: Record<string, string | null> | undefined): Record<string, string> => {
  try {
    const obj = urls && typeof urls === 'object' ? urls : {};
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null) {
        continue;
      }
      if (typeof v === 'string' && v.trim() === '') {
        continue;
      }
      if (typeof v === 'string') {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch (_) { return {}; }
};

const Book = {
  createTable: (): Promise<void> => {
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
        db.run(sql, (err: Error | null) => {
          if (err) {
            console.error('Error creating books table:', err);
            reject(err);
          } else {
            console.log('Books table created successfully');

          // Check if artists column exists and add it if missing (for existing databases)
          db.all("PRAGMA table_info(books)", (err: Error | null, columns: PragmaColumnInfo[]) => {
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
              db.run(`ALTER TABLE books ADD COLUMN artists TEXT`, (alterErr: Error | null) => {
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

            function checkEbookFileColumn(): void {
              // If ebook_file column doesn't exist, add it
              if (!hasEbookFileColumn) {
                console.log('Adding missing ebook_file column to books table...');
                db.run(`ALTER TABLE books ADD COLUMN ebook_file TEXT`, (alterErr: Error | null) => {
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

            function migrateBorrowedToReadDate(): void {
              // Migration: Replace borrowed columns with read_date and update title_status
              if (hasBorrowedColumn) {
                // Need to recreate table first (to update CHECK constraint), then migrate data
                console.log('Starting migration: borrowed -> read_date and title_status...');
                recreateTableWithoutBorrowed();
              } else {
                // No migration needed - just ensure read_date exists and constraint is updated
                if (!hasReadDateColumn) {
                  // Add read_date if it doesn't exist
                  db.run(`ALTER TABLE books ADD COLUMN read_date DATE`, (alterErr: Error | null) => {
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

            function recreateTableWithoutBorrowed(): void {
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
              `, (createErr: Error | null) => {
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
                `, (copyErr: Error | null) => {
                  if (copyErr) {
                    console.error('Error copying data to new table:', copyErr);
                    return reject(copyErr);
                  }

                  // Drop old table
                  db.run(`DROP TABLE books`, (dropErr: Error | null) => {
                    if (dropErr) {
                      console.error('Error dropping old books table:', dropErr);
                      return reject(dropErr);
                    }

                    // Rename new table
                    db.run(`ALTER TABLE books_new RENAME TO books`, (renameErr: Error | null) => {
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

            function updateTitleStatusConstraint(): void {
              // Check if title_status constraint needs updating
              // SQLite doesn't support modifying CHECK constraints directly,
              // but since we're recreating the table, the constraint should already be updated
              // Just verify and create indexes
              createIndexes();
            }
          });

          function createIndexes(): void {
            // Create indexes for better performance
            const indexPromises: Promise<void>[] = [
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON books(isbn13)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_authors ON books(authors)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_artists ON books(artists)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_language ON books(language)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_format ON books(format)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_title_status ON books(title_status)`, (err: Error | null) => {
                  if (err) reject(err); else resolve();
                });
              }),
              new Promise((resolve, reject) => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_books_read_date ON books(read_date)`, (err: Error | null) => {
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

  create: (bookData: BookCreateData): Promise<BookFormatted> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

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
        urls: JSON.stringify(sanitizeUrls(bookData.urls)),
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

      db.run(sql, params, async function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when book is created
          await cacheService.invalidateAnalytics();

          // Get the created book with proper formatting
          db.get('SELECT * FROM books WHERE id = ?', [this.lastID], (err: Error | null, row: BookRow | undefined) => {
            if (err) {
              reject(err);
            } else {
              resolve(Book.formatRow(row!)!);
            }
          });
        }
      });
    });
  },

  findById: (id: number): Promise<BookFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE id = ?';

      db.get(sql, [id], (err: Error | null, row: BookRow | undefined) => {
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

  findAll: (): Promise<BookFormatted[]> => {
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

      db.all(sql, [], (err: Error | null, rows: BookRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow).filter((r): r is BookFormatted => r !== null));
        }
      });
    });
  },

  findByIsbn: (isbn: string): Promise<BookFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE isbn = ? OR isbn13 = ?';

      db.get(sql, [isbn, isbn], (err: Error | null, row: BookRow | undefined) => {
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

  findByStatus: (status: string): Promise<BookFormatted[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE title_status = ? ORDER BY title';

      db.all(sql, [status], (err: Error | null, rows: BookRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow).filter((r): r is BookFormatted => r !== null));
        }
      });
    });
  },

  findBySeriesAndNumber: (series: string, seriesNumber: number): Promise<BookFormatted | null> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM books WHERE series = ? AND series_number = ? AND (title_status IN (\'owned\', \'borrowed\') OR title_status IS NULL)';

      db.get(sql, [series, seriesNumber], (err: Error | null, row: BookRow | undefined) => {
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

  findBySeries: (series: string): Promise<BookFormatted[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      // Use case-insensitive comparison for series name
      // Return owned and borrowed books (exclude wish)
      const sql = 'SELECT * FROM books WHERE LOWER(TRIM(series)) = LOWER(TRIM(?)) AND (title_status IN (\'owned\', \'borrowed\') OR title_status IS NULL) ORDER BY series_number';

      db.all(sql, [series], (err: Error | null, rows: BookRow[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(Book.formatRow).filter((r): r is BookFormatted => r !== null));
        }
      });
    });
  },

  updateStatus: (id: number, status: string): Promise<BookStatusResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE books SET title_status = ?, updated_at = ? WHERE id = ?';
      const now = new Date().toISOString();

      db.run(sql, [status, now, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, title_status: status });
        }
      });
    });
  },

  // Helper function to parse enhanced search query syntax
  // Supports: OR (type:book,graphic-novel), negation (-type:score), ranges (year:2020-2024)
  _parseSearchQuery: (query: string): BookSearchParsed => {
    const params: unknown[] = [];
    const whereClauses: string[] = [];
    let titleStatusFilter: string | string[] | null = null;
    let hasFilters = false;
    let cleanedQuery = query;

    // Column mapping for filter fields
    const columnMap: Record<string, string> = {
      'title': 'title', 'subtitle': 'subtitle', 'author': 'authors', 'artist': 'artists',
      'isbn': 'isbn', 'series': 'series', 'owner': 'owner', 'format': 'format',
      'language': 'language', 'genre': 'genres', 'tag': 'tags', 'type': 'book_type', 'book_type': 'book_type'
    };

    const isArrayColumn = (col: string): boolean => ['authors', 'artists', 'genres', 'tags'].includes(col);

    // Helper: parse comma-separated values respecting quotes
    // Handles: value1,value2,"value with spaces","another value"
    const parseCommaSeparatedValues = (valueStr: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < valueStr.length; i++) {
        const char = valueStr[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          if (current.trim()) values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) values.push(current.trim());
      return values.filter(v => v);
    };

    // Helper: extract filter value including quoted parts with spaces
    const extractFilterValue = (text: string, startIndex: number): { value: string; endIndex: number } => {
      let value = '';
      let inQuotes = false;
      let i = startIndex;

      while (i < text.length) {
        const char = text[i];
        if (char === '"') {
          inQuotes = !inQuotes;
          value += char;
        } else if (char === ' ' && !inQuotes) {
          break;
        } else {
          value += char;
        }
        i++;
      }
      return { value, endIndex: i };
    };

    // Helper to process regex patterns
    const processPattern = (pattern: RegExp, text: string, handler: (m: RegExpExecArray) => void): string => {
      let m: RegExpExecArray | null;
      let remaining = text;
      const originalText = text;
      while ((m = pattern.exec(originalText)) !== null) {
        handler(m);
        remaining = remaining.replace(m[0], ' ').trim();
      }
      return remaining;
    };

    // Text fields that support smart comma-separated parsing
    const textFields = 'title|author|artist|isbn|series|owner|format|language|genre|tag|subtitle';

    // Process negated text field filters with smart value extraction
    // Include type and book_type for negated type filters like -type:score
    const negTextFilterRe = new RegExp(`-(${textFields}|type|book_type):`, 'g');
    let match: RegExpExecArray | null;
    const negTextMatches: Array<{ field: string; value: string; fullMatch: string }> = [];
    while ((match = negTextFilterRe.exec(cleanedQuery)) !== null) {
      const field = match[1];
      const valueStart = match.index + match[0].length;
      const { value, endIndex } = extractFilterValue(cleanedQuery, valueStart);
      if (value) {
        negTextMatches.push({ field, value, fullMatch: cleanedQuery.substring(match.index, endIndex) });
      }
    }

    for (const m of negTextMatches.reverse()) {
      hasFilters = true;
      const col = columnMap[m.field];
      if (!col) continue;
      const vals = parseCommaSeparatedValues(m.value);
      if (col === 'book_type') {
        const valid = vals.filter(v => ['book', 'score', 'graphic-novel'].includes(v.toLowerCase()));
        if (valid.length === 1) { whereClauses.push(`${col} != ?`); params.push(valid[0].toLowerCase()); }
        else if (valid.length > 1) { whereClauses.push(`${col} NOT IN (${valid.map(() => '?').join(',')})`); valid.forEach(v => params.push(v.toLowerCase())); }
      } else if (isArrayColumn(col)) {
        const clauses = vals.map(v => { params.push(`%${v}%`); return `${col} LIKE ?`; });
        whereClauses.push(`NOT (${clauses.join(' OR ')})`);
      } else {
        const clauses = vals.map(v => { params.push(`%${v}%`); return `${col} LIKE ?`; });
        whereClauses.push(`NOT (${clauses.join(' OR ')})`);
      }
      cleanedQuery = cleanedQuery.replace(m.fullMatch, ' ').trim();
    }

    // Process regular text field filters with smart value extraction
    const posTextFilterRe = new RegExp(`(?<!-)(${textFields}|title_status|type|book_type):`, 'g');
    const posTextMatches: Array<{ field: string; value: string; fullMatch: string }> = [];
    while ((match = posTextFilterRe.exec(cleanedQuery)) !== null) {
      const field = match[1];
      const valueStart = match.index + match[0].length;
      const { value, endIndex } = extractFilterValue(cleanedQuery, valueStart);
      if (value) {
        posTextMatches.push({ field, value, fullMatch: cleanedQuery.substring(match.index, endIndex) });
      }
    }

    for (const m of posTextMatches.reverse()) {
      hasFilters = true;

      if (m.field === 'title_status') {
        const vals = parseCommaSeparatedValues(m.value).filter(v => ['owned', 'borrowed', 'wish'].includes(v));
        titleStatusFilter = vals.length === 1 ? vals[0] : (vals.length > 1 ? vals : null);
        cleanedQuery = cleanedQuery.replace(m.fullMatch, ' ').trim();
        continue;
      }
      if (m.field === 'type' || m.field === 'book_type') {
        const vals = parseCommaSeparatedValues(m.value).filter(v => ['book', 'score', 'graphic-novel'].includes(v.toLowerCase()));
        if (vals.length === 1) { whereClauses.push('book_type = ?'); params.push(vals[0].toLowerCase()); }
        else if (vals.length > 1) { whereClauses.push(`book_type IN (${vals.map(() => '?').join(',')})`); vals.forEach(v => params.push(v.toLowerCase())); }
        cleanedQuery = cleanedQuery.replace(m.fullMatch, ' ').trim();
        continue;
      }

      const col = columnMap[m.field];
      if (!col) continue;
      const vals = parseCommaSeparatedValues(m.value);
      if (isArrayColumn(col)) {
        if (vals.length === 1) { whereClauses.push(`${col} LIKE ?`); params.push(`%${vals[0]}%`); }
        else { const clauses = vals.map(v => { params.push(`%${v}%`); return `${col} LIKE ?`; }); whereClauses.push(`(${clauses.join(' OR ')})`); }
      } else if (col === 'owner') {
        whereClauses.push(`LOWER(${col}) = LOWER(?)`); params.push(vals[0]);
      } else {
        if (vals.length === 1) { whereClauses.push(`${col} LIKE ?`); params.push(`%${vals[0]}%`); }
        else { const clauses = vals.map(v => { params.push(`%${v}%`); return `${col} LIKE ?`; }); whereClauses.push(`(${clauses.join(' OR ')})`); }
      }
      cleanedQuery = cleanedQuery.replace(m.fullMatch, ' ').trim();
    }

    // Process has_ebook filter
    cleanedQuery = processPattern(
      /-has_ebook:(true|false)/gi,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        const v = m[1].toLowerCase();
        if (v === 'true') whereClauses.push('(ebook_file IS NULL OR ebook_file = "")');
        else if (v === 'false') whereClauses.push('ebook_file IS NOT NULL AND ebook_file != ""');
      }
    );

    cleanedQuery = processPattern(
      /has_ebook:(true|false)/gi,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        const v = m[1].toLowerCase();
        if (v === 'true') whereClauses.push('ebook_file IS NOT NULL AND ebook_file != ""');
        else if (v === 'false') whereClauses.push('(ebook_file IS NULL OR ebook_file = "")');
      }
    );

    // Process year/rating with range or operators: year:2020-2024, year:>=2020, -year:2020
    cleanedQuery = processPattern(
      /-year:(>=|<=|>|<)?(\d+)(?:-(\d+))?/g,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        if (m[3]) {
          whereClauses.push(`published_year NOT BETWEEN ? AND ?`);
          params.push(parseInt(m[2]), parseInt(m[3]));
        } else {
          const op = m[1] || '=';
          const val = parseInt(m[2]);
          const opMap: Record<string, string> = { '>=': '<', '<=': '>', '>': '<=', '<': '>=', '=': '!=' };
          whereClauses.push(`published_year ${opMap[op]} ?`);
          params.push(val);
        }
      }
    );

    cleanedQuery = processPattern(
      /year:(>=|<=|>|<)?(\d+)(?:-(\d+))?/g,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        if (m[3]) {
          whereClauses.push(`published_year BETWEEN ? AND ?`);
          params.push(parseInt(m[2]), parseInt(m[3]));
        } else {
          const op = m[1] || '=';
          const val = parseInt(m[2]);
          const opSql: Record<string, string> = { '>=': '>=', '<=': '<=', '>': '>', '<': '<', '=': '=' };
          whereClauses.push(`published_year ${opSql[op]} ?`);
          params.push(val);
        }
      }
    );

    cleanedQuery = processPattern(
      /-rating:(>=|<=|>|<)?(\d+(?:\.\d+)?)/g,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        const op = m[1] || '=';
        const val = parseFloat(m[2]);
        const opMap: Record<string, string> = { '>=': '<', '<=': '>', '>': '<=', '<': '>=', '=': '!=' };
        whereClauses.push(`rating ${opMap[op]} ?`);
        params.push(val);
      }
    );

    cleanedQuery = processPattern(
      /rating:(>=|<=|>|<)?(\d+(?:\.\d+)?)/g,
      cleanedQuery,
      (m) => {
        hasFilters = true;
        const op = m[1] || '=';
        const val = parseFloat(m[2]);
        const opSql: Record<string, string> = { '>=': '>=', '<=': '<=', '>': '>', '<': '<', '=': '=' };
        whereClauses.push(`rating ${opSql[op]} ?`);
        params.push(val);
      }
    );

    return { params, whereClauses, titleStatusFilter, hasFilters, cleanedQuery: cleanedQuery.trim() };
  },

  search: (query: string): Promise<BookFormatted[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      // Use enhanced search parser (supports OR, negation, ranges)
      const { params, whereClauses, titleStatusFilter, hasFilters, cleanedQuery } = Book._parseSearchQuery(query);

      // Build title_status filter clause (supports array for OR logic)
      let titleStatusClause = "(title_status IN ('owned', 'borrowed') OR title_status IS NULL)";
      let titleStatusParams: string[] = [];
      if (titleStatusFilter) {
        if (Array.isArray(titleStatusFilter)) {
          // Multiple statuses: title_status IN ('owned', 'wish')
          titleStatusClause = `title_status IN (${titleStatusFilter.map(() => '?').join(', ')})`;
          titleStatusParams = titleStatusFilter;
        } else {
          titleStatusClause = "title_status = ?";
          titleStatusParams = [titleStatusFilter];
        }
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

        db.all(sql, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (err: Error | null, rows: BookRow[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Book.formatRow).filter((r): r is BookFormatted => r !== null));
          }
        });
      } else {
        // Build filtered query
        // If we have filters but no general search text, we still need a WHERE clause
        let searchClause = '';
        let searchParams: string[] = [];

        if (generalSearchText && generalSearchText.length > 0) {
          // We have search text (after removing title_status filter)
          searchClause = '(title LIKE ? OR subtitle LIKE ? OR authors LIKE ? OR artists LIKE ? OR isbn LIKE ? OR isbn13 LIKE ? OR series LIKE ? OR description LIKE ?)';
          const searchTerm = `%${generalSearchText}%`;
          searchParams = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
        }

        const whereParts: string[] = [];
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

        db.all(sql, [...searchParams, ...params, ...titleStatusParams], (err: Error | null, rows: BookRow[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(Book.formatRow).filter((r): r is BookFormatted => r !== null));
          }
        });
      }
    });
  },

  update: (id: number, bookData: BookCreateData): Promise<BookUpdateResult> => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // Get existing book to preserve ebook_file if not provided
      let existingBook: BookFormatted | null = null;
      try {
        existingBook = await Book.findById(id);
      } catch (err) {
        console.warn('Could not fetch existing book to preserve ebook_file:', (err as Error).message);
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
        : (existingBook?.ebookFile || null);

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
        JSON.stringify(sanitizeUrls(bookData.urls)),
        bookData.annotation || null,
        ebookFile,
        bookData.titleStatus || 'owned',
        bookData.bookType || 'book',
        now,
        id
      ];

      db.run(sql, params, async function(this: sqlite3.RunResult, err: Error | null) {
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

  updateCover: (id: number, coverPath: string): Promise<BookCoverResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      const sql = 'UPDATE books SET cover = ?, updated_at = ? WHERE id = ?';

      db.run(sql, [coverPath, now, id], function(this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, cover: coverPath, updated_at: now });
        }
      });
    });
  },

  updateEbookFile: (id: number, ebookFilePath: string | null): Promise<BookEbookFileResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      const sql = 'UPDATE books SET ebook_file = ?, updated_at = ? WHERE id = ?';

      console.log(`Updating ebook_file for book ${id} with filename: ${ebookFilePath}`);

      db.run(sql, [ebookFilePath, now, id], function(this: sqlite3.RunResult, err: Error | null) {
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

  updateUrls: (id: number, newUrls: Record<string, string>): Promise<BookUrlsResult> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // First fetch existing urls to merge
      db.get('SELECT urls FROM books WHERE id = ?', [id], (err: Error | null, row: UrlsRow | undefined) => {
        if (err) {
          return reject(err);
        }
        const existingUrls: Record<string, string> = row && row.urls ? JSON.parse(row.urls) : {};
        const merged: Record<string, string> = { ...existingUrls, ...newUrls };

        const sql = 'UPDATE books SET urls = ?, updated_at = ? WHERE id = ?';
        db.run(sql, [JSON.stringify(merged), now, id], function(this: sqlite3.RunResult, updateErr: Error | null) {
          if (updateErr) {
            reject(updateErr);
          } else {
            resolve({ id, urls: merged, updated_at: now });
          }
        });
      });
    });
  },

  delete: (id: number): Promise<{ deleted: boolean }> => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM books WHERE id = ?';

      db.run(sql, [id], async function(this: sqlite3.RunResult, err: Error | null) {
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
  parseArrayField: (value: string | null): string[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed as string[];
      }
      // If parsed value is not an array, treat as single item
      return parsed ? [parsed as string] : [];
    } catch (e) {
      // If JSON parsing fails, treat as comma-separated string
      if (typeof value === 'string') {
        return value.split(',').map(item => item.trim()).filter(item => item);
      }
      return [];
    }
  },

  formatRow: (row: BookRow): BookFormatted | null => {
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

  autocomplete: (field: string, value: string): Promise<Record<string, string | number | null>[]> => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();

      // Validate field to prevent SQL injection
      const allowedFields = ['title', 'author', 'artist', 'series', 'publisher', 'genre', 'tag', 'owner'];
      if (!allowedFields.includes(field)) {
        return reject(new Error(`Invalid field: ${field}`));
      }

      // Map field names to column names
      const columnMap: Record<string, string> = {
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
      let sql: string;
      let params: string[];

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

      db.all(sql, params, (err: Error | null, rows: BookAutocompleteRow[]) => {
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

export default Book;
