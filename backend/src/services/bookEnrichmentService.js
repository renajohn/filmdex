/**
 * Book Enrichment Service
 * Orchestrates enrichment from multiple data sources (Google Books, OpenLibrary)
 */

const axios = require('axios');
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
    
    // Explicitly extract and log genres/tags from OpenLibrary
    if (olBook.genres && Array.isArray(olBook.genres) && olBook.genres.length > 0) {
      logger.info(`[Enrichment] ✓ Found ${olBook.genres.length} genre(s) from OpenLibrary: ${olBook.genres.join(', ')}`);
    } else if (olBook.genres) {
      logger.info(`[Enrichment] ✓ Found genre from OpenLibrary: ${olBook.genres}`);
    }
    if (olBook.tags && Array.isArray(olBook.tags) && olBook.tags.length > 0) {
      logger.info(`[Enrichment] ✓ Found ${olBook.tags.length} tag(s) from OpenLibrary: ${olBook.tags.join(', ')}`);
    } else if (olBook.tags) {
      logger.info(`[Enrichment] ✓ Found tag from OpenLibrary: ${olBook.tags}`);
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
    
    // Explicitly extract and log genres/tags from Google Books
    if (googleBook.genres && Array.isArray(googleBook.genres) && googleBook.genres.length > 0) {
      logger.info(`[Enrichment] ✓ Found ${googleBook.genres.length} genre(s) from Google Books: ${googleBook.genres.join(', ')}`);
    } else if (googleBook.genres) {
      logger.info(`[Enrichment] ✓ Found genre from Google Books: ${googleBook.genres}`);
    }
    if (googleBook.tags && Array.isArray(googleBook.tags) && googleBook.tags.length > 0) {
      logger.info(`[Enrichment] ✓ Found ${googleBook.tags.length} tag(s) from Google Books: ${googleBook.tags.join(', ')}`);
    } else if (googleBook.tags) {
      logger.info(`[Enrichment] ✓ Found tag from Google Books: ${googleBook.tags}`);
    }
    
    return this._mergeBookData(book, googleBook, 'Google Books');
  }

  /**
   * Comprehensive enrichment from all sources
   */
  async enrichBook(bookData) {
    if (!bookData) return bookData;
    
    logger.info(`[Enrichment] Starting comprehensive enrichment for "${bookData.title}"`);
    
    // Preserve the original title - it should never be replaced
    const originalTitle = bookData.title;
    
    let enriched = { ...bookData };
    
    // Check for Amazon URLs and extract ASIN for cover, and ISBN for enrichment
    if (bookData.urls) {
      const amazonUrl = bookData.urls.amazon || bookData.urls.amazonUrl;
      if (amazonUrl) {
        const asin = bookCoverService.extractAsinFromUrl(amazonUrl);
        if (asin) {
          logger.info(`[Enrichment] Extracted ASIN ${asin} from Amazon URL`);
          const asinCovers = bookCoverService.generateAmazonCoversFromAsin(asin);
          enriched.availableCovers = [...(enriched.availableCovers || []), ...asinCovers];
          enriched.asin = asin;
          
          // If we don't have an ISBN or title, try to scrape them from Amazon page
          // IMPORTANT: Only scrape title if the original title is missing or very short (< 10 chars)
          // This preserves user-provided titles like "Les soeurs Grémillet - Tome 1 - Le rêve de Sarah"
          const shouldScrapeTitle = !enriched.title || enriched.title.trim().length < 10;
          if ((!enriched.isbn && !enriched.isbn13) || shouldScrapeTitle) {
            try {
              const scrapedMetadata = await this._scrapeAmazonMetadata(amazonUrl);
              if (scrapedMetadata.isbn) {
                logger.info(`[Enrichment] Scraped ISBN ${scrapedMetadata.isbn} from Amazon page`);
                if (scrapedMetadata.isbn.length === 13) {
                  enriched.isbn13 = scrapedMetadata.isbn;
                } else {
                  enriched.isbn = scrapedMetadata.isbn;
                }
              }
              // Only use scraped title if original title is missing or very short
              // This preserves user-provided complete titles
              if (scrapedMetadata.title && shouldScrapeTitle) {
                enriched.title = scrapedMetadata.title;
                logger.info(`[Enrichment] Using scraped title from Amazon: "${scrapedMetadata.title}" (original was: "${originalTitle || 'none'}")`);
              } else if (scrapedMetadata.title && !shouldScrapeTitle) {
                logger.info(`[Enrichment] Preserving original title "${originalTitle}" (scraped title "${scrapedMetadata.title}" ignored)`);
              }
            } catch (error) {
              logger.warn(`[Enrichment] Failed to scrape metadata from Amazon: ${error.message}`);
            }
          }
        }
      }
    }
    
    // Store metadata from each source - include title in original metadata
    enriched._metadataSources = {
      original: {
        title: originalTitle || null,
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
    
    // ALWAYS preserve the original title provided by the user
    // The original title is the source of truth and should never be replaced
    // This ensures titles like "Les soeurs Grémillet - Tome 1 - Le rêve de Sarah" are preserved
    if (originalTitle && originalTitle.trim().length > 0) {
      // Only replace if the enriched title is significantly longer and more complete
      // This handles cases where Amazon scraping found a better title than a very short user input
      const originalLen = originalTitle.trim().length;
      const enrichedLen = (enriched.title || '').trim().length;
      
      // If original title is substantial (>= 10 chars), always preserve it
      // If original title is short (< 10 chars) but enriched title is much longer (> 2x), use enriched
      if (originalLen >= 10) {
        enriched.title = originalTitle;
        logger.info(`[Enrichment] Preserving original title: "${originalTitle}" (enriched had: "${enriched.title}")`);
      } else if (enrichedLen > originalLen * 2 && enrichedLen >= 20) {
        logger.info(`[Enrichment] Using enriched title "${enriched.title}" (original "${originalTitle}" was very short)`);
      } else {
        enriched.title = originalTitle;
        logger.info(`[Enrichment] Preserving original title: "${originalTitle}"`);
      }
    } else if (enriched.title) {
      logger.info(`[Enrichment] Using enriched title: "${enriched.title}" (no original title provided)`);
    }
    
    // Extract series from title if not found (use enriched title which should be the full Amazon title)
    // CRITICAL: Always use the original title for series extraction to preserve the full title
    // The original title like "Les soeurs Grémillet - Tome 1 - Le rêve de Sarah" should be preserved
    const titleForExtraction = originalTitle || enriched.title;
    if (!enriched.series && titleForExtraction) {
      const extracted = extractSeriesFromTitle(titleForExtraction);
      if (extracted) {
        enriched.series = extracted.series;
        enriched.seriesNumber = extracted.seriesNumber;
        logger.info(`[Enrichment] Extracted series from title "${titleForExtraction}": "${extracted.series}" #${extracted.seriesNumber}`);
      }
    }
    
    // CRITICAL: After series extraction, ensure the original title is still preserved
    // The title should NEVER be modified by series extraction - it's only used to extract series info
    if (originalTitle && originalTitle.trim().length >= 10 && enriched.title !== originalTitle) {
      enriched.title = originalTitle;
      logger.info(`[Enrichment] Final preservation of original title after series extraction: "${originalTitle}"`);
    }
    
    // Select best cover
    if (enriched.availableCovers?.length > 0) {
      const largestCover = bookCoverService.selectLargestCover(enriched.availableCovers);
      if (largestCover) {
        enriched.coverUrl = largestCover;
        logger.info(`[Enrichment] Selected largest cover: ${largestCover}`);
      }
    }
    
    // Summary of genres/tags found from all sources
    const totalGenres = enriched.genres ? (Array.isArray(enriched.genres) ? enriched.genres.length : 1) : 0;
    const totalTags = enriched.tags ? (Array.isArray(enriched.tags) ? enriched.tags.length : 1) : 0;
    if (totalGenres > 0 || totalTags > 0) {
      logger.info(`[Enrichment] Genre/Tag summary: ${totalGenres} genre(s), ${totalTags} tag(s) from all sources`);
      if (totalGenres > 0) {
        const genreList = Array.isArray(enriched.genres) ? enriched.genres : [enriched.genres];
        logger.info(`[Enrichment] Final genres: ${genreList.join(', ')}`);
      }
      if (totalTags > 0) {
        const tagList = Array.isArray(enriched.tags) ? enriched.tags : [enriched.tags];
        logger.info(`[Enrichment] Final tags: ${tagList.join(', ')}`);
      }
    } else {
      logger.info(`[Enrichment] No genres or tags found from external APIs`);
    }
    
    logger.info(`[Enrichment] Completed enrichment for "${enriched.title}"`);
    return enriched;
  }

  /**
   * Search external APIs with fallback
   */
  /**
   * Try to scrape title and ISBN from Amazon product page
   */
  async _scrapeAmazonMetadata(amazonUrl) {
    try {
      logger.info(`[Amazon] Attempting to scrape metadata from: ${amazonUrl}`);
      
      const response = await axios.get(amazonUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      const html = response.data;
      const metadata = { title: null, isbn: null };
      
      // Try to extract title from various Amazon HTML structures
      // Priority order: most specific first
      const titlePatterns = [
        // Product title span (most reliable for Amazon)
        /<span[^>]*id=["']productTitle["'][^>]*>([^<]+)<\/span>/i,
        // H1 with product title class
        /<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)<\/h1>/i,
        // H1 with title id
        /<h1[^>]*id=["']title["'][^>]*>([^<]+)<\/h1>/i,
        // Data attribute
        /data-asin-title=["']([^"']+)["']/i,
        // Meta tag og:title
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
        // Page title (needs cleanup)
        /<title[^>]*>([^<]+)<\/title>/i,
        // JSON-LD format - be more specific to avoid matching error messages
        /"@type"\s*:\s*"Product"[^}]*"name"\s*:\s*"([^"]+)"/i
      ];
      
      // Invalid title patterns to filter out
      const invalidTitlePatterns = [
        /^flyout/i,
        /^error/i,
        /^undefined$/i,
        /^null$/i,
        /^loading/i,
        /^please wait/i,
        /amazon\.(fr|com|co\.uk|de|it|es)\s*$/i
      ];
      
      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let title = match[1].trim();
          
          // Skip invalid titles
          if (invalidTitlePatterns.some(invalid => invalid.test(title))) {
            continue;
          }
          
          // Clean up common Amazon title suffixes
          title = title.replace(/\s*:\s*Amazon\.(fr|com|co\.uk|de|it|es)[^:]*$/i, '');
          title = title.replace(/\s*-\s*Amazon[^:]*$/i, '');
          // Remove " : " and everything after if it looks like a category (but keep if it's part of the title)
          // Only remove if it's a single word after the colon (likely a category)
          title = title.replace(/\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$/, '');
          
          // Must be at least 5 characters and not just numbers/special chars
          if (title.length >= 5 && /[a-zA-Z]/.test(title)) {
            metadata.title = title;
            logger.info(`[Amazon] Found title: "${title}"`);
            break;
          }
        }
      }
      
      // Multiple patterns to find ISBN-13 (various Amazon HTML structures)
      const isbn13Patterns = [
        // Standard product details format
        /ISBN-13\s*[:\s]*<\/span>\s*<span[^>]*>\s*([\d-]{10,17})/i,
        /ISBN-13\s*[:\s]*([\d-]{10,17})/i,
        // JSON-LD format
        /"isbn13"\s*:\s*"(\d{13})"/i,
        /"isbn"\s*:\s*"(\d{13})"/i,
        // Table format with just numbers after ISBN-13 text
        /ISBN-13[^<]*<[^>]*>[^<]*<[^>]*>\s*([\d-]{10,17})/i,
        // Generic: any 13-digit number starting with 978 or 979
        />(\s*978[\d-]{10,14})</i,
        />(\s*979[\d-]{10,14})</i,
        // Data attribute format
        /data-isbn[^"]*"(\d{13})"/i,
        // Plain text format
        /ISBN-13[^0-9]*(97[89][\d-]{10,14})/i,
        // Music scores often show as ISBN even for ISMN
        /ISBN[^0-9]*(9790[\d-]{9,13})/i
      ];
      
      for (const pattern of isbn13Patterns) {
        const match = html.match(pattern);
        if (match) {
          const isbn = match[1].replace(/[-\s]/g, '');
          if (isbn.length >= 10 && isbn.length <= 13) {
            metadata.isbn = isbn;
            logger.info(`[Amazon] Found ISBN-13/ISMN: ${isbn}`);
            break;
          }
        }
      }
      
      // Look for ISBN-10 if we didn't find ISBN-13
      if (!metadata.isbn) {
        const isbn10Patterns = [
          /ISBN-10\s*[:\s]*<\/span>\s*<span[^>]*>\s*(\d{9}[\dX])/i,
          /ISBN-10\s*[:\s]*(\d{9}[\dX])/i,
          /"isbn10"\s*:\s*"(\d{9}[\dX])"/i,
          /ISBN-10[^<]*<[^>]*>[^<]*<[^>]*>\s*(\d{9,13})/i,
          /ISBN-10[^0-9]*(\d{9,13})/i
        ];
        
        for (const pattern of isbn10Patterns) {
          const match = html.match(pattern);
          if (match) {
            const isbn = match[1].replace(/[-\s]/g, '');
            metadata.isbn = isbn;
            logger.info(`[Amazon] Found ISBN-10: ${isbn}`);
            break;
          }
        }
      }
      
      // Look for ISMN explicitly labeled if we still don't have ISBN
      if (!metadata.isbn) {
        const ismnPatterns = [
          /ISMN\s*[:\s]*(979[-\s]?0[-\s]?[\d-]{7,12})/i,
          /ISMN[^0-9]*(9790[\d-]{9,13})/i
        ];
        
        for (const pattern of ismnPatterns) {
          const match = html.match(pattern);
          if (match) {
            const ismn = match[1].replace(/[-\s]/g, '');
            metadata.isbn = ismn;
            logger.info(`[Amazon] Found ISMN: ${ismn}`);
            break;
          }
        }
      }
      
      if (!metadata.title && !metadata.isbn) {
        logger.info(`[Amazon] No title or ISBN/ISMN found on page`);
      }
      
      return metadata;
    } catch (error) {
      logger.warn(`[Amazon] Failed to scrape page: ${error.message}`);
      return { title: null, isbn: null };
    }
  }

  /**
   * Try to scrape ISBN from Amazon product page (backward compatibility)
   */
  async _scrapeAmazonIsbn(amazonUrl) {
    const metadata = await this._scrapeAmazonMetadata(amazonUrl);
    return metadata.isbn;
  }

  async searchExternalBooks(query, filters = {}) {
    const { isbn, asin, amazonUrl, author, title, limit = 20, language = 'any' } = filters;
    
    // Normalize filters
    let normalizedTitle = title?.trim() || undefined;
    const normalizedAuthor = author?.trim() || undefined;
    const normalizedIsbn = isbn?.trim() || undefined;
    
    // If we have an ASIN from an Amazon URL
    let amazonCovers = [];
    let scrapedAmazonTitle = null; // Store Amazon-scraped title early
    if (asin) {
      logger.info(`[Search] Amazon ASIN detected: ${asin}`);
      amazonCovers = bookCoverService.generateAmazonCoversFromAsin(asin);
      
      // Try to extract ISBN from Amazon URL parameters first
      if (amazonUrl) {
        const isbnMatch = amazonUrl.match(/ISBN[%3A:]+(\d{10,13}|\d{3}[-\s]?\d[-\s]?\d{3,4}[-\s]?\d{4,5}[-\s]?\d)/i);
        if (isbnMatch) {
          const extractedIsbn = isbnMatch[1].replace(/[-\s]/g, '');
          logger.info(`[Search] Extracted ISBN from Amazon URL params: ${extractedIsbn}`);
          filters.isbn = extractedIsbn;
        } else {
          // CRITICAL: Always scrape title from Amazon - it's the source of truth
          // Scrape early so we can use it to replace truncated API titles
          try {
            const scrapedMetadata = await this._scrapeAmazonMetadata(amazonUrl);
            if (scrapedMetadata.isbn) {
              filters.isbn = scrapedMetadata.isbn;
            }
            if (scrapedMetadata.title && scrapedMetadata.title.trim().length >= 10) {
              scrapedAmazonTitle = scrapedMetadata.title;
              filters.title = scrapedMetadata.title;
              normalizedTitle = scrapedMetadata.title;
              logger.info(`[Search] Scraped title from Amazon: "${scrapedAmazonTitle}"`);
            }
          } catch (error) {
            logger.warn(`[Search] Failed to scrape Amazon metadata: ${error.message}`);
          }
        }
      }
    }
    
    // Check if query is an ISBN
    let isbnToSearch = filters.isbn?.trim() || normalizedIsbn;
    if (!isbnToSearch && query) {
      const cleanQuery = query.replace(/[-\s]/g, '');
      if (/^\d{10}$/.test(cleanQuery) || /^\d{13}$/.test(cleanQuery)) {
        isbnToSearch = query;
      }
    }
    
    // Helper to add Amazon covers to results and preserve Amazon-scraped title
    // CRITICAL: This function must preserve the Amazon title if it was scraped
    const addAmazonCoversToResults = (results, amazonTitleToUse = null) => {
      if (amazonCovers.length === 0 || !results?.length) return results;
      // Use the best Amazon cover (first one, which is large size)
      const bestAmazonCover = amazonCovers[0]?.url;
      return results.map(book => {
        // CRITICAL: If we have an Amazon-scraped title, use it instead of the API title
        // API titles are often truncated (e.g., "Le rêve de Sarah" instead of "Les soeurs Grémillet - Tome 1 - Le rêve de Sarah")
        const titleToUse = (amazonTitleToUse && amazonTitleToUse.trim().length >= 10) 
          ? amazonTitleToUse 
          : book.title;
        
        if (amazonTitleToUse && titleToUse !== book.title) {
          logger.info(`[Search] Replacing API title "${book.title}" with Amazon title "${amazonTitleToUse}"`);
        }
        
        return {
          ...book,
          title: titleToUse, // Use Amazon title if available
          asin: asin,
          // Use Amazon cover as primary if available (it's usually better quality for music scores)
          coverUrl: bestAmazonCover || book.coverUrl,
          availableCovers: [...amazonCovers, ...(book.availableCovers || [])], // Amazon first
          urls: { ...book.urls, amazon: amazonUrl }
        };
      });
    };
    
    // ISBN search
    if (isbnToSearch) {
      try {
        const googleResults = await bookApiService.searchGoogleBooksByIsbn(isbnToSearch);
        if (googleResults?.length > 0) {
          // CRITICAL: Replace API titles with Amazon-scraped title if available
          return addAmazonCoversToResults(googleResults, scrapedAmazonTitle);
        }
      } catch (error) {
        logger.warn(`Google Books ISBN search failed: ${error.message}`);
      }
      
      try {
        const results = await bookApiService.searchByIsbn(isbnToSearch);
        // CRITICAL: Replace API titles with Amazon-scraped title if available
        return addAmazonCoversToResults(results, scrapedAmazonTitle);
      } catch (error) {
        logger.error(`Both ISBN searches failed: ${error.message}`);
        // If we have Amazon ASIN but no book results, create a placeholder
        if (amazonCovers.length > 0) {
          logger.info(`[Search] No book found but ASIN available, returning placeholder`);
          return [{
            title: scrapedAmazonTitle || 'Unknown Title (from Amazon)',
            authors: [],
            asin: asin,
            coverUrl: amazonCovers[0]?.url,
            availableCovers: amazonCovers,
            urls: { amazon: amazonUrl },
            _fromAsin: true
          }];
        }
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
    
    // If we have no search query but have Amazon ASIN, return placeholder
    if (!searchQuery && amazonCovers.length > 0) {
      logger.info(`[Search] No search query but ASIN available, returning placeholder`);
      return [{
        title: 'Unknown Title (from Amazon)',
        authors: [],
        asin: asin,
        coverUrl: amazonCovers[0]?.url,
        availableCovers: amazonCovers,
        urls: { amazon: amazonUrl },
        _fromAsin: true,
        _needsManualEntry: true
      }];
    }
    
    // Try Google Books first
    let results = [];
    try {
      const googleResults = await bookApiService.searchGoogleBooks(
        searchQuery, limit, { title: finalTitle, author: finalAuthor, language }
      );
      if (googleResults?.length > 0) {
        // CRITICAL: Replace API titles with Amazon-scraped title if available
        results = addAmazonCoversToResults(googleResults, scrapedAmazonTitle);
      }
    } catch (error) {
      logger.warn(`Google Books search failed: ${error.message}`);
    }
    
    // Fallback to OpenLibrary if no results
    if (results.length === 0) {
      try {
        const olResults = await bookApiService.searchOpenLibrary(searchQuery, limit, language);
        if (olResults?.length > 0) {
          // CRITICAL: Replace API titles with Amazon-scraped title if available
          results = addAmazonCoversToResults(olResults, scrapedAmazonTitle);
        }
      } catch (error) {
        logger.error(`OpenLibrary search failed: ${error.message}`);
      }
    }
    
    // If we have Amazon URL/ASIN, enrich the results to get genres and other metadata
    if (amazonUrl && results.length > 0) {
      logger.info(`[Search] Enriching ${results.length} result(s) from Amazon search`);
      
      // CRITICAL: Use the already-scraped Amazon title (scraped earlier in the function)
      // This is the source of truth for complete titles
      // We scraped it early so we could replace API titles immediately
      let amazonTitle = scrapedAmazonTitle;
      
      // Fallback: If we didn't scrape it earlier, try now (shouldn't happen, but safety)
      if (!amazonTitle && amazonUrl) {
        try {
          const scrapedMetadata = await this._scrapeAmazonMetadata(amazonUrl);
          if (scrapedMetadata.title && scrapedMetadata.title.trim().length >= 10) {
            amazonTitle = scrapedMetadata.title;
            logger.info(`[Search] Scraped title from Amazon (late fallback): "${amazonTitle}"`);
          }
        } catch (error) {
          logger.warn(`[Search] Failed to scrape title from Amazon: ${error.message}`);
        }
      }
      
      // Fallback to normalizedTitle if Amazon scraping failed
      if (!amazonTitle && normalizedTitle && normalizedTitle.trim().length >= 10) {
        amazonTitle = normalizedTitle;
      }
      
      if (amazonTitle) {
        logger.info(`[Search] Using Amazon title for enrichment: "${amazonTitle}"`);
      }
      
      const enrichedResults = await Promise.all(
        results.map(async (book) => {
          try {
            // CRITICAL: Always prioritize Amazon-scraped title as it's the most complete
            // Titles from Google Books/OpenLibrary are often truncated
            // This ensures titles like "Les soeurs Grémillet - Tome 1 - Le rêve de Sarah" are preserved
            let titleToUse = book.title;
            
            // Priority order:
            // 1. Amazon-scraped title (most complete, source of truth)
            // 2. User-provided normalized title (if substantial)
            // 3. Book title from APIs (may be truncated)
            if (amazonTitle && amazonTitle.trim().length >= 10) {
              titleToUse = amazonTitle;
              logger.info(`[Search] Using Amazon-scraped title: "${amazonTitle}"`);
            } else if (normalizedTitle && normalizedTitle.trim().length >= 10) {
              titleToUse = normalizedTitle;
              logger.info(`[Search] Using user-provided title: "${normalizedTitle}"`);
            } else if (amazonTitle && amazonTitle.trim().length > (book.title || '').trim().length) {
              titleToUse = amazonTitle;
              logger.info(`[Search] Using Amazon title (longer than API title): "${amazonTitle}"`);
            }
            
            // Add Amazon URL to book data for enrichment
            // CRITICAL: Pass the Amazon-scraped title as the original title so it's preserved
            const bookWithAmazon = {
              ...book,
              title: titleToUse, // Use the best available title (prioritizing Amazon)
              urls: { ...book.urls, amazon: amazonUrl }
            };
            
            logger.info(`[Search] Enriching book with title: "${titleToUse}" (original API title was: "${book.title}")`);
            const enriched = await this.enrichBook(bookWithAmazon);
            
            // CRITICAL: ALWAYS preserve the Amazon-scraped title or user-provided title
            // The enrichBook method should preserve it, but we enforce it here as a safety measure
            const titleToPreserve = amazonTitle || normalizedTitle;
            if (titleToPreserve && titleToPreserve.trim().length >= 10) {
              if (enriched.title !== titleToPreserve) {
                enriched.title = titleToPreserve;
                logger.info(`[Search] ✓ Enforced preservation of title: "${titleToPreserve}" (enriched had: "${enriched.title}")`);
              } else {
                logger.info(`[Search] ✓ Title already preserved: "${titleToPreserve}"`);
              }
            } else if (titleToUse && titleToUse.trim().length >= 10 && enriched.title !== titleToUse) {
              enriched.title = titleToUse;
              logger.info(`[Search] Preserved title after enrichment: "${titleToUse}" (enriched had: "${enriched.title}")`);
            }
            
            // Final check: ensure the title is the full Amazon title
            if (amazonTitle && enriched.title !== amazonTitle) {
              logger.warn(`[Search] ⚠ Title mismatch! Amazon title: "${amazonTitle}", Enriched title: "${enriched.title}" - fixing...`);
              enriched.title = amazonTitle;
            }
            
            return enriched;
          } catch (error) {
            logger.warn(`[Search] Failed to enrich book "${book.title}": ${error.message}`);
            return book; // Return original if enrichment fails
          }
        })
      );
      return enrichedResults;
    }
    
    return results;
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
    const metadata = {
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
    if (metadata.genres) {
      logger.info(`[Enrichment] Extracted ${Array.isArray(metadata.genres) ? metadata.genres.length : 1} genre(s): ${Array.isArray(metadata.genres) ? metadata.genres.join(', ') : metadata.genres}`);
    }
    return metadata;
  }

  _mergeBookData(base, enrichment, sourceName) {
    if (!enrichment) return base;
    
    const enriched = { ...base };
    const enrichedFields = [];
    
    // IMPORTANT: Preserve the original title from base - never replace it with enrichment title
    // The original title (e.g., from Amazon) should always be kept
    const originalTitle = enriched.title;
    
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
    
    // Merge genres - always add genres from enrichment sources
    const allGenres = new Set(enriched.genres || []);
    const newGenres = [];
    (enrichment.genres || []).forEach(g => {
      if (g && typeof g === 'string' && g.trim()) {
        const genre = g.trim();
        if (!allGenres.has(genre)) {
          newGenres.push(genre);
          allGenres.add(genre);
        }
      }
    });
    if (allGenres.size > 0) enriched.genres = Array.from(allGenres);
    if (newGenres.length > 0) {
      logger.info(`[Enrichment] Added ${newGenres.length} new genre(s) from ${sourceName}: ${newGenres.join(', ')}`);
    }
    
    // Merge tags - always add tags from enrichment sources
    const allTags = new Set(enriched.tags || []);
    const newTags = [];
    (enrichment.tags || []).forEach(t => {
      if (t && typeof t === 'string' && t.trim()) {
        const tag = t.trim();
        if (!allTags.has(tag)) {
          newTags.push(tag);
          allTags.add(tag);
        }
      }
    });
    if (allTags.size > 0) enriched.tags = Array.from(allTags);
    if (newTags.length > 0) {
      logger.info(`[Enrichment] Added ${newTags.length} new tag(s) from ${sourceName}: ${newTags.join(', ')}`);
    }
    
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
    
    // Ensure original title is preserved
    if (originalTitle && enriched.title !== originalTitle) {
      enriched.title = originalTitle;
      logger.info(`[Enrichment] Preserved original title: "${originalTitle}" (enrichment had: "${enrichment.title}")`);
    }
    
    if (enrichedFields.length > 0) {
      logger.info(`[Enrichment] Enriched with ${sourceName}: ${enrichedFields.join(', ')}`);
    }
    
    return enriched;
  }

  _mergeAllSources(enriched, googleData, olData) {
    // Preserve the original title - it should never be replaced
    const originalTitle = enriched.title;
    
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
    
    // Aggregate genres and tags from all sources - ensure we get genres from enrichment
    const allGenres = new Set();
    const allTags = new Set();
    
    // Start with existing genres from enriched book
    if (enriched.genres) {
      (Array.isArray(enriched.genres) ? enriched.genres : [enriched.genres])
        .forEach(g => {
          if (g && typeof g === 'string' && g.trim()) {
            allGenres.add(g.trim());
          }
        });
    }
    
    // Add genres from all metadata sources
    [enriched._metadataSources.original, enriched._metadataSources.googleBooks, enriched._metadataSources.openLibrary]
      .forEach(source => {
        if (source?.genres) {
          (Array.isArray(source.genres) ? source.genres : [source.genres])
            .forEach(g => {
              if (g && typeof g === 'string' && g.trim()) {
                allGenres.add(g.trim());
              }
            });
        }
        if (source?.tags) {
          (Array.isArray(source.tags) ? source.tags : [source.tags]).forEach(t => t && allTags.add(t));
        }
      });
    
    // Also check googleData and olData directly for genres (they might not be in _metadataSources yet)
    if (googleData?.genres) {
      (Array.isArray(googleData.genres) ? googleData.genres : [googleData.genres])
        .forEach(g => {
          if (g && typeof g === 'string' && g.trim()) {
            allGenres.add(g.trim());
          }
        });
    }
    if (olData?.genres) {
      (Array.isArray(olData.genres) ? olData.genres : [olData.genres])
        .forEach(g => {
          if (g && typeof g === 'string' && g.trim()) {
            allGenres.add(g.trim());
          }
        });
    }
    
    if (allGenres.size > 0) {
      enriched.genres = Array.from(allGenres);
      logger.info(`[Enrichment] Aggregated ${allGenres.size} genre(s) from all sources: ${Array.from(allGenres).join(', ')}`);
    }
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
    
    // Series: prefer OpenLibrary, but don't override if already extracted from title
    if (!enriched.series) {
      enriched.series = enriched._metadataSources.openLibrary?.series || 
                        enriched._metadataSources.googleBooks?.series || 
                        enriched._metadataSources.original?.series || null;
    }
    if (!enriched.seriesNumber) {
      enriched.seriesNumber = enriched._metadataSources.openLibrary?.seriesNumber || 
                              enriched._metadataSources.googleBooks?.seriesNumber || 
                              enriched._metadataSources.original?.seriesNumber || null;
    }
    
    // Rating: prefer Google Books
    enriched.rating = enriched._metadataSources.googleBooks?.rating || 
                      enriched._metadataSources.openLibrary?.rating || 
                      enriched._metadataSources.original?.rating || null;
    
    // ALWAYS preserve the original title - it should never be replaced
    // The original title provided by the user is the source of truth
    if (originalTitle && originalTitle.trim().length > 0) {
      const originalLen = originalTitle.trim().length;
      const enrichedLen = (enriched.title || '').trim().length;
      
      // If original title is substantial (>= 10 chars), always preserve it
      if (originalLen >= 10) {
        enriched.title = originalTitle;
        if (enriched.title !== originalTitle) {
          logger.info(`[Enrichment] Preserved original title in _mergeAllSources: "${originalTitle}" (enriched had: "${enriched.title}")`);
        }
      } else if (enrichedLen > originalLen * 2 && enrichedLen >= 20) {
        logger.info(`[Enrichment] Using enriched title "${enriched.title}" (original "${originalTitle}" was very short)`);
      } else {
        enriched.title = originalTitle;
        logger.info(`[Enrichment] Preserved original title in _mergeAllSources: "${originalTitle}"`);
      }
    }
    
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


