import axios, { AxiosResponse } from 'axios';
import logger from '../logger';
import { isbn13ToIsbn10 } from './utils/bookUtils';

export interface CoverOption {
  source: string;
  url: string;
  type: string;
  size?: string;
  priority?: number;
  isbn?: string;
  asin?: string;
  coverId?: number;
}

class BookCoverService {
  /**
   * Validate if a cover URL actually returns a valid image
   * Returns true if valid, false if invalid, null if uncertain
   */
  async validateCoverUrl(url: string, timeout: number = 5000): Promise<boolean | null> {
    try {
      // For OpenLibrary ISBN-based covers, use ?default=false to detect missing covers
      let testUrl = url;
      if (url.includes('covers.openlibrary.org/b/isbn/')) {
        testUrl = url.includes('?') ? `${url}&default=false` : `${url}?default=false`;
      }

      const response: AxiosResponse = await axios.head(testUrl, {
        timeout,
        validateStatus: (status: number) => status < 500
      });

      if (response.status === 200) {
        const contentType = (response.headers['content-type'] as string) || '';
        const contentLength = parseInt((response.headers['content-length'] as string) || '0', 10);

        if (contentType.startsWith('image/')) {
          // Amazon/OpenLibrary return 1x1 pixel placeholders when no cover exists
          // These are typically < 500 bytes; real covers are always > 1KB
          if (contentLength > 0 && contentLength < 500) {
            logger.info(`[CoverValidation] Cover at ${url} appears to be a placeholder (size: ${contentLength} bytes)`);
            return false;
          }
          return true;
        }
      }

      return false;
    } catch (error: unknown) {
      const err = error as { response?: { status: number }; message: string };
      if (err.response && err.response.status === 404) {
        logger.info(`[CoverValidation] Cover not found at ${url}`);
        return false;
      }
      logger.warn(`[CoverValidation] Error validating cover ${url}: ${err.message}`);
      return null;
    }
  }

  /**
   * Find the best available cover from a list of cover options
   * Validates covers in order of priority and returns the first valid one
   */
  async findBestCover(availableCovers: CoverOption[], maxAttempts: number = 5): Promise<string | null> {
    if (!availableCovers || availableCovers.length === 0) {
      return null;
    }

    const sortedCovers = [...availableCovers].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let attempts = 0;
    for (const cover of sortedCovers) {
      if (attempts >= maxAttempts) {
        logger.info(`[CoverValidation] Reached max attempts (${maxAttempts}), using best available: ${cover.url}`);
        return cover.url;
      }

      // Skip validation for high-priority Google Books covers
      if (cover.source === 'Google Books' && (cover.priority || 0) >= 3) {
        return cover.url;
      }

      const isValid = await this.validateCoverUrl(cover.url);
      attempts++;

      if (isValid === true) {
        logger.info(`[CoverValidation] Found valid cover: ${cover.url}`);
        return cover.url;
      }

      if (isValid === false) {
        continue;
      }

      logger.info(`[CoverValidation] Using cover with uncertain validation: ${cover.url}`);
      return cover.url;
    }

    if (sortedCovers.length > 0) {
      logger.warn(`[CoverValidation] All covers failed validation, using first: ${sortedCovers[0].url}`);
      return sortedCovers[0].url;
    }

    return null;
  }

  /**
   * Get cover size priority (higher number = larger/better)
   */
  getCoverSizePriority(url: string | null): number {
    if (!url) return 0;

    // OpenLibrary covers
    if (url.includes('covers.openlibrary.org')) {
      const coverIdMatch = url.match(/\/b\/id\/(\d+)\.jpg$/);
      if (coverIdMatch && !url.includes('-L.jpg') && !url.includes('-M.jpg') && !url.includes('-S.jpg')) {
        return 5;
      }
      if (url.includes('-L.jpg')) return 4;
      if (url.includes('-M.jpg')) return 3;
      if (url.includes('-S.jpg')) return 2;
      return 2;
    }

    // Google Books
    if (url.includes('books.google.com') || url.includes('googleapis.com')) {
      if (url.includes('zoom=10') || (url.includes('&w=') && url.includes('&h='))) {
        const wMatch = url.match(/[&?]w=(\d+)/);
        const hMatch = url.match(/[&?]h=(\d+)/);
        if (wMatch && hMatch) {
          const area = parseInt(wMatch[1]) * parseInt(hMatch[1]);
          if (area > 1000000) return 6;
          if (area > 500000) return 5;
          if (area > 200000) return 4;
          if (area > 50000) return 3;
          return 2;
        }
        if (url.includes('zoom=10')) return 5;
      }
      if (url.includes('extra-large') || url.includes('w=1280') || url.includes('h=1920')) return 5;
      if (url.includes('large') || url.includes('L.jpg')) return 4;
      if (url.includes('medium') || url.includes('M.jpg')) return 3;
      if (url.includes('small') || url.includes('S.jpg')) return 2;
      return 3;
    }

    return 2;
  }

