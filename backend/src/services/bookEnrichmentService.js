/**
 * Book Enrichment Service
 * Orchestrates enrichment from multiple data sources (Google Books, OpenLibrary)
 */

const logger = require('../logger');
const bookApiService = require('./bookApiService');
const bookCoverService = require('./bookCoverService');
const { normalizeTitle, extractSeriesFromTitle } = require('./utils/bookUtils');

class BookEnrichmentService {
  /**
   * Calculate a metadata richness score for a book
   */
  calculateMetadataScore(book) {
    if (!book) return 0;
    
    let score = 0;
    
    if (book.description) {
      score += Math.min(book.description.length / 100, 50);
    }
    if (book.authors && Array.isArray(book.authors) && book.authors.length > 0) score += 10;
    if (book.publisher) score += 10;
    if (book.publishedYear) score += 10;
    if (book.pageCount) score += 10;
    if (book.genres && Array.isArray(book.genres)) {
      score += Math.min(book.genres.length * 5, 20);
    }
    if (book.coverUrl) score += 5;
    if (book.series) score += 5;
    
    return score;
  }

  /**
   * Enrich with OpenLibrary data
   */
  async enrichWithOpenLibrary(book) {
    if (!book) return book;
    
    logger.info(`[Enrichment] Enriching "${book.title}" with OpenLibrary`);
    
    let olBook = null;
    
    // Try ISBN lookup first
    const isbnsToTry = [];
    if (book.isbn13) isbnsToTry.push({ type: 'ISBN-13', value: book.isbn13 });
    if (book.isbn && book.isbn !== book.isbn13) isbnsToTry.push({ type: 'ISBN', value: book.isbn });
    
    for (const { type, value } of isbnsToTry) {
      try {
        const results = await bookApiService.searchByIsbn(value);
        if (results?.length > 0) {
          olBook = results[0];
          logger.info(`[Enrichment] ✓ Found OpenLibrary match by ${type}`);
          break;
        }
      } catch (error) {
        logger.warn(`[Enrichment] ${type} lookup failed: ${error.message}`);
      }
    }
    
    // Try title search if ISBN failed
    if (!olBook && book.title) {
      try {
        let searchQuery = book.title;
        if (book.authors?.[0]) searchQuery += ` ${book.authors[0]}`;
        
        const results = await bookApiService.searchOpenLibrary(searchQuery, 20, 'any');
        if (results?.length > 0) {
          const bookTitleNormalized = normalizeTitle(book.title);
          
          for (const result of results) {
            const resultTitleNormalized = normalizeTitle(result.title);
            if (this._titlesMatch(bookTitleNormalized, resultTitleNormalized)) {
              olBook = result;
              logger.info(`[Enrichment] ✓ Found OpenLibrary match by title`);
              break;
            }
          }
        }
      } catch (error) {
        logger.warn(`[Enrichment] Title search failed: ${error.message}`);
      }
    }
    
    if (!olBook) {
      logger.info(`[Enrichment] No OpenLibrary match found for "${book.title}"`);
      return book;
    }
    
    return this._mergeBookData(book, olBook, 'OpenLibrary');
  }

