const Book = require('../models/book');
const imageService = require('./imageService');
const configManager = require('../config');
const axios = require('axios');
const logger = require('../logger');

/**
 * Remove surrounding quotes from a string if the entire string is enclosed in quotes
 */
function removeSurroundingQuotes(str) {
  if (!str || typeof str !== 'string') return str;
  const trimmed = str.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return str;
}

/**
 * Normalize array fields (tags, genres, authors, artists) to ensure they're arrays
 * Handles cases where they might be comma-separated strings
 */
function normalizeArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === 'string' ? item.trim() : String(item).trim())
      .filter(item => item);
  }
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(item => item);
  }
  return [];
}

/**
 * Extract series name and number from book title
 * Handles patterns like "Title T01", "Title T1", "Title Vol. 1", "Title #1", etc.
 * Returns { series, seriesNumber } or null if no series detected
 */
function extractSeriesFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  
  // Patterns to detect volume numbers in title
  const volumePatterns = [
    // "Les Royaumes de Feu (Tome 2) - La Princesse disparue" format (with parentheses)
    {
      regex: /^(.+?)\s*\(\s*Tome\s+0*(\d+)\s*\)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = match[1].trim();
        const volumeNum = parseInt(match[2], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Thorgal - Tome 21 - La Couronne d'Ogotaï" format (French comics)
    // Also handles "Les royaumes de feu - Tome 1 - Le dragon prophétique"
    // Pattern matches: "Series - Tome N" or "Series - Tome N - Subtitle"
    {
      regex: /^(.+?)\s*-\s*Tome\s+0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = match[1].trim();
        const volumeNum = parseInt(match[2], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Series - Tome 21" or "Series Tome 21" format (with or without dash)
    // This pattern works even if there's text after (like a subtitle)
    {
      regex: /\s*-\s*Tome\s+0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Series (Tome 21)" format (with parentheses, anywhere in title)
    {
      regex: /\s*\(\s*Tome\s+0*(\d+)\s*\)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Series Tome 21" format (without dash, but may have subtitle after)
    {
      regex: /\s+Tome\s+0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // T01, T1, T02, etc. (most common for French comics)
    // Updated to handle cases with subtitles: "Series T01 - Subtitle"
    {
      regex: /\s+T0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        // Only return if we have a meaningful series name (more than 3 chars)
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // Vol. 1, Vol 1, Volume 1, etc.
    {
      regex: /\s+Vol(?:ume)?\.?\s*0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // #1, #01, etc.
    {
      regex: /\s+#0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // Trailing number like "Book 1" or "1" (only at the very end)
    {
      regex: /\s+(\d+)\s*$/,
      extractSeries: (title, match) => {
        // Only extract if the number is preceded by a space and title is long enough
        const beforeNumber = title.substring(0, match.index).trim();
        if (beforeNumber.length > 3) { // Avoid extracting single-word titles with numbers
          const volumeNum = parseInt(match[1], 10);
          return { series: beforeNumber, seriesNumber: volumeNum };
        }
        return null;
      }
    }
  ];
  
  // Try each pattern
  for (const pattern of volumePatterns) {
    const match = trimmedTitle.match(pattern.regex);
    if (match) {
      const result = pattern.extractSeries(trimmedTitle, match);
      if (result && result.series && result.series.length > 0) {
        return result;
      }
    }
  }
  
  return null;
}

class BookService {
  constructor() {
    this.apiCache = new Map();
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  }

  _getCacheKey(source, identifier) {
    return `${source}:${identifier}`;
  }

  _getCached(key) {
    const cached = this.apiCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  _setCache(key, data) {
    this.apiCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Validate if a cover URL actually returns a valid image
   * For OpenLibrary ISBN-based covers, we can append ?default=false to get a 404 if no cover exists
   * Returns true if the cover is valid, false otherwise
   */
  async validateCoverUrl(url, timeout = 5000) {
    try {
      // For OpenLibrary ISBN-based covers, use ?default=false to detect missing covers
      let testUrl = url;
      if (url.includes('covers.openlibrary.org/b/isbn/')) {
        testUrl = url.includes('?') ? `${url}&default=false` : `${url}?default=false`;
      }
      
      // Use HEAD request to check if the image exists
      const response = await axios.head(testUrl, { 
        timeout,
        validateStatus: (status) => status < 500 // Accept all non-500 responses
      });
      
      // Check for successful response and proper content type
      if (response.status === 200) {
        const contentType = response.headers['content-type'] || '';
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        
        // Verify it's an image and not a tiny placeholder (1x1 pixel = ~43 bytes for GIF, ~68 for PNG)
        if (contentType.startsWith('image/')) {
          // OpenLibrary returns a 1x1 transparent pixel when no cover exists
          // This is typically less than 100 bytes
          if (contentLength > 100 || contentLength === 0) { // 0 means unknown, assume valid
            return true;
          }
          logger.info(`[CoverValidation] Cover at ${url} appears to be a placeholder (size: ${contentLength} bytes)`);
          return false;
        }
      }
      
      return false;
    } catch (error) {
      // 404 means no cover available (especially with ?default=false)
      if (error.response && error.response.status === 404) {
        logger.info(`[CoverValidation] Cover not found at ${url}`);
        return false;
      }
      // For other errors (timeout, network issues), assume cover might exist
      logger.warn(`[CoverValidation] Error validating cover ${url}: ${error.message}`);
      return null; // Unknown - don't exclude but don't prefer
    }
  }

  /**
   * Find the best available cover from a list of cover options
   * Validates covers in order of priority and returns the first valid one
   */
  async findBestCover(availableCovers, maxAttempts = 5) {
    if (!availableCovers || availableCovers.length === 0) {
      return null;
    }

    // Sort by priority (highest first)
    const sortedCovers = [...availableCovers].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    let attempts = 0;
    for (const cover of sortedCovers) {
      if (attempts >= maxAttempts) {
        logger.info(`[CoverValidation] Reached max attempts (${maxAttempts}), using best available: ${cover.url}`);
        return cover.url;
      }
      
      // Skip validation for high-priority Google Books covers (they're usually reliable)
      if (cover.source === 'Google Books' && cover.priority >= 3) {
        return cover.url;
      }
      
      const isValid = await this.validateCoverUrl(cover.url);
      attempts++;
      
      if (isValid === true) {
        logger.info(`[CoverValidation] Found valid cover: ${cover.url}`);
        return cover.url;
      }
      
      // If validation failed definitively, continue to next
      if (isValid === false) {
        continue;
      }
      
      // If validation was inconclusive (null), use it but note the uncertainty
      logger.info(`[CoverValidation] Using cover with uncertain validation: ${cover.url}`);
      return cover.url;
    }
    
    // If all covers failed validation, return the highest priority one anyway
    if (sortedCovers.length > 0) {
      logger.warn(`[CoverValidation] All covers failed validation, using first: ${sortedCovers[0].url}`);
      return sortedCovers[0].url;
    }
    
    return null;
  }

  async initializeTables() {
    try {
      await Book.createTable();
      console.log('Book tables initialized successfully');
    } catch (error) {
      console.error('Error initializing book tables:', error);
      throw error;
    }
  }

  async searchBooks(query) {
    try {
      return await Book.search(query);
    } catch (error) {
      console.error('Error searching books:', error);
      throw error;
    }
  }

  async getAllBooks() {
    try {
      return await Book.findAll();
    } catch (error) {
      console.error('Error getting all books:', error);
      throw error;
    }
  }

  async getBooksByStatus(status) {
    try {
      return await Book.findByStatus(status);
    } catch (error) {
      console.error('Error getting books by status:', error);
      throw error;
    }
  }

  async getBooksBySeries(series) {
    try {
      return await Book.findBySeries(series);
    } catch (error) {
      console.error('Error getting books by series:', error);
      throw error;
    }
  }

  async updateBookStatus(id, status) {
    try {
      return await Book.updateStatus(id, status);
    } catch (error) {
      console.error('Error updating book status:', error);
      throw error;
    }
  }

  async getBookById(id) {
    try {
      const book = await Book.findById(id);
      if (!book) {
        throw new Error('Book not found');
      }
      return book;
    } catch (error) {
      console.error('Error getting book:', error);
      throw error;
    }
  }

  async addBook(bookData) {
    try {
      // Check if book already exists by ISBN
      if (bookData.isbn || bookData.isbn13) {
        const existing = await Book.findByIsbn(bookData.isbn || bookData.isbn13);
        if (existing) {
          throw new Error('Book with this ISBN already exists in collection');
        }
      }

      // Download and save cover if URL provided
      // Use the highest quality cover available from availableCovers if present
      // Try multiple covers with fallback if the first ones fail
      let coverPath = bookData.cover;
      
      if (!coverPath && bookData.availableCovers && Array.isArray(bookData.availableCovers) && bookData.availableCovers.length > 0) {
        // Sort covers by priority (highest first)
        const sortedCovers = [...bookData.availableCovers]
          .filter(c => c.url && (!c.type || c.type === 'front'))
          .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        logger.info(`[AddBook] Trying ${sortedCovers.length} cover options (from ${bookData.availableCovers.length} available)`);
        
        // Try covers in order of priority until one succeeds
        for (let i = 0; i < Math.min(sortedCovers.length, 5); i++) {
          const cover = sortedCovers[i];
          try {
            const filename = `book_${Date.now()}_${i}.jpg`;
            logger.info(`[AddBook] Trying cover ${i + 1}/${Math.min(sortedCovers.length, 5)}: ${cover.source || 'unknown'} (${cover.size || 'unknown size'})`);
            
            const downloadedPath = await imageService.downloadImageFromUrl(cover.url, 'book', filename);
            if (downloadedPath) {
              // Verify the downloaded file is valid (not a placeholder)
              const path = require('path');
              const fs = require('fs');
              const downloadedFilename = downloadedPath.split('/').pop();
              const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
              
              const stats = fs.statSync(fullPath);
              // OpenLibrary placeholder images are typically < 100 bytes
              if (stats.size < 200) {
                logger.warn(`[AddBook] Downloaded cover appears to be a placeholder (${stats.size} bytes), trying next`);
                fs.unlinkSync(fullPath); // Clean up placeholder
                continue;
              }
              
              // Valid cover found, resize it
              try {
                await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
              } catch (resizeError) {
                console.warn('Failed to resize cover:', resizeError.message);
              }
              
              coverPath = downloadedPath;
              logger.info(`[AddBook] Successfully downloaded cover from ${cover.source || 'unknown'}`);
              break;
            }
          } catch (error) {
            logger.warn(`[AddBook] Cover ${i + 1} failed: ${error.message}, trying next...`);
          }
        }
        
        if (!coverPath) {
          logger.warn(`[AddBook] All cover download attempts failed`);
        }
      } else if (!coverPath && bookData.coverUrl) {
        // Fallback: try the single coverUrl if no availableCovers
        try {
          const filename = `book_${Date.now()}.jpg`;
          coverPath = await imageService.downloadImageFromUrl(bookData.coverUrl, 'book', filename);
          if (coverPath) {
            try {
              const path = require('path');
              const downloadedFilename = coverPath.split('/').pop();
              const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError) {
              console.warn('Failed to resize cover:', resizeError.message);
            }
          }
        } catch (error) {
          console.warn('Failed to download cover:', error.message);
        }
      }

      // Normalize array fields to ensure they're arrays
      const normalizedData = {
        ...bookData,
        cover: coverPath || bookData.cover,
        tags: normalizeArrayField(bookData.tags),
        genres: normalizeArrayField(bookData.genres),
        authors: normalizeArrayField(bookData.authors),
        artists: normalizeArrayField(bookData.artists)
      };
      
      // Log owner information for debugging
      if (normalizedData.owner !== undefined) {
        logger.info(`[AddBook] Owner information: "${normalizedData.owner}" (type: ${typeof normalizedData.owner})`);
      }

      // Extract series from title if not already provided
      if (!normalizedData.series && normalizedData.title) {
        const extractedSeries = extractSeriesFromTitle(normalizedData.title);
        if (extractedSeries) {
          normalizedData.series = extractedSeries.series;
          normalizedData.seriesNumber = extractedSeries.seriesNumber;
          logger.info(`[AddBook] Extracted series from title: "${extractedSeries.series}" #${extractedSeries.seriesNumber}`);
        }
      }

      const book = await Book.create(normalizedData);

      return book;
    } catch (error) {
      console.error('Error adding book:', error);
      throw error;
    }
  }

  async addBooksBatch(booksData) {
    try {
      const results = [];
      const errors = [];

      for (const bookData of booksData) {
        try {
          const book = await this.addBook(bookData);
          results.push(book);
        } catch (error) {
          errors.push({ book: bookData.title || bookData.isbn, error: error.message });
        }
      }

      return {
        success: results,
        errors: errors
      };
    } catch (error) {
      console.error('Error adding books batch:', error);
      throw error;
    }
  }

  async updateBook(id, bookData) {
    try {
      // Get existing book to check current cover
      const existingBook = await Book.findById(id);
      const existingCoverUrl = existingBook?.coverUrl || null;
      const existingCoverPath = existingBook?.cover || null;
      
      // Check if existing cover is a custom uploaded cover (stored in /custom/ directory)
      const isCustomCover = existingCoverPath && existingCoverPath.includes('/custom/');
      
      // Download and save cover if URL provided
      // IMPORTANT: Always respect user's explicit selection if they provided a coverUrl
      // Only use selectLargestCover if no explicit selection was made
      let coverUrlToUse = bookData.coverUrl;
      
      // If user explicitly selected a cover URL, always use it (don't override with selectLargestCover)
      if (coverUrlToUse) {
        logger.info(`[UpdateBook] Using user-selected cover URL: ${coverUrlToUse}`);
        // Check if it exists in availableCovers for logging purposes
        if (bookData.availableCovers && Array.isArray(bookData.availableCovers) && bookData.availableCovers.length > 0) {
          const selectedCover = bookData.availableCovers.find(c => c.url === coverUrlToUse);
          if (selectedCover) {
            logger.info(`[UpdateBook] User-selected cover found in availableCovers`);
          } else {
            logger.info(`[UpdateBook] User-selected cover not in availableCovers, but using it anyway (user's explicit choice)`);
          }
        }
      } else if (bookData.availableCovers && Array.isArray(bookData.availableCovers) && bookData.availableCovers.length > 0) {
        // No explicit selection, use largest cover as fallback
        const largestCover = this.selectLargestCover(bookData.availableCovers);
        if (largestCover) {
          coverUrlToUse = largestCover;
          logger.info(`[UpdateBook] No explicit selection, using largest cover from ${bookData.availableCovers.length} available covers: ${coverUrlToUse}`);
        }
      }
      
      let coverPath = bookData.cover;
      
      // Determine if we need to download a new cover
      // IMPORTANT: Preserve custom covers unless user explicitly selects a different cover
      // Download new cover if:
      // 1. A coverUrl is provided AND
      // 2. Either there's no existing cover, OR the new coverUrl is different from the existing one
      // 3. AND the existing cover is NOT a custom cover (unless user explicitly changed it)
      // Note: We compare URLs, not paths, since the path is the local saved file
      
      logger.info(`[UpdateBook] Cover update check - coverUrlToUse: ${coverUrlToUse}, existingCoverUrl: ${existingCoverUrl}, existingCoverPath: ${existingCoverPath}, isCustomCover: ${isCustomCover}`);
      
      // Check if the cover URL has changed
      // If existingCoverUrl is null/undefined, we consider it changed if coverUrlToUse is provided
      const coverUrlChanged = coverUrlToUse && 
        (!existingCoverUrl || coverUrlToUse !== existingCoverUrl);
      
      // Download new cover if:
      // 1. User provided a coverUrl AND
      // 2. The URL has changed AND
      // 3. Either it's not a custom cover, OR it is custom but user explicitly selected a different one (coverUrlChanged handles this)
      // For custom covers: if coverUrlChanged is true, it means user selected a different cover, so we should download
      const shouldDownload = coverUrlToUse && coverUrlChanged;
      
      logger.info(`[UpdateBook] Cover decision - coverUrlChanged: ${coverUrlChanged}, shouldDownload: ${shouldDownload}, isCustomCover: ${isCustomCover}`);
      
      if (shouldDownload) {
        try {
          logger.info(`[UpdateBook] Downloading new cover: ${coverUrlToUse}`);
          const filename = `book_${id}_${Date.now()}.jpg`;
          coverPath = await imageService.downloadImageFromUrl(coverUrlToUse, 'book', filename);
          if (coverPath) {
            try {
              const path = require('path');
              const downloadedFilename = coverPath.split('/').pop();
              const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
              logger.info(`[UpdateBook] Successfully downloaded and resized new cover: ${coverPath}`);
            } catch (resizeError) {
              logger.warn(`[UpdateBook] Failed to resize cover: ${resizeError.message}`);
            }
          } else {
            logger.warn(`[UpdateBook] Download returned no cover path`);
          }
        } catch (error) {
          logger.warn(`[UpdateBook] Failed to download cover: ${error.message}`);
          // If download fails, keep existing cover
          coverPath = existingCoverPath;
        }
      } else {
        // Keep existing cover
        coverPath = existingCoverPath;
        if (isCustomCover) {
          logger.info(`[UpdateBook] Preserving custom cover: ${existingCoverPath}`);
        } else if (!coverUrlToUse) {
          logger.info(`[UpdateBook] No cover URL provided, keeping existing cover: ${existingCoverPath}`);
        } else {
          logger.info(`[UpdateBook] Cover URL unchanged, keeping existing cover: ${existingCoverPath}`);
        }
      }

      // Normalize array fields to ensure they're arrays
      const normalizedData = {
        ...bookData,
        cover: coverPath || bookData.cover,
        // Always update coverUrl if it was provided, so we can track the source URL
        coverUrl: coverUrlToUse || bookData.coverUrl || null
      };
      
      // Log what we're about to save
      logger.info(`[UpdateBook] Saving cover - path: ${normalizedData.cover}, url: ${normalizedData.coverUrl}`);
      
      // Only normalize array fields if they're provided
      if (bookData.tags !== undefined) normalizedData.tags = normalizeArrayField(bookData.tags);
      if (bookData.genres !== undefined) normalizedData.genres = normalizeArrayField(bookData.genres);
      if (bookData.authors !== undefined) normalizedData.authors = normalizeArrayField(bookData.authors);
      if (bookData.artists !== undefined) normalizedData.artists = normalizeArrayField(bookData.artists);

      const book = await Book.update(id, normalizedData);

      return book;
    } catch (error) {
      console.error('Error updating book:', error);
      throw error;
    }
  }

  async deleteBook(id) {
    try {
      // Get book first to check for ebook file
      const book = await Book.findById(id);
      
      // Delete ebook file if it exists
      if (book && book.ebookFile) {
        const path = require('path');
        const fs = require('fs');
        let ebookDir;
        try {
          ebookDir = configManager.getEbooksPath();
        } catch (error) {
          // Fallback to default if config not loaded
          ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
        }
        const filePath = path.join(ebookDir, book.ebookFile);
        
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`Deleted ebook file: ${filePath}`);
          } catch (fileError) {
            console.warn('Failed to delete ebook file:', fileError.message);
            // Continue with book deletion even if file deletion fails
          }
        }
      }
      
      const result = await Book.delete(id);
      return result;
    } catch (error) {
      console.error('Error deleting book:', error);
      throw error;
    }
  }

  /**
   * Enrich Google Books result with OpenLibrary data
   * Uses Google Books as base, fills gaps with OpenLibrary data
   */
  async enrichWithOpenLibrary(googleBook) {
    if (!googleBook) return googleBook;
    
    logger.info(`[Enrichment] Attempting to enrich "${googleBook.title}" with OpenLibrary data`);
    logger.info(`[Enrichment] Google Books data - ISBN: ${googleBook.isbn}, ISBN-13: ${googleBook.isbn13}`);

    let olBook = null;
    
    // First, try to find matching OpenLibrary book by ISBN
    // Try both ISBN-13 and ISBN-10
    const isbn13 = googleBook.isbn13 || null;
    const isbn10 = googleBook.isbn || (isbn13 && isbn13.length === 13 ? isbn13.slice(3, 13) : null);
    
    // Try ISBN-13 first, then ISBN-10
    const isbnsToTry = [];
    if (isbn13) {
      isbnsToTry.push({ type: 'ISBN-13', value: isbn13 });
    }
    if (isbn10 && (!isbn13 || isbn10 !== isbn13.slice(3, 13))) {
      isbnsToTry.push({ type: 'ISBN-10', value: isbn10 });
    }
    // Also try the main ISBN field
    if (googleBook.isbn && googleBook.isbn !== isbn13 && googleBook.isbn !== isbn10) {
      isbnsToTry.push({ type: 'ISBN', value: googleBook.isbn });
    }
    
    logger.info(`[Enrichment] Will try ${isbnsToTry.length} ISBN(s): ${isbnsToTry.map(i => `${i.type}=${i.value}`).join(', ')}`);
    
    for (const isbnInfo of isbnsToTry) {
      try {
        logger.info(`[Enrichment] Trying ${isbnInfo.type} lookup: ${isbnInfo.value}`);
        const openLibraryResults = await this.searchByIsbn(isbnInfo.value);
        if (openLibraryResults && openLibraryResults.length > 0) {
          olBook = openLibraryResults[0];
          logger.info(`[Enrichment] ✓ Found OpenLibrary match by ${isbnInfo.type} for "${googleBook.title}"`);
          break;
        } else {
          logger.info(`[Enrichment] No OpenLibrary match found for ${isbnInfo.type} ${isbnInfo.value}`);
        }
      } catch (error) {
        logger.warn(`[Enrichment] ${isbnInfo.type} lookup failed: ${error.message}`);
      }
    }
    
    if (!olBook) {
      logger.info(`[Enrichment] All ISBN lookups failed, trying title search`);
    }

    // If ISBN lookup failed or no ISBN, try searching by title and author
    if (!olBook && googleBook.title) {
      try {
        // Build search query from title and authors
        let searchQuery = googleBook.title;
        if (googleBook.authors && Array.isArray(googleBook.authors) && googleBook.authors.length > 0) {
          searchQuery += ` ${googleBook.authors[0]}`;
        }
        
        logger.info(`[Enrichment] Searching OpenLibrary by title: "${searchQuery}"`);
        
        // For enrichment, search without language filtering to get all results
        // Then we'll match by title ourselves
        const url = 'https://openlibrary.org/search.json';
        const params = {
          q: searchQuery,
          limit: 20 // Get more results for better matching
        };
        
        logger.info(`[Enrichment] OpenLibrary search URL: ${url}?q=${encodeURIComponent(searchQuery)}`);
        const response = await axios.get(url, { params, timeout: 15000 });
        const data = response.data;
        
        logger.info(`[Enrichment] OpenLibrary returned ${data.docs ? data.docs.length : 0} results`);
        
        if (!data.docs || data.docs.length === 0) {
          logger.info(`[Enrichment] No OpenLibrary results found for title search: "${searchQuery}"`);
        } else {
          // Log first few results for debugging
          data.docs.slice(0, 5).forEach((doc, idx) => {
            logger.info(`[Enrichment] Result ${idx + 1}: "${doc.title || doc.title_suggest}" (lang: ${doc.language ? doc.language.join(',') : 'unknown'})`);
          });
          
          // Try to find the best match by comparing titles
          // Normalize: lowercase, remove accents/diacritics, remove special chars, trim
          const normalizeTitle = (title) => {
            if (!title) return '';
            return title
              .toLowerCase()
              .normalize('NFD') // Decompose accented characters
              .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
              .replace(/[^\w\s]/g, '') // Remove special chars
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();
          };
          const googleTitleNormalized = normalizeTitle(googleBook.title);
          
          logger.info(`[Enrichment] Comparing normalized title: "${googleTitleNormalized}"`);
          
          // Fetch work details for top candidates
          const topCandidates = data.docs.slice(0, 10);
          const candidatesWithMetadata = await Promise.allSettled(
            topCandidates.map(async (doc) => {
              let workData = null;
              if (doc.work_key && doc.work_key.length > 0) {
                try {
                  const workKey = doc.work_key[0];
                  const workResponse = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 5000 });
                  workData = workResponse.data;
                } catch (error) {
                  // Silently fail
                }
              }
              return { doc, workData };
            })
          );
          
          for (const candidateResult of candidatesWithMetadata) {
            if (candidateResult.status !== 'fulfilled') continue;
            
            const { doc, workData } = candidateResult.value;
            const formattedBook = this.formatOpenLibraryBook(doc, workData);
            const resultTitleNormalized = normalizeTitle(formattedBook.title);
            
            logger.info(`[Enrichment] Checking result: "${formattedBook.title}" -> normalized: "${resultTitleNormalized}"`);
            
            // Check if titles match (allowing for some variation)
            const titlesMatch = resultTitleNormalized.includes(googleTitleNormalized) || 
                googleTitleNormalized.includes(resultTitleNormalized) ||
                resultTitleNormalized === googleTitleNormalized;
            
            // Also check if key words match (at least 2 words in common)
            const googleWords = googleTitleNormalized.split(/\s+/).filter(w => w.length > 2);
            const resultWords = resultTitleNormalized.split(/\s+/).filter(w => w.length > 2);
            const commonWords = googleWords.filter(w => resultWords.includes(w));
            const hasCommonWords = commonWords.length >= Math.min(2, Math.min(googleWords.length, resultWords.length));
            
            if (titlesMatch || hasCommonWords) {
              olBook = formattedBook;
              logger.info(`[Enrichment] ✓ Found OpenLibrary match by title: "${formattedBook.title}" (match: ${titlesMatch ? 'title' : 'words'})`);
              break;
            }
          }
          
          if (!olBook) {
            logger.info(`[Enrichment] Found ${data.docs.length} OpenLibrary results but no good title match for "${googleBook.title}"`);
          }
        }
      } catch (error) {
        logger.warn(`[Enrichment] Title search failed: ${error.message}`);
      }
    }

    // If still no match found, return original book
    if (!olBook) {
      logger.info(`[Enrichment] No OpenLibrary match found for "${googleBook.title}" (tried ISBN and title search)`);
      return googleBook;
    }

    logger.info(`[Enrichment] Found OpenLibrary match for "${googleBook.title}"`);
    
    // Merge data: Google Books as base, OpenLibrary fills gaps
    const enriched = { ...googleBook };
    const enrichedFields = [];
    
    // Fill missing fields or enhance existing ones
    if (!enriched.series && olBook.series) {
      enriched.series = olBook.series;
      enrichedFields.push('series');
    }
    if (!enriched.seriesNumber && olBook.seriesNumber) {
      enriched.seriesNumber = olBook.seriesNumber;
      enrichedFields.push('seriesNumber');
    }
    
    // Use OpenLibrary description if Google Books description is too short or missing
    if (olBook.description) {
      const googleDescLength = (googleBook.description || '').length;
      const olDescLength = olBook.description.length;
      if (!googleBook.description || olDescLength > googleDescLength * 1.5) {
        enriched.description = olBook.description;
        enrichedFields.push(`description (${olDescLength} chars vs ${googleDescLength} chars)`);
      }
    }
    
    // Fill missing page count
    if (!enriched.pageCount && olBook.pageCount) {
      enriched.pageCount = olBook.pageCount;
      enrichedFields.push(`pageCount (${olBook.pageCount})`);
    }
    
    // Fill missing publisher
    if (!enriched.publisher && olBook.publisher) {
      enriched.publisher = olBook.publisher;
      enrichedFields.push(`publisher (${olBook.publisher})`);
    }
    
    // Fill missing published year
    if (!enriched.publishedYear && olBook.publishedYear) {
      enriched.publishedYear = olBook.publishedYear;
      enrichedFields.push(`publishedYear (${olBook.publishedYear})`);
    }
    
    // Merge genres (combine both sources, remove duplicates)
    const allGenres = new Set();
    if (googleBook.genres && Array.isArray(googleBook.genres)) {
      googleBook.genres.forEach(g => allGenres.add(g));
    }
    if (olBook.genres && Array.isArray(olBook.genres)) {
      olBook.genres.forEach(g => allGenres.add(g));
    }
    if (allGenres.size > 0) {
      const originalGenresCount = googleBook.genres ? (Array.isArray(googleBook.genres) ? googleBook.genres.length : 1) : 0;
      const newGenresCount = allGenres.size;
      if (newGenresCount > originalGenresCount) {
        enriched.genres = Array.from(allGenres);
        enrichedFields.push(`genres (${originalGenresCount} -> ${newGenresCount})`);
      }
    }
    
    // Use OpenLibrary cover if Google Books cover is missing or low quality
    if (!enriched.coverUrl && olBook.coverUrl) {
      enriched.coverUrl = olBook.coverUrl;
      enrichedFields.push('coverUrl');
    }
    
    // Merge URLs
    if (!enriched.urls) {
      enriched.urls = {};
    }
    if (olBook.urls) {
      const originalUrlCount = Object.keys(enriched.urls || {}).length;
      enriched.urls = { ...enriched.urls, ...olBook.urls };
      const newUrlCount = Object.keys(enriched.urls).length;
      if (newUrlCount > originalUrlCount) {
        enrichedFields.push(`urls (${originalUrlCount} -> ${newUrlCount})`);
      }
    }
    
    // Collect all available covers from different sources
    // Initialize covers array
    enriched.availableCovers = [];
    
    // Add Google Books cover (if exists and not duplicate)
    if (googleBook.coverUrl) {
      enriched.availableCovers.push({
        source: 'Google Books',
        url: googleBook.coverUrl,
        type: 'front'
      });
    }
    
    // Add OpenLibrary covers (includes front and back if available)
    if (olBook.availableCovers && Array.isArray(olBook.availableCovers)) {
      olBook.availableCovers.forEach(cover => {
        // Avoid duplicates by URL
        if (!enriched.availableCovers.some(c => c.url === cover.url)) {
          enriched.availableCovers.push(cover);
        }
      });
    } else if (olBook.coverUrl) {
      // Fallback if availableCovers not set
      if (!enriched.availableCovers.some(c => c.url === olBook.coverUrl)) {
        enriched.availableCovers.push({
          source: 'OpenLibrary',
          url: olBook.coverUrl,
          type: 'front'
        });
      }
    }
    
    // Set default cover: select the largest available cover
    if (enriched.availableCovers.length > 0) {
      const largestCover = this.selectLargestCover(enriched.availableCovers);
      if (largestCover) {
        enriched.coverUrl = largestCover;
      }
    }
    
    if (enrichedFields.length > 0) {
      logger.info(`[Enrichment] Successfully enriched "${googleBook.title}" with fields: ${enrichedFields.join(', ')}`);
    } else {
      logger.info(`[Enrichment] Found OpenLibrary match for "${googleBook.title}" but no additional fields to enrich`);
    }
    
    logger.info(`[Enrichment] Collected ${enriched.availableCovers.length} covers from different sources`);
    
    return enriched;
  }


  /**
   * Search for all volumes in a series
   * Searches external APIs to find all volumes of a given series
   */
  async searchSeriesVolumes(seriesName, options = {}) {
    try {
      const { language = 'any', maxVolumes = 100 } = options;
      const volumes = [];
      const seenVolumes = new Set(); // Track volumes by series number to avoid duplicates
      const seenIsbns = new Set(); // Also track by ISBN to avoid duplicates

      logger.info(`[SeriesSearch] Searching for volumes of series: "${seriesName}"`);

      // Helper function to check if a result belongs to the series (more flexible matching)
      const belongsToSeries = (result, targetSeries) => {
        // Try to extract series from result
        const resultSeries = result.series || extractSeriesFromTitle(result.title)?.series;
        if (!resultSeries) return false;
        
        const normalizedResult = this.normalizeSeriesName(resultSeries);
        const normalizedTarget = this.normalizeSeriesName(targetSeries);
        
        // Exact match
        if (normalizedResult === normalizedTarget) return true;
        
        // Check if target series is contained in result series (e.g., "Thorgal" in "Thorgal - Tome 21")
        if (normalizedResult.includes(normalizedTarget) || normalizedTarget.includes(normalizedResult)) {
          // Additional check: make sure it's not a false positive
          // For example, avoid matching "Thorgal" with "Thorgal Chronicles" if they're different series
          const words = normalizedTarget.split(/\s+/);
          const resultWords = normalizedResult.split(/\s+/);
          // If target is a single word or all words are present, it's likely a match
          if (words.length === 1 || words.every(word => resultWords.some(rw => rw.startsWith(word) || word.startsWith(rw)))) {
            return true;
          }
        }
        
        return false;
      };

      // Search Google Books with multiple query strategies
      try {
        const searchQueries = [
          `"${seriesName}"`, // Exact phrase - most specific
          `${seriesName} tome`, // With "tome" keyword - good for French comics
          `${seriesName}`, // Without quotes (broader)
          `intitle:"${seriesName}"`, // In title only
          `${seriesName} volume`, // With "volume" keyword
        ];
        
        const allGoogleResults = [];
        for (const query of searchQueries) {
          try {
            // Request more results than maxVolumes to account for filtering
            const requestLimit = Math.min(maxVolumes * 2, 40); // Google Books max is 40 per request
            const googleResults = await this.searchGoogleBooks(query, requestLimit, {});
            allGoogleResults.push(...googleResults);
            
            // If we got max results, try pagination (startIndex parameter)
            // Note: Google Books allows pagination but we'll prioritize breadth over depth
            if (googleResults.length >= requestLimit) {
              logger.info(`[SeriesSearch] Got ${googleResults.length} results for "${query}", may need pagination`);
            }
          } catch (err) {
            logger.warn(`[SeriesSearch] Google Books query "${query}" failed: ${err.message}`);
          }
        }
        
        // Deduplicate by ISBN first
        const uniqueGoogleResults = [];
        const seenGoogleIsbns = new Set();
        for (const result of allGoogleResults) {
          const isbn = result.isbn13 || result.isbn;
          if (isbn && seenGoogleIsbns.has(isbn)) continue;
          if (isbn) seenGoogleIsbns.add(isbn);
          uniqueGoogleResults.push(result);
        }
        
        for (const result of uniqueGoogleResults) {
          if (belongsToSeries(result, seriesName)) {
            // Try to extract series number from title or use existing
            let seriesNumber = result.seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            
            // If no series number found, try to extract from title patterns more aggressively
            if (!seriesNumber && result.title) {
              // Try patterns like "Tome 21", "T21", "#21", etc.
              const tomeMatch = result.title.match(/Tome\s+(\d+)/i);
              if (tomeMatch) seriesNumber = parseInt(tomeMatch[1], 10);
              
              if (!seriesNumber) {
                const tMatch = result.title.match(/T(\d+)/i);
                if (tMatch) seriesNumber = parseInt(tMatch[1], 10);
              }
              
              if (!seriesNumber) {
                const hashMatch = result.title.match(/#(\d+)/i);
                if (hashMatch) seriesNumber = parseInt(hashMatch[1], 10);
              }
            }
            
            // Use ISBN as fallback identifier if no series number
            const identifier = seriesNumber || (result.isbn13 || result.isbn);
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              const isbn = result.isbn13 || result.isbn;
              if (isbn) seenIsbns.add(isbn);
              volumes.push({
                ...result,
                series: seriesName,
                seriesNumber: seriesNumber || null
              });
            }
          }
        }
        
        logger.info(`[SeriesSearch] Found ${volumes.length} volumes from Google Books`);
      } catch (error) {
        logger.warn(`[SeriesSearch] Google Books search failed: ${error.message}`);
      }

      // Search OpenLibrary for series
      try {
        const olQueries = [
          seriesName,
          `${seriesName} tome`,
          `${seriesName} volume`
        ];
        
        const allOlResults = [];
        for (const query of olQueries) {
          try {
            const olResults = await this.searchOpenLibrary(query, Math.max(maxVolumes, 40), 'any');
            allOlResults.push(...olResults);
          } catch (err) {
            logger.warn(`[SeriesSearch] OpenLibrary query "${query}" failed: ${err.message}`);
          }
        }
        
        // Deduplicate by ISBN
        const uniqueOlResults = [];
        const seenOlIsbns = new Set();
        for (const result of allOlResults) {
          const isbn = result.isbn13 || result.isbn;
          if (isbn && seenOlIsbns.has(isbn)) continue;
          if (isbn) seenOlIsbns.add(isbn);
          uniqueOlResults.push(result);
        }
        
        for (const result of uniqueOlResults) {
          if (belongsToSeries(result, seriesName)) {
            // Try to extract series number from title or use existing
            let seriesNumber = result.seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            
            // If no series number found, try to extract from title patterns more aggressively
            if (!seriesNumber && result.title) {
              // Try patterns like "Tome 21", "T21", "#21", etc.
              const tomeMatch = result.title.match(/Tome\s+(\d+)/i);
              if (tomeMatch) seriesNumber = parseInt(tomeMatch[1], 10);
              
              if (!seriesNumber) {
                const tMatch = result.title.match(/T(\d+)/i);
                if (tMatch) seriesNumber = parseInt(tMatch[1], 10);
              }
              
              if (!seriesNumber) {
                const hashMatch = result.title.match(/#(\d+)/i);
                if (hashMatch) seriesNumber = parseInt(hashMatch[1], 10);
              }
            }
            
            // Use ISBN as fallback identifier if no series number
            const identifier = seriesNumber || (result.isbn13 || result.isbn);
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              const isbn = result.isbn13 || result.isbn;
              if (isbn) seenIsbns.add(isbn);
              volumes.push({
                ...result,
                series: seriesName,
                seriesNumber: seriesNumber || null
              });
            }
          }
        }
        
        logger.info(`[SeriesSearch] Found ${volumes.length} total volumes after OpenLibrary`);
      } catch (error) {
        logger.warn(`[SeriesSearch] OpenLibrary search failed: ${error.message}`);
      }

      // Sort volumes by series number (volumes without numbers go to the end)
      volumes.sort((a, b) => {
        const numA = a.seriesNumber || 9999;
        const numB = b.seriesNumber || 9999;
        if (numA === 9999 && numB === 9999) {
          // Both have no number, sort by title
          return (a.title || '').localeCompare(b.title || '');
        }
        return numA - numB;
      });

      logger.info(`[SeriesSearch] Found ${volumes.length} volumes for series "${seriesName}"`);
      return volumes;
    } catch (error) {
      logger.error(`[SeriesSearch] Error searching series volumes: ${error.message}`);
      return [];
    }
  }

  /**
   * Normalize series name for comparison (remove accents, lowercase, trim)
   */
  normalizeSeriesName(name) {
    if (!name) return '';
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Get cover size priority (higher number = larger/better)
   * OpenLibrary: -L.jpg (large) > -M.jpg (medium) > -S.jpg (small)
   * Google Books: large > medium > small > thumbnail
   */
  getCoverSizePriority(url) {
    if (!url) return 0;
    
    // OpenLibrary covers: original (no suffix) = 5, -L.jpg = 4, -M.jpg = 3, -S.jpg = 2, default = 2
    if (url.includes('covers.openlibrary.org')) {
      // Check for original size (no size suffix, just .jpg)
      const coverIdMatch = url.match(/\/b\/id\/(\d+)\.jpg$/);
      if (coverIdMatch && !url.includes('-L.jpg') && !url.includes('-M.jpg') && !url.includes('-S.jpg')) {
        return 5; // Original/highest resolution
      }
      if (url.includes('-L.jpg')) return 4; // Large
      if (url.includes('-M.jpg')) return 3; // Medium
      if (url.includes('-S.jpg')) return 2; // Small
      return 2; // Default OpenLibrary cover (usually medium)
    }
    
    // Google Books: check URL parameters or path
    if (url.includes('books.google.com') || url.includes('googleapis.com')) {
      // Google Books API imageLinks: extra-large (enhanced) > large > medium > small > thumbnail
      // Check for enhanced URLs with high resolution parameters
      if (url.includes('zoom=10') || (url.includes('&w=') && url.includes('&h='))) {
        // Try to extract dimensions if available
        const wMatch = url.match(/[&?]w=(\d+)/);
        const hMatch = url.match(/[&?]h=(\d+)/);
        if (wMatch && hMatch) {
          const area = parseInt(wMatch[1]) * parseInt(hMatch[1]);
          if (area > 1000000) return 6; // Extra large (> 1000x1000)
          if (area > 500000) return 5; // Very large (> 700x700)
          if (area > 200000) return 4; // Large (> 450x450)
          if (area > 50000) return 3;  // Medium (> 220x220)
          return 2; // Small
        }
        // If zoom=10 is present, it's likely enhanced
        if (url.includes('zoom=10')) return 5;
      }
      // Fallback: check for size indicators in URL
      if (url.includes('extra-large') || (url.includes('w=1280') || url.includes('h=1920'))) return 5;
      if (url.includes('large') || url.includes('L.jpg')) return 4;
      if (url.includes('medium') || url.includes('M.jpg')) return 3;
      if (url.includes('small') || url.includes('S.jpg')) return 2;
      return 3; // Default Google Books (usually medium/large)
    }
    
    // Other sources: assume medium priority
    return 2;
  }

  /**
   * Select the largest cover from availableCovers
   * Returns the URL of the largest cover, or null if none available
   */
  selectLargestCover(availableCovers) {
    if (!availableCovers || !Array.isArray(availableCovers) || availableCovers.length === 0) {
      return null;
    }
    
    // Filter to front covers only (prefer front covers)
    const frontCovers = availableCovers.filter(c => !c.type || c.type === 'front');
    const coversToCheck = frontCovers.length > 0 ? frontCovers : availableCovers;
    
    if (coversToCheck.length === 0) return null;
    
    // Sort by size priority (largest first)
    // Use explicit priority field if available, otherwise infer from URL
    const sortedCovers = coversToCheck.sort((a, b) => {
      // Prefer explicit priority field if available
      const priorityA = (a.priority !== undefined && a.priority !== null) 
        ? a.priority 
        : this.getCoverSizePriority(a.url);
      const priorityB = (b.priority !== undefined && b.priority !== null) 
        ? b.priority 
        : this.getCoverSizePriority(b.url);
      return priorityB - priorityA; // Descending order
    });
    
    return sortedCovers[0].url;
  }

  /**
   * Search external book APIs (Google Books, OpenLibrary)
   * Supports ISBN, author, and title searches
   * Routing:
   * - All languages: Google Books first, OpenLibrary fallback
   * - Enrichment happens when book is selected (Google Books + OpenLibrary)
   */
  async searchExternalBooks(query, filters = {}) {
    try {
      const { isbn, author, title, limit = 20, language = 'any' } = filters;
      
      // Normalize filter values - treat empty strings as undefined
      const normalizedTitle = title && title.trim() ? title.trim() : undefined;
      const normalizedAuthor = author && author.trim() ? author.trim() : undefined;
      const normalizedIsbn = isbn && isbn.trim() ? isbn.trim() : undefined;

      // Check if ISBN is provided directly or if query looks like an ISBN
      let isbnToSearch = normalizedIsbn;
      if (!isbnToSearch && query) {
        // Clean the query to check if it's an ISBN
        const cleanQuery = query.replace(/[-\s]/g, '');
        // Check if it's a valid ISBN (10 or 13 digits)
        if (/^\d{10}$/.test(cleanQuery) || /^\d{13}$/.test(cleanQuery)) {
          isbnToSearch = query; // Use original query with dashes
        }
      }

      // If ISBN detected, try Google Books first, then OpenLibrary
      if (isbnToSearch) {
        try {
          const googleResults = await this.searchGoogleBooksByIsbn(isbnToSearch);
          if (googleResults && googleResults.length > 0) {
            return googleResults;
          }
        } catch (error) {
          // Handle network errors gracefully
          const errorCode = error.code || error.errno;
          const isNetworkError = [
            'EADDRNOTAVAIL', 
            'ECONNREFUSED', 
            'ETIMEDOUT', 
            'ENOTFOUND',
            'ECONNABORTED',
            'ENETUNREACH'
          ].includes(errorCode);
          
          if (isNetworkError) {
            logger.warn(`Network error in Google Books ISBN search (${errorCode}), falling back to OpenLibrary`);
          } else {
            logger.warn('Google Books ISBN search failed, falling back to OpenLibrary:', error.message || errorCode);
          }
        }
        
        // Fallback to OpenLibrary only if Google Books fails
        try {
          return await this.searchByIsbn(isbnToSearch);
        } catch (fallbackError) {
          logger.error('Both Google Books and OpenLibrary ISBN searches failed:', fallbackError.message || fallbackError.code);
          return [];
        }
      }

      // Build search query
      // Use specific filters if provided, otherwise use the general query
      let searchQuery = query;
      let finalTitle = normalizedTitle;
      let finalAuthor = normalizedAuthor;
      
      if (normalizedTitle && normalizedAuthor) {
        // Both title and author provided - combine them
        searchQuery = `${normalizedTitle} ${normalizedAuthor}`;
        finalTitle = normalizedTitle;
        finalAuthor = normalizedAuthor;
      } else if (normalizedTitle && !normalizedAuthor) {
        // Only title provided
        searchQuery = normalizedTitle;
        finalTitle = normalizedTitle;
      } else if (normalizedAuthor && !normalizedTitle) {
        // Only author provided
        searchQuery = normalizedAuthor;
        finalAuthor = normalizedAuthor;
      } else if (query && query.trim()) {
        // If only general query is provided (no filters), treat it as a title search
        // This helps with searches like "Carnets de cerise"
        searchQuery = query.trim();
        finalTitle = query.trim();
        logger.info(`[Search] No filters provided, treating general query as title: "${finalTitle}"`);
      }

      // Use Google Books as primary source for all languages
      logger.info(`[Search] Searching on Google Books (language: ${language}, query: "${searchQuery}")`);
      try {
        const googleResults = await this.searchGoogleBooks(searchQuery, limit, { title: finalTitle, author: finalAuthor, language });
        if (googleResults && googleResults.length > 0) {
          return googleResults;
        }
      } catch (error) {
        // Handle network errors gracefully
        const errorCode = error.code || error.errno;
        const isNetworkError = [
          'EADDRNOTAVAIL', 
          'ECONNREFUSED', 
          'ETIMEDOUT', 
          'ENOTFOUND',
          'ECONNABORTED',
          'ENETUNREACH'
        ].includes(errorCode);
        
        if (isNetworkError) {
          logger.warn(`Network error in Google Books search (${errorCode}), falling back to OpenLibrary`);
        } else {
          logger.warn('Google Books search failed, falling back to OpenLibrary:', error.message || errorCode);
        }
      }

      // Fallback to OpenLibrary only if Google Books failed or returned no results
      logger.info(`[Search] Google Books returned no results, trying OpenLibrary`);
      try {
        return await this.searchOpenLibrary(searchQuery, limit, language);
      } catch (error) {
        logger.error('OpenLibrary search failed:', error.message);
        return [];
      }
    } catch (error) {
      console.error('Error searching external books:', error);
      throw error;
    }
  }

  /**
   * Enrich a book with Google Books data
   * Searches Google Books by ISBN or title/author to get additional metadata
   */
  async enrichWithGoogleBooks(book) {
    if (!book) return book;
    
    logger.info(`[Enrichment] Attempting to enrich "${book.title}" with Google Books data`);
    
    try {
      let googleBook = null;
      
      // Try to find by ISBN first
      if (book.isbn || book.isbn13) {
        try {
          const isbnToSearch = book.isbn13 || book.isbn;
          logger.info(`[Enrichment] Searching Google Books by ISBN: ${isbnToSearch}`);
          const googleResults = await this.searchGoogleBooksByIsbn(isbnToSearch);
          if (googleResults && googleResults.length > 0) {
            googleBook = googleResults[0];
            logger.info(`[Enrichment] ✓ Found Google Books match by ISBN for "${book.title}"`);
          }
        } catch (error) {
          logger.warn(`[Enrichment] Google Books ISBN search failed: ${error.message}`);
        }
      }
      
      // If ISBN search failed, try by title/author
      if (!googleBook && book.title) {
        try {
          // Build more flexible search queries
          const searchQueries = [];
          
          // Clean up title for better matching
          let cleanTitle = book.title.trim();
          // Extract main title (remove subtitle after second dash or colon)
          const titleParts = cleanTitle.split(/[-–—]/);
          const mainTitle = titleParts[0].trim();
          
          // Add queries with author if available
          if (book.authors && Array.isArray(book.authors) && book.authors.length > 0) {
            const author = book.authors[0].trim();
            // Try with intitle and inauthor for better precision
            searchQueries.push(`intitle:"${mainTitle}" inauthor:"${author}"`);
            searchQueries.push(`"${mainTitle}" "${author}"`);
            searchQueries.push(`${mainTitle} ${author}`);
          }
          
          // Also try without author and with full title
          searchQueries.push(`intitle:"${cleanTitle}"`);
          searchQueries.push(`"${mainTitle}"`);
          searchQueries.push(cleanTitle);
          searchQueries.push(mainTitle);
          
          logger.info(`[Enrichment] Searching Google Books by title/author with ${searchQueries.length} query variants`);
          
          for (const searchQuery of searchQueries) {
            try {
              const googleResults = await this.searchGoogleBooks(searchQuery, 10);
              if (googleResults && googleResults.length > 0) {
                // Try to match by title with more flexible matching
                const normalizeTitle = (title) => {
                  if (!title) return '';
                  return title.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
                };
                
                const bookTitleNormalized = normalizeTitle(book.title);
                const bookMainTitleNormalized = normalizeTitle(mainTitle);
                const bookTitleWords = bookMainTitleNormalized.split(/\s+/).filter(w => w.length > 2); // Words longer than 2 chars
                
                for (const result of googleResults) {
                  const resultTitleNormalized = normalizeTitle(result.title);
                  
                  // Exact match
                  if (resultTitleNormalized === bookTitleNormalized || 
                      resultTitleNormalized === bookMainTitleNormalized) {
                    googleBook = result;
                    logger.info(`[Enrichment] ✓ Found Google Books exact match by title for "${book.title}"`);
                    break;
                  }
                  
                  // Check if all significant words from book title are in result title
                  if (bookTitleWords.length > 0) {
                    const resultTitleWords = resultTitleNormalized.split(/\s+/);
                    const allWordsMatch = bookTitleWords.every(word => 
                      resultTitleWords.some(rw => rw.includes(word) || word.includes(rw))
                    );
                    
                    if (allWordsMatch) {
                      googleBook = result;
                      logger.info(`[Enrichment] ✓ Found Google Books match by title words for "${book.title}" -> "${result.title}"`);
                      break;
                    }
                  }
                  
                  // Partial match (one title contains the other)
                  if (resultTitleNormalized.includes(bookMainTitleNormalized) ||
                      bookMainTitleNormalized.includes(resultTitleNormalized) ||
                      resultTitleNormalized.includes(bookTitleNormalized) ||
                      bookTitleNormalized.includes(resultTitleNormalized)) {
                    googleBook = result;
                    logger.info(`[Enrichment] ✓ Found Google Books partial match by title for "${book.title}" -> "${result.title}"`);
                    break;
                  }
                }
                
                if (googleBook) break; // Found a match, stop trying other queries
              }
            } catch (queryError) {
              logger.warn(`[Enrichment] Google Books query "${searchQuery}" failed: ${queryError.message}`);
              continue; // Try next query variant
            }
          }
        } catch (error) {
          logger.warn(`[Enrichment] Google Books title search failed: ${error.message}`);
        }
      }
      
      if (!googleBook) {
        logger.info(`[Enrichment] No Google Books match found for "${book.title}"`);
        return book;
      }
      
      // Merge Google Books data into the book
      const enriched = { ...book };
      const enrichedFields = [];
      
      // Fill missing fields or update if Google Books has better data
      // Description: update if missing or if Google Books has a longer/better description
      if (googleBook.description) {
        const currentDescLength = (enriched.description || '').length;
        const googleDescLength = googleBook.description.length;
        if (!enriched.description || googleDescLength > currentDescLength * 1.2) {
          enriched.description = googleBook.description;
          enrichedFields.push(`description (${googleDescLength} chars)`);
        }
      }
      
      // Authors: update if missing or if Google Books has authors and current doesn't
      if (googleBook.authors && Array.isArray(googleBook.authors) && googleBook.authors.length > 0) {
        const currentAuthors = enriched.authors || [];
        const hasCurrentAuthors = Array.isArray(currentAuthors) && currentAuthors.length > 0;
        if (!hasCurrentAuthors) {
          enriched.authors = googleBook.authors;
          enrichedFields.push(`authors (${googleBook.authors.join(', ')})`);
        }
      }
      
      if (!enriched.pageCount && googleBook.pageCount) {
        enriched.pageCount = googleBook.pageCount;
        enrichedFields.push(`pageCount (${googleBook.pageCount})`);
      }
      if (!enriched.publisher && googleBook.publisher) {
        enriched.publisher = googleBook.publisher;
        enrichedFields.push(`publisher (${googleBook.publisher})`);
      }
      if (!enriched.publishedYear && googleBook.publishedYear) {
        enriched.publishedYear = googleBook.publishedYear;
        enrichedFields.push(`publishedYear (${googleBook.publishedYear})`);
      }
      
      // Merge genres
      const allGenres = new Set();
      if (book.genres && Array.isArray(book.genres)) {
        book.genres.forEach(g => allGenres.add(g));
      }
      if (googleBook.genres && Array.isArray(googleBook.genres)) {
        googleBook.genres.forEach(g => allGenres.add(g));
      }
      if (allGenres.size > 0) {
        enriched.genres = Array.from(allGenres);
        if (allGenres.size > (book.genres?.length || 0)) {
          enrichedFields.push(`genres`);
        }
      }
      
      // Add Google Books cover if not already present
      if (googleBook.coverUrl) {
        if (!enriched.availableCovers) {
          enriched.availableCovers = [];
        }
        if (!enriched.availableCovers.some(c => c.url === googleBook.coverUrl)) {
          enriched.availableCovers.push({
            source: 'Google Books',
            url: googleBook.coverUrl,
            type: 'front'
          });
        }
        if (!enriched.coverUrl) {
          enriched.coverUrl = googleBook.coverUrl;
          enrichedFields.push('coverUrl');
        }
      }
      
      // Merge URLs
      if (!enriched.urls) {
        enriched.urls = {};
      }
      if (googleBook.urls) {
        enriched.urls = { ...enriched.urls, ...googleBook.urls };
        enrichedFields.push('urls');
      }
      
      if (enrichedFields.length > 0) {
        logger.info(`[Enrichment] Successfully enriched "${book.title}" with Google Books fields: ${enrichedFields.join(', ')}`);
      }
      
      return enriched;
    } catch (error) {
      logger.warn(`[Enrichment] Google Books enrichment failed: ${error.message}`);
      return book;
    }
  }


  /**
   * Enrich a single book with ALL available sources (Google Books, OpenLibrary)
   * This is called when a book is selected from search results
   * Stores metadata from each source separately to allow user selection
   */
  async enrichBook(bookData) {
    try {
      if (!bookData) return bookData;
      
      logger.info(`[Enrichment] Starting comprehensive enrichment for "${bookData.title}"`);
      
      // Start with the original book
      let enriched = { ...bookData };
      
      // Store metadata from each source separately
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
      
      // Determine the source of the book to avoid redundant enrichment
      // Note: Even if book has Google Books URLs, we still enrich to get complete metadata
      // (URLs might exist but metadata might be incomplete)
      const isFromGoogleBooks = bookData.urls?.googleBooks || bookData.urls?.googleBooksInfo;
      const isFromOpenLibrary = bookData.urls?.openlibrary || bookData._openLibraryData;
      
      // Helper function to perform Google Books enrichment
      const performGoogleBooksEnrichment = async () => {
        let googleBooksData = null;
        let pureGoogleBook = null; // Store pure Google Books data before merging
        let googleMetadata = null;
        
        // Work on a copy of bookData to avoid modifying the original
        const localEnriched = { ...bookData };
        
        // This function is only called when enrichment is needed
        // (hasCompleteGoogleData check is done outside)
        try {
          // First, fetch the pure Google Books data before merging
          let googleBook = null;
          
          // Try to extract Google Books volume ID from existing URL if available
          if (bookData.urls?.googleBooks || bookData.urls?.googleBooksInfo) {
            const googleUrl = bookData.urls.googleBooks || bookData.urls.googleBooksInfo;
            const volumeIdMatch = googleUrl.match(/[?&]id=([^&]+)/);
            if (volumeIdMatch) {
              const volumeId = volumeIdMatch[1];
              try {
                logger.info(`[Enrichment] Found Google Books volume ID in URL: ${volumeId}, fetching directly`);
                googleBook = await this.getGoogleBookVolume(volumeId);
                logger.info(`[Enrichment] ✓ Fetched Google Books volume directly: title="${googleBook.title}", authors=${JSON.stringify(googleBook.authors)}, description length=${(googleBook.description || '').length}`);
              } catch (error) {
                logger.warn(`[Enrichment] Failed to fetch Google Books volume ${volumeId}: ${error.message}`);
              }
            }
          }
          
          // Prioritize title/author search as main criteria (as requested by user)
          // This ensures we get richer metadata by considering more books
          let googleBookByTitle = null;
          if (!googleBook && bookData.title) {
            try {
              // Build more flexible search queries
              const searchQueries = [];
              
              // Clean up title for better matching
              let cleanTitle = bookData.title.trim();
              // Extract main title (remove subtitle after second dash or colon)
              const titleParts = cleanTitle.split(/[-–—]/);
              const mainTitle = titleParts[0].trim();
              
              // Add queries with author if available (title + author is main criteria)
              if (bookData.authors && Array.isArray(bookData.authors) && bookData.authors.length > 0) {
                const author = bookData.authors[0].trim();
                // Try with intitle and inauthor for better precision
                searchQueries.push(`intitle:"${mainTitle}" inauthor:"${author}"`);
                searchQueries.push(`"${mainTitle}" "${author}"`);
                searchQueries.push(`${mainTitle} ${author}`);
              }
              
              // Also try without author and with full title
              searchQueries.push(`intitle:"${cleanTitle}"`);
              searchQueries.push(`"${mainTitle}"`);
              searchQueries.push(cleanTitle);
              searchQueries.push(mainTitle);
              
              logger.info(`[Enrichment] Searching Google Books by title/author (main criteria) with ${searchQueries.length} query variants (parallel)`);
              
              // Prepare normalization function
              const normalizeTitle = (title) => {
                if (!title) return '';
                return title.toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
                  .replace(/\s+/g, ' ') // Normalize whitespace
                  .trim();
              };
              
              const bookTitleNormalized = normalizeTitle(bookData.title);
              const bookMainTitleNormalized = normalizeTitle(mainTitle);
              const bookTitleWords = bookMainTitleNormalized.split(/\s+/).filter(w => w.length > 2); // Words longer than 2 chars
              
              // Execute all search queries in parallel
              const searchPromises = searchQueries.map(async (searchQuery) => {
                try {
                  const googleResults = await this.searchGoogleBooks(searchQuery, 10);
                  if (googleResults && googleResults.length > 0) {
                    // Try to match by title with more flexible matching
                    for (const result of googleResults) {
                      const resultTitleNormalized = normalizeTitle(result.title);
                      
                      // Exact match
                      if (resultTitleNormalized === bookTitleNormalized || 
                          resultTitleNormalized === bookMainTitleNormalized) {
                        return { result, matchType: 'exact', query: searchQuery };
                      }
                      
                      // Check if all significant words from book title are in result title
                      if (bookTitleWords.length > 0) {
                        const resultTitleWords = resultTitleNormalized.split(/\s+/);
                        const allWordsMatch = bookTitleWords.every(word => 
                          resultTitleWords.some(rw => rw.includes(word) || word.includes(rw))
                        );
                        
                        if (allWordsMatch) {
                          return { result, matchType: 'words', query: searchQuery };
                        }
                      }
                      
                      // Partial match (one title contains the other)
                      if (resultTitleNormalized.includes(bookMainTitleNormalized) ||
                          bookMainTitleNormalized.includes(resultTitleNormalized) ||
                          resultTitleNormalized.includes(bookTitleNormalized) ||
                          bookTitleNormalized.includes(resultTitleNormalized)) {
                        return { result, matchType: 'partial', query: searchQuery };
                      }
                    }
                  }
                  return null;
                } catch (queryError) {
                  logger.warn(`[Enrichment] Google Books query "${searchQuery}" failed: ${queryError.message}`);
                  return null;
                }
              });
              
              // Wait for all queries to complete and find the best match
              const searchResults = await Promise.allSettled(searchPromises);
              
              // Process results and find the best match (prioritize exact > words > partial)
              let bestMatch = null;
              let bestMatchType = null;
              
              for (const result of searchResults) {
                if (result.status === 'fulfilled' && result.value) {
                  const { result: matchedBook, matchType, query } = result.value;
                  if (!bestMatch || 
                      (matchType === 'exact' && bestMatchType !== 'exact') ||
                      (matchType === 'words' && bestMatchType === 'partial')) {
                    bestMatch = matchedBook;
                    bestMatchType = matchType;
                    logger.info(`[Enrichment] ✓ Found Google Books ${matchType} match by title/author for "${bookData.title}" (query: "${query}")`);
                    // Continue checking other results to find the best match, but we'll use the first exact match if found
                    if (matchType === 'exact') {
                      break; // Exact match found, no need to check further
                    }
                  }
                }
              }
              
              if (bestMatch) {
                googleBookByTitle = bestMatch;
              }
            } catch (error) {
              logger.warn(`[Enrichment] Google Books title/author search failed: ${error.message}`);
            }
          }
          
          // Also try ISBN search (as secondary/verification method)
          // Compare results and use the one with more metadata
          let googleBookByIsbn = null;
          if (bookData.isbn || bookData.isbn13) {
            try {
              const isbnToSearch = bookData.isbn13 || bookData.isbn;
              logger.info(`[Enrichment] Searching Google Books by ISBN (secondary): ${isbnToSearch}`);
              const googleResults = await this.searchGoogleBooksByIsbn(isbnToSearch);
              if (googleResults && googleResults.length > 0) {
                googleBookByIsbn = googleResults[0];
                logger.info(`[Enrichment] ✓ Found Google Books book by ISBN`);
              }
            } catch (error) {
              logger.warn(`[Enrichment] Google Books ISBN search failed: ${error.message}`);
            }
          }
          
          // Choose the best result: prefer title/author match, but use ISBN if it has significantly more metadata
          if (googleBookByTitle && googleBookByIsbn) {
            // Compare metadata richness
            const titleMetadataScore = this._calculateMetadataScore(googleBookByTitle);
            const isbnMetadataScore = this._calculateMetadataScore(googleBookByIsbn);
            
            logger.info(`[Enrichment] Comparing results - Title/Author score: ${titleMetadataScore}, ISBN score: ${isbnMetadataScore}`);
            
            // Use ISBN result only if it has significantly more metadata (20% more)
            if (isbnMetadataScore > titleMetadataScore * 1.2) {
              googleBook = googleBookByIsbn;
              logger.info(`[Enrichment] Using ISBN result (has more metadata)`);
            } else {
              googleBook = googleBookByTitle;
              logger.info(`[Enrichment] Using title/author result (main criteria)`);
            }
          } else if (googleBookByTitle) {
            googleBook = googleBookByTitle;
          } else if (googleBookByIsbn) {
            googleBook = googleBookByIsbn;
          }
          
          // Store pure Google Books data
          if (googleBook) {
            pureGoogleBook = googleBook;
            logger.info(`[Enrichment] Found Google Books book: "${googleBook.title}", authors: ${JSON.stringify(googleBook.authors)}, description length: ${(googleBook.description || '').length}, publisher: ${googleBook.publisher || 'none'}`);
            
            // Use the googleBook we found directly to enrich, instead of searching again
            // Merge Google Books data into the enriched book
            const enrichedFields = [];
            
            // Description: update if missing or if Google Books has a longer/better description
            if (googleBook.description) {
              const currentDescLength = (localEnriched.description || '').length;
              const googleDescLength = googleBook.description.length;
              if (!localEnriched.description || googleDescLength > currentDescLength * 1.2) {
                localEnriched.description = googleBook.description;
                enrichedFields.push(`description (${googleDescLength} chars)`);
              }
            }
            
            // Authors: update if missing or if Google Books has authors and current doesn't
            if (googleBook.authors && Array.isArray(googleBook.authors) && googleBook.authors.length > 0) {
              const currentAuthors = localEnriched.authors || [];
              const hasCurrentAuthors = Array.isArray(currentAuthors) && currentAuthors.length > 0;
              if (!hasCurrentAuthors) {
                localEnriched.authors = googleBook.authors;
                enrichedFields.push(`authors (${googleBook.authors.join(', ')})`);
              }
            }
            
            if (!localEnriched.pageCount && googleBook.pageCount) {
              localEnriched.pageCount = googleBook.pageCount;
              enrichedFields.push(`pageCount (${googleBook.pageCount})`);
            }
            if (!localEnriched.publisher && googleBook.publisher) {
              localEnriched.publisher = googleBook.publisher;
              enrichedFields.push(`publisher (${googleBook.publisher})`);
            }
            if (!localEnriched.publishedYear && googleBook.publishedYear) {
              localEnriched.publishedYear = googleBook.publishedYear;
              enrichedFields.push(`publishedYear (${googleBook.publishedYear})`);
            }
            
            // Merge genres
            const allGenres = new Set();
            if (bookData.genres && Array.isArray(bookData.genres)) {
              bookData.genres.forEach(g => allGenres.add(g));
            }
            if (googleBook.genres && Array.isArray(googleBook.genres)) {
              googleBook.genres.forEach(g => allGenres.add(g));
            }
            if (allGenres.size > 0) {
              localEnriched.genres = Array.from(allGenres);
              if (allGenres.size > (bookData.genres?.length || 0)) {
                enrichedFields.push(`genres`);
              }
            }
            
            // Add Google Books cover if not already present
            if (googleBook.coverUrl) {
              if (!localEnriched.availableCovers) {
                localEnriched.availableCovers = [];
              }
              if (!localEnriched.availableCovers.some(c => c.url === googleBook.coverUrl)) {
                localEnriched.availableCovers.push({
                  source: 'Google Books',
                  url: googleBook.coverUrl,
                  type: 'front'
                });
              }
              if (!localEnriched.coverUrl) {
                localEnriched.coverUrl = googleBook.coverUrl;
                enrichedFields.push('coverUrl');
              }
            }
            
            // Merge URLs
            if (!localEnriched.urls) {
              localEnriched.urls = {};
            }
            if (googleBook.urls) {
              localEnriched.urls = { ...localEnriched.urls, ...googleBook.urls };
              enrichedFields.push('urls');
            }
            
            if (enrichedFields.length > 0) {
              logger.info(`[Enrichment] Successfully enriched "${bookData.title}" with Google Books fields: ${enrichedFields.join(', ')}`);
            }
            
            googleBooksData = localEnriched; // Use the enriched data we just created
          } else {
            // If we didn't find googleBook directly, fall back to enrichWithGoogleBooks
            googleBooksData = await this.enrichWithGoogleBooks({ ...bookData });
          }
          
          // Store Google Books metadata separately - use pure source data (from formatGoogleBook)
          // This ensures we store what Google Books actually returned, not what was merged
          googleMetadata = {
            description: pureGoogleBook?.description || googleBooksData.description || null,
            series: pureGoogleBook?.series || googleBooksData.series || null,
            seriesNumber: pureGoogleBook?.seriesNumber || googleBooksData.seriesNumber || null,
            genres: pureGoogleBook?.genres || googleBooksData.genres || null,
            tags: pureGoogleBook?.tags || googleBooksData.tags || null,
            publisher: pureGoogleBook?.publisher || googleBooksData.publisher || null,
            publishedYear: pureGoogleBook?.publishedYear || googleBooksData.publishedYear || null,
            pageCount: pureGoogleBook?.pageCount || googleBooksData.pageCount || null,
            rating: pureGoogleBook?.rating || googleBooksData.rating || null,
            authors: pureGoogleBook?.authors || googleBooksData.authors || null
          };
          
          logger.info(`[Enrichment] Stored Google Books metadata: description=${!!googleMetadata.description}, authors=${JSON.stringify(googleMetadata.authors)}, publisher=${googleMetadata.publisher}, pageCount=${googleMetadata.pageCount}`);
        } catch (error) {
          logger.warn(`[Enrichment] Google Books enrichment failed: ${error.message}`);
        }
        
        return { googleBooksData, pureGoogleBook, googleMetadata };
      };
      
      // Helper function to perform OpenLibrary enrichment
      const performOpenLibraryEnrichment = async () => {
        let openLibraryData = null;
        let pureOlBook = null;
        let olMetadata = null;
        
        try {
        // First, fetch the pure OpenLibrary data before merging
        const isbn13 = bookData.isbn13 || null;
        const isbn10 = bookData.isbn || (isbn13 && isbn13.length === 13 ? isbn13.slice(3, 13) : null);
        
        // Try to find matching OpenLibrary book by ISBN
        const isbnsToTry = [];
        if (isbn13) {
          isbnsToTry.push({ type: 'ISBN-13', value: isbn13 });
        }
        if (isbn10 && (!isbn13 || isbn10 !== isbn13.slice(3, 13))) {
          isbnsToTry.push({ type: 'ISBN-10', value: isbn10 });
        }
        if (bookData.isbn && bookData.isbn !== isbn13 && bookData.isbn !== isbn10) {
          isbnsToTry.push({ type: 'ISBN', value: bookData.isbn });
        }
        
        for (const isbnInfo of isbnsToTry) {
          try {
            const openLibraryResults = await this.searchByIsbn(isbnInfo.value);
            if (openLibraryResults && openLibraryResults.length > 0) {
              pureOlBook = openLibraryResults[0];
              break;
            }
          } catch (error) {
            // Ignore
          }
        }
        
        // If ISBN lookup failed, try searching by title
        if (!pureOlBook && bookData.title) {
          try {
            let searchQuery = bookData.title;
            if (bookData.authors && Array.isArray(bookData.authors) && bookData.authors.length > 0) {
              searchQuery += ` ${bookData.authors[0]}`;
            }
            const url = 'https://openlibrary.org/search.json';
            const params = { q: searchQuery, limit: 20 };
            const response = await axios.get(url, { params, timeout: 15000 });
            const data = response.data;
            
            if (data.docs && data.docs.length > 0) {
              const normalizeTitle = (title) => {
                if (!title) return '';
                return title
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^\w\s]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
              };
              const bookTitleNormalized = normalizeTitle(bookData.title);
              
              const topCandidates = data.docs.slice(0, 10);
              const candidatesWithMetadata = await Promise.allSettled(
                topCandidates.map(async (doc) => {
                  let workData = null;
                  if (doc.work_key && doc.work_key.length > 0) {
                    try {
                      const workKey = doc.work_key[0];
                      const workResponse = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 5000 });
                      workData = workResponse.data;
                    } catch (error) {
                      // Silently fail
                    }
                  }
                  return { doc, workData };
                })
              );
              
              for (const candidateResult of candidatesWithMetadata) {
                if (candidateResult.status !== 'fulfilled') continue;
                const { doc, workData } = candidateResult.value;
                const formattedBook = this.formatOpenLibraryBook(doc, workData);
                const resultTitleNormalized = normalizeTitle(formattedBook.title);
                
                const titlesMatch = resultTitleNormalized.includes(bookTitleNormalized) || 
                    bookTitleNormalized.includes(resultTitleNormalized) ||
                    resultTitleNormalized === bookTitleNormalized;
                
                const bookWords = bookTitleNormalized.split(/\s+/).filter(w => w.length > 2);
                const resultWords = resultTitleNormalized.split(/\s+/).filter(w => w.length > 2);
                const commonWords = bookWords.filter(w => resultWords.includes(w));
                const hasCommonWords = commonWords.length >= Math.min(2, Math.min(bookWords.length, resultWords.length));
                
                if (titlesMatch || hasCommonWords) {
                  pureOlBook = formattedBook;
                  break;
                }
              }
            }
          } catch (error) {
            // Ignore
          }
        }
        
        // Now enrich with the merged data
        openLibraryData = await this.enrichWithOpenLibrary({ ...bookData });
        // Store OpenLibrary metadata separately - use pure source data
        olMetadata = {
          description: pureOlBook?.description || openLibraryData.description || null,
          series: pureOlBook?.series || openLibraryData.series || null,
          seriesNumber: pureOlBook?.seriesNumber || openLibraryData.seriesNumber || null,
          genres: pureOlBook?.genres || openLibraryData.genres || null,
          tags: pureOlBook?.tags || openLibraryData.tags || null,
          publisher: pureOlBook?.publisher || openLibraryData.publisher || null,
          publishedYear: pureOlBook?.publishedYear || openLibraryData.publishedYear || null,
          pageCount: pureOlBook?.pageCount || openLibraryData.pageCount || null,
          rating: pureOlBook?.rating || openLibraryData.rating || null
        };
        } catch (error) {
          logger.warn(`[Enrichment] OpenLibrary enrichment failed: ${error.message}`);
        }
        
        return { openLibraryData, pureOlBook, olMetadata };
      };
      
      // Run Google Books and OpenLibrary enrichment in parallel
      const hasCompleteGoogleData = isFromGoogleBooks && 
        bookData.description && 
        bookData.description.length > 50 && // Description should be substantial
        bookData.authors && 
        Array.isArray(bookData.authors) && 
        bookData.authors.length > 0 &&
        bookData.publisher &&
        bookData.pageCount;
      
      const [googleResult, openLibraryResult] = await Promise.allSettled([
        hasCompleteGoogleData ? Promise.resolve({ googleBooksData: null, pureGoogleBook: null, googleMetadata: null }) : performGoogleBooksEnrichment(),
        performOpenLibraryEnrichment()
      ]);
      
      // Process Google Books results
      let googleBooksData = null;
      let pureGoogleBook = null;
      let googleMetadata = null;
      
      if (googleResult.status === 'fulfilled') {
        ({ googleBooksData, pureGoogleBook, googleMetadata } = googleResult.value);
      } else {
        logger.warn(`[Enrichment] Google Books enrichment promise rejected: ${googleResult.reason?.message}`);
      }
      
      if (hasCompleteGoogleData) {
        logger.info(`[Enrichment] Book already has complete Google Books data, storing existing data`);
        googleMetadata = {
          description: bookData.description || null,
          series: bookData.series || null,
          seriesNumber: bookData.seriesNumber || null,
          genres: bookData.genres || null,
          tags: bookData.tags || null,
          publisher: bookData.publisher || null,
          publishedYear: bookData.publishedYear || null,
          pageCount: bookData.pageCount || null,
          rating: bookData.rating || null,
          authors: bookData.authors || null
        };
      }
      
      // Process OpenLibrary results
      let openLibraryData = null;
      let pureOlBook = null;
      let olMetadata = null;
      
      if (openLibraryResult.status === 'fulfilled') {
        ({ openLibraryData, pureOlBook, olMetadata } = openLibraryResult.value);
      } else {
        logger.warn(`[Enrichment] OpenLibrary enrichment promise rejected: ${openLibraryResult.reason?.message}`);
      }
      
      // Store metadata sources
      enriched._metadataSources.googleBooks = googleMetadata;
      enriched._metadataSources.openLibrary = olMetadata;
      
      // Merge Google Books data into enriched object
      if (googleBooksData && googleBooksData !== bookData) {
        logger.info(`[Enrichment] Merging Google Books data into enriched object`);
        // Merge Google Books data into enriched object
        if (googleBooksData.description && (!enriched.description || googleBooksData.description.length > enriched.description.length)) {
          enriched.description = googleBooksData.description;
          logger.info(`[Enrichment] ✓ Updated description (${googleBooksData.description.length} chars)`);
        }
        if (googleBooksData.authors && Array.isArray(googleBooksData.authors) && googleBooksData.authors.length > 0) {
          const currentAuthors = enriched.authors || [];
          if (!Array.isArray(currentAuthors) || currentAuthors.length === 0) {
            enriched.authors = googleBooksData.authors;
            logger.info(`[Enrichment] ✓ Updated authors: ${googleBooksData.authors.join(', ')}`);
          }
        }
        if (googleBooksData.publisher && !enriched.publisher) {
          enriched.publisher = googleBooksData.publisher;
          logger.info(`[Enrichment] ✓ Updated publisher: ${googleBooksData.publisher}`);
        }
        if (googleBooksData.publishedYear && !enriched.publishedYear) {
          enriched.publishedYear = googleBooksData.publishedYear;
          logger.info(`[Enrichment] ✓ Updated publishedYear: ${googleBooksData.publishedYear}`);
        }
        if (googleBooksData.pageCount && !enriched.pageCount) {
          enriched.pageCount = googleBooksData.pageCount;
          logger.info(`[Enrichment] ✓ Updated pageCount: ${googleBooksData.pageCount}`);
        }
        if (googleBooksData.genres && Array.isArray(googleBooksData.genres)) {
          const allGenres = new Set(enriched.genres || []);
          googleBooksData.genres.forEach(g => allGenres.add(g));
          enriched.genres = Array.from(allGenres);
        }
      }
      
      // Merge OpenLibrary data
      if (openLibraryData) {
        // Merge covers
        if (openLibraryData.availableCovers) {
          if (!enriched.availableCovers) enriched.availableCovers = [];
          openLibraryData.availableCovers.forEach(cover => {
            if (!enriched.availableCovers.some(c => c.url === cover.url)) {
              enriched.availableCovers.push(cover);
            }
          });
        }
        // Merge URLs
        if (openLibraryData.urls) {
          if (!enriched.urls) enriched.urls = {};
          enriched.urls = { ...enriched.urls, ...openLibraryData.urls };
        }
      }
      
      // Set default values (prefer OpenLibrary for series, Google Books for description if longer)
      // Aggregate genres from all sources
      const allGenres = new Set();
      const allTags = new Set();
      
      [enriched._metadataSources.original, enriched._metadataSources.googleBooks, enriched._metadataSources.openLibrary].forEach(source => {
        if (source && source.genres) {
          const genres = Array.isArray(source.genres) ? source.genres : [source.genres];
          genres.forEach(g => g && allGenres.add(g));
        }
        if (source && source.tags) {
          const tags = Array.isArray(source.tags) ? source.tags : [source.tags];
          tags.forEach(t => t && allTags.add(t));
        }
      });
      
      if (allGenres.size > 0) {
        enriched.genres = Array.from(allGenres);
      }
      if (allTags.size > 0) {
        enriched.tags = Array.from(allTags);
      }
      
      // Default description: use longest available
      const descriptions = [
        enriched._metadataSources.googleBooks?.description,
        enriched._metadataSources.openLibrary?.description,
        enriched._metadataSources.original?.description
      ].filter(d => d);
      if (descriptions.length > 0) {
        enriched.description = descriptions.reduce((a, b) => (a.length > b.length ? a : b));
      }
      
      // Default series: prefer OpenLibrary, then Google Books, then original
      enriched.series = enriched._metadataSources.openLibrary?.series || 
                       enriched._metadataSources.googleBooks?.series || 
                       enriched._metadataSources.original?.series || null;
      enriched.seriesNumber = enriched._metadataSources.openLibrary?.seriesNumber || 
                              enriched._metadataSources.googleBooks?.seriesNumber || 
                              enriched._metadataSources.original?.seriesNumber || null;
      
      // If no series found from external sources, try to extract from title
      if (!enriched.series && enriched.title) {
        const extractedSeries = extractSeriesFromTitle(enriched.title);
        if (extractedSeries) {
          enriched.series = extractedSeries.series;
          enriched.seriesNumber = extractedSeries.seriesNumber;
          logger.info(`[Enrichment] Extracted series from title: "${extractedSeries.series}" #${extractedSeries.seriesNumber}`);
        }
      }
      
      // Default rating: prefer Google Books (more reliable), then OpenLibrary, then original
      enriched.rating = enriched._metadataSources.googleBooks?.rating || 
                       enriched._metadataSources.openLibrary?.rating || 
                       enriched._metadataSources.original?.rating || null;
      
      // Set default cover: select the largest available cover
      if (enriched.availableCovers && enriched.availableCovers.length > 0) {
        const largestCover = this.selectLargestCover(enriched.availableCovers);
        if (largestCover) {
          enriched.coverUrl = largestCover;
          logger.info(`[Enrichment] Selected largest cover: ${largestCover}`);
        }
      }
      
      logger.info(`[Enrichment] Comprehensive enrichment completed for "${enriched.title}"`);
      logger.info(`[Enrichment] Metadata sources available: ${Object.keys(enriched._metadataSources).filter(k => enriched._metadataSources[k]).join(', ')}`);
      
      return enriched;
    } catch (error) {
      logger.error('Error enriching book:', error);
      // Return original book if enrichment fails
      return bookData;
    }
  }

  /**
   * Search Google Books API
   * Better search relevance and coverage for English/French books
   */
  async searchGoogleBooks(query, limit = 20, filters = {}) {
    try {
      const { author, title, language } = filters;
      const url = 'https://www.googleapis.com/books/v1/volumes';
      
      // Build search query with proper Google Books syntax
      // Use filters if provided, otherwise use the query as-is
      let searchQuery = query;
      if (title && author) {
        // Both title and author filters provided - use intitle and inauthor
        searchQuery = `intitle:${title} inauthor:${author}`;
      } else if (title) {
        // Only title filter provided - use intitle
        // This handles cases where the query is treated as a title
        searchQuery = `intitle:${title}`;
      } else if (author) {
        // Only author filter provided - use inauthor
        searchQuery = `inauthor:${author}`;
      }
      // If no filters provided, use query as-is (general search)
      
      const params = {
        q: searchQuery,
        maxResults: Math.min(limit * 2, 40), // Get more to filter down
        orderBy: 'relevance',
        projection: 'full' // Request full volume details (not just snippets)
      };
      
      const response = await axios.get(url, { params, timeout: 15000 });
      const data = response.data;
      
      if (!data.items || data.items.length === 0) {
        return [];
      }
      
      // Fetch full volume details for top results to get complete descriptions
      // Google Books search results often have truncated descriptions
      // Note: We use Promise.allSettled to handle network errors gracefully
      const topItems = data.items.slice(0, Math.min(limit, data.items.length));
      const itemsWithFullDetails = await Promise.allSettled(
        topItems.map(async (item) => {
          try {
            // Fetch individual volume for complete description
            const volumeResponse = await axios.get(
              `https://www.googleapis.com/books/v1/volumes/${item.id}`,
              { 
                params: { projection: 'full' }, 
                timeout: 5000,
                // Add retry configuration for network errors
                validateStatus: (status) => status < 500 // Don't throw on 4xx errors
              }
            );
            return { success: true, data: volumeResponse.data };
          } catch (error) {
            // Handle various network errors gracefully
            const errorCode = error.code || error.errno;
            const isNetworkError = [
              'EADDRNOTAVAIL', 
              'ECONNREFUSED', 
              'ETIMEDOUT', 
              'ENOTFOUND',
              'ECONNABORTED',
              'ENETUNREACH'
            ].includes(errorCode);
            
            if (isNetworkError) {
              logger.warn(`Network error fetching volume ${item.id}: ${errorCode}, using search result`);
            } else {
              logger.warn(`Failed to fetch full details for volume ${item.id}: ${error.message || errorCode}, using search result`);
            }
            
            // Fallback to search result if individual fetch fails
            return { success: false, data: item };
          }
        })
      );
      
      // Format and filter results
      const formattedResults = itemsWithFullDetails
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          // Extract data from the result structure
          // result.value is either { success: true/false, data: ... } or the item directly
          let itemData;
          if (result.value && typeof result.value === 'object' && 'data' in result.value) {
            itemData = result.value.data;
          } else {
            itemData = result.value;
          }
          return this.formatGoogleBook(itemData);
        })
        .filter(book => {
          // Filter by language if specified
          if (language && language !== 'any') {
            const lang = (book.language || '').toLowerCase();
            const langMap = {
              'en': ['en', 'eng'],
              'eng': ['en', 'eng'],
              'fr': ['fr', 'fre', 'fra'],
              'fre': ['fr', 'fre', 'fra'],
              'fra': ['fr', 'fre', 'fra'],
              'de': ['de', 'ger'],
              'ger': ['de', 'ger'],
              'es': ['es', 'spa'],
              'spa': ['es', 'spa'],
              'it': ['it', 'ita'],
              'ita': ['it', 'ita'],
              'pt': ['pt', 'por'],
              'por': ['pt', 'por']
            };
            const allowedLangs = langMap[language.toLowerCase()] || [language.toLowerCase()];
            return allowedLangs.includes(lang);
          }
          // If no language filter, prefer English and French, but allow others
          const lang = (book.language || '').toLowerCase();
          const preferredLangs = ['en', 'eng', 'fr', 'fre', 'fra'];
          return preferredLangs.includes(lang) || !book.language;
        })
        .slice(0, limit);
      
      return formattedResults;
    } catch (error) {
      // Handle network errors gracefully - don't crash the server
      const errorCode = error.code || error.errno;
      const isNetworkError = [
        'EADDRNOTAVAIL', 
        'ECONNREFUSED', 
        'ETIMEDOUT', 
        'ENOTFOUND',
        'ECONNABORTED',
        'ENETUNREACH'
      ].includes(errorCode);
      
      if (isNetworkError) {
        logger.error(`Network error searching Google Books: ${errorCode} - ${error.message}`);
        // Return empty array instead of throwing - let fallback to OpenLibrary handle it
        return [];
      }
      
      logger.error('Error searching Google Books:', error.message || error);
      throw error;
    }
  }

  /**
   * Search Google Books by ISBN
   * Also tries ISBN-13 if ISBN-10 is provided and vice versa
   */
  async searchGoogleBooksByIsbn(isbn) {
    try {
      // Clean ISBN (remove dashes and spaces)
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      
      const url = 'https://www.googleapis.com/books/v1/volumes';
      
      // Try both ISBN-10 and ISBN-13 formats
      const isbnVariants = [cleanIsbn];
      
      // If it's an ISBN-13, also try ISBN-10 (remove prefix 978)
      if (cleanIsbn.length === 13 && cleanIsbn.startsWith('978')) {
        const isbn10 = cleanIsbn.slice(3, 13);
        isbnVariants.push(isbn10);
      }
      // If it's an ISBN-10, also try ISBN-13 (add prefix 978)
      else if (cleanIsbn.length === 10) {
        const isbn13 = '978' + cleanIsbn;
        isbnVariants.push(isbn13);
      }
      
      // Try each ISBN variant
      for (const isbnVariant of isbnVariants) {
        try {
          const params = {
            q: `isbn:${isbnVariant}`,
            maxResults: 1,
            projection: 'full' // Request full volume details
          };
          
          const response = await axios.get(url, { params, timeout: 10000 });
          const data = response.data;
          
          if (!data.items || data.items.length === 0) {
            continue; // Try next variant
          }
          
          // Fetch full volume details for complete description
          try {
            const volumeId = data.items[0].id;
            logger.info(`[GoogleBooks] Fetching full volume details for ID: ${volumeId}`);
            const volumeResponse = await axios.get(`https://www.googleapis.com/books/v1/volumes/${volumeId}`, { 
              params: { projection: 'full' },
              timeout: 10000,
              validateStatus: (status) => status < 500 // Don't throw on 4xx errors
            });
            
            const formatted = this.formatGoogleBook(volumeResponse.data);
            logger.info(`[GoogleBooks] Formatted book: title="${formatted.title}", authors=${JSON.stringify(formatted.authors)}, description length=${(formatted.description || '').length}, publisher=${formatted.publisher || 'none'}, pageCount=${formatted.pageCount || 'none'}`);
            return [formatted];
          } catch (volumeError) {
            // Handle network errors gracefully
            const errorCode = volumeError.code || volumeError.errno;
            const isNetworkError = [
              'EADDRNOTAVAIL', 
              'ECONNREFUSED', 
              'ETIMEDOUT', 
              'ENOTFOUND',
              'ECONNABORTED',
              'ENETUNREACH'
            ].includes(errorCode);
            
            if (isNetworkError) {
              logger.warn(`Network error fetching volume ${data.items[0].id}: ${errorCode}, using search result`);
            } else {
              logger.warn(`Failed to fetch full volume details: ${volumeError.message || errorCode}, using search result`);
            }
            
            // Fallback to search result if individual volume fetch fails
            return [this.formatGoogleBook(data.items[0])];
          }
        } catch (variantError) {
          // Continue to next variant if this one fails
          continue;
        }
      }
      
      // If all variants failed, return empty
      return [];
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return [];
      }
      console.error('Error searching Google Books by ISBN:', error);
      throw error;
    }
  }

  /**
   * Get full volume details from Google Books (for complete descriptions)
   */
  async getGoogleBookVolume(volumeId) {
    try {
      const url = `https://www.googleapis.com/books/v1/volumes/${volumeId}`;
      const params = {
        projection: 'full'
      };
      
      const response = await axios.get(url, { params, timeout: 10000 });
      return this.formatGoogleBook(response.data);
    } catch (error) {
      console.error('Error fetching Google Books volume:', error);
      throw error;
    }
  }

  /**
   * Format Google Books API result to our schema
   */
  formatGoogleBook(item) {
    const volumeInfo = item.volumeInfo || {};
    const saleInfo = item.saleInfo || {};
    
    // Extract ISBNs
    const industryIdentifiers = volumeInfo.industryIdentifiers || [];
    let isbn = null;
    let isbn13 = null;
    
    industryIdentifiers.forEach(identifier => {
      if (identifier.type === 'ISBN_10') {
        isbn = identifier.identifier;
      } else if (identifier.type === 'ISBN_13') {
        isbn13 = identifier.identifier;
      }
    });
    
    // Use ISBN-13 as primary ISBN if available
    if (!isbn && isbn13) {
      isbn = isbn13;
    }
    
    // Extract authors
    const authors = volumeInfo.authors || [];
    
    // Extract cover image and create availableCovers with all sizes
    let coverUrl = null;
    const availableCovers = [];
    
    if (volumeInfo.imageLinks) {
      // Collect all available cover sizes
      const coverSizes = [
        { key: 'large', priority: 4 },
        { key: 'medium', priority: 3 },
        { key: 'small', priority: 2 },
        { key: 'thumbnail', priority: 1 }
      ];
      
      coverSizes.forEach(({ key, priority }) => {
        if (volumeInfo.imageLinks[key]) {
          let url = volumeInfo.imageLinks[key];
          // Replace http with https
          if (url && url.startsWith('http://')) {
            url = url.replace('http://', 'https://');
          }
          if (url) {
            availableCovers.push({
              source: 'Google Books',
              url: url,
              type: 'front',
              size: key,
              priority: priority
            });
            // Set coverUrl to largest available
            if (!coverUrl && priority === 4) {
              coverUrl = url;
            }
          }
        }
      });
      
      // Try to generate higher resolution versions from the large image
      // Google Books URLs can be modified to get better quality
      if (volumeInfo.imageLinks.large) {
        let largeUrl = volumeInfo.imageLinks.large;
        if (largeUrl && largeUrl.startsWith('http://')) {
          largeUrl = largeUrl.replace('http://', 'https://');
        }
        
        // Try to enhance the URL for better quality
        // Method 1: Modify zoom parameter if present
        if (largeUrl.includes('zoom=')) {
          const enhancedUrl1 = largeUrl.replace(/zoom=\d+/, 'zoom=10');
          if (enhancedUrl1 !== largeUrl) {
            availableCovers.push({
              source: 'Google Books',
              url: enhancedUrl1,
              type: 'front',
              size: 'extra-large',
              priority: 5
            });
          }
        }
        
        // Method 2: Add or modify w and h parameters for higher resolution
        // Google Books images can be scaled up by modifying dimensions
        if (largeUrl.includes('books.google.com') || largeUrl.includes('googleapis.com')) {
          // Try to get a very high resolution version
          // Remove existing w and h parameters and add larger ones
          let enhancedUrl2 = largeUrl;
          enhancedUrl2 = enhancedUrl2.replace(/[&?]w=\d+/g, '');
          enhancedUrl2 = enhancedUrl2.replace(/[&?]h=\d+/g, '');
          const separator = enhancedUrl2.includes('?') ? '&' : '?';
          enhancedUrl2 = `${enhancedUrl2}${separator}w=1280&h=1920`;
          
          if (enhancedUrl2 !== largeUrl) {
            availableCovers.push({
              source: 'Google Books',
              url: enhancedUrl2,
              type: 'front',
              size: 'extra-large',
              priority: 5
            });
          }
        }
      }
      
      // Fallback: use largest available if coverUrl not set
      if (!coverUrl && availableCovers.length > 0) {
        const sortedCovers = availableCovers.sort((a, b) => b.priority - a.priority);
        coverUrl = sortedCovers[0].url;
      }
    }
    
    // Extract language (Google uses ISO 639-1 codes like 'en', 'fr')
    let language = volumeInfo.language || null;
    if (language && language.length > 2) {
      // Convert to ISO 639-1 if needed
      const langMap = {
        'eng': 'en',
        'fre': 'fr',
        'fra': 'fr'
      };
      language = langMap[language] || language;
    }
    
    // Extract categories/genres - filter and improve them
    let genres = volumeInfo.categories || [];
    
    // Filter out overly generic categories and improve specificity
    genres = genres
      .map(cat => {
        // Google Books uses hierarchical categories like "Fiction / Dystopian"
        // Split by "/" and take the more specific part
        if (cat.includes(' / ')) {
          const parts = cat.split(' / ');
          // Prefer the more specific (usually last) part, unless it's too generic
          const specific = parts[parts.length - 1].trim();
          const generic = parts[0].trim().toLowerCase();
          
          // Skip if first part is just "Fiction" and second part is better
          if (generic === 'fiction' && parts.length > 1) {
            return specific;
          }
          // Return full category if it adds specificity
          return cat;
        }
        // Filter out overly generic single-word categories
        const lowerCat = cat.toLowerCase();
        if (['fiction', 'nonfiction', 'non-fiction'].includes(lowerCat) && genres.length > 1) {
          return null; // Skip if there are other categories
        }
        return cat;
      })
      .filter(cat => cat !== null && cat.trim().length > 0);
    
    // If no genres after filtering, keep original but cleaned
    if (genres.length === 0 && volumeInfo.categories && volumeInfo.categories.length > 0) {
      genres = volumeInfo.categories;
    }
    
    // Extract publisher
    let publisher = volumeInfo.publisher || null;
    
    // Extract published date and year
    let publishedYear = null;
    if (volumeInfo.publishedDate) {
      const yearMatch = volumeInfo.publishedDate.match(/\d{4}/);
      if (yearMatch) {
        publishedYear = parseInt(yearMatch[0]);
      }
    }
    
    // Extract description - handle both short and long descriptions
    // Google Books API may truncate in search results, but full volumes have complete descriptions
    let description = volumeInfo.description || null;
    
    // Clean up description HTML if present
    if (description && typeof description === 'string') {
      // Remove HTML tags but preserve formatting
      description = description
        .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
        .replace(/<\/p>/gi, '\n\n') // Convert </p> to double newlines
        .replace(/<[^>]*>/g, '') // Remove all other HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
        .trim();
      
      // Remove surrounding quotes if the entire description is enclosed in quotes
      description = removeSurroundingQuotes(description);
    }
    
    // Extract page count
    const pageCount = volumeInfo.pageCount || null;
    
    // Extract subtitle
    let subtitle = volumeInfo.subtitle || null;
    if (subtitle) {
      subtitle = removeSurroundingQuotes(subtitle);
    }
    
    // Clean up publisher
    if (publisher) {
      publisher = removeSurroundingQuotes(publisher);
    }
    
    // Build URLs
    const urls = {};
    if (volumeInfo.canonicalVolumeLink) {
      urls.googleBooks = volumeInfo.canonicalVolumeLink;
    }
    if (volumeInfo.infoLink) {
      urls.googleBooksInfo = volumeInfo.infoLink;
    }
    if (volumeInfo.previewLink) {
      urls.googleBooksPreview = volumeInfo.previewLink;
    }
    
    // FALLBACK: Add ISBN-based cover URLs from multiple sources
    // This helps when Google Books doesn't have cover art (common for French books)
    
    // Amazon Images - works well for French books, especially BD/comics
    // Format: https://images-eu.ssl-images-amazon.com/images/P/{ISBN10}.01._SCLZZZZZZZ_.jpg
    const addAmazonCovers = (isbn10Value, priority = 0) => {
      if (!isbn10Value || isbn10Value.length !== 10) return;
      
      // Amazon offers different size formats
      const sizes = [
        { suffix: '._SCLZZZZZZZ_.jpg', size: 'large', priority: 6 + priority }, // High priority - Amazon often has best covers
        { suffix: '._SL500_.jpg', size: 'medium', priority: 5 + priority },
        { suffix: '._SL160_.jpg', size: 'small', priority: 4 + priority }
      ];
      
      sizes.forEach(({ suffix, size, priority: sizePriority }) => {
        const url = `https://images-eu.ssl-images-amazon.com/images/P/${isbn10Value}.01${suffix}`;
        if (!availableCovers.some(c => c.url === url)) {
          availableCovers.push({
            source: 'Amazon',
            url: url,
            type: 'front',
            isbn: isbn10Value,
            size: size,
            priority: sizePriority
          });
        }
      });
      
      // Also try US Amazon for broader coverage
      const usUrl = `https://images-na.ssl-images-amazon.com/images/P/${isbn10Value}.01._SCLZZZZZZZ_.jpg`;
      if (!availableCovers.some(c => c.url === usUrl)) {
        availableCovers.push({
          source: 'Amazon-US',
          url: usUrl,
          type: 'front',
          isbn: isbn10Value,
          size: 'large',
          priority: 5 + priority
        });
      }
    };
    
    // OpenLibrary's cover API can return covers by ISBN from their aggregated sources
    const addOpenLibraryIsbnCovers = (isbnValue, priority = 0) => {
      if (!isbnValue) return;
      const sizes = [
        { suffix: '-L.jpg', size: 'large', priority: 4 + priority },
        { suffix: '-M.jpg', size: 'medium', priority: 3 + priority },
        { suffix: '-S.jpg', size: 'small', priority: 2 + priority }
      ];
      
      sizes.forEach(({ suffix, size, priority: sizePriority }) => {
        const url = `https://covers.openlibrary.org/b/isbn/${isbnValue}${suffix}`;
        // Avoid duplicates
        if (!availableCovers.some(c => c.url === url)) {
          availableCovers.push({
            source: 'OpenLibrary-ISBN',
            url: url,
            type: 'front',
            isbn: isbnValue,
            size: size,
            priority: sizePriority
          });
        }
      });
    };
    
    // Add Amazon covers first (highest priority for French books)
    // Need ISBN-10 for Amazon URLs
    let isbn10ForAmazon = isbn;
    if (!isbn10ForAmazon && isbn13 && isbn13.startsWith('978')) {
      // Convert ISBN-13 to ISBN-10: remove 978 prefix and recalculate check digit
      const isbn9 = isbn13.slice(3, 12);
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(isbn9[i]) * (10 - i);
      }
      const check = (11 - (sum % 11)) % 11;
      isbn10ForAmazon = isbn9 + (check === 10 ? 'X' : check.toString());
    }
    if (isbn10ForAmazon && isbn10ForAmazon.length === 10) {
      addAmazonCovers(isbn10ForAmazon, 0);
    }
    
    // Add OpenLibrary ISBN-based covers as fallback
    if (isbn13) {
      addOpenLibraryIsbnCovers(isbn13, 0);
    }
    if (isbn && isbn !== isbn13) {
      addOpenLibraryIsbnCovers(isbn, -1);
    }
    
    // If Google Books didn't have a cover, try Amazon or OpenLibrary ISBN cover
    if (!coverUrl && availableCovers.length > 0) {
      const sortedCovers = [...availableCovers].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      coverUrl = sortedCovers[0].url;
    }
    
    return {
      isbn: isbn,
      isbn13: isbn13,
      title: volumeInfo.title || null,
      subtitle: subtitle,
      authors: authors.length > 0 ? authors : null,
      publisher: publisher,
      publishedYear: publishedYear,
      language: language,
      format: null, // Google Books doesn't provide format
      filetype: null,
      drm: null,
      narrator: null,
      runtime: null,
      series: null, // Would need to parse from title or search separately
      seriesNumber: null,
      genres: genres.length > 0 ? genres : null,
      tags: null,
      rating: volumeInfo.averageRating || null,
      coverUrl: coverUrl,
      availableCovers: availableCovers.length > 0 ? availableCovers : undefined,
      owner: null,
      readDate: null,
      pageCount: pageCount,
      description: description,
      urls: Object.keys(urls).length > 0 ? urls : null
    };
  }

  /**
   * Search OpenLibrary API
   */
  async searchOpenLibrary(query, limit = 20, language = 'any') {
    try {
      const url = 'https://openlibrary.org/search.json';
      // Fetch more results to ensure we get enough books after filtering
      const params = {
        q: query,
        limit: Math.min(limit * 5, 100) // Get many results to filter down
      };

      const response = await axios.get(url, { params, timeout: 15000 });
      const data = response.data;

      if (!data.docs || data.docs.length === 0) {
        return [];
      }

      // Normalize query for matching
      const normalize = (str) => (str || '').toLowerCase().trim();
      const queryNormalized = normalize(query);
      const queryWords = queryNormalized.split(/\s+/).filter(w => w.length > 0);
      
      // Determine preferred language codes based on language filter
      let preferredLangCodes;
      if (language && language !== 'any') {
        const langMap = {
          'en': ['eng'],
          'eng': ['eng'],
          'fr': ['fre', 'fra'],
          'fre': ['fre', 'fra'],
          'fra': ['fre', 'fra'],
          'de': ['ger'],
          'ger': ['ger'],
          'es': ['spa'],
          'spa': ['spa'],
          'it': ['ita'],
          'ita': ['ita'],
          'pt': ['por'],
          'por': ['por']
        };
        preferredLangCodes = langMap[language.toLowerCase()] || [language.toLowerCase()];
      } else {
        // Default: prefer English and French
        preferredLangCodes = ['eng', 'fre', 'fra'];
      }
      const scoredDocs = data.docs.map((doc, index) => {
        let score = 0;
        
        // Get title for matching
        const docTitle = normalize(doc.title || doc.title_suggest || '');
        const workTitle = doc.work_title ? normalize(doc.work_title[0]) : '';
        const bestTitle = docTitle || workTitle;
        
        // Exact title match gets highest priority
        if (bestTitle === queryNormalized) {
          score += 100;
        }
        // Title starts with query
        else if (bestTitle.startsWith(queryNormalized)) {
          score += 50;
        }
        // Title contains exact query
        else if (bestTitle.includes(queryNormalized)) {
          score += 30;
        }
        // All query words are in title
        else if (queryWords.length > 0 && queryWords.every(word => bestTitle.includes(word))) {
          score += 20;
        }
        // Some query words in title
        else if (queryWords.length > 0) {
          const matchingWords = queryWords.filter(word => bestTitle.includes(word)).length;
          score += matchingWords * 5;
        }
        
        // Language preference
        const langCodes = doc.language || [];
        const hasPreferredLang = langCodes.some(lang => preferredLangCodes.includes(lang));
        if (hasPreferredLang) {
          score += 10;
        }
        
        // Prefer books with covers
        if (doc.cover_i) {
          score += 5;
        }
        
        // Keep original index for tie-breaking
        return { doc, index, score, hasPreferredLang };
      });
      
      // Sort by score (highest first), then by index
      scoredDocs.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.index - b.index;
      });
      
      // Take top results to process (more than limit to account for language filtering)
      const docsToProcess = scoredDocs.slice(0, Math.min(limit * 3, 60));

      // Fetch work details for each book to get more metadata
      const resultsWithMetadata = await Promise.allSettled(
        docsToProcess.map(async ({ doc, score }) => {
          let workData = null;
          
          // Try to get work details for better metadata
          if (doc.work_key && doc.work_key.length > 0) {
            try {
              const workKey = doc.work_key[0];
              const workResponse = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 5000 });
              workData = workResponse.data;
            } catch (error) {
              // Silently fail - we'll use edition data only
            }
          } else if (doc.works && doc.works.length > 0) {
            try {
              const workKey = doc.works[0].key;
              const workResponse = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 5000 });
              workData = workResponse.data;
            } catch (error) {
              // Silently fail - we'll use edition data only
            }
          }
          
          return { doc, workData, score };
        })
      );

      // Format results and preserve scores
      const formattedResults = resultsWithMetadata
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          const { doc, workData, score } = result.value;
          const book = this.formatOpenLibraryBook(doc, workData);
          return { ...book, _relevanceScore: score, _docLanguages: doc.language || [] };
        })
        .filter(book => {
          // Filter by language if specified
          if (language && language !== 'any') {
            const langMap = {
              'en': ['en', 'eng'],
              'eng': ['en', 'eng'],
              'fr': ['fr', 'fre', 'fra'],
              'fre': ['fr', 'fre', 'fra'],
              'fra': ['fr', 'fre', 'fra'],
              'de': ['de', 'ger'],
              'ger': ['de', 'ger'],
              'es': ['es', 'spa'],
              'spa': ['es', 'spa'],
              'it': ['it', 'ita'],
              'ita': ['it', 'ita'],
              'pt': ['pt', 'por'],
              'por': ['pt', 'por']
            };
            const allowedLangs = langMap[language.toLowerCase()] || [language.toLowerCase()];
            const bookLang = (book.language || '').toLowerCase();
            // Check both normalized language and OpenLibrary's raw language codes
            const docLangs = (book._docLanguages || []).map(l => l.toLowerCase());
            const allBookLangs = [bookLang, ...docLangs].filter(l => l);
            return allBookLangs.some(l => allowedLangs.includes(l));
          }
          
          // If no language filter, prefer English or French books, but allow others if they have high relevance
          const lang = (book.language || '').toLowerCase();
          const preferredLangs = ['en', 'eng', 'fr', 'fre', 'fra'];
          const hasPreferredLang = preferredLangs.includes(lang);
          
          // Always include high-scoring exact matches regardless of language
          if (book._relevanceScore >= 100) {
            return true;
          }
          
          // For lower scores, only include preferred languages
          return hasPreferredLang;
        });
      
      // Sort by relevance score first (highest first), then by language preference
      formattedResults.sort((a, b) => {
        // Higher relevance score first
        if (b._relevanceScore !== a._relevanceScore) {
          return b._relevanceScore - a._relevanceScore;
        }
        
        // Then prioritize English, then French
        const aLang = (a.language || '').toLowerCase();
        const bLang = (b.language || '').toLowerCase();
        
        // English first
        if (aLang === 'en' || aLang === 'eng') return -1;
        if (bLang === 'en' || bLang === 'eng') return 1;
        
        // French second
        if (aLang === 'fr' || aLang === 'fre' || aLang === 'fra') return -1;
        if (bLang === 'fr' || bLang === 'fre' || bLang === 'fra') return 1;
        
        return 0;
      });
      
      // Return limited results, removing the internal score and docLanguages fields
      return formattedResults.slice(0, limit).map(({ _relevanceScore, _docLanguages, ...book }) => book);
    } catch (error) {
      console.error('Error searching OpenLibrary:', error);
      throw error;
    }
  }

  /**
   * Search by ISBN using OpenLibrary
   * Note: Does NOT apply language filtering - returns exact match for ISBN
   */
  async searchByIsbn(isbn) {
    try {
      if (!isbn) {
        logger.warn(`[OpenLibrary] No ISBN provided`);
        return [];
      }
      
      // Clean ISBN (remove dashes and spaces, keep X for ISBN-10 checksum)
      const cleanIsbn = isbn.replace(/[-\s]/g, '').toUpperCase();

      // Validate ISBN format (ISBN-10 can end with X, ISBN-13 is all digits)
      const isIsbn10 = /^\d{9}[\dX]$/.test(cleanIsbn);
      const isIsbn13 = /^\d{13}$/.test(cleanIsbn);
      
      if (!isIsbn10 && !isIsbn13) {
        logger.warn(`[OpenLibrary] Invalid ISBN format: ${isbn} (cleaned: ${cleanIsbn})`);
        return [];
      }

      logger.info(`[OpenLibrary] Searching by ISBN: ${cleanIsbn} (${isIsbn13 ? 'ISBN-13' : 'ISBN-10'})`);

      // Try ISBN-13 first, then ISBN-10
      let url = `https://openlibrary.org/isbn/${cleanIsbn}.json`;
      let response;
      
      try {
        logger.info(`[OpenLibrary] Fetching: ${url}`);
        response = await axios.get(url, { timeout: 10000 });
      } catch (error) {
        // If not found and it's ISBN-13, try converting to ISBN-10
        if (cleanIsbn.length === 13 && error.response && error.response.status === 404) {
          logger.info(`[OpenLibrary] ISBN-13 not found, trying ISBN-10 conversion`);
          // Convert ISBN-13 to ISBN-10 (remove first 3 digits: 978 or 979)
          const isbn10 = cleanIsbn.slice(3, 13);
          url = `https://openlibrary.org/isbn/${isbn10}.json`;
          try {
            logger.info(`[OpenLibrary] Fetching ISBN-10: ${url}`);
            response = await axios.get(url, { timeout: 10000 });
            logger.info(`[OpenLibrary] Found match using ISBN-10: ${isbn10}`);
          } catch (innerError) {
            // Both failed, return empty
            if (innerError.response && innerError.response.status === 404) {
              logger.info(`[OpenLibrary] No match found for ISBN ${isbn} (tried both ISBN-13 and ISBN-10)`);
              return [];
            }
            logger.warn(`[OpenLibrary] Error fetching ISBN-10: ${innerError.message}`);
            throw innerError;
          }
        } else {
          if (error.response && error.response.status === 404) {
            logger.info(`[OpenLibrary] No match found for ISBN ${isbn}`);
            return [];
          }
          logger.warn(`[OpenLibrary] Error fetching ISBN: ${error.message}`);
          throw error;
        }
      }

      const bookData = response.data;
      logger.info(`[OpenLibrary] Found book: ${bookData.title || 'Unknown'} (ISBN: ${isbn})`);
      
      // Get full work details for better metadata
      let workData = null;
      if (bookData.works && bookData.works.length > 0) {
        const workKey = bookData.works[0].key;
        try {
          const workResponse = await axios.get(`https://openlibrary.org${workKey}.json`, { timeout: 10000 });
          workData = workResponse.data;
        } catch (error) {
          console.warn('Failed to fetch work details:', error.message);
        }
      }

      // Fetch author details if they're stored as keys
      if (bookData.authors && bookData.authors.length > 0) {
        const authorPromises = bookData.authors.map(async (author) => {
          if (author.key) {
            try {
              const authorResponse = await axios.get(`https://openlibrary.org${author.key}.json`, { timeout: 5000 });
              return authorResponse.data.name || null;
            } catch (error) {
              // Fallback to name if available
              return author.name || null;
            }
          }
          return author.name || null;
        });
        
        try {
          const authorNames = await Promise.allSettled(authorPromises);
          const resolvedAuthors = authorNames
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
          
          if (resolvedAuthors.length > 0) {
            bookData.author_name = resolvedAuthors;
          }
        } catch (error) {
          console.warn('Failed to fetch some author details:', error.message);
        }
      }

      // Format the book (no language filtering for ISBN searches)
      const formattedBook = this.formatOpenLibraryBook(bookData, workData);
      
      // Return the book even if language doesn't match preferences (ISBN is exact match)
      return [formattedBook];
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return [];
      }
      console.error('Error searching by ISBN:', error);
      throw error;
    }
  }

  /**
   * Format OpenLibrary book data to our schema
   */
  formatOpenLibraryBook(doc, workData = null) {
    // Extract ISBNs - try multiple sources
    const allIsbns = [
      ...(doc.isbn || []),
      ...(doc.isbn_10 || []),
      ...(doc.isbn_13 || [])
    ];
    const isbn10 = allIsbns.find(i => i && i.length === 10) || null;
    const isbn13 = allIsbns.find(i => i && i.length === 13) || null;
    const isbn = isbn10 || isbn13 || allIsbns[0] || null;

    // Extract authors - prioritize from work data if available
    const authors = [];
    if (workData && workData.authors) {
      workData.authors.forEach(author => {
        if (typeof author === 'object' && author.author) {
          // Fetch author name if it's a key
          if (author.author.key) {
            // We'll just use the name if available, otherwise skip async fetch for now
            if (author.author.name) {
              authors.push(author.author.name);
            }
          } else if (typeof author.author === 'string') {
            authors.push(author.author);
          }
        } else if (typeof author === 'string') {
          authors.push(author);
        }
      });
    }
    
    // Fallback to edition authors
    if (authors.length === 0) {
      if (doc.author_name) {
        authors.push(...doc.author_name);
      } else if (doc.authors) {
        doc.authors.forEach(author => {
          if (typeof author === 'string') {
            authors.push(author);
          } else if (author.name) {
            authors.push(author.name);
          }
        });
      }
    }

    // Extract cover image - try multiple sources
    let coverUrl = null;
    if (doc.cover_i) {
      coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    } else if (doc.cover_large) {
      coverUrl = doc.cover_large;
    } else if (doc.cover) {
      coverUrl = typeof doc.cover === 'string' ? doc.cover : doc.cover.large || doc.cover.medium;
    } else if (workData && workData.covers && workData.covers.length > 0) {
      coverUrl = `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`;
    }

    // Extract description - prioritize work data
    let description = null;
    if (workData && workData.description) {
      if (typeof workData.description === 'string') {
        description = workData.description;
      } else if (workData.description.value) {
        description = workData.description.value;
      } else if (workData.description.type && workData.description.type === '/type/text') {
        description = workData.description.value || workData.description;
      }
    }
    
    // Clean up description HTML if present
    if (description && typeof description === 'string') {
      description = description
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
      
      // Remove surrounding quotes if the entire description is enclosed in quotes
      description = removeSurroundingQuotes(description);
    }
    
    if (!description && doc.first_sentence) {
      const firstSentence = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence;
      if (firstSentence) {
        description = firstSentence;
      }
    }

    // Extract publish year - try multiple sources
    let publishedYear = null;
    if (workData && workData.first_publish_date) {
      const yearMatch = workData.first_publish_date.match(/\d{4}/);
      if (yearMatch) {
        publishedYear = parseInt(yearMatch[0]);
      }
    }
    
    if (!publishedYear && doc.first_publish_year) {
      publishedYear = doc.first_publish_year;
    }
    
    if (!publishedYear && doc.publish_date) {
      const yearMatch = doc.publish_date.match(/\d{4}/);
      if (yearMatch) {
        publishedYear = parseInt(yearMatch[0]);
      }
    }
    
    if (!publishedYear && doc.publish_year && doc.publish_year.length > 0) {
      publishedYear = parseInt(doc.publish_year[0]);
    }

    // Extract publisher - try multiple sources
    let publisher = null;
    if (doc.publisher && doc.publisher.length > 0) {
      publisher = Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher;
    } else if (doc.publishers && doc.publishers.length > 0) {
      publisher = Array.isArray(doc.publishers) ? doc.publishers[0] : doc.publishers;
    }
    if (publisher) {
      publisher = removeSurroundingQuotes(publisher);
    }

    // Extract series - prioritize work data
    let series = null;
    let seriesNumber = null;
    if (workData && workData.series) {
      if (Array.isArray(workData.series) && workData.series.length > 0) {
        series = workData.series[0];
      } else if (typeof workData.series === 'string') {
        series = workData.series;
      }
    }
    
    if (!series && doc.series) {
      if (Array.isArray(doc.series)) {
        series = doc.series[0];
      } else {
        series = doc.series;
      }
    }

    // Extract subjects/genres - prioritize work data
    const genres = [];
    if (workData && workData.subjects) {
      // Filter out genre-like subjects (avoid very specific ones)
      const goodSubjects = workData.subjects.filter(s => {
        const subject = typeof s === 'string' ? s : (s.name || s);
        return subject && subject.length < 50; // Reasonable length
      });
      genres.push(...goodSubjects.slice(0, 10).map(s => typeof s === 'string' ? s : (s.name || s)));
    }
    
    if (genres.length === 0 && doc.subject) {
      genres.push(...doc.subject.slice(0, 10));
    }

    // Extract language - check both edition and work
    let language = null;
    const langCodes = doc.language || (workData && workData.languages) || [];
    
    if (langCodes && langCodes.length > 0) {
      const langCode = Array.isArray(langCodes) ? langCodes[0] : langCodes;
      // Convert to ISO 639-1 (simplified mapping)
      const langMap = {
        'eng': 'en',
        'fre': 'fr',
        'fra': 'fr',
        'spa': 'es',
        'ger': 'de',
        'ita': 'it',
        'por': 'pt',
        'rus': 'ru',
        'jpn': 'ja',
        'kor': 'ko',
        'chi': 'zh'
      };
      language = langMap[langCode] || langCode;
    }

    // Extract page count
    let pageCount = null;
    if (doc.number_of_pages) {
      pageCount = parseInt(doc.number_of_pages);
    } else if (doc.number_of_pages_median) {
      pageCount = parseInt(doc.number_of_pages_median);
    }

    // Build URLs
    const urls = {};
    if (doc.key) {
      urls.openlibrary = `https://openlibrary.org${doc.key}`;
    }
    if (workData && workData.key) {
      urls.openlibraryWork = `https://openlibrary.org${workData.key}`;
    }

    // Collect all available covers (front and back)
    const availableCovers = [];
    
    // Helper function to add all OpenLibrary cover sizes for a given coverId
    const addOpenLibraryCovers = (coverId, coverType, priority = 0) => {
      if (!coverId) return;
      
      // OpenLibrary supports multiple sizes:
      // -L.jpg (Large, ~600px) - priority 4
      // -M.jpg (Medium, ~350px) - priority 3
      // -S.jpg (Small, ~150px) - priority 2
      // We can also try to get higher resolution by using the cover ID directly
      // Some covers may have higher resolution versions available
      
      const sizes = [
        { suffix: '-L.jpg', size: 'large', priority: 4 + priority },
        { suffix: '-M.jpg', size: 'medium', priority: 3 + priority },
        { suffix: '-S.jpg', size: 'small', priority: 2 + priority }
      ];
      
      sizes.forEach(({ suffix, size, priority: sizePriority }) => {
        const url = `https://covers.openlibrary.org/b/id/${coverId}${suffix}`;
        // Avoid duplicates by URL
        if (!availableCovers.some(c => c.url === url)) {
          availableCovers.push({
            source: 'OpenLibrary',
            url: url,
            type: coverType,
            coverId: coverId,
            size: size,
            priority: sizePriority
          });
        }
      });
      
      // Try to get even higher resolution by using the cover ID with different formats
      // Some OpenLibrary covers may have higher resolution versions
      // Try without suffix first (original size if available)
      const originalUrl = `https://covers.openlibrary.org/b/id/${coverId}.jpg`;
      if (!availableCovers.some(c => c.url === originalUrl)) {
        availableCovers.push({
          source: 'OpenLibrary',
          url: originalUrl,
          type: coverType,
          coverId: coverId,
          size: 'original',
          priority: 5 + priority
        });
      }
    };
    
    // Edition covers - add all available sizes
    if (doc.covers && Array.isArray(doc.covers)) {
      doc.covers.forEach((coverId, index) => {
        if (coverId) {
          const coverType = index === 0 ? 'front' : 'back';
          addOpenLibraryCovers(coverId, coverType);
        }
      });
    }
    
    // Work covers (if edition doesn't have covers) - add all available sizes
    if (workData && workData.covers && Array.isArray(workData.covers)) {
      workData.covers.forEach((coverId, index) => {
        if (coverId) {
          const coverType = index === 0 ? 'front' : 'back';
          // Avoid duplicates by coverId (only check if we haven't added this coverId yet)
          if (!availableCovers.some(c => c.coverId === coverId && c.size === 'large')) {
            addOpenLibraryCovers(coverId, coverType);
          }
        }
      });
    }
    
    // Add the main cover URL if available and not already in availableCovers
    if (coverUrl && !availableCovers.some(c => c.url === coverUrl)) {
      availableCovers.unshift({
        source: 'OpenLibrary',
        url: coverUrl,
        type: 'front'
      });
    }
    
    // FALLBACK: Add ISBN-based cover URLs from multiple sources
    // This is especially useful for French books and other non-English publications
    
    // Amazon Images - works well for French books, especially BD/comics
    const addAmazonCoversOL = (isbn10Value, priority = 0) => {
      if (!isbn10Value || isbn10Value.length !== 10) return;
      
      const sizes = [
        { suffix: '._SCLZZZZZZZ_.jpg', size: 'large', priority: 6 + priority },
        { suffix: '._SL500_.jpg', size: 'medium', priority: 5 + priority }
      ];
      
      sizes.forEach(({ suffix, size, priority: sizePriority }) => {
        const url = `https://images-eu.ssl-images-amazon.com/images/P/${isbn10Value}.01${suffix}`;
        if (!availableCovers.some(c => c.url === url)) {
          availableCovers.push({
            source: 'Amazon',
            url: url,
            type: 'front',
            isbn: isbn10Value,
            size: size,
            priority: sizePriority
          });
        }
      });
    };
    
    // OpenLibrary's cover API can return covers by ISBN even when the book record
    // doesn't have cover_i metadata
    const addIsbnBasedCovers = (isbnValue, priority = 1) => {
      if (!isbnValue) return;
      const sizes = [
        { suffix: '-L.jpg', size: 'large', priority: 4 + priority },
        { suffix: '-M.jpg', size: 'medium', priority: 3 + priority },
        { suffix: '-S.jpg', size: 'small', priority: 2 + priority }
      ];
      
      sizes.forEach(({ suffix, size, priority: sizePriority }) => {
        const url = `https://covers.openlibrary.org/b/isbn/${isbnValue}${suffix}`;
        // Avoid duplicates by URL
        if (!availableCovers.some(c => c.url === url)) {
          availableCovers.push({
            source: 'OpenLibrary-ISBN',
            url: url,
            type: 'front',
            isbn: isbnValue,
            size: size,
            priority: sizePriority
          });
        }
      });
    };
    
    // Add Amazon covers first (highest priority for French books)
    if (isbn10) {
      addAmazonCoversOL(isbn10, 0);
    } else if (isbn13 && isbn13.startsWith('978')) {
      // Convert ISBN-13 to ISBN-10
      const isbn9 = isbn13.slice(3, 12);
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(isbn9[i]) * (10 - i);
      }
      const check = (11 - (sum % 11)) % 11;
      const convertedIsbn10 = isbn9 + (check === 10 ? 'X' : check.toString());
      addAmazonCoversOL(convertedIsbn10, 0);
    }
    
    // Add OpenLibrary ISBN-based covers as fallback
    if (isbn13) {
      addIsbnBasedCovers(isbn13, 0);
    }
    if (isbn10 && isbn10 !== isbn13) {
      addIsbnBasedCovers(isbn10, -1); // Lower priority for ISBN-10
    }
    
    // If we still don't have a coverUrl but we have ISBN-based covers, use the best one
    if (!coverUrl && availableCovers.length > 0) {
      const sortedCovers = [...availableCovers].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      coverUrl = sortedCovers[0].url;
    }

    return {
      isbn: isbn,
      isbn13: isbn13,
      title: doc.title || doc.title_suggest || (workData && workData.title) || null,
      subtitle: doc.subtitle ? removeSurroundingQuotes(doc.subtitle) : null,
      authors: authors.length > 0 ? authors : null,
      publisher: publisher,
      publishedYear: publishedYear,
      language: language,
      series: series,
      seriesNumber: seriesNumber,
      genres: genres.length > 0 ? genres : null,
      description: description,
      coverUrl: coverUrl,
      pageCount: pageCount,
      urls: Object.keys(urls).length > 0 ? urls : null,
      availableCovers: availableCovers.length > 0 ? availableCovers : undefined,
      // OpenLibrary-specific data for reference and grouping
      _openLibraryData: {
        key: doc.key,
        editionKey: doc.edition_key?.[0],
        workKey: doc.work_key?.[0] || (workData && workData.key),
        // Include all available covers from this edition and work
        covers: doc.covers || (workData && workData.covers) || []
      }
    };
  }

  /**
   * Get autocomplete suggestions for a given field
   */
  async getAutocompleteSuggestions(field, value) {
    const allowedFields = ['title', 'author', 'series', 'publisher', 'genre', 'tag', 'owner', 'title_status'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }
    
    // title_status has fixed values, return them directly (excluding 'wish' as it has its own tab)
    if (field === 'title_status') {
      const statusOptions = ['owned', 'borrowed'];
      const matches = statusOptions.filter(status => 
        status.toLowerCase().includes((value || '').toLowerCase())
      );
      return matches.map(status => ({ title_status: status }));
    }
    
    try {
      const rows = await Book.autocomplete(field, value);
      return rows;
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      throw error;
    }
  }

  /**
   * Calculate a metadata richness score for a book
   * Higher score = more metadata available
   */
  _calculateMetadataScore(book) {
    if (!book) return 0;
    
    let score = 0;
    
    // Description: weight by length (longer descriptions are better)
    if (book.description) {
      score += Math.min(book.description.length / 100, 50); // Max 50 points for description
    }
    
    // Authors: 10 points if present
    if (book.authors && Array.isArray(book.authors) && book.authors.length > 0) {
      score += 10;
    }
    
    // Publisher: 10 points
    if (book.publisher) {
      score += 10;
    }
    
    // Published year: 10 points
    if (book.publishedYear) {
      score += 10;
    }
    
    // Page count: 10 points
    if (book.pageCount) {
      score += 10;
    }
    
    // Genres: 5 points per genre, max 20 points
    if (book.genres && Array.isArray(book.genres)) {
      score += Math.min(book.genres.length * 5, 20);
    }
    
    // Cover: 5 points
    if (book.coverUrl) {
      score += 5;
    }
    
    // Series info: 5 points
    if (book.series) {
      score += 5;
    }
    
    return score;
  }
}

module.exports = new BookService();