  /**
   * Select the largest cover from availableCovers
   */
  selectLargestCover(availableCovers: CoverOption[] | null | undefined): string | null {
    if (!availableCovers || !Array.isArray(availableCovers) || availableCovers.length === 0) {
      return null;
    }

    const frontCovers = availableCovers.filter(c => !c.type || c.type === 'front');
    const coversToCheck = frontCovers.length > 0 ? frontCovers : availableCovers;

    if (coversToCheck.length === 0) return null;

    const sortedCovers = coversToCheck.sort((a, b) => {
      const priorityA = (a.priority !== undefined && a.priority !== null)
        ? a.priority
        : this.getCoverSizePriority(a.url);
      const priorityB = (b.priority !== undefined && b.priority !== null)
        ? b.priority
        : this.getCoverSizePriority(b.url);
      return priorityB - priorityA;
    });

    return sortedCovers[0].url;
  }

  /**
   * Generate Amazon cover URLs for a given ISBN
   */
  generateAmazonCovers(isbn10: string, priority: number = 0): CoverOption[] {
    if (!isbn10 || isbn10.length !== 10) return [];

    const covers: CoverOption[] = [];
    const sizes: Array<{ suffix: string; size: string; priority: number }> = [
      { suffix: '._SCLZZZZZZZ_.jpg', size: 'large', priority: 6 + priority },
      { suffix: '._SL500_.jpg', size: 'medium', priority: 5 + priority },
      { suffix: '._SL160_.jpg', size: 'small', priority: 4 + priority }
    ];

    sizes.forEach(({ suffix, size, priority: sizePriority }) => {
      covers.push({
        source: 'Amazon',
        url: `https://images-eu.ssl-images-amazon.com/images/P/${isbn10}.01${suffix}`,
        type: 'front',
        isbn: isbn10,
        size: size,
        priority: sizePriority
      });
    });

    // US Amazon fallback
    covers.push({
      source: 'Amazon-US',
      url: `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01._SCLZZZZZZZ_.jpg`,
      type: 'front',
      isbn: isbn10,
      size: 'large',
      priority: 5 + priority
    });

    return covers;
  }

  /**
   * Extract ASIN from an Amazon URL
   * Works with various Amazon URL formats (amazon.com, amazon.fr, etc.)
   */
  extractAsinFromUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;

    const patterns: RegExp[] = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i,
      /\/ASIN\/([A-Z0-9]{10})/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  /**
   * Generate Amazon cover URLs from an ASIN (not ISBN)
   */
  generateAmazonCoversFromAsin(asin: string, priority: number = 0): CoverOption[] {
    if (!asin || asin.length !== 10) return [];

    const covers: CoverOption[] = [];
    const sizes: Array<{ suffix: string; size: string; priority: number }> = [
      { suffix: '._SCLZZZZZZZ_.jpg', size: 'large', priority: 10 + priority },
      { suffix: '._SL500_.jpg', size: 'medium', priority: 9 + priority },
      { suffix: '._SL160_.jpg', size: 'small', priority: 8 + priority }
    ];

    // EU Amazon (for .fr, .de, .it, .es, etc.)
    sizes.forEach(({ suffix, size, priority: sizePriority }) => {
      covers.push({
        source: 'Amazon (ASIN)',
        url: `https://images-eu.ssl-images-amazon.com/images/P/${asin}.01${suffix}`,
        type: 'front',
        asin: asin,
        size: size,
        priority: sizePriority
      });
    });

    // US Amazon fallback
    covers.push({
      source: 'Amazon-US (ASIN)',
      url: `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`,
      type: 'front',
      asin: asin,
      size: 'large',
      priority: 9 + priority
    });

    return covers;
  }

