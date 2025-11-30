/**
 * Book Service
 * Core CRUD operations for books, orchestrating specialized services
 */

const Book = require('../models/book');
const imageService = require('./imageService');
const configManager = require('../config');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Specialized services
const bookCoverService = require('./bookCoverService');
const bookEnrichmentService = require('./bookEnrichmentService');
const bookImslpService = require('./bookImslpService');
const { 
  normalizeArrayField, 
  extractSeriesFromTitle, 
  isMusicScore,
  detectBookType 
} = require('./utils/bookUtils');

class BookService {
  // ============================================
  // Basic CRUD operations
  // ============================================

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

  // ============================================
  // Add book
  // ============================================

  async addBook(bookData) {
    try {
      // Check for existing book by ISBN
      if (bookData.isbn || bookData.isbn13) {
        const existing = await Book.findByIsbn(bookData.isbn || bookData.isbn13);
        if (existing) {
          throw new Error('Book with this ISBN already exists in collection');
        }
      }

      // Download cover
      let coverPath = await this._downloadCover(bookData);

      // Normalize array fields
      const normalizedData = {
        ...bookData,
        cover: coverPath || bookData.cover,
        tags: normalizeArrayField(bookData.tags),
        genres: normalizeArrayField(bookData.genres),
        authors: normalizeArrayField(bookData.authors),
        artists: normalizeArrayField(bookData.artists)
      };

      // Extract series from title if not provided
      if (!normalizedData.series && normalizedData.title) {
        const extractedSeries = extractSeriesFromTitle(normalizedData.title);
        if (extractedSeries) {
          normalizedData.series = extractedSeries.series;
          normalizedData.seriesNumber = extractedSeries.seriesNumber;
          logger.info(`[AddBook] Extracted series: "${extractedSeries.series}" #${extractedSeries.seriesNumber}`);
        }
      }

      // For music scores, enrich with IMSLP data
      if (isMusicScore(normalizedData.isbn13 || normalizedData.isbn)) {
        const enrichedData = await bookImslpService.enrichMusicScore(normalizedData);
        Object.assign(normalizedData, enrichedData);
      }

      // Detect book type if not provided
      if (!normalizedData.bookType) {
        const genres = normalizedData.genres || [];
        logger.info(`[AddBook] Detecting book type with genres: ${Array.isArray(genres) ? genres.join(', ') : genres}`);
        normalizedData.bookType = detectBookType(
          normalizedData.isbn13 || normalizedData.isbn,
          genres
        );
        logger.info(`[AddBook] Detected book type: ${normalizedData.bookType} (genres: ${Array.isArray(genres) ? genres.join(', ') : 'none'})`);
      }

      // Add 'score' tag for music scores
      if (normalizedData.bookType === 'score') {
        const currentTags = normalizedData.tags || [];
        if (!currentTags.includes('score')) {
          normalizedData.tags = [...currentTags, 'score'];
          logger.info(`[AddBook] Added 'score' tag for music score`);
        }
      }

      return await Book.create(normalizedData);
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

      return { success: results, errors };
    } catch (error) {
      console.error('Error adding books batch:', error);
      throw error;
    }
  }

  // ============================================
  // Update book
  // ============================================