  /**
   * Enrich with Google Books data
   */
  async enrichWithGoogleBooks(book) {
    if (!book) return book;
    
    logger.info(`[Enrichment] Enriching "${book.title}" with Google Books`);
    
    let googleBook = null;
    
    // Try extracting volume ID from existing URL
    if (book.urls?.googleBooks || book.urls?.googleBooksInfo) {
      const googleUrl = book.urls.googleBooks || book.urls.googleBooksInfo;
      const volumeIdMatch = googleUrl.match(/[?&]id=([^&]+)/);
      if (volumeIdMatch) {
        try {
          googleBook = await bookApiService.getGoogleBookVolume(volumeIdMatch[1]);
          logger.info(`[Enrichment] ✓ Fetched Google Books volume directly`);
        } catch (error) {
          logger.warn(`[Enrichment] Failed to fetch volume: ${error.message}`);
        }
      }
    }
    
    // Try title/author search
    if (!googleBook && book.title) {
      const titleParts = book.title.split(/[-–—]/);
      const mainTitle = titleParts[0].trim();
      
      const searchQueries = [];
      if (book.authors?.[0]) {
        searchQueries.push(`intitle:"${mainTitle}" inauthor:"${book.authors[0]}"`);
        searchQueries.push(`${mainTitle} ${book.authors[0]}`);
      }
      searchQueries.push(`intitle:"${book.title}"`);
      searchQueries.push(mainTitle);
      
      const bookTitleNormalized = normalizeTitle(book.title);
      const bookMainTitleNormalized = normalizeTitle(mainTitle);
      
      for (const query of searchQueries) {
        try {
          const results = await bookApiService.searchGoogleBooks(query, 10);
          if (results?.length > 0) {
            for (const result of results) {
              const resultTitleNormalized = normalizeTitle(result.title);
              if (this._titlesMatch(bookTitleNormalized, resultTitleNormalized) ||
                  this._titlesMatch(bookMainTitleNormalized, resultTitleNormalized)) {
                googleBook = result;
                logger.info(`[Enrichment] ✓ Found Google Books match by title`);
                break;
              }
            }
            if (googleBook) break;
          }
        } catch (error) {
          logger.warn(`[Enrichment] Query "${query}" failed: ${error.message}`);
        }
      }
    }
    
    // Try ISBN search as fallback
    if (!googleBook && (book.isbn || book.isbn13)) {
      try {
        const results = await bookApiService.searchGoogleBooksByIsbn(book.isbn13 || book.isbn);
        if (results?.length > 0) {
          googleBook = results[0];
          logger.info(`[Enrichment] ✓ Found Google Books match by ISBN`);
        }
      } catch (error) {
        logger.warn(`[Enrichment] ISBN search failed: ${error.message}`);
      }
    }
    
    if (!googleBook) {
      logger.info(`[Enrichment] No Google Books match found for "${book.title}"`);
      return book;
    }
    
    return this._mergeBookData(book, googleBook, 'Google Books');
  }

  /**
   * Comprehensive enrichment from all sources
   */
  async enrichBook(bookData) {
    if (!bookData) return bookData;
    
    logger.info(`[Enrichment] Starting comprehensive enrichment for "${bookData.title}"`);
    
    let enriched = { ...bookData };
    
    // Store metadata from each source
    enriched._metadataSources = {
      original: {
        description: bookData.description || null,
        series: bookData.series || null,
        seriesNumber: bookData.seriesNumber || null,
        genres: bookData.genres || null,
        tags: bookData.tags || null,
        publisher: bookData.publisher || null,
        publishedYear: bookData.publishedYear || null,
        pageCount: bookData.pageCount || null
      },
      googleBooks: null,
      openLibrary: null
    };
    
    // Check if book already has complete data
    const isFromGoogleBooks = bookData.urls?.googleBooks || bookData.urls?.googleBooksInfo;
    const hasCompleteData = isFromGoogleBooks && 
      bookData.description?.length > 50 &&
      bookData.authors?.length > 0 &&
      bookData.publisher &&
      bookData.pageCount;
    
    // Run enrichments in parallel
    const [googleResult, olResult] = await Promise.allSettled([
      hasCompleteData ? Promise.resolve(null) : this._performGoogleBooksEnrichment(bookData),
      this._performOpenLibraryEnrichment(bookData)
    ]);
    
    // Process Google Books results
    let googleData = null;
    if (googleResult.status === 'fulfilled' && googleResult.value) {
      googleData = googleResult.value;
      enriched._metadataSources.googleBooks = this._extractMetadata(googleData);
    } else if (hasCompleteData) {
      enriched._metadataSources.googleBooks = this._extractMetadata(bookData);
    }
    
    // Process OpenLibrary results
    let olData = null;
    if (olResult.status === 'fulfilled' && olResult.value) {
      olData = olResult.value;
      enriched._metadataSources.openLibrary = this._extractMetadata(olData);
    }
    
    // Merge enriched data
    enriched = this._mergeAllSources(enriched, googleData, olData);
    
    // Extract series from title if not found
    if (!enriched.series && enriched.title) {
      const extracted = extractSeriesFromTitle(enriched.title);
      if (extracted) {
        enriched.series = extracted.series;
        enriched.seriesNumber = extracted.seriesNumber;
        logger.info(`[Enrichment] Extracted series from title: "${extracted.series}" #${extracted.seriesNumber}`);
      }
    }
    
    // Select best cover
    if (enriched.availableCovers?.length > 0) {
      const largestCover = bookCoverService.selectLargestCover(enriched.availableCovers);
      if (largestCover) {
        enriched.coverUrl = largestCover;
        logger.info(`[Enrichment] Selected largest cover: ${largestCover}`);
      }
    }
    
    logger.info(`[Enrichment] Completed enrichment for "${enriched.title}"`);
    return enriched;
  }