  /**
   * Generate OpenLibrary ISBN-based cover URLs
   */
  generateOpenLibraryIsbnCovers(isbn: string, priority: number = 0): CoverOption[] {
    if (!isbn) return [];

    const covers: CoverOption[] = [];
    const sizes: Array<{ suffix: string; size: string; priority: number }> = [
      { suffix: '-L.jpg', size: 'large', priority: 4 + priority },
      { suffix: '-M.jpg', size: 'medium', priority: 3 + priority },
      { suffix: '-S.jpg', size: 'small', priority: 2 + priority }
    ];

    sizes.forEach(({ suffix, size, priority: sizePriority }) => {
      covers.push({
        source: 'OpenLibrary-ISBN',
        url: `https://covers.openlibrary.org/b/isbn/${isbn}${suffix}`,
        type: 'front',
        isbn: isbn,
        size: size,
        priority: sizePriority
      });
    });

    return covers;
  }

  /**
   * Generate OpenLibrary cover ID-based cover URLs
   */
  generateOpenLibraryCoverIdCovers(coverId: number, coverType: string = 'front', priority: number = 0): CoverOption[] {
    if (!coverId) return [];

    const covers: CoverOption[] = [];
    const sizes: Array<{ suffix: string; size: string; priority: number }> = [
      { suffix: '-L.jpg', size: 'large', priority: 4 + priority },
      { suffix: '-M.jpg', size: 'medium', priority: 3 + priority },
      { suffix: '-S.jpg', size: 'small', priority: 2 + priority }
    ];

    sizes.forEach(({ suffix, size, priority: sizePriority }) => {
      covers.push({
        source: 'OpenLibrary',
        url: `https://covers.openlibrary.org/b/id/${coverId}${suffix}`,
        type: coverType,
        coverId: coverId,
        size: size,
        priority: sizePriority
      });
    });

    // Original size (potentially higher resolution)
    covers.push({
      source: 'OpenLibrary',
      url: `https://covers.openlibrary.org/b/id/${coverId}.jpg`,
      type: coverType,
      coverId: coverId,
      size: 'original',
      priority: 5 + priority
    });

    return covers;
  }

  /**
   * Generate all fallback covers for a book based on ISBN
   */
  generateFallbackCovers(isbn: string | null, isbn13: string | null): CoverOption[] {
    const covers: CoverOption[] = [];

    // Get ISBN-10 for Amazon
    let isbn10 = isbn && isbn.length === 10 ? isbn : null;
    if (!isbn10 && isbn13 && isbn13.startsWith('978')) {
      isbn10 = isbn13ToIsbn10(isbn13);
    }

    // Amazon covers (highest priority for many books)
    if (isbn10) {
      covers.push(...this.generateAmazonCovers(isbn10, 0));
    }

    // OpenLibrary ISBN-based covers
    if (isbn13) {
      covers.push(...this.generateOpenLibraryIsbnCovers(isbn13, 0));
    }
    if (isbn && isbn !== isbn13) {
      covers.push(...this.generateOpenLibraryIsbnCovers(isbn, -1));
    }

    return covers;
  }

  /**
   * Enhance Google Books image URLs with higher resolution variants
   */
  enhanceGoogleBooksCovers(baseUrl: string | null): CoverOption[] {
    if (!baseUrl) return [];

    const covers: CoverOption[] = [];
    let url = baseUrl.startsWith('http://') ? baseUrl.replace('http://', 'https://') : baseUrl;

    // Try higher zoom levels
    if (url.includes('zoom=')) {
      const zoomZeroUrl = url.replace(/zoom=\d+/, 'zoom=0');
      if (zoomZeroUrl !== url) {
        covers.push({
          source: 'Google Books',
          url: zoomZeroUrl,
          type: 'front',
          size: 'extra-large',
          priority: 6
        });
      }

      const zoom3Url = url.replace(/zoom=\d+/, 'zoom=3');
      if (zoom3Url !== url) {
        covers.push({
          source: 'Google Books',
          url: zoom3Url,
          type: 'front',
          size: 'large-enhanced',
          priority: 5
        });
      }
    }

    // Add explicit dimensions for higher resolution
    if (url.includes('books.google.com') || url.includes('googleapis.com')) {
      let enhancedUrl = url;
      enhancedUrl = enhancedUrl.replace(/[&?]w=\d+/g, '');
      enhancedUrl = enhancedUrl.replace(/[&?]h=\d+/g, '');
      enhancedUrl = enhancedUrl.replace(/[&?]zoom=\d+/g, '');
      const separator = enhancedUrl.includes('?') ? '&' : '?';
      enhancedUrl = `${enhancedUrl}${separator}w=800&h=1200&zoom=0`;

      covers.push({
        source: 'Google Books',
        url: enhancedUrl,
        type: 'front',
        size: 'extra-large',
        priority: 7
      });
    }

    return covers;
  }
}

export default new BookCoverService();