  async updateBook(id, bookData) {
    try {
      const existingBook = await Book.findById(id);
      const existingCoverUrl = existingBook?.coverUrl || null;
      const existingCoverPath = existingBook?.cover || null;

      // Determine cover URL to use
      let coverUrlToUse = bookData.coverUrl;
      if (!coverUrlToUse && bookData.availableCovers?.length > 0) {
        coverUrlToUse = bookCoverService.selectLargestCover(bookData.availableCovers);
        logger.info(`[UpdateBook] Using largest cover from available covers`);
      }

      // Download new cover if needed
      let coverPath = bookData.cover;
      const coverUrlChanged = coverUrlToUse && (!existingCoverUrl || coverUrlToUse !== existingCoverUrl);
      
      if (coverUrlToUse && coverUrlChanged) {
        try {
          const filename = `book_${id}_${Date.now()}.jpg`;
          coverPath = await imageService.downloadImageFromUrl(coverUrlToUse, 'book', filename);
          if (coverPath) {
            const downloadedFilename = coverPath.split('/').pop();
            const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
            try {
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError) {
              logger.warn(`Failed to resize cover: ${resizeError.message}`);
            }
          }
        } catch (error) {
          logger.warn(`Failed to download cover: ${error.message}`);
          coverPath = existingCoverPath;
        }
      } else {
        coverPath = existingCoverPath;
      }

      // Build normalized data
      const normalizedData = {
        ...bookData,
        cover: coverPath || bookData.cover,
        coverUrl: coverUrlToUse || bookData.coverUrl || null
      };

      // Only normalize array fields if provided
      if (bookData.tags !== undefined) normalizedData.tags = normalizeArrayField(bookData.tags);
      if (bookData.genres !== undefined) normalizedData.genres = normalizeArrayField(bookData.genres);
      if (bookData.authors !== undefined) normalizedData.authors = normalizeArrayField(bookData.authors);
      if (bookData.artists !== undefined) normalizedData.artists = normalizeArrayField(bookData.artists);

      return await Book.update(id, normalizedData);
    } catch (error) {
      console.error('Error updating book:', error);
      throw error;
    }
  }

  // ============================================
  // Delete book
  // ============================================