  /**
   * Search external APIs with fallback
   */
  async searchExternalBooks(query, filters = {}) {
    const { isbn, author, title, limit = 20, language = 'any' } = filters;
    
    // Normalize filters
    const normalizedTitle = title?.trim() || undefined;
    const normalizedAuthor = author?.trim() || undefined;
    const normalizedIsbn = isbn?.trim() || undefined;
    
    // Check if query is an ISBN
    let isbnToSearch = normalizedIsbn;
    if (!isbnToSearch && query) {
      const cleanQuery = query.replace(/[-\s]/g, '');
      if (/^\d{10}$/.test(cleanQuery) || /^\d{13}$/.test(cleanQuery)) {
        isbnToSearch = query;
      }
    }
    
    // ISBN search
    if (isbnToSearch) {
      try {
        const googleResults = await bookApiService.searchGoogleBooksByIsbn(isbnToSearch);
        if (googleResults?.length > 0) return googleResults;
      } catch (error) {
        logger.warn(`Google Books ISBN search failed: ${error.message}`);
      }
      
      try {
        return await bookApiService.searchByIsbn(isbnToSearch);
      } catch (error) {
        logger.error(`Both ISBN searches failed: ${error.message}`);
        return [];
      }
    }
    
    // Build search query
    let searchQuery = query;
    let finalTitle = normalizedTitle;
    let finalAuthor = normalizedAuthor;
    
    if (normalizedTitle && normalizedAuthor) {
      searchQuery = `${normalizedTitle} ${normalizedAuthor}`;
    } else if (normalizedTitle) {
      searchQuery = normalizedTitle;
    } else if (normalizedAuthor) {
      searchQuery = normalizedAuthor;
    } else if (query?.trim()) {
      searchQuery = query.trim();
      finalTitle = query.trim();
    }
    
    // Try Google Books first
    try {
      const googleResults = await bookApiService.searchGoogleBooks(
        searchQuery, limit, { title: finalTitle, author: finalAuthor, language }
      );
      if (googleResults?.length > 0) return googleResults;
    } catch (error) {
      logger.warn(`Google Books search failed: ${error.message}`);
    }
    
    // Fallback to OpenLibrary
    try {
      return await bookApiService.searchOpenLibrary(searchQuery, limit, language);
    } catch (error) {
      logger.error(`OpenLibrary search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Search for series volumes
   */
  async searchSeriesVolumes(seriesName, options = {}) {
    const { language = 'any', maxVolumes = 100 } = options;
    const volumes = [];
    const seenVolumes = new Set();
    const seenIsbns = new Set();
    
    logger.info(`[SeriesSearch] Searching for volumes of: "${seriesName}"`);
    
    // Search Google Books with multiple queries
    const searchQueries = [
      `"${seriesName}"`,
      `${seriesName} tome`,
      `${seriesName}`,
      `intitle:"${seriesName}"`,
      `${seriesName} volume`
    ];
    
    for (const query of searchQueries) {
      try {
        const results = await bookApiService.searchGoogleBooks(query, Math.min(maxVolumes * 2, 40), {});
        for (const result of results) {
          if (this._belongsToSeries(result, seriesName)) {
            const seriesNumber = result.seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            const isbn = result.isbn13 || result.isbn;
            
            if (isbn && seenIsbns.has(isbn)) continue;
            const identifier = seriesNumber || isbn;
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              if (isbn) seenIsbns.add(isbn);
              volumes.push({ ...result, series: seriesName, seriesNumber: seriesNumber || null });
            }
          }
        }
      } catch (error) {
        logger.warn(`[SeriesSearch] Query "${query}" failed: ${error.message}`);
      }
    }
    
    // Also try OpenLibrary
    for (const query of [seriesName, `${seriesName} tome`, `${seriesName} volume`]) {
      try {
        const results = await bookApiService.searchOpenLibrary(query, Math.max(maxVolumes, 40), 'any');
        for (const result of results) {
          if (this._belongsToSeries(result, seriesName)) {
            const seriesNumber = result.seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            const isbn = result.isbn13 || result.isbn;
            
            if (isbn && seenIsbns.has(isbn)) continue;
            const identifier = seriesNumber || isbn;
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              if (isbn) seenIsbns.add(isbn);
              volumes.push({ ...result, series: seriesName, seriesNumber: seriesNumber || null });
            }
          }
        }
      } catch (error) {
        logger.warn(`[SeriesSearch] OpenLibrary query failed: ${error.message}`);
      }
    }
    
    // Sort by series number
    volumes.sort((a, b) => {
      const numA = a.seriesNumber || 9999;
      const numB = b.seriesNumber || 9999;
      if (numA === 9999 && numB === 9999) return (a.title || '').localeCompare(b.title || '');
      return numA - numB;
    });
    
    logger.info(`[SeriesSearch] Found ${volumes.length} volumes for "${seriesName}"`);
    return volumes;
  }

  // ============================================
  // Private helpers
  // ============================================

  async _performGoogleBooksEnrichment(bookData) {
    try {
      return await this.enrichWithGoogleBooks({ ...bookData });
    } catch (error) {
      logger.warn(`[Enrichment] Google Books enrichment failed: ${error.message}`);
      return null;
    }
  }

  async _performOpenLibraryEnrichment(bookData) {
    try {
      return await this.enrichWithOpenLibrary({ ...bookData });
    } catch (error) {
      logger.warn(`[Enrichment] OpenLibrary enrichment failed: ${error.message}`);
      return null;
    }
  }

  _extractMetadata(book) {
    if (!book) return null;
    return {
      description: book.description || null,
      series: book.series || null,
      seriesNumber: book.seriesNumber || null,
      genres: book.genres || null,
      tags: book.tags || null,
      publisher: book.publisher || null,
      publishedYear: book.publishedYear || null,
      pageCount: book.pageCount || null,
      rating: book.rating || null,
      authors: book.authors || null
    };
  }

  _mergeBookData(base, enrichment, sourceName) {
    if (!enrichment) return base;
    
    const enriched = { ...base };
    const enrichedFields = [];
    
    // Description: prefer longer
    if (enrichment.description) {
      const currentLen = (enriched.description || '').length;
      const newLen = enrichment.description.length;
      if (!enriched.description || newLen > currentLen * 1.2) {
        enriched.description = enrichment.description;
        enrichedFields.push(`description (${newLen} chars)`);
      }
    }
    
    // Authors
    if (enrichment.authors?.length > 0 && !enriched.authors?.length) {
      enriched.authors = enrichment.authors;
      enrichedFields.push(`authors`);
    }
    
    // Fill missing fields
    if (!enriched.series && enrichment.series) {
      enriched.series = enrichment.series;
      enrichedFields.push('series');
    }
    if (!enriched.seriesNumber && enrichment.seriesNumber) {
      enriched.seriesNumber = enrichment.seriesNumber;
      enrichedFields.push('seriesNumber');
    }
    if (!enriched.pageCount && enrichment.pageCount) {
      enriched.pageCount = enrichment.pageCount;
      enrichedFields.push('pageCount');
    }
    if (!enriched.publisher && enrichment.publisher) {
      enriched.publisher = enrichment.publisher;
      enrichedFields.push('publisher');
    }
    if (!enriched.publishedYear && enrichment.publishedYear) {
      enriched.publishedYear = enrichment.publishedYear;
      enrichedFields.push('publishedYear');
    }
    
    // Merge genres
    const allGenres = new Set(enriched.genres || []);
    (enrichment.genres || []).forEach(g => allGenres.add(g));
    if (allGenres.size > 0) enriched.genres = Array.from(allGenres);
    
    // Merge covers
    if (!enriched.availableCovers) enriched.availableCovers = [];
    if (enrichment.availableCovers) {
      enrichment.availableCovers.forEach(cover => {
        if (!enriched.availableCovers.some(c => c.url === cover.url)) {
          enriched.availableCovers.push(cover);
        }
      });
    }
    
    // Cover URL
    if (!enriched.coverUrl && enrichment.coverUrl) {
      enriched.coverUrl = enrichment.coverUrl;
      enrichedFields.push('coverUrl');
    }
    
    // Merge URLs
    if (!enriched.urls) enriched.urls = {};
    if (enrichment.urls) enriched.urls = { ...enriched.urls, ...enrichment.urls };
    
    if (enrichedFields.length > 0) {
      logger.info(`[Enrichment] Enriched with ${sourceName}: ${enrichedFields.join(', ')}`);
    }
    
    return enriched;
  }

  _mergeAllSources(enriched, googleData, olData) {
    // Merge Google Books data
    if (googleData) {
      enriched = this._mergeBookData(enriched, googleData, 'Google Books');
    }
    
    // Merge OpenLibrary data
    if (olData) {
      if (!enriched.availableCovers) enriched.availableCovers = [];
      if (olData.availableCovers) {
        olData.availableCovers.forEach(cover => {
          if (!enriched.availableCovers.some(c => c.url === cover.url)) {
            enriched.availableCovers.push(cover);
          }
        });
      }
      if (olData.urls) {
        if (!enriched.urls) enriched.urls = {};
        enriched.urls = { ...enriched.urls, ...olData.urls };
      }
    }
    
    // Aggregate genres and tags from all sources
    const allGenres = new Set();
    const allTags = new Set();
    
    [enriched._metadataSources.original, enriched._metadataSources.googleBooks, enriched._metadataSources.openLibrary]
      .forEach(source => {
        if (source?.genres) {
          (Array.isArray(source.genres) ? source.genres : [source.genres]).forEach(g => g && allGenres.add(g));
        }
        if (source?.tags) {
          (Array.isArray(source.tags) ? source.tags : [source.tags]).forEach(t => t && allTags.add(t));
        }
      });
    
    if (allGenres.size > 0) enriched.genres = Array.from(allGenres);
    if (allTags.size > 0) enriched.tags = Array.from(allTags);
    
    // Use longest description
    const descriptions = [
      enriched._metadataSources.googleBooks?.description,
      enriched._metadataSources.openLibrary?.description,
      enriched._metadataSources.original?.description
    ].filter(d => d);
    if (descriptions.length > 0) {
      enriched.description = descriptions.reduce((a, b) => a.length > b.length ? a : b);
    }
    
    // Series: prefer OpenLibrary
    enriched.series = enriched._metadataSources.openLibrary?.series || 
                      enriched._metadataSources.googleBooks?.series || 
                      enriched._metadataSources.original?.series || null;
    enriched.seriesNumber = enriched._metadataSources.openLibrary?.seriesNumber || 
                            enriched._metadataSources.googleBooks?.seriesNumber || 
                            enriched._metadataSources.original?.seriesNumber || null;
    
    // Rating: prefer Google Books
    enriched.rating = enriched._metadataSources.googleBooks?.rating || 
                      enriched._metadataSources.openLibrary?.rating || 
                      enriched._metadataSources.original?.rating || null;
    
    return enriched;
  }

  _titlesMatch(title1, title2) {
    if (!title1 || !title2) return false;
    
    // Exact match
    if (title1 === title2) return true;
    
    // Contains match
    if (title1.includes(title2) || title2.includes(title1)) return true;
    
    // Word overlap
    const words1 = title1.split(/\s+/).filter(w => w.length > 2);
    const words2 = title2.split(/\s+/).filter(w => w.length > 2);
    const common = words1.filter(w => words2.some(w2 => w.includes(w2) || w2.includes(w)));
    
    return common.length >= Math.min(2, Math.min(words1.length, words2.length));
  }

  _belongsToSeries(result, targetSeries) {
    const resultSeries = result.series || extractSeriesFromTitle(result.title)?.series;
    if (!resultSeries) return false;
    
    const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const normalizedResult = normalize(resultSeries);
    const normalizedTarget = normalize(targetSeries);
    
    if (normalizedResult === normalizedTarget) return true;
    if (normalizedResult.includes(normalizedTarget) || normalizedTarget.includes(normalizedResult)) {
      const words = normalizedTarget.split(/\s+/);
      const resultWords = normalizedResult.split(/\s+/);
      return words.length === 1 || words.every(word => resultWords.some(rw => rw.startsWith(word) || word.startsWith(rw)));
    }
    
    return false;
  }
}

module.exports = new BookEnrichmentService();


