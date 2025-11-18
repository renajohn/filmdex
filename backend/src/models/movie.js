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
      if (criteria.searchText) {
        let searchText = criteria.searchText.trim();
        
        // Parse all special syntax filters
        const filters = {
          actors: [],
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
          hasComments: []
        };
        
        // Extract actor:"Name" or actor:Name filters (can be multiple)
        let actorMatches;
        const actorQuotedRegex = /actor:"([^"]+)"/g;
        const actorWordRegex = /actor:(\S+)/g;
        
        while ((actorMatches = actorQuotedRegex.exec(searchText)) !== null) {
          filters.actors.push(actorMatches[1]);
        }
        searchText = searchText.replace(actorQuotedRegex, '').trim();
        
        while ((actorMatches = actorWordRegex.exec(searchText)) !== null) {
          filters.actors.push(actorMatches[1]);
        }
        searchText = searchText.replace(actorWordRegex, '').trim();
        
        // Extract director:"Name" or director:Name filters (can be multiple)
        let directorMatches;
        const directorQuotedRegex = /director:"([^"]+)"/g;
        const directorWordRegex = /director:(\S+)/g;
        
        while ((directorMatches = directorQuotedRegex.exec(searchText)) !== null) {
          filters.directors.push(directorMatches[1]);
        }
        searchText = searchText.replace(directorQuotedRegex, '').trim();
        
        while ((directorMatches = directorWordRegex.exec(searchText)) !== null) {
          filters.directors.push(directorMatches[1]);
        }
        searchText = searchText.replace(directorWordRegex, '').trim();
        
        // Extract title: filters (quoted or single word)
        const titleQuotedRegex = /title:"([^"]+)"/g;
        const titleWordRegex = /title:(\S+)/g;
        let titleMatches;
        
        while ((titleMatches = titleQuotedRegex.exec(searchText)) !== null) {
          filters.titles.push(titleMatches[1]);
        }
        searchText = searchText.replace(titleQuotedRegex, '').trim();
        
        while ((titleMatches = titleWordRegex.exec(searchText)) !== null) {
          filters.titles.push(titleMatches[1]);
        }
        searchText = searchText.replace(titleWordRegex, '').trim();
        
        // Extract collection:"Name" or collection:Name filters (can be multiple)
        let collectionMatches;
        const collectionQuotedRegex = /collection:"([^"]+)"/g;
        const collectionWordRegex = /collection:(\S+)/g;
        
        while ((collectionMatches = collectionQuotedRegex.exec(searchText)) !== null) {
          filters.collections.push(collectionMatches[1]);
        }
        searchText = searchText.replace(collectionQuotedRegex, '').trim();
        
        while ((collectionMatches = collectionWordRegex.exec(searchText)) !== null) {
          filters.collections.push(collectionMatches[1]);
        }
        searchText = searchText.replace(collectionWordRegex, '').trim();
        
        // Extract box_set:"Name" or box_set:Name filters (can be multiple)
        let boxSetMatches;
        const boxSetQuotedRegex = /box_set:"([^"]+)"/g;
        const boxSetWordRegex = /box_set:(\S+)/g;
        
        while ((boxSetMatches = boxSetQuotedRegex.exec(searchText)) !== null) {
          filters.boxSets.push(boxSetMatches[1]);
        }
        searchText = searchText.replace(boxSetQuotedRegex, '').trim();
        
        while ((boxSetMatches = boxSetWordRegex.exec(searchText)) !== null) {
          filters.boxSets.push(boxSetMatches[1]);
        }
        searchText = searchText.replace(boxSetWordRegex, '').trim();
        
        // Extract genre:"Name" or genre:Name filters (can be multiple)
        let genreMatches;
        const genreQuotedRegex = /genre:"([^"]+)"/g;
        const genreWordRegex = /genre:(\S+)/g;
        
        while ((genreMatches = genreQuotedRegex.exec(searchText)) !== null) {
          filters.genres.push(genreMatches[1]);
        }
        searchText = searchText.replace(genreQuotedRegex, '').trim();
        
        while ((genreMatches = genreWordRegex.exec(searchText)) !== null) {
          filters.genres.push(genreMatches[1]);
        }
        searchText = searchText.replace(genreWordRegex, '').trim();
        
        // Extract format:"Name" or format:Name filters (can be multiple)
        let formatMatches;
        const formatQuotedRegex = /format:"([^"]+)"/g;
        const formatWordRegex = /format:(\S+)/g;
        
        while ((formatMatches = formatQuotedRegex.exec(searchText)) !== null) {
          filters.formats.push(formatMatches[1]);
        }
        searchText = searchText.replace(formatQuotedRegex, '').trim();
        
        while ((formatMatches = formatWordRegex.exec(searchText)) !== null) {
          filters.formats.push(formatMatches[1]);
        }
        searchText = searchText.replace(formatWordRegex, '').trim();
        
        // Extract original_language:"Name" or original_language:Name filters (can be multiple)
        let languageMatches;
        const languageQuotedRegex = /original_language:"([^"]+)"/g;
        const languageWordRegex = /original_language:(\S+)/g;
        
        while ((languageMatches = languageQuotedRegex.exec(searchText)) !== null) {
          filters.languages.push(languageMatches[1]);
        }
        searchText = searchText.replace(languageQuotedRegex, '').trim();
        
        while ((languageMatches = languageWordRegex.exec(searchText)) !== null) {
          filters.languages.push(languageMatches[1]);
        }
        searchText = searchText.replace(languageWordRegex, '').trim();
        
        // Extract media_type:"Name" or media_type:Name filters (can be multiple)
        let mediaTypeMatches;
        const mediaTypeQuotedRegex = /media_type:"([^"]+)"/g;
        const mediaTypeWordRegex = /media_type:(\S+)/g;
        
        while ((mediaTypeMatches = mediaTypeQuotedRegex.exec(searchText)) !== null) {
          filters.mediaTypes.push(mediaTypeMatches[1]);
        }
        searchText = searchText.replace(mediaTypeQuotedRegex, '').trim();
        
        while ((mediaTypeMatches = mediaTypeWordRegex.exec(searchText)) !== null) {
          filters.mediaTypes.push(mediaTypeMatches[1]);
        }
        searchText = searchText.replace(mediaTypeWordRegex, '').trim();
        
        // Extract year: filters with operators
        const yearRegex = /year:(>=|<=|>|<|)(\d+)/g;
        let yearMatches;
        while ((yearMatches = yearRegex.exec(searchText)) !== null) {
          const operator = yearMatches[1] || '=';
          const value = parseInt(yearMatches[2]);
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
        
        // Remove incomplete predicates (predicates without values) from search text
        // This prevents them from being treated as generic search terms
        const incompletePredicateRegex = /\b(actor|director|title|collection|box_set|genre|format|original_language|media_type|year|imdb_rating|tmdb_rating|rotten_tomato_rating|recommended_age|price|has_comments):\s*$/g;
        searchText = searchText.replace(incompletePredicateRegex, '').trim();
        
        // Also remove predicates with operators but no values (e.g., "imdb_rating:>", "year:<=")
        const incompleteOperatorPredicateRegex = /\b(year|imdb_rating|tmdb_rating|rotten_tomato_rating|recommended_age|price):(>=|<=|>|<)\s*$/g;
        searchText = searchText.replace(incompleteOperatorPredicateRegex, '').trim();
        
        // Apply actor filters (AND logic)
        filters.actors.forEach(actorName => {
          sql += ` AND m.cast LIKE ?`;
          params.push(`%${actorName}%`);
        });
        
        // Apply director filters (AND logic)
        filters.directors.forEach(directorName => {
          sql += ` AND m.director LIKE ?`;
          params.push(`%${directorName}%`);
        });
        
        // Apply title filters (AND logic - all titles must match)
        filters.titles.forEach(titleTerm => {
          sql += ` AND (m.title LIKE ? OR m.original_title LIKE ?)`;
          const titleSearch = `%${titleTerm}%`;
          params.push(titleSearch, titleSearch);
        });
        
        // Apply collection filters (AND logic - all collections must match)
        filters.collections.forEach(collectionName => {
          sql += ` AND EXISTS (
            SELECT 1 FROM movie_collections mc3
            JOIN collections c3 ON mc3.collection_id = c3.id
            WHERE mc3.movie_id = m.id AND c3.name LIKE ?
          )`;
          params.push(`%${collectionName}%`);
        });
        
        // Apply box set filters (AND logic - all box sets must match)
        filters.boxSets.forEach(boxSetName => {
          sql += ` AND EXISTS (
            SELECT 1 FROM movie_collections mc4
            JOIN collections c4 ON mc4.collection_id = c4.id
            WHERE mc4.movie_id = m.id AND c4.type = 'box_set' AND c4.name LIKE ?
          )`;
          params.push(`%${boxSetName}%`);
        });
        
        // Apply genre filters (AND logic)
        filters.genres.forEach(genreName => {
          sql += ` AND m.genre LIKE ?`;
          params.push(`%${genreName}%`);
        });
        
        // Apply format filters (AND logic)
        filters.formats.forEach(formatName => {
          sql += ` AND m.format LIKE ?`;
          params.push(`%${formatName}%`);
        });
        
        // Apply language filters (AND logic)
        filters.languages.forEach(languageName => {
          sql += ` AND m.original_language LIKE ?`;
          params.push(`%${languageName}%`);
        });
        
        // Apply media type filters (AND logic)
        filters.mediaTypes.forEach(mediaType => {
          sql += ` AND m.media_type LIKE ?`;
          params.push(`%${mediaType}%`);
        });
        
        // Apply year filters (AND logic)
        filters.years.forEach(yearFilter => {
          switch (yearFilter.operator) {
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
            title_status: row.title_status || 'owned'
          };
          
          resolve(movie);
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