  async deleteBook(id) {
    try {
      const book = await Book.findById(id);
      
      // Delete ebook file if exists
      if (book?.ebookFile) {
        let ebookDir;
        try {
          ebookDir = configManager.getEbooksPath();
        } catch (error) {
          ebookDir = path.join(__dirname, '..', '..', 'data', 'ebooks');
        }
        const filePath = path.join(ebookDir, book.ebookFile);
        
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`Deleted ebook file: ${filePath}`);
          } catch (fileError) {
            console.warn('Failed to delete ebook file:', fileError.message);
          }
        }
      }
      
      return await Book.delete(id);
    } catch (error) {
      console.error('Error deleting book:', error);
      throw error;
    }
  }

  // ============================================
  // External API methods (delegated to services)
  // ============================================

  async searchExternalBooks(query, filters = {}) {
    return bookEnrichmentService.searchExternalBooks(query, filters);
  }

  async enrichBook(bookData) {
    return bookEnrichmentService.enrichBook(bookData);
  }

  async searchSeriesVolumes(seriesName, options = {}) {
    return bookEnrichmentService.searchSeriesVolumes(seriesName, options);
  }

  // ============================================
  // Autocomplete
  // ============================================

  async getAutocompleteSuggestions(field, value) {
    const allowedFields = ['title', 'author', 'series', 'publisher', 'genre', 'tag', 'owner', 'title_status', 'type', 'book_type'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }
    
    if (field === 'title_status') {
      const statusOptions = ['owned', 'borrowed'];
      const matches = statusOptions.filter(status => 
        status.toLowerCase().includes((value || '').toLowerCase())
      );
      return matches.map(status => ({ title_status: status }));
    }
    
    if (field === 'type' || field === 'book_type') {
      const typeOptions = [
        { value: 'book', label: 'Book' },
        { value: 'graphic-novel', label: 'Graphic Novel' },
        { value: 'score', label: 'Score' }
      ];
      const matches = typeOptions.filter(opt => 
        opt.value.toLowerCase().includes((value || '').toLowerCase()) ||
        opt.label.toLowerCase().includes((value || '').toLowerCase())
      );
      return matches.map(opt => ({ type: opt.value, book_type: opt.value }));
    }
    
    try {
      return await Book.autocomplete(field, value);
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      throw error;
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  async _downloadCover(bookData) {
    let coverPath = bookData.cover;
    
    // If cover is already a local path, keep it
    if (coverPath && coverPath.startsWith('/api/images/')) {
      return coverPath;
    }
    
    if (!coverPath && bookData.availableCovers?.length > 0) {
      const sortedCovers = [...bookData.availableCovers]
        .filter(c => c.url && (!c.type || c.type === 'front'))
        // Skip local paths - they're already downloaded
        .filter(c => !c.url.startsWith('/api/images/') && c.url.startsWith('http'))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      logger.info(`[AddBook] Trying ${sortedCovers.length} cover options`);
      
      for (let i = 0; i < Math.min(sortedCovers.length, 5); i++) {
        const cover = sortedCovers[i];
        try {
          const filename = `book_${Date.now()}_${i}.jpg`;
          const downloadedPath = await imageService.downloadImageFromUrl(cover.url, 'book', filename);
          
          if (downloadedPath) {
            const downloadedFilename = downloadedPath.split('/').pop();
            const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
            
            // Verify it's not a placeholder
            const stats = fs.statSync(fullPath);
            if (stats.size < 200) {
              logger.warn(`[AddBook] Cover appears to be placeholder (${stats.size} bytes), trying next`);
              fs.unlinkSync(fullPath);
              continue;
            }
            
            // Check for Google Books "image not available" placeholder using image analysis
            // The placeholder is mostly white/gray with very little color variation
            if (cover.source === 'Google Books' || cover.url?.includes('books.google.com')) {
              try {
                const imageStats = await sharp(fullPath).stats();
                // Placeholder characteristics: all channels nearly white (mean > 240) with low variation (stdev < 25)
                const isPlaceholder = imageStats.channels.every(ch => 
                  ch.mean > 240 && ch.stdev < 25
                );
                if (isPlaceholder) {
                  logger.warn(`[AddBook] Google Books "image not available" placeholder detected, trying next`);
                  fs.unlinkSync(fullPath);
                  continue;
                }
              } catch (sharpError) {
                logger.warn(`[AddBook] Could not analyze image: ${sharpError.message}`);
              }
            }
            
            // Resize
            try {
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError) {
              console.warn('Failed to resize cover:', resizeError.message);
            }
            
            coverPath = downloadedPath;
            logger.info(`[AddBook] Downloaded cover from ${cover.source || 'unknown'}`);
            break;
          }
        } catch (error) {
          logger.warn(`[AddBook] Cover ${i + 1} failed: ${error.message}`);
        }
      }
    } else if (!coverPath && bookData.coverUrl) {
      // If coverUrl is already a local path, use it directly
      if (bookData.coverUrl.startsWith('/api/images/')) {
        return bookData.coverUrl;
      }
      
      // Only download if it's a valid external URL
      if (!bookData.coverUrl.startsWith('http')) {
        return coverPath;
      }
      
      try {
        const filename = `book_${Date.now()}.jpg`;
        const downloadedPath = await imageService.downloadImageFromUrl(bookData.coverUrl, 'book', filename);
        
        if (downloadedPath) {
          const downloadedFilename = downloadedPath.split('/').pop();
          const fullPath = path.join(imageService.getLocalImagesDir(), 'book', downloadedFilename);
          
          const stats = fs.statSync(fullPath);
          let isPlaceholder = stats.size < 200;
          
          // Check for Google Books "image not available" placeholder using image analysis
          if (!isPlaceholder && bookData.coverUrl?.includes('books.google.com')) {
            try {
              const imageStats = await sharp(fullPath).stats();
              isPlaceholder = imageStats.channels.every(ch => 
                ch.mean > 240 && ch.stdev < 25
              );
            } catch (sharpError) {
              logger.warn(`[AddBook] Could not analyze image: ${sharpError.message}`);
            }
          }
          
          if (isPlaceholder) {
            logger.warn(`[AddBook] Placeholder image detected, skipping`);
            fs.unlinkSync(fullPath);
          } else {
            try {
              await imageService.resizeImage(fullPath, fullPath, 1200, 1200);
            } catch (resizeError) {
              console.warn('Failed to resize cover:', resizeError.message);
            }
            coverPath = downloadedPath;
          }
        }
      } catch (error) {
        console.warn('Failed to download cover:', error.message);
      }
    }
    
    return coverPath;
  }
}

module.exports = new BookService();
