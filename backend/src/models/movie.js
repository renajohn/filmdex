const { getDatabase } = require('../database');
const cacheService = require('../services/cacheService');

const Movie = {
  createTable: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          original_title TEXT,
          original_language TEXT,
          genre TEXT,
          director TEXT,
          cast TEXT,
          release_date TEXT,
          format TEXT,
          imdb_rating REAL,
          rotten_tomato_rating INTEGER,
          rotten_tomatoes_link TEXT,
          tmdb_rating REAL,
          tmdb_id INTEGER,
          imdb_id TEXT,
          price REAL,
          runtime INTEGER,
          plot TEXT,
          comments TEXT,
          never_seen BOOLEAN,
          acquired_date DATE,
          import_id TEXT,
          poster_path TEXT,
          backdrop_path TEXT,
          budget INTEGER,
          revenue INTEGER,
          trailer_key TEXT,
          trailer_site TEXT,
          status TEXT,
          popularity REAL,
          vote_count INTEGER,
          adult BOOLEAN,
          video BOOLEAN,
          media_type TEXT DEFAULT 'movie',
          recommended_age INTEGER,
          age_processed BOOLEAN DEFAULT 0,
          title_status TEXT DEFAULT 'owned'
        )
      `;
      db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // Create unique index for multiple editions support
          db.run(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_edition_unique 
            ON movies(title, tmdb_id, format)
          `, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    });
  },

  create: (movie) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { 
        title, original_title, original_language, genre, director, cast, release_date, format, 
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type = 'movie', recommended_age, age_processed = false, title_status = 'owned'
      } = movie;
      const sql = `
        INSERT INTO movies (title, original_title, original_language, genre, director, cast, release_date, format, 
                           imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
                           price, runtime, plot, comments, never_seen, acquired_date, import_id,
                           poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
                           popularity, vote_count, adult, video, media_type, recommended_age, age_processed, title_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
        imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
        price, runtime, plot, comments, never_seen, acquired_date, import_id,
        poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
        popularity, vote_count, adult, video, media_type, recommended_age, age_processed, title_status
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          // Return the full movie data with the new ID
          const createdMovie = {
            id: this.lastID,
            title,
            original_title,
            original_language,
            genre,
            director,
            cast: Array.isArray(cast) ? cast : (cast ? JSON.parse(cast) : []),
            release_date,
            format,
            imdb_rating,
            rotten_tomato_rating,
            rotten_tomatoes_link,
            tmdb_rating,
            tmdb_id,
            imdb_id,
            price,
            runtime,
            plot,
            comments,
            never_seen,
            acquired_date,
            import_id,
            poster_path,
            backdrop_path,
            budget,
            revenue,
            trailer_key,
            trailer_site,
            status,
            popularity,
            vote_count,
            adult,
            video,
            media_type,
            recommended_age,
            age_processed,
            title_status
          };
          resolve(createdMovie);
        }
      });
    });
  },

  findAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*,
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set' 
            THEN c.id || ':' || c.name || ':' || c.type 
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user' 
            THEN c.name 
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        GROUP BY m.id
        ORDER BY m.title
      `;
      db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie = { ...row };
            
            // Parse box set collections info
            if (movie.box_set_collections && movie.box_set_collections.trim() !== '') {
              const boxSetData = movie.box_set_collections.split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;
            
            // Parse user collections info
            if (movie.user_collections && movie.user_collections.trim() !== '') {
              const collectionNames = movie.user_collections.split(',').filter(name => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;
            
            return movie;
          });
          resolve(movies);
        }
      });
    });
  },

  search: (criteria) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      let sql = `
        SELECT m.*,
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set' 
            THEN c.id || ':' || c.name || ':' || c.type 
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user' 
            THEN c.name 
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        WHERE 1=1
      `;
      const params = [];

      // Filter by title_status if specified, otherwise return owned movies by default
      if (criteria.title_status) {
        sql += ' AND m.title_status = ?';
        params.push(criteria.title_status);
      } else {
        // Only return owned movies by default (for collection search)
        sql += ' AND (m.title_status = ? OR m.title_status IS NULL)';
        params.push('owned');
      }

      // Advanced search with multiple filter support
      // Enhanced with: OR syntax (genre:action,comedy), negation (-genre:horror), ranges (year:2020-2024)
      if (criteria.searchText) {
        let searchText = criteria.searchText.trim();
        
        // Parse all special syntax filters with OR and negation support
        const filters = {
          actors: [],        // { values: [...], negate: bool }
          directors: [],
          titles: [],
          collections: [],
          boxSets: [],
          genres: [],
          formats: [],
          languages: [],
          mediaTypes: [],
          years: [],
          imdbRatings: [],
          tmdbRatings: [],
          rottenTomatoRatings: [],
          ages: [],
          prices: [],
          hasComments: [],
          watched: [],
          lastWatched: []
        };
        
        // Helper: parse comma-separated values respecting quotes
        // Handles: value1,value2,"value with spaces","another value"
        const parseCommaSeparatedValues = (valueStr) => {
          const values = [];
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
        const extractFilterValue = (text, startIndex) => {
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
        
        // Helper to extract text filters with smart comma-separated value parsing
        const extractTextFilter = (fieldName, text) => {
          const results = [];
          let remaining = text;
          
          // Find negated filters: -field:...
          const negRe = new RegExp(`-${fieldName}:`, 'g');
          let match;
          const negMatches = [];
          while ((match = negRe.exec(text)) !== null) {
            const valueStart = match.index + match[0].length;
            const { value, endIndex } = extractFilterValue(text, valueStart);
            if (value) {
              negMatches.push({ value, fullMatch: text.substring(match.index, endIndex) });
            }
          }
          for (const m of negMatches.reverse()) {
            const values = parseCommaSeparatedValues(m.value);
            if (values.length > 0) {
              results.push({ values, negate: true });
              remaining = remaining.replace(m.fullMatch, ' ').trim();
            }
          }
          
          // Find regular filters: field:... (not preceded by -)
          const posRe = new RegExp(`(?<!-)${fieldName}:`, 'g');
          const posMatches = [];
          while ((match = posRe.exec(remaining)) !== null) {
            const valueStart = match.index + match[0].length;
            const { value, endIndex } = extractFilterValue(remaining, valueStart);
            if (value) {
              posMatches.push({ value, fullMatch: remaining.substring(match.index, endIndex) });
            }
          }
          for (const m of posMatches.reverse()) {
            const values = parseCommaSeparatedValues(m.value);
            if (values.length > 0) {
              results.push({ values, negate: false });
              remaining = remaining.replace(m.fullMatch, ' ').trim();
            }
          }
          
          return { filters: results, remainingText: remaining };
        };
        
        // Extract all text-based filters
        let result;
        result = extractTextFilter('actor', searchText);
        filters.actors = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('director', searchText);
        filters.directors = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('title', searchText);
        filters.titles = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('collection', searchText);
        filters.collections = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('box_set', searchText);
        filters.boxSets = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('genre', searchText);
        filters.genres = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('format', searchText);
        filters.formats = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('original_language', searchText);
        filters.languages = result.filters;
        searchText = result.remainingText;
        
        result = extractTextFilter('media_type', searchText);
        filters.mediaTypes = result.filters;
        searchText = result.remainingText;
        
        // Extract year filters with range support: year:2020-2024, year:>=2020, -year:2020
        // Negated year with range
        const negYearRangeRe = /-year:(\d+)-(\d+)/g;
        let yearM;
        while ((yearM = negYearRangeRe.exec(searchText)) !== null) {
          filters.years.push({ operator: 'not_between', min: parseInt(yearM[1]), max: parseInt(yearM[2]) });
        }
        searchText = searchText.replace(negYearRangeRe, '').trim();
        
        // Regular year with range
        const yearRangeRe = /(?<!-)year:(\d+)-(\d+)/g;
        while ((yearM = yearRangeRe.exec(searchText)) !== null) {
          filters.years.push({ operator: 'between', min: parseInt(yearM[1]), max: parseInt(yearM[2]) });
        }
        searchText = searchText.replace(yearRangeRe, '').trim();
        
        // Negated year with operator
        const negYearOpRe = /-year:(>=|<=|>|<|)(\d+)/g;
        while ((yearM = negYearOpRe.exec(searchText)) !== null) {
          const op = yearM[1] || '=';
          const opMap = { '>=': '<', '<=': '>', '>': '<=', '<': '>=', '=': '!=' };
          filters.years.push({ operator: opMap[op], value: parseInt(yearM[2]) });
        }
        searchText = searchText.replace(negYearOpRe, '').trim();
        
        // Regular year with operator
        const yearRegex = /(?<!-)year:(>=|<=|>|<|)(\d+)/g;
        while ((yearM = yearRegex.exec(searchText)) !== null) {
          const operator = yearM[1] || '=';
          const value = parseInt(yearM[2]);
          filters.years.push({ operator, value });
        }
        searchText = searchText.replace(yearRegex, '').trim();
        
        // Extract imdb_rating: filters with operators
        const imdbRatingRegex = /imdb_rating:(>=|<=|>|<|)(\d+(?:\.\d+)?)/g;
        let imdbRatingMatches;
        while ((imdbRatingMatches = imdbRatingRegex.exec(searchText)) !== null) {
          const operator = imdbRatingMatches[1] || '=';
          const value = parseFloat(imdbRatingMatches[2]);
          filters.imdbRatings.push({ operator, value });
        }
        searchText = searchText.replace(imdbRatingRegex, '').trim();
        
        // Extract tmdb_rating: filters with operators
        const tmdbRatingRegex = /tmdb_rating:(>=|<=|>|<|)(\d+(?:\.\d+)?)/g;
        let tmdbRatingMatches;
        while ((tmdbRatingMatches = tmdbRatingRegex.exec(searchText)) !== null) {
          const operator = tmdbRatingMatches[1] || '=';
          const value = parseFloat(tmdbRatingMatches[2]);
          filters.tmdbRatings.push({ operator, value });
        }
        searchText = searchText.replace(tmdbRatingRegex, '').trim();
        
        // Extract rotten_tomato_rating: filters with operators
        const rottenTomatoRatingRegex = /rotten_tomato_rating:(>=|<=|>|<|)(\d+(?:\.\d+)?)/g;
        let rottenTomatoRatingMatches;
        while ((rottenTomatoRatingMatches = rottenTomatoRatingRegex.exec(searchText)) !== null) {
          const operator = rottenTomatoRatingMatches[1] || '=';
          const value = parseFloat(rottenTomatoRatingMatches[2]);
          filters.rottenTomatoRatings.push({ operator, value });
        }
        searchText = searchText.replace(rottenTomatoRatingRegex, '').trim();
        
        // Extract recommended_age: filters with operators
        const ageRegex = /recommended_age:(>=|<=|>|<|)(\d+)/g;
        let ageMatches;
        while ((ageMatches = ageRegex.exec(searchText)) !== null) {
          const operator = ageMatches[1] || '=';
          const value = parseInt(ageMatches[2]);
          filters.ages.push({ operator, value });
        }
        searchText = searchText.replace(ageRegex, '').trim();
        
        // Extract price: filters with operators
        const priceRegex = /price:(>=|<=|>|<|)(\d+(?:\.\d+)?)/g;
        let priceMatches;
        while ((priceMatches = priceRegex.exec(searchText)) !== null) {
          const operator = priceMatches[1] || '=';
          const value = parseFloat(priceMatches[2]);
          filters.prices.push({ operator, value });
        }
        searchText = searchText.replace(priceRegex, '').trim();
        
        // Extract has_comments: filters (boolean)
        const hasCommentsRegex = /has_comments:(true|false)/g;
        let hasCommentsMatches;
        while ((hasCommentsMatches = hasCommentsRegex.exec(searchText)) !== null) {
          const value = hasCommentsMatches[1] === 'true';
          filters.hasComments.push(value);
        }
        searchText = searchText.replace(hasCommentsRegex, '').trim();
        
        // Extract watched: filters (boolean or numeric with operators)
        // Supports: watched:true, watched:false, watched:yes, watched:no
        //           watched:1, watched:>1, watched:>=2, watched:<3, watched:<=5
        const watchedBoolRegex = /watched:(yes|no|true|false)/gi;
        let watchedBoolMatches;
        while ((watchedBoolMatches = watchedBoolRegex.exec(searchText)) !== null) {
          const value = watchedBoolMatches[1].toLowerCase();
          // true/yes means watch_count > 0, false/no means watch_count = 0
          if (value === 'yes' || value === 'true') {
            filters.watched.push({ type: 'boolean', value: true });
          } else {
            filters.watched.push({ type: 'boolean', value: false });
          }
        }
        searchText = searchText.replace(watchedBoolRegex, '').trim();
        
        // Extract watched: filters with numeric operators
        const watchedNumRegex = /watched:(>=|<=|>|<|)(\d+)/g;
        let watchedNumMatches;
        while ((watchedNumMatches = watchedNumRegex.exec(searchText)) !== null) {
          const operator = watchedNumMatches[1] || '=';
          const value = parseInt(watchedNumMatches[2]);
          filters.watched.push({ type: 'numeric', operator, value });
        }
        searchText = searchText.replace(watchedNumRegex, '').trim();
        
        // Extract last_watched: filters (relative dates and specific dates)
        // Supports: today, yesterday, week, month, year, YYYY, YYYY-MM, >YYYY-MM-DD, <YYYY-MM-DD
        const lastWatchedRegex = /last_watched:(today|yesterday|week|month|year|>?\d{4}(?:-\d{2})?(?:-\d{2})?|<?\d{4}(?:-\d{2})?(?:-\d{2})?)/gi;
        let lastWatchedMatches;
        while ((lastWatchedMatches = lastWatchedRegex.exec(searchText)) !== null) {
          const value = lastWatchedMatches[1].toLowerCase();
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (value === 'today') {
            filters.lastWatched.push({ type: 'date', value: today.toISOString().split('T')[0] });
          } else if (value === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            filters.lastWatched.push({ type: 'date', value: yesterday.toISOString().split('T')[0] });
          } else if (value === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filters.lastWatched.push({ type: 'after', value: weekAgo.toISOString().split('T')[0] });
          } else if (value === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setDate(monthAgo.getDate() - 30);
            filters.lastWatched.push({ type: 'after', value: monthAgo.toISOString().split('T')[0] });
          } else if (value === 'year') {
            const yearAgo = new Date(today);
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            filters.lastWatched.push({ type: 'after', value: yearAgo.toISOString().split('T')[0] });
          } else if (value.startsWith('>')) {
            filters.lastWatched.push({ type: 'after', value: value.substring(1) });
          } else if (value.startsWith('<')) {
            filters.lastWatched.push({ type: 'before', value: value.substring(1) });
          } else if (value.length === 4) {
            // Year only: YYYY
            filters.lastWatched.push({ type: 'year', value: value });
          } else if (value.length === 7) {
            // Year-month: YYYY-MM
            filters.lastWatched.push({ type: 'month', value: value });
          } else {
            // Full date: YYYY-MM-DD
            filters.lastWatched.push({ type: 'date', value: value });
          }
        }
        searchText = searchText.replace(lastWatchedRegex, '').trim();
        
        // Remove incomplete predicates (predicates without values) from search text
        // This prevents them from being treated as generic search terms
        const incompletePredicateRegex = /\b(actor|director|title|collection|box_set|genre|format|original_language|media_type|year|imdb_rating|tmdb_rating|rotten_tomato_rating|recommended_age|price|has_comments|watched|last_watched):\s*$/g;
        searchText = searchText.replace(incompletePredicateRegex, '').trim();
        
        // Also remove predicates with operators but no values (e.g., "imdb_rating:>", "year:<=")
        const incompleteOperatorPredicateRegex = /\b(year|imdb_rating|tmdb_rating|rotten_tomato_rating|recommended_age|price|watched|last_watched):(>=|<=|>|<)\s*$/g;
        searchText = searchText.replace(incompleteOperatorPredicateRegex, '').trim();
        
        // Helper to apply text filter with OR/negation support
        const applyTextFilter = (filterList, column, columnIsTitle = false) => {
          filterList.forEach(filter => {
            if (filter.values.length === 0) return;
            
            let clause;
            if (columnIsTitle) {
              // Title searches both title and original_title
              if (filter.values.length === 1) {
                clause = `(m.title LIKE ? OR m.original_title LIKE ?)`;
                params.push(`%${filter.values[0]}%`, `%${filter.values[0]}%`);
              } else {
                const orClauses = filter.values.map(v => {
                  params.push(`%${v}%`, `%${v}%`);
                  return `(m.title LIKE ? OR m.original_title LIKE ?)`;
                });
                clause = `(${orClauses.join(' OR ')})`;
              }
            } else {
              if (filter.values.length === 1) {
                clause = `${column} LIKE ?`;
                params.push(`%${filter.values[0]}%`);
              } else {
                const orClauses = filter.values.map(v => {
                  params.push(`%${v}%`);
                  return `${column} LIKE ?`;
                });
                clause = `(${orClauses.join(' OR ')})`;
              }
            }
            
            sql += filter.negate ? ` AND NOT ${clause}` : ` AND ${clause}`;
          });
        };
        
        // Helper to apply collection/box_set filter with OR/negation
        const applyCollectionFilter = (filterList, isBoxSet = false) => {
          filterList.forEach(filter => {
            if (filter.values.length === 0) return;
            
            let existsClause;
            if (filter.values.length === 1) {
              if (isBoxSet) {
                existsClause = `EXISTS (
                  SELECT 1 FROM movie_collections mc_f
                  JOIN collections c_f ON mc_f.collection_id = c_f.id
                  WHERE mc_f.movie_id = m.id AND c_f.type = 'box_set' AND c_f.name LIKE ?
                )`;
              } else {
                existsClause = `EXISTS (
                  SELECT 1 FROM movie_collections mc_f
                  JOIN collections c_f ON mc_f.collection_id = c_f.id
                  WHERE mc_f.movie_id = m.id AND c_f.name LIKE ?
                )`;
              }
              params.push(`%${filter.values[0]}%`);
            } else {
              const orClauses = filter.values.map(v => {
                params.push(`%${v}%`);
                return `c_f.name LIKE ?`;
              });
              if (isBoxSet) {
                existsClause = `EXISTS (
                  SELECT 1 FROM movie_collections mc_f
                  JOIN collections c_f ON mc_f.collection_id = c_f.id
                  WHERE mc_f.movie_id = m.id AND c_f.type = 'box_set' AND (${orClauses.join(' OR ')})
                )`;
              } else {
                existsClause = `EXISTS (
                  SELECT 1 FROM movie_collections mc_f
                  JOIN collections c_f ON mc_f.collection_id = c_f.id
                  WHERE mc_f.movie_id = m.id AND (${orClauses.join(' OR ')})
                )`;
              }
            }
            
            sql += filter.negate ? ` AND NOT ${existsClause}` : ` AND ${existsClause}`;
          });
        };
        
        // Apply actor filters (supports OR and negation)
        applyTextFilter(filters.actors, 'm.cast');
        
        // Apply director filters
        applyTextFilter(filters.directors, 'm.director');
        
        // Apply title filters
        applyTextFilter(filters.titles, null, true);
        
        // Apply collection filters
        applyCollectionFilter(filters.collections, false);
        
        // Apply box set filters
        applyCollectionFilter(filters.boxSets, true);
        
        // Apply genre filters
        applyTextFilter(filters.genres, 'm.genre');
        
        // Apply format filters
        applyTextFilter(filters.formats, 'm.format');
        
        // Apply language filters
        applyTextFilter(filters.languages, 'm.original_language');
        
        // Apply media type filters
        applyTextFilter(filters.mediaTypes, 'm.media_type');
        
        // Apply year filters (with range support)
        filters.years.forEach(yearFilter => {
          switch (yearFilter.operator) {
            case 'between':
              sql += ` AND CAST(strftime('%Y', m.release_date) AS INTEGER) BETWEEN ? AND ?`;
              params.push(yearFilter.min, yearFilter.max);
              break;
            case 'not_between':
              sql += ` AND CAST(strftime('%Y', m.release_date) AS INTEGER) NOT BETWEEN ? AND ?`;
              params.push(yearFilter.min, yearFilter.max);
              break;
            case '!=':
              sql += ` AND strftime('%Y', m.release_date) != ?`;
              params.push(yearFilter.value.toString());
              break;
            case '>':
              sql += ` AND strftime('%Y', m.release_date) > ?`;
              params.push(yearFilter.value.toString());
              break;
            case '<':
              sql += ` AND strftime('%Y', m.release_date) < ?`;
              params.push(yearFilter.value.toString());
              break;
            case '>=':
              sql += ` AND strftime('%Y', m.release_date) >= ?`;
              params.push(yearFilter.value.toString());
              break;
            case '<=':
              sql += ` AND strftime('%Y', m.release_date) <= ?`;
              params.push(yearFilter.value.toString());
              break;
            case '=':
            default:
              sql += ` AND strftime('%Y', m.release_date) = ?`;
              params.push(yearFilter.value.toString());
              break;
          }
        });
        
        // Apply IMDB rating filters (AND logic)
        filters.imdbRatings.forEach(ratingFilter => {
          switch (ratingFilter.operator) {
            case '>':
              sql += ` AND m.imdb_rating > ?`;
              params.push(ratingFilter.value);
              break;
            case '<':
              sql += ` AND m.imdb_rating < ?`;
              params.push(ratingFilter.value);
              break;
            case '>=':
              sql += ` AND m.imdb_rating >= ?`;
              params.push(ratingFilter.value);
              break;
            case '<=':
              sql += ` AND m.imdb_rating <= ?`;
              params.push(ratingFilter.value);
              break;
            case '=':
            default:
              sql += ` AND m.imdb_rating = ?`;
              params.push(ratingFilter.value);
              break;
          }
        });
        
        // Apply TMDB rating filters (AND logic)
        filters.tmdbRatings.forEach(ratingFilter => {
          switch (ratingFilter.operator) {
            case '>':
              sql += ` AND m.tmdb_rating > ?`;
              params.push(ratingFilter.value);
              break;
            case '<':
              sql += ` AND m.tmdb_rating < ?`;
              params.push(ratingFilter.value);
              break;
            case '>=':
              sql += ` AND m.tmdb_rating >= ?`;
              params.push(ratingFilter.value);
              break;
            case '<=':
              sql += ` AND m.tmdb_rating <= ?`;
              params.push(ratingFilter.value);
              break;
            case '=':
            default:
              sql += ` AND m.tmdb_rating = ?`;
              params.push(ratingFilter.value);
              break;
          }
        });
        
        // Apply Rotten Tomatoes rating filters (AND logic)
        filters.rottenTomatoRatings.forEach(ratingFilter => {
          switch (ratingFilter.operator) {
            case '>':
              sql += ` AND m.rotten_tomato_rating > ?`;
              params.push(ratingFilter.value);
              break;
            case '<':
              sql += ` AND m.rotten_tomato_rating < ?`;
              params.push(ratingFilter.value);
              break;
            case '>=':
              sql += ` AND m.rotten_tomato_rating >= ?`;
              params.push(ratingFilter.value);
              break;
            case '<=':
              sql += ` AND m.rotten_tomato_rating <= ?`;
              params.push(ratingFilter.value);
              break;
            case '=':
            default:
              sql += ` AND m.rotten_tomato_rating = ?`;
              params.push(ratingFilter.value);
              break;
          }
        });
        
        // Apply age filters (AND logic)
        filters.ages.forEach(ageFilter => {
          switch (ageFilter.operator) {
            case '>':
              sql += ` AND m.recommended_age > ?`;
              params.push(ageFilter.value);
              break;
            case '<':
              sql += ` AND m.recommended_age < ?`;
              params.push(ageFilter.value);
              break;
            case '>=':
              sql += ` AND m.recommended_age >= ?`;
              params.push(ageFilter.value);
              break;
            case '<=':
              sql += ` AND m.recommended_age <= ?`;
              params.push(ageFilter.value);
              break;
            case '=':
            default:
              sql += ` AND m.recommended_age = ?`;
              params.push(ageFilter.value);
              break;
          }
        });
        
        // Apply price filters (AND logic)
        filters.prices.forEach(priceFilter => {
          switch (priceFilter.operator) {
            case '>':
              sql += ` AND m.price > ?`;
              params.push(priceFilter.value);
              break;
            case '<':
              sql += ` AND m.price < ?`;
              params.push(priceFilter.value);
              break;
            case '>=':
              sql += ` AND m.price >= ?`;
              params.push(priceFilter.value);
              break;
            case '<=':
              sql += ` AND m.price <= ?`;
              params.push(priceFilter.value);
              break;
            case '=':
            default:
              sql += ` AND m.price = ?`;
              params.push(priceFilter.value);
              break;
          }
        });
        
        // Apply has_comments filters (AND logic)
        filters.hasComments.forEach(hasComments => {
          if (hasComments) {
            // Has comments: comments is not null and not empty
            sql += ` AND m.comments IS NOT NULL AND m.comments != ''`;
          } else {
            // No comments: comments is null or empty
            sql += ` AND (m.comments IS NULL OR m.comments = '')`;
          }
        });
        
        // Apply watched filters (AND logic)
        filters.watched.forEach(watchedFilter => {
          if (watchedFilter.type === 'boolean') {
            if (watchedFilter.value) {
              // Has been watched: watch_count > 0
              sql += ` AND COALESCE(m.watch_count, 0) > 0`;
            } else {
              // Never watched: watch_count = 0 or null
              sql += ` AND COALESCE(m.watch_count, 0) = 0`;
            }
          } else if (watchedFilter.type === 'numeric') {
            // Numeric filter with operator
            const op = watchedFilter.operator;
            const val = watchedFilter.value;
            switch (op) {
              case '>':
                sql += ` AND COALESCE(m.watch_count, 0) > ?`;
                params.push(val);
                break;
              case '<':
                sql += ` AND COALESCE(m.watch_count, 0) < ?`;
                params.push(val);
                break;
              case '>=':
                sql += ` AND COALESCE(m.watch_count, 0) >= ?`;
                params.push(val);
                break;
              case '<=':
                sql += ` AND COALESCE(m.watch_count, 0) <= ?`;
                params.push(val);
                break;
              case '=':
              default:
                sql += ` AND COALESCE(m.watch_count, 0) = ?`;
                params.push(val);
                break;
            }
          }
        });
        
        // Apply last_watched filters (AND logic)
        filters.lastWatched.forEach(lwFilter => {
          switch (lwFilter.type) {
            case 'date':
              // Exact date match
              sql += ` AND m.last_watched = ?`;
              params.push(lwFilter.value);
              break;
            case 'after':
              // After a specific date
              sql += ` AND m.last_watched >= ?`;
              params.push(lwFilter.value);
              break;
            case 'before':
              // Before a specific date
              sql += ` AND m.last_watched < ?`;
              params.push(lwFilter.value);
              break;
            case 'year':
              // Within a specific year (YYYY)
              sql += ` AND strftime('%Y', m.last_watched) = ?`;
              params.push(lwFilter.value);
              break;
            case 'month':
              // Within a specific month (YYYY-MM)
              sql += ` AND strftime('%Y-%m', m.last_watched) = ?`;
              params.push(lwFilter.value);
              break;
          }
        });
        
        // Apply remaining generic search terms (if any)
        if (searchText.length > 0) {
          sql += ` AND (
            m.title LIKE ? OR 
            m.original_title LIKE ? OR 
            m.director LIKE ? OR 
            m.comments LIKE ? OR
            EXISTS (
              SELECT 1 FROM movie_collections mc2
              JOIN collections c2 ON mc2.collection_id = c2.id
              WHERE mc2.movie_id = m.id AND c2.name LIKE ?
            )
          )`;
          const genericTerm = `%${searchText}%`;
          params.push(genericTerm, genericTerm, genericTerm, genericTerm, genericTerm);
        }
      }

      if (criteria.format) {
        sql += ' AND m.format = ?';
        params.push(criteria.format);
      }

      // Search by year in release_date
      if (criteria.year) {
        sql += ' AND (m.release_date LIKE ? OR strftime("%Y", m.release_date) = ?)';
        params.push(`%${criteria.year}%`, criteria.year.toString());
      }

      sql += ' GROUP BY m.id ORDER BY m.title';

      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie = { ...row };
            
            // Parse box set collections info
            if (movie.box_set_collections && movie.box_set_collections.trim() !== '') {
              const boxSetData = movie.box_set_collections.split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;
            
            // Parse user collections info
            if (movie.user_collections && movie.user_collections.trim() !== '') {
              const collectionNames = movie.user_collections.split(',').filter(name => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;
            
            return movie;
          });
          resolve(movies);
        }
      });
    });
  },

  getFormats: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `SELECT DISTINCT format FROM movies WHERE format IS NOT NULL AND format != '' ORDER BY format`;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.format));
        }
      });
    });
  },

  findById: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*
        FROM movies m
        WHERE m.id = ?
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          // Map the raw database row to the expected format
          const movie = {
            id: row.id,
            title: row.title,
            original_title: row.original_title,
            original_language: row.original_language,
            genre: row.genre,
            director: row.director,
            cast: Array.isArray(row.cast) ? row.cast : (row.cast ? JSON.parse(row.cast) : []),
            release_date: row.release_date,
            format: row.format,
            imdb_rating: row.imdb_rating,
            rotten_tomato_rating: row.rotten_tomato_rating,
            rotten_tomatoes_link: row.rotten_tomatoes_link,
            tmdb_rating: row.tmdb_rating,
            tmdb_id: row.tmdb_id,
            imdb_id: row.imdb_id,
            price: row.price,
            runtime: row.runtime,
            plot: row.plot,
            comments: row.comments,
            never_seen: row.never_seen,
            acquired_date: row.acquired_date,
            import_id: row.import_id,
            poster_path: row.poster_path,
            backdrop_path: row.backdrop_path,
            budget: row.budget,
            revenue: row.revenue,
            trailer_key: row.trailer_key,
            trailer_site: row.trailer_site,
            status: row.status,
            popularity: row.popularity,
            vote_count: row.vote_count,
            adult: row.adult,
            video: row.video,
            media_type: row.media_type,
            recommended_age: row.recommended_age,
            age_processed: row.age_processed,
            title_status: row.title_status || 'owned',
            last_watched: row.last_watched,
            watch_count: row.watch_count || 0
          };
          
          resolve(movie);
        }
      });
    });
  },

  // Mark a movie as watched (optionally increments watch_count, sets last_watched, and never_seen to false)
  // incrementCount: true = always increment, false = only increment if count was 0
  markAsWatched: (id, date = null, incrementCount = true) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const watchDate = date || new Date().toISOString().split('T')[0];
      
      // If incrementCount is false, only increment if count is currently 0
      const sql = incrementCount
        ? `UPDATE movies SET last_watched = ?, never_seen = 0, watch_count = COALESCE(watch_count, 0) + 1 WHERE id = ?`
        : `UPDATE movies SET last_watched = ?, never_seen = 0, watch_count = CASE WHEN COALESCE(watch_count, 0) = 0 THEN 1 ELSE watch_count END WHERE id = ?`;
      
      db.run(sql, [watchDate, id], function(err) {
        if (err) {
          reject(err);
        } else {
          // Get the updated watch_count
          db.get(`SELECT watch_count FROM movies WHERE id = ?`, [id], (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve({ 
                id: id, 
                last_watched: watchDate,
                watch_count: row ? row.watch_count : 1,
                never_seen: false,
                changes: this.changes 
              });
            }
          });
        }
      });
    });
  },

  // Clear the watched date and count (reset watch history)
  clearWatched: (id) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      
      const sql = `UPDATE movies SET last_watched = NULL, watch_count = 0 WHERE id = ?`;
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ 
            id: id, 
            last_watched: null,
            watch_count: 0,
            changes: this.changes 
          });
        }
      });
    });
  },

  // Update watch count directly (for manual editing)
  updateWatchCount: (id, count) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const watchCount = Math.max(0, parseInt(count) || 0);
      
      const sql = `UPDATE movies SET watch_count = ? WHERE id = ?`;
      
      db.run(sql, [watchCount, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ 
            id: id, 
            watch_count: watchCount,
            changes: this.changes 
          });
        }
      });
    });
  },

  findByImdbId: (imdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE imdb_id = ?';
      
      db.get(sql, [imdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByTmdbId: (tmdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE tmdb_id = ?';
      
      db.get(sql, [tmdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  update: (id, movieData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        const { 
          title, original_title, original_language, genre, director, cast, release_date, format, 
          imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
          price, runtime, plot, comments, never_seen, acquired_date, import_id,
          poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
          popularity, vote_count, adult, video, media_type = 'movie', recommended_age, title_status
        } = movieData;
        
        const sql = `
          UPDATE movies 
          SET title = ?, original_title = ?, original_language = ?, genre = ?, director = ?, cast = ?, 
              release_date = ?, format = ?, imdb_rating = ?, rotten_tomato_rating = ?, 
              rotten_tomatoes_link = ?, tmdb_rating = ?, tmdb_id = ?, imdb_id = ?, 
              price = ?, runtime = ?, plot = ?, comments = ?, never_seen = ?, acquired_date = ?, import_id = ?,
              poster_path = ?, backdrop_path = ?, budget = ?, revenue = ?, trailer_key = ?, trailer_site = ?,
              status = ?, popularity = ?, vote_count = ?, adult = ?, video = ?, media_type = ?, recommended_age = ?, title_status = ?
          WHERE id = ?
        `;
        
        db.run(sql, [
          title, original_title, original_language, genre, director, JSON.stringify(cast), release_date, format,
          imdb_rating, rotten_tomato_rating, rotten_tomatoes_link, tmdb_rating, tmdb_id, imdb_id,
          price, runtime, plot, comments, never_seen, acquired_date, import_id,
          poster_path, backdrop_path, budget, revenue, trailer_key, trailer_site, status,
          popularity, vote_count, adult, video, media_type, recommended_age, title_status, id
        ], function(err) {
          if (err) {
            console.error(`[Movie.update] Error updating movie ID ${id}:`, err);
            reject(err);
          } else {
            resolve({ id: id, changes: this.changes });
          }
        });
      } catch (error) {
        console.error(`[Movie.update] Error in update process for movie ID ${id}:`, error);
        reject(error);
      }
    });
  },

  // Update only specific fields (for simplified editing)
  updateFields: (id, movieData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        
        // Build dynamic SQL based on provided fields
        const fields = [];
        const values = [];
        
        Object.keys(movieData).forEach(key => {
          if (movieData[key] !== undefined) {
            if (key === 'cast' && Array.isArray(movieData[key])) {
              fields.push(`${key} = ?`);
              values.push(JSON.stringify(movieData[key]));
            } else {
              fields.push(`${key} = ?`);
              values.push(movieData[key]);
            }
          }
        });
        
        if (fields.length === 0) {
          resolve({ id: id, changes: 0 });
          return;
        }
        
        values.push(id);
        const sql = `UPDATE movies SET ${fields.join(', ')} WHERE id = ?`;
        
        db.run(sql, values, async function(err) {
          if (err) {
            reject(err);
          } else {
            // Invalidate analytics cache when movie is updated
            await cacheService.invalidateAnalytics();
            resolve({ id: id, changes: this.changes });
          }
        });
      } catch (error) {
        console.error(`[Movie.updateFields] Error in updateFields process for movie ID ${id}:`, error);
        reject(error);
      }
    });
  },

  delete: (id) => {
    return new Promise(async (resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies WHERE id = ?';
      
      db.run(sql, [id], async function(err) {
        if (err) {
          reject(err);
        } else {
          // Invalidate analytics cache when movie is deleted
          await cacheService.invalidateAnalytics();
          resolve({ id: id, changes: this.changes });
        }
      });
    });
  },

  deleteAll: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'DELETE FROM movies';
      
      db.run(sql, [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes });
        }
      });
    });
  },

  findByTitle: (title) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE LOWER(title) = LOWER(?)';
      
      db.get(sql, [title], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  findByTmdbId: (tmdbId) => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = 'SELECT * FROM movies WHERE tmdb_id = ?';
        
        db.get(sql, [tmdbId], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Find all movies with the same TMDB ID (different editions)
  findAllByTmdbId: (tmdbId) => {
    return new Promise((resolve, reject) => {
      try {
        const db = getDatabase();
        const sql = 'SELECT * FROM movies WHERE tmdb_id = ? ORDER BY title, format';
        
        db.all(sql, [tmdbId], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  findByImdbId: (imdbId) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'SELECT * FROM movies WHERE imdb_id = ?';
      
      db.get(sql, [imdbId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Helper method to build IMDB URL from ID
  buildImdbUrl: (imdbId) => {
    return imdbId ? `https://www.imdb.com/title/${imdbId}` : null;
  },

  // Helper method to build TMDB URL from ID
  buildTmdbUrl: (tmdbId) => {
    return tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null;
  },

  upsert: (movieData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const existingMovie = await Movie.findByTitle(movieData.title);
        
        if (existingMovie) {
          // Update existing movie
          const updatedMovie = await Movie.update(existingMovie.id, movieData);
          resolve({ ...updatedMovie, action: 'updated' });
        } else {
          // Create new movie
          const newMovie = await Movie.create(movieData);
          resolve({ ...newMovie, action: 'created' });
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  // Validate and clean up image paths
  validateImagePaths: (movie) => {
    const fs = require('fs');
    const path = require('path');
    const configManager = require('../config');
    
    try {
      const imagesPath = configManager.getImagesPath();
      let cleanedMovie = { ...movie };
      
      // Check poster_path
      if (movie.poster_path && movie.poster_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.poster_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          cleanedMovie.poster_path = null;
        }
      }
      
      // Check backdrop_path
      if (movie.backdrop_path && movie.backdrop_path.startsWith('/images/')) {
        const localPath = path.join(imagesPath, movie.backdrop_path.replace('/images/', ''));
        if (!fs.existsSync(localPath)) {
          cleanedMovie.backdrop_path = null;
        }
      }
      
      return cleanedMovie;
    } catch (error) {
      console.error('Error validating image paths:', error);
      return movie; // Return original if validation fails
    }
  },

  // Get movies by title_status
  findByStatus: (status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        SELECT m.*,
          MAX(CASE WHEN c.type = 'box_set' THEN mc.collection_order END) as collection_order,
          GROUP_CONCAT(
            CASE WHEN c.type = 'box_set' 
            THEN c.id || ':' || c.name || ':' || c.type 
            END
          ) as box_set_collections,
          GROUP_CONCAT(
            CASE WHEN c.type = 'user' 
            THEN c.name 
            END
          ) as user_collections
        FROM movies m
        LEFT JOIN movie_collections mc ON m.id = mc.movie_id
        LEFT JOIN collections c ON mc.collection_id = c.id
        WHERE m.title_status = ?
        GROUP BY m.id
        ORDER BY m.title
      `;
      db.all(sql, [status], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const movies = rows.map(row => {
            const movie = { ...row };
            if (movie.cast) {
              try {
                movie.cast = JSON.parse(movie.cast);
              } catch (e) {
                movie.cast = [];
              }
            } else {
              movie.cast = [];
            }
            
            // Parse box set collections info
            if (movie.box_set_collections && movie.box_set_collections.trim() !== '') {
              const boxSetData = movie.box_set_collections.split(',')[0].split(':');
              if (boxSetData.length >= 2) {
                movie.has_box_set = true;
                movie.box_set_name = boxSetData[1];
              } else {
                movie.has_box_set = false;
                movie.box_set_name = null;
              }
            } else {
              movie.has_box_set = false;
              movie.box_set_name = null;
            }
            // Remove the raw concatenated string
            delete movie.box_set_collections;
            
            // Parse user collections info
            if (movie.user_collections && movie.user_collections.trim() !== '') {
              const collectionNames = movie.user_collections.split(',').filter(name => name && name.trim() !== '');
              movie.collection_names = collectionNames;
            } else {
              movie.collection_names = [];
            }
            // Remove the raw concatenated string
            delete movie.user_collections;
            
            return movie;
          });
          resolve(movies);
        }
      });
    });
  },

  // Update title_status of a movie
  updateStatus: (id, status) => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = 'UPDATE movies SET title_status = ? WHERE id = ?';
      db.run(sql, [status, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, title_status: status });
        }
      });
    });
  },

  // Migration method to add title_status column to existing databases
  addTitleStatusColumn: () => {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const sql = `
        ALTER TABLE movies ADD COLUMN title_status TEXT DEFAULT 'owned'
      `;
      db.run(sql, (err) => {
        if (err) {
          // Column might already exist, which is fine
          if (err.message.includes('duplicate column name')) {
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  },

  // Toggle Watch Next collection membership
  toggleWatchNext: (id) => {
    return new Promise(async (resolve, reject) => {
      try {
        const db = getDatabase();
        const Collection = require('./collection');
        const MovieCollection = require('./movieCollection');
        
        // Get the Watch Next system collection
        const watchNextCollection = await Collection.findByType('watch_next');
        if (!watchNextCollection) {
          throw new Error('Watch Next collection not found');
        }
        
        // Check if movie is already in Watch Next
        const existing = await MovieCollection.findByMovieAndCollection(id, watchNextCollection.id);
        
        if (existing) {
          // Remove from Watch Next
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM movie_collections WHERE id = ?', [existing.id], function(err) {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
          
          resolve({ id });
        } else {
          // Add to Watch Next at the end
          const position = await MovieCollection.getNextOrder(watchNextCollection.id);
          
          await MovieCollection.create({
            movie_id: id,
            collection_id: watchNextCollection.id,
            collection_order: position
          });
          
          resolve({ id });
        }
      } catch (error) {
        reject(error);
      }
    });
  },

};

module.exports = Movie;
