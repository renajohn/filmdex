/**
 * Book Enrichment Service
 * Orchestrates enrichment from multiple data sources (Google Books, OpenLibrary)
 */

import axios, { AxiosResponse } from 'axios';
import logger from '../logger';
import bookApiService from './bookApiService';
import type { FormattedBook } from './bookApiService';
import bookCoverService from './bookCoverService';
import type { CoverOption } from './bookCoverService';
import { normalizeTitle, extractSeriesFromTitle, cleanDescription, detectBookType, isMusicScore } from './utils/bookUtils';

interface BookData {
  isbn?: string | null;
  isbn13?: string | null;
  title?: string | null;
  subtitle?: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  publishedYear?: number | null;
  language?: string | null;
  series?: string | null;
  seriesNumber?: number | null;
  genres?: string[] | string | null;
  tags?: string[] | string | null;
  rating?: number | null;
  coverUrl?: string | null;
  availableCovers?: CoverOption[];
  description?: string | null;
  urls?: Record<string, string> | null;
  pageCount?: number | null;
  asin?: string;
  bookType?: string;
  _metadataSources?: {
    original: MetadataSource | null;
    googleBooks: MetadataSource | null;
    openLibrary: MetadataSource | null;
  };
  _fromAsin?: boolean;
  _needsManualEntry?: boolean;
  [key: string]: unknown;
}

interface MetadataSource {
  title?: string | null;
  description: string | null;
  series: string | null;
  seriesNumber: number | null;
  genres: string[] | string | null;
  tags: string[] | string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  rating?: number | null;
  authors?: string[] | null;
}

interface AmazonScrapedMetadata {
  title: string | null;
  isbn: string | null;
  description: string | null;
}

interface SearchFilters {
  isbn?: string;
  asin?: string;
  amazonUrl?: string;
  author?: string;
  title?: string;
  limit?: number;
  language?: string;
  [key: string]: unknown;
}

interface SearchOptions {
  language?: string;
  maxVolumes?: number;
}

class BookEnrichmentService {
  /**
   * Calculate a metadata richness score for a book
   */
  calculateMetadataScore(book: BookData | null): number {
    if (!book) return 0;

    let score = 0;

    if (book.description) {
      score += Math.min((book.description as string).length / 100, 50);
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
  async enrichWithOpenLibrary(book: BookData): Promise<BookData> {
    if (!book) return book;

    logger.info(`[Enrichment] Enriching "${book.title}" with OpenLibrary`);

    let olBook: FormattedBook | null = null;

    // Try ISBN lookup first
    const isbnsToTry: Array<{ type: string; value: string }> = [];
    if (book.isbn13) isbnsToTry.push({ type: 'ISBN-13', value: book.isbn13 });
    if (book.isbn && book.isbn !== book.isbn13) isbnsToTry.push({ type: 'ISBN', value: book.isbn });

    for (const { type, value } of isbnsToTry) {
      try {
        const results = await bookApiService.searchByIsbn(value);
        if (results?.length > 0) {
          olBook = results[0];
          logger.info(`[Enrichment] Found OpenLibrary match by ${type}`);
          break;
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`[Enrichment] ${type} lookup failed: ${err.message}`);
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
              logger.info(`[Enrichment] Found OpenLibrary match by title`);
              break;
            }
          }
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`[Enrichment] Title search failed: ${err.message}`);
      }
    }

    if (!olBook) {
      logger.info(`[Enrichment] No OpenLibrary match found for "${book.title}"`);
      return book;
    }

    if (olBook.genres && Array.isArray(olBook.genres) && olBook.genres.length > 0) {
      logger.info(`[Enrichment] Found ${olBook.genres.length} genre(s) from OpenLibrary: ${olBook.genres.join(', ')}`);
    } else if (olBook.genres) {
      logger.info(`[Enrichment] Found genre from OpenLibrary: ${olBook.genres}`);
    }
    if (olBook.tags && Array.isArray(olBook.tags) && olBook.tags.length > 0) {
      logger.info(`[Enrichment] Found ${olBook.tags.length} tag(s) from OpenLibrary: ${olBook.tags.join(', ')}`);
    } else if (olBook.tags) {
      logger.info(`[Enrichment] Found tag from OpenLibrary: ${olBook.tags}`);
    }

    return this._mergeBookData(book, olBook as BookData, 'OpenLibrary');
  }

  /**
   * Enrich with Google Books data
   */
  async enrichWithGoogleBooks(book: BookData): Promise<BookData> {
    if (!book) return book;

    logger.info(`[Enrichment] Enriching "${book.title}" with Google Books`);

    let googleBook: FormattedBook | null = null;

    // Try extracting volume ID from existing URL
    if (book.urls?.googleBooks || book.urls?.googleBooksInfo) {
      const googleUrl = book.urls!.googleBooks || book.urls!.googleBooksInfo;
      const volumeIdMatch = googleUrl.match(/[?&]id=([^&]+)/);
      if (volumeIdMatch) {
        try {
          googleBook = await bookApiService.getGoogleBookVolume(volumeIdMatch[1]);
          logger.info(`[Enrichment] Fetched Google Books volume directly`);
        } catch (error: unknown) {
          const err = error as { message: string };
          logger.warn(`[Enrichment] Failed to fetch volume: ${err.message}`);
        }
      }
    }

    // Try title/author search
    if (!googleBook && book.title) {
      const titleParts = book.title.split(/[-\u2013\u2014]/);
      const mainTitle = titleParts[0].trim();

      const searchQueries: string[] = [];
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
                logger.info(`[Enrichment] Found Google Books match by title`);
                break;
              }
            }
            if (googleBook) break;
          }
        } catch (error: unknown) {
          const err = error as { message: string };
          logger.warn(`[Enrichment] Query "${query}" failed: ${err.message}`);
        }
      }
    }

    // Try ISBN search as fallback
    if (!googleBook && (book.isbn || book.isbn13)) {
      try {
        const results = await bookApiService.searchGoogleBooksByIsbn(book.isbn13 || book.isbn!);
        if (results?.length > 0) {
          googleBook = results[0];
          logger.info(`[Enrichment] Found Google Books match by ISBN`);
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`[Enrichment] ISBN search failed: ${err.message}`);
      }
    }

    if (!googleBook) {
      logger.info(`[Enrichment] No Google Books match found for "${book.title}"`);
      return book;
    }

    if (googleBook.genres && Array.isArray(googleBook.genres) && googleBook.genres.length > 0) {
      logger.info(`[Enrichment] Found ${googleBook.genres.length} genre(s) from Google Books: ${googleBook.genres.join(', ')}`);
    } else if (googleBook.genres) {
      logger.info(`[Enrichment] Found genre from Google Books: ${googleBook.genres}`);
    }
    if (googleBook.tags && Array.isArray(googleBook.tags) && googleBook.tags.length > 0) {
      logger.info(`[Enrichment] Found ${googleBook.tags.length} tag(s) from Google Books: ${googleBook.tags.join(', ')}`);
    } else if (googleBook.tags) {
      logger.info(`[Enrichment] Found tag from Google Books: ${googleBook.tags}`);
    }

    return this._mergeBookData(book, googleBook as BookData, 'Google Books');
  }

  /**
   * Comprehensive enrichment from all sources
   */
  async enrichBook(bookData: BookData): Promise<BookData> {
    if (!bookData) return bookData;

    logger.info(`[Enrichment] Starting comprehensive enrichment for "${bookData.title}"`);

    const originalTitle = bookData.title;

    let enriched: BookData = { ...bookData };

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

          const shouldScrapeTitle = !enriched.title || (enriched.title as string).trim().length < 10;
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
              if (scrapedMetadata.title && shouldScrapeTitle) {
                enriched.title = scrapedMetadata.title;
                logger.info(`[Enrichment] Using scraped title from Amazon: "${scrapedMetadata.title}" (original was: "${originalTitle || 'none'}")`);
              } else if (scrapedMetadata.title && !shouldScrapeTitle) {
                logger.info(`[Enrichment] Preserving original title "${originalTitle}" (scraped title "${scrapedMetadata.title}" ignored)`);
              }
              if (scrapedMetadata.description) {
                const currentLen = ((enriched.description as string) || '').length;
                const newLen = scrapedMetadata.description.length;
                if (!enriched.description || newLen > currentLen * 1.2) {
                  enriched.description = scrapedMetadata.description;
                  logger.info(`[Enrichment] Using scraped description from Amazon (${newLen} chars)`);
                }
              }
            } catch (error: unknown) {
              const err = error as { message: string };
              logger.warn(`[Enrichment] Failed to scrape metadata from Amazon: ${err.message}`);
            }
          }
        }
      }
    }

    enriched._metadataSources = {
      original: {
        title: originalTitle || null,
        description: (bookData.description as string) || null,
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

    const isFromGoogleBooks = bookData.urls?.googleBooks || bookData.urls?.googleBooksInfo;
    const hasCompleteData = isFromGoogleBooks &&
      (bookData.description as string)?.length > 50 &&
      bookData.authors && bookData.authors.length > 0 &&
      bookData.publisher &&
      bookData.pageCount;

    const [googleResult, olResult] = await Promise.allSettled([
      hasCompleteData ? Promise.resolve(null) : this._performGoogleBooksEnrichment(bookData),
      this._performOpenLibraryEnrichment(bookData)
    ]);

    let googleData: BookData | null = null;
    if (googleResult.status === 'fulfilled' && googleResult.value) {
      googleData = googleResult.value;
      enriched._metadataSources!.googleBooks = this._extractMetadata(googleData);
    } else if (hasCompleteData) {
      enriched._metadataSources!.googleBooks = this._extractMetadata(bookData);
    }

    let olData: BookData | null = null;
    if (olResult.status === 'fulfilled' && olResult.value) {
      olData = olResult.value;
      enriched._metadataSources!.openLibrary = this._extractMetadata(olData);
    }

    enriched = this._mergeAllSources(enriched, googleData, olData);

    if (originalTitle && (originalTitle as string).trim().length > 0) {
      const originalLen = (originalTitle as string).trim().length;
      const enrichedLen = ((enriched.title as string) || '').trim().length;

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

    const titleForExtraction = originalTitle || enriched.title;
    if (!enriched.series && titleForExtraction) {
      const extracted = extractSeriesFromTitle(titleForExtraction as string);
      if (extracted) {
        enriched.series = extracted.series;
        enriched.seriesNumber = extracted.seriesNumber;
        logger.info(`[Enrichment] Extracted series from title "${titleForExtraction}": "${extracted.series}" #${extracted.seriesNumber}`);
      }
    }

    if (originalTitle && (originalTitle as string).trim().length >= 10 && enriched.title !== originalTitle) {
      enriched.title = originalTitle;
      logger.info(`[Enrichment] Final preservation of original title after series extraction: "${originalTitle}"`);
    }

    if (enriched.availableCovers && enriched.availableCovers.length > 0) {
      const bestCover = await bookCoverService.findBestCover(enriched.availableCovers);
      if (bestCover) {
        enriched.coverUrl = bestCover;
        logger.info(`[Enrichment] Selected best cover: ${bestCover}`);
      }
    }

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
   * Try to scrape title and ISBN from Amazon product page
   */
  async _scrapeAmazonMetadata(amazonUrl: string): Promise<AmazonScrapedMetadata> {
    try {
      logger.info(`[Amazon] Attempting to scrape metadata from: ${amazonUrl}`);

      const response: AxiosResponse<string> = await axios.get(amazonUrl, {
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

      const html: string = response.data;
      const metadata: AmazonScrapedMetadata = { title: null, isbn: null, description: null };

      const titlePatterns: RegExp[] = [
        /<span[^>]*id=["']productTitle["'][^>]*>([^<]+)<\/span>/i,
        /<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)<\/h1>/i,
        /<h1[^>]*id=["']title["'][^>]*>([^<]+)<\/h1>/i,
        /data-asin-title=["']([^"']+)["']/i,
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
        /<title[^>]*>([^<]+)<\/title>/i,
        /"@type"\s*:\s*"Product"[^}]*"name"\s*:\s*"([^"]+)"/i
      ];

      const invalidTitlePatterns: RegExp[] = [
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

          title = title
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ');

          if (invalidTitlePatterns.some(invalid => invalid.test(title))) {
            continue;
          }

          title = title.replace(/\s*:\s*Amazon\.(fr|com|co\.uk|de|it|es)[^:]*$/i, '');
          title = title.replace(/\s*-\s*Amazon[^:]*$/i, '');
          title = title.replace(/\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$/, '');

          if (title.length >= 5 && /[a-zA-Z]/.test(title)) {
            metadata.title = title;
            logger.info(`[Amazon] Found title: "${title}"`);
            break;
          }
        }
      }

      const isbn13Patterns: RegExp[] = [
        /ISBN-13\s*[:\s]*<\/span>\s*<span[^>]*>\s*([\d-]{10,17})/i,
        /ISBN-13\s*[:\s]*([\d-]{10,17})/i,
        /"isbn13"\s*:\s*"(\d{13})"/i,
        /"isbn"\s*:\s*"(\d{13})"/i,
        /ISBN-13[^<]*<[^>]*>[^<]*<[^>]*>\s*([\d-]{10,17})/i,
        />(\s*978[\d-]{10,14})</i,
        />(\s*979[\d-]{10,14})</i,
        /data-isbn[^"]*"(\d{13})"/i,
        /ISBN-13[^0-9]*(97[89][\d-]{10,14})/i,
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

      if (!metadata.isbn) {
        const isbn10Patterns: RegExp[] = [
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

      if (!metadata.isbn) {
        const ismnPatterns: RegExp[] = [
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

      // Extract description/summary from Amazon page
      let descriptionText: string | null = null;

      const bookDescMatch = html.match(/<div[^>]*data-feature-name=["']bookDescription["'][^>]*>([\s\S]{100,}?)<\/div>/i);
      if (bookDescMatch && bookDescMatch[1]) {
        let extracted = cleanDescription(bookDescMatch[1]);
        if (extracted && extracted.length >= 50 && !this._isInvalidDescription(extracted)) {
          descriptionText = extracted;
          logger.info(`[Amazon] Found description from data-feature-name="bookDescription" (${extracted.length} chars)`);
        }
      }

      if (!descriptionText) {
        const descriptionPatterns: RegExp[] = [
          /<div[^>]*id=["']productDescription["'][^>]*>([\s\S]{100,}?)<\/div>/i,
          /<div[^>]*id=["']productDescription_feature_div["'][^>]*>([\s\S]{100,}?)<\/div>/i,
          /<div[^>]*class=["'][^"']*a-expander-content[^"']*["'][^>]*>([\s\S]{100,}?)<\/div>/i,
          /<div[^>]*class=["'][^"']*productDescriptionWrapper[^"']*["'][^>]*>([\s\S]{100,}?)<\/div>/i,
          /<h2[^>]*>[\s\S]*?About this item[\s\S]*?<\/h2>[\s\S]*?<div[^>]*>([\s\S]{100,}?)<\/div>/i,
          /<span[^>]*data-a-expander-content[^>]*>([\s\S]{100,}?)<\/span>/i,
          /<div[^>]*id=["']editorialReviews_feature_div["'][^>]*>([\s\S]{100,}?)<\/div>/i,
          /<div[^>]*id=["']feature-bullets["'][^>]*>[\s\S]*?<ul[^>]*class=["'][^"']*a-unordered-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i,
          /"description"\s*:\s*"([^"]{100,})"/i
        ];

        for (const pattern of descriptionPatterns) {
          const matches = html.match(pattern);
          if (matches && matches[1]) {
            let extracted = cleanDescription(matches[1]);

            if (extracted && extracted.length >= 50 && !this._isInvalidDescription(extracted)) {
              descriptionText = extracted;
              logger.info(`[Amazon] Found description (${extracted.length} chars)`);
              break;
            }
          }
        }
      }

      if (!descriptionText) {
        const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        if (metaDescMatch && metaDescMatch[1]) {
          let extracted = cleanDescription(metaDescMatch[1]);
          if (extracted && extracted.length >= 100 && !this._isInvalidDescription(extracted)) {
            descriptionText = extracted;
            logger.info(`[Amazon] Found description from meta tag (${extracted.length} chars)`);
          }
        }
      }

      if (!descriptionText) {
        const featureBulletsMatch = html.match(/<div[^>]*id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
        if (featureBulletsMatch) {
          const bulletsSection = featureBulletsMatch[1];
          const bulletPattern = /<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
          const bullets: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = bulletPattern.exec(bulletsSection)) !== null) {
            if (match[1]) {
              const cleaned = cleanDescription(match[1]);
              if (cleaned && cleaned.length >= 20 && !this._isInvalidDescription(cleaned)) {
                bullets.push(cleaned);
              }
            }
          }
          if (bullets.length > 0) {
            descriptionText = bullets.join('\n\n');
            logger.info(`[Amazon] Found description from feature bullets (${descriptionText.length} chars)`);
          }
        }
      }

      if (!descriptionText) {
        const productDescMatch = html.match(/<div[^>]*id=["']productDescription["'][^>]*>([\s\S]{100,})<\/div>/i);
        if (productDescMatch) {
          const cleaned = cleanDescription(productDescMatch[1]);
          if (cleaned && cleaned.length >= 50 && !this._isInvalidDescription(cleaned)) {
            descriptionText = cleaned;
            logger.info(`[Amazon] Found description from productDescription (${descriptionText.length} chars)`);
          }
        }
      }

      if (!descriptionText) {
        const expanderPattern = /<div[^>]*class=["'][^"']*a-expander-content[^"']*["'][^>]*>([\s\S]{100,}?)<\/div>/gi;
        let match: RegExpExecArray | null;
        while ((match = expanderPattern.exec(html)) !== null) {
          if (match[1]) {
            const cleaned = cleanDescription(match[1]);
            const hasNarrativeText = cleaned && cleaned.length >= 100 &&
                                     (cleaned.match(/[.!?]\s+[A-Z]/) || cleaned.split(/\s+/).length > 20) &&
                                     !this._isInvalidDescription(cleaned);
            if (hasNarrativeText) {
              descriptionText = cleaned;
              logger.info(`[Amazon] Found description from a-expander-content (${descriptionText!.length} chars)`);
              break;
            }
          }
        }
      }

      if (!descriptionText) {
        const textBlockPattern = /(?:<p[^>]*>|<div[^>]*>|<span[^>]*>)([A-Z\u00C0-\u00FF][^<]{100,}?)(?:<\/p>|<\/div>|<\/span>)/gi;
        const textBlocks: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = textBlockPattern.exec(html)) !== null) {
          if (match[1]) {
            const cleaned = cleanDescription(match[1]);
            if (cleaned && cleaned.length >= 100 &&
                cleaned.match(/[.!?]\s+[A-Z]/) &&
                cleaned.split(/\s+/).length > 15 &&
                !this._isInvalidDescription(cleaned)) {
              textBlocks.push(cleaned);
            }
          }
        }
        if (textBlocks.length > 0) {
          descriptionText = textBlocks.reduce((a, b) => a.length > b.length ? a : b);
          logger.info(`[Amazon] Found description from text blocks (${descriptionText.length} chars)`);
        }
      }

      if (descriptionText) {
        metadata.description = descriptionText;
      }

      if (!metadata.title && !metadata.isbn && !metadata.description) {
        logger.info(`[Amazon] No title, ISBN/ISMN, or description found on page`);
      }

      return metadata;
    } catch (error: unknown) {
      const err = error as { message: string };
      logger.warn(`[Amazon] Failed to scrape page: ${err.message}`);
      return { title: null, isbn: null, description: null };
    }
  }

  /**
   * Try to scrape ISBN from Amazon product page (backward compatibility)
   */
  async _scrapeAmazonIsbn(amazonUrl: string): Promise<string | null> {
    const metadata = await this._scrapeAmazonMetadata(amazonUrl);
    return metadata.isbn;
  }

  async searchExternalBooks(query: string, filters: SearchFilters = {}): Promise<BookData[]> {
    const { isbn, asin, amazonUrl, author, title, limit = 20, language = 'any' } = filters;

    let normalizedTitle = title?.trim() || undefined;
    const normalizedAuthor = author?.trim() || undefined;
    const normalizedIsbn = isbn?.trim() || undefined;

    let amazonCovers: CoverOption[] = [];
    let scrapedAmazonTitle: string | null = null;
    let scrapedAmazonDescription: string | null = null;
    if (asin) {
      logger.info(`[Search] Amazon ASIN detected: ${asin}`);
      amazonCovers = bookCoverService.generateAmazonCoversFromAsin(asin);

      if (amazonUrl) {
        const isbnMatch = amazonUrl.match(/ISBN[%3A:]+(\d{10,13}|\d{3}[-\s]?\d[-\s]?\d{3,4}[-\s]?\d{4,5}[-\s]?\d)/i);
        if (isbnMatch) {
          const extractedIsbn = isbnMatch[1].replace(/[-\s]/g, '');
          logger.info(`[Search] Extracted ISBN from Amazon URL params: ${extractedIsbn}`);
          filters.isbn = extractedIsbn;
        } else {
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
            } else if (scrapedMetadata.title && scrapedMetadata.title.trim().length >= 5) {
              scrapedAmazonTitle = scrapedMetadata.title;
              filters.title = scrapedMetadata.title;
              normalizedTitle = scrapedMetadata.title;
              logger.info(`[Search] Scraped title from Amazon (short): "${scrapedAmazonTitle}"`);
            }
            if (scrapedMetadata.description) {
              scrapedAmazonDescription = scrapedMetadata.description;
              logger.info(`[Search] Scraped description from Amazon (${scrapedAmazonDescription.length} chars)`);
            }
          } catch (error: unknown) {
            const err = error as { message: string };
            logger.warn(`[Search] Failed to scrape Amazon metadata: ${err.message}`);
          }
        }
      }
    }

    let isbnToSearch = filters.isbn?.trim() || normalizedIsbn;
    if (!isbnToSearch && query) {
      const cleanQuery = query.replace(/[-\s]/g, '');
      if (/^\d{10}$/.test(cleanQuery) || /^\d{13}$/.test(cleanQuery)) {
        isbnToSearch = query;
      }
    }

    const addAmazonCoversToResults = (results: BookData[], amazonTitleToUse: string | null = null, amazonDescriptionToUse: string | null = null): BookData[] => {
      if (amazonCovers.length === 0 || !results?.length) return results;
      const bestAmazonCover = amazonCovers[0]?.url;
      return results.map(book => {
        const titleToUse = (amazonTitleToUse && amazonTitleToUse.trim().length >= 10)
          ? amazonTitleToUse
          : book.title;

        if (amazonTitleToUse && titleToUse !== book.title) {
          logger.info(`[Search] Replacing API title "${book.title}" with Amazon title "${amazonTitleToUse}"`);
        }

        let descriptionToUse = book.description;
        if (amazonDescriptionToUse) {
          const currentLen = ((book.description as string) || '').length;
          const amazonLen = amazonDescriptionToUse.length;
          if (!book.description || amazonLen > currentLen * 1.2) {
            descriptionToUse = amazonDescriptionToUse;
            logger.info(`[Search] Using Amazon description (${amazonLen} chars)`);
          }
        }

        return {
          ...book,
          title: titleToUse,
          description: descriptionToUse,
          asin: asin,
          coverUrl: bestAmazonCover || book.coverUrl,
          availableCovers: [...amazonCovers, ...(book.availableCovers || [])],
          urls: { ...book.urls, amazon: amazonUrl } as Record<string, string>
        };
      });
    };

    // ISBN search
    if (isbnToSearch) {
      try {
        const googleResults = await bookApiService.searchGoogleBooksByIsbn(isbnToSearch);
        if (googleResults?.length > 0) {
          return addAmazonCoversToResults(googleResults as BookData[], scrapedAmazonTitle, scrapedAmazonDescription);
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`Google Books ISBN search failed: ${err.message}`);
      }

      try {
        const results = await bookApiService.searchByIsbn(isbnToSearch);
        const enrichedResults = addAmazonCoversToResults(results as BookData[], scrapedAmazonTitle, scrapedAmazonDescription);

        if (enrichedResults.length === 0 && (amazonCovers.length > 0 || scrapedAmazonTitle)) {
          logger.info(`[Search] No book found by ISBN but Amazon metadata available, returning placeholder`);
          const isbnVal = isbnToSearch;
          const bookType = isbnVal ? detectBookType(isbnVal, []) : 'book';
          return [{
            title: scrapedAmazonTitle || normalizedTitle || 'Unknown Title (from Amazon)',
            authors: normalizedAuthor ? [normalizedAuthor] : [],
            isbn: isbnVal || undefined,
            isbn13: isbnVal || undefined,
            asin: asin,
            coverUrl: amazonCovers[0]?.url,
            availableCovers: amazonCovers,
            description: scrapedAmazonDescription || undefined,
            urls: amazonUrl ? { amazon: amazonUrl } : {},
            bookType: bookType,
            _fromAsin: true,
            _needsManualEntry: true
          }];
        }

        return enrichedResults;
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.error(`Both ISBN searches failed: ${err.message}`);
        if (amazonCovers.length > 0 || scrapedAmazonTitle) {
          logger.info(`[Search] No book found but ASIN available, returning placeholder`);
          const isbnVal = isbnToSearch;
          const bookType = isbnVal ? detectBookType(isbnVal, []) : 'book';
          return [{
            title: scrapedAmazonTitle || normalizedTitle || 'Unknown Title (from Amazon)',
            authors: normalizedAuthor ? [normalizedAuthor] : [],
            isbn: isbnVal || undefined,
            isbn13: isbnVal || undefined,
            asin: asin,
            coverUrl: amazonCovers[0]?.url,
            availableCovers: amazonCovers,
            description: scrapedAmazonDescription || undefined,
            urls: amazonUrl ? { amazon: amazonUrl } : {},
            bookType: bookType,
            _fromAsin: true,
            _needsManualEntry: true
          }];
        }
        return [];
      }
    }

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

    if (!searchQuery && amazonCovers.length > 0) {
      logger.info(`[Search] No search query but ASIN available, returning placeholder`);
      return [{
        title: 'Unknown Title (from Amazon)',
        authors: [],
        asin: asin,
        coverUrl: amazonCovers[0]?.url,
        availableCovers: amazonCovers,
        urls: { amazon: amazonUrl! },
        _fromAsin: true,
        _needsManualEntry: true
      }];
    }

    let results: BookData[] = [];
    try {
      const googleResults = await bookApiService.searchGoogleBooks(
        searchQuery, limit, { title: finalTitle, author: finalAuthor, language }
      );
      if (googleResults?.length > 0) {
        results = addAmazonCoversToResults(googleResults as BookData[], scrapedAmazonTitle, scrapedAmazonDescription);
      }
    } catch (error: unknown) {
      const err = error as { message: string };
      logger.warn(`Google Books search failed: ${err.message}`);
    }

    if (results.length === 0) {
      try {
        const olResults = await bookApiService.searchOpenLibrary(searchQuery, limit, language);
        if (olResults?.length > 0) {
          results = addAmazonCoversToResults(olResults as BookData[], scrapedAmazonTitle, scrapedAmazonDescription);
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.error(`OpenLibrary search failed: ${err.message}`);
      }
    }

    if (amazonUrl && results.length > 0) {
      logger.info(`[Search] Enriching ${results.length} result(s) from Amazon search`);

      let amazonTitle = scrapedAmazonTitle;
      let amazonDescription = scrapedAmazonDescription;

      if ((!amazonTitle || !amazonDescription) && amazonUrl) {
        try {
          const scrapedMetadata = await this._scrapeAmazonMetadata(amazonUrl);
          if (scrapedMetadata.title && scrapedMetadata.title.trim().length >= 10) {
            amazonTitle = scrapedMetadata.title;
            logger.info(`[Search] Scraped title from Amazon (late fallback): "${amazonTitle}"`);
          }
          if (scrapedMetadata.description) {
            amazonDescription = scrapedMetadata.description;
            logger.info(`[Search] Scraped description from Amazon (late fallback, ${amazonDescription.length} chars)`);
          }
        } catch (error: unknown) {
          const err = error as { message: string };
          logger.warn(`[Search] Failed to scrape metadata from Amazon: ${err.message}`);
        }
      }

      if (!amazonTitle && normalizedTitle && normalizedTitle.trim().length >= 10) {
        amazonTitle = normalizedTitle;
      }

      if (amazonTitle) {
        logger.info(`[Search] Using Amazon title for enrichment: "${amazonTitle}"`);
      }

      const enrichedResults = await Promise.all(
        results.map(async (book) => {
          try {
            let titleToUse = book.title;

            if (amazonTitle && amazonTitle.trim().length >= 10) {
              titleToUse = amazonTitle;
              logger.info(`[Search] Using Amazon-scraped title: "${amazonTitle}"`);
            } else if (normalizedTitle && normalizedTitle.trim().length >= 10) {
              titleToUse = normalizedTitle;
              logger.info(`[Search] Using user-provided title: "${normalizedTitle}"`);
            } else if (amazonTitle && amazonTitle.trim().length > ((book.title as string) || '').trim().length) {
              titleToUse = amazonTitle;
              logger.info(`[Search] Using Amazon title (longer than API title): "${amazonTitle}"`);
            }

            let descriptionToUse = book.description;
            if (amazonDescription) {
              const currentLen = ((book.description as string) || '').length;
              const amazonLen = amazonDescription.length;
              if (!book.description || amazonLen > currentLen * 1.2) {
                descriptionToUse = amazonDescription;
                logger.info(`[Search] Using Amazon description (${amazonLen} chars)`);
              }
            }

            const bookWithAmazon: BookData = {
              ...book,
              title: titleToUse,
              description: descriptionToUse,
              urls: { ...book.urls, amazon: amazonUrl } as Record<string, string>
            };

            logger.info(`[Search] Enriching book with title: "${titleToUse}" (original API title was: "${book.title}")`);
            const enriched = await this.enrichBook(bookWithAmazon);

            const titleToPreserve = amazonTitle || normalizedTitle;
            if (titleToPreserve && titleToPreserve.trim().length >= 10) {
              if (enriched.title !== titleToPreserve) {
                enriched.title = titleToPreserve;
                logger.info(`[Search] Enforced preservation of title: "${titleToPreserve}" (enriched had: "${enriched.title}")`);
              } else {
                logger.info(`[Search] Title already preserved: "${titleToPreserve}"`);
              }
            } else if (titleToUse && (titleToUse as string).trim().length >= 10 && enriched.title !== titleToUse) {
              enriched.title = titleToUse;
              logger.info(`[Search] Preserved title after enrichment: "${titleToUse}" (enriched had: "${enriched.title}")`);
            }

            if (amazonTitle && enriched.title !== amazonTitle) {
              logger.warn(`[Search] Title mismatch! Amazon title: "${amazonTitle}", Enriched title: "${enriched.title}" - fixing...`);
              enriched.title = amazonTitle;
            }

            if (amazonDescription) {
              const currentLen = ((enriched.description as string) || '').length;
              const amazonLen = amazonDescription.length;
              if (!enriched.description || amazonLen > currentLen * 1.2) {
                enriched.description = amazonDescription;
                logger.info(`[Search] Using Amazon description after enrichment (${amazonLen} chars)`);
              }
            }

            return enriched;
          } catch (error: unknown) {
            const err = error as { message: string };
            logger.warn(`[Search] Failed to enrich book "${book.title}": ${err.message}`);
            return book;
          }
        })
      );
      return enrichedResults;
    }

    if (results.length === 0 && (amazonCovers.length > 0 || scrapedAmazonTitle)) {
      logger.info(`[Search] No API results but Amazon metadata available, returning placeholder`);
      const placeholderTitle = scrapedAmazonTitle || normalizedTitle || 'Unknown Title (from Amazon)';
      const isbnVal = normalizedIsbn || filters.isbn;
      const bookType = isbnVal ? detectBookType(isbnVal, []) : 'book';
      return [{
        title: placeholderTitle,
        authors: normalizedAuthor ? [normalizedAuthor] : [],
        isbn: isbnVal || undefined,
        isbn13: isbnVal || undefined,
        asin: asin,
        coverUrl: amazonCovers[0]?.url,
        availableCovers: amazonCovers,
        description: scrapedAmazonDescription || undefined,
        urls: amazonUrl ? { amazon: amazonUrl } : {},
        bookType: bookType,
        _fromAsin: true,
        _needsManualEntry: true
      }];
    }

    return results;
  }

  /**
   * Search for series volumes
   */
  async searchSeriesVolumes(seriesName: string, options: SearchOptions = {}): Promise<BookData[]> {
    const { language = 'any', maxVolumes = 100 } = options;
    const volumes: BookData[] = [];
    const seenVolumes = new Set<string | number>();
    const seenIsbns = new Set<string>();

    logger.info(`[SeriesSearch] Searching for volumes of: "${seriesName}"`);

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
          if (this._belongsToSeries(result as BookData, seriesName)) {
            const seriesNumber = (result as BookData).seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            const isbn = result.isbn13 || result.isbn;

            if (isbn && seenIsbns.has(isbn)) continue;
            const identifier = seriesNumber || isbn;
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              if (isbn) seenIsbns.add(isbn);
              volumes.push({ ...result, series: seriesName, seriesNumber: seriesNumber || null } as BookData);
            }
          }
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`[SeriesSearch] Query "${query}" failed: ${err.message}`);
      }
    }

    for (const query of [seriesName, `${seriesName} tome`, `${seriesName} volume`]) {
      try {
        const results = await bookApiService.searchOpenLibrary(query, Math.max(maxVolumes, 40), 'any');
        for (const result of results) {
          if (this._belongsToSeries(result as BookData, seriesName)) {
            const seriesNumber = (result as BookData).seriesNumber || extractSeriesFromTitle(result.title)?.seriesNumber;
            const isbn = result.isbn13 || result.isbn;

            if (isbn && seenIsbns.has(isbn)) continue;
            const identifier = seriesNumber || isbn;
            if (identifier && !seenVolumes.has(identifier)) {
              seenVolumes.add(identifier);
              if (isbn) seenIsbns.add(isbn);
              volumes.push({ ...result, series: seriesName, seriesNumber: seriesNumber || null } as BookData);
            }
          }
        }
      } catch (error: unknown) {
        const err = error as { message: string };
        logger.warn(`[SeriesSearch] OpenLibrary query failed: ${err.message}`);
      }
    }

    volumes.sort((a, b) => {
      const numA = a.seriesNumber || 9999;
      const numB = b.seriesNumber || 9999;
      if (numA === 9999 && numB === 9999) return ((a.title as string) || '').localeCompare((b.title as string) || '');
      return numA - numB;
    });

    logger.info(`[SeriesSearch] Found ${volumes.length} volumes for "${seriesName}"`);
    return volumes;
  }

  // ============================================
  // Private helpers
  // ============================================

  private async _performGoogleBooksEnrichment(bookData: BookData): Promise<BookData | null> {
    try {
      return await this.enrichWithGoogleBooks({ ...bookData });
    } catch (error: unknown) {
      const err = error as { message: string };
      logger.warn(`[Enrichment] Google Books enrichment failed: ${err.message}`);
      return null;
    }
  }

  private async _performOpenLibraryEnrichment(bookData: BookData): Promise<BookData | null> {
    try {
      return await this.enrichWithOpenLibrary({ ...bookData });
    } catch (error: unknown) {
      const err = error as { message: string };
      logger.warn(`[Enrichment] OpenLibrary enrichment failed: ${err.message}`);
      return null;
    }
  }

  private _extractMetadata(book: BookData | null): MetadataSource | null {
    if (!book) return null;
    const metadata: MetadataSource = {
      description: (book.description as string) || null,
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

  private _mergeBookData(base: BookData, enrichment: BookData, sourceName: string): BookData {
    if (!enrichment) return base;

    const enriched: BookData = { ...base };
    const enrichedFields: string[] = [];

    const originalTitle = enriched.title;

    if (enrichment.description) {
      const currentLen = ((enriched.description as string) || '').length;
      const newLen = (enrichment.description as string).length;
      if (!enriched.description || newLen > currentLen * 1.2) {
        enriched.description = enrichment.description;
        enrichedFields.push(`description (${newLen} chars)`);
      }
    }

    if (enrichment.authors && (enrichment.authors as string[]).length > 0 && !enriched.authors?.length) {
      enriched.authors = enrichment.authors;
      enrichedFields.push(`authors`);
    }

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

    const allGenres = new Set<string>(((enriched.genres || []) as string[]));
    const newGenres: string[] = [];
    ((enrichment.genres || []) as string[]).forEach(g => {
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

    const allTags = new Set<string>(((enriched.tags || []) as string[]));
    const newTags: string[] = [];
    ((enrichment.tags || []) as string[]).forEach(t => {
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

    if (!enriched.availableCovers) enriched.availableCovers = [];
    if (enrichment.availableCovers) {
      enrichment.availableCovers.forEach(cover => {
        if (!enriched.availableCovers!.some(c => c.url === cover.url)) {
          enriched.availableCovers!.push(cover);
        }
      });
    }

    if (!enriched.coverUrl && enrichment.coverUrl) {
      enriched.coverUrl = enrichment.coverUrl;
      enrichedFields.push('coverUrl');
    }

    if (!enriched.urls) enriched.urls = {};
    if (enrichment.urls) enriched.urls = { ...enriched.urls, ...enrichment.urls };

    if (originalTitle && enriched.title !== originalTitle) {
      enriched.title = originalTitle;
      logger.info(`[Enrichment] Preserved original title: "${originalTitle}" (enrichment had: "${enrichment.title}")`);
    }

    if (enrichedFields.length > 0) {
      logger.info(`[Enrichment] Enriched with ${sourceName}: ${enrichedFields.join(', ')}`);
    }

    return enriched;
  }

  private _mergeAllSources(enriched: BookData, googleData: BookData | null, olData: BookData | null): BookData {
    const originalTitle = enriched.title;

    if (googleData) {
      enriched = this._mergeBookData(enriched, googleData, 'Google Books');
    }

    if (olData) {
      if (!enriched.availableCovers) enriched.availableCovers = [];
      if (olData.availableCovers) {
        olData.availableCovers.forEach(cover => {
          if (!enriched.availableCovers!.some(c => c.url === cover.url)) {
            enriched.availableCovers!.push(cover);
          }
        });
      }
      if (olData.urls) {
        if (!enriched.urls) enriched.urls = {};
        enriched.urls = { ...enriched.urls, ...olData.urls };
      }
    }

    const allGenres = new Set<string>();
    const allTags = new Set<string>();

    if (enriched.genres) {
      (Array.isArray(enriched.genres) ? enriched.genres : [enriched.genres as string])
        .forEach(g => {
          if (g && typeof g === 'string' && g.trim()) {
            allGenres.add(g.trim());
          }
        });
    }

    [enriched._metadataSources?.original, enriched._metadataSources?.googleBooks, enriched._metadataSources?.openLibrary]
      .forEach(source => {
        if (source?.genres) {
          (Array.isArray(source.genres) ? source.genres : [source.genres as string])
            .forEach(g => {
              if (g && typeof g === 'string' && g.trim()) {
                allGenres.add(g.trim());
              }
            });
        }
        if (source?.tags) {
          (Array.isArray(source.tags) ? source.tags : [source.tags as string]).forEach(t => t && allTags.add(t));
        }
      });

    if (googleData?.genres) {
      (Array.isArray(googleData.genres) ? googleData.genres : [googleData.genres as string])
        .forEach(g => {
          if (g && typeof g === 'string' && g.trim()) {
            allGenres.add(g.trim());
          }
        });
    }
    if (olData?.genres) {
      (Array.isArray(olData.genres) ? olData.genres : [olData.genres as string])
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

    const descriptions = [
      enriched._metadataSources?.googleBooks?.description,
      enriched._metadataSources?.openLibrary?.description,
      enriched._metadataSources?.original?.description
    ].filter((d): d is string => !!d);
    if (descriptions.length > 0) {
      enriched.description = descriptions.reduce((a, b) => a.length > b.length ? a : b);
    }

    if (!enriched.series) {
      enriched.series = enriched._metadataSources?.openLibrary?.series ||
                        enriched._metadataSources?.googleBooks?.series ||
                        enriched._metadataSources?.original?.series || null;
    }
    if (!enriched.seriesNumber) {
      enriched.seriesNumber = enriched._metadataSources?.openLibrary?.seriesNumber ||
                              enriched._metadataSources?.googleBooks?.seriesNumber ||
                              enriched._metadataSources?.original?.seriesNumber || null;
    }

    enriched.rating = enriched._metadataSources?.googleBooks?.rating ||
                      enriched._metadataSources?.openLibrary?.rating ||
                      enriched._metadataSources?.original?.rating || null;

    if (originalTitle && (originalTitle as string).trim().length > 0) {
      const originalLen = (originalTitle as string).trim().length;
      const enrichedLen = ((enriched.title as string) || '').trim().length;

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

  private _isInvalidDescription(text: string | null): boolean {
    if (!text || typeof text !== 'string') return true;

    const lowerText = text.toLowerCase();

    const isPageTitle = text.match(/Amazon\.(fr|com|co\.uk|de|it|es)[:\s]*Books/i) ||
                        text.match(/^[^:]+:\s*[^:]+:\s*[^:]+:\s*Amazon/i) ||
                        (text.length < 200 && text.match(/:\s*[A-Z][a-z]+\s*,\s*[A-Z]/));

    const isReturnPolicy = lowerText.includes('go to your orders') ||
                           lowerText.includes('start the return') ||
                           lowerText.includes('select the ship method') ||
                           lowerText.includes('ship it') ||
                           lowerText.includes('return this item') ||
                           lowerText.includes('free returns') ||
                           lowerText.includes('return a product') ||
                           lowerText.includes('request the return') ||
                           lowerText.includes('return policy') ||
                           lowerText.includes('delivery cost') ||
                           lowerText.includes('delivery date') ||
                           lowerText.includes('order total') ||
                           lowerText.includes('checkout') ||
                           lowerText.includes('add to basket') ||
                           lowerText.includes('add to cart') ||
                           lowerText.includes('buy now') ||
                           lowerText.includes('secure transaction') ||
                           lowerText.includes('payment security');

    const isNavigationText = lowerText.includes('skip to') ||
                             lowerText.includes('keyboard shortcuts') ||
                             lowerText.includes('search alt') ||
                             lowerText.includes('basket shift') ||
                             lowerText.includes('home shift') ||
                             lowerText.includes('orders shift');

    const isActionText = text.length < 100 &&
                         !!text.match(/^(Voir|See|View|Acheter|Buy|Read more|Add to|Select|Go to)/i);

    return !!(isPageTitle || isReturnPolicy || isNavigationText || isActionText);
  }

  private _titlesMatch(title1: string, title2: string): boolean {
    if (!title1 || !title2) return false;

    if (title1 === title2) return true;
    if (title1.includes(title2) || title2.includes(title1)) return true;

    const words1 = title1.split(/\s+/).filter(w => w.length > 2);
    const words2 = title2.split(/\s+/).filter(w => w.length > 2);
    const common = words1.filter(w => words2.some(w2 => w.includes(w2) || w2.includes(w)));

    return common.length >= Math.min(2, Math.min(words1.length, words2.length));
  }

  private _belongsToSeries(result: BookData, targetSeries: string): boolean {
    const resultSeries = result.series || extractSeriesFromTitle(result.title as string)?.series;
    if (!resultSeries) return false;

    const normalize = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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

export default new BookEnrichmentService();
