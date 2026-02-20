
/**
 * Book API Service
 * Handles external API integration with Google Books and OpenLibrary
 */

import axios, { AxiosResponse } from 'axios';
import logger from '../logger';
import bookCoverService from './bookCoverService';
import type { CoverOption } from './bookCoverService';
import {
  removeSurroundingQuotes,
  cleanDescription,
  isbn13ToIsbn10,
  isNetworkError
} from './utils/bookUtils';

interface GoogleBooksSearchResponse {
  items?: GoogleBooksItem[];
  totalItems?: number;
}

interface GoogleBooksItem {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    language?: string;
    imageLinks?: Record<string, string>;
    canonicalVolumeLink?: string;
    infoLink?: string;
    previewLink?: string;
  };
}

interface OpenLibrarySearchResponse {
  docs: OpenLibraryDoc[];
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  title_suggest?: string;
  subtitle?: string;
  isbn?: string[];
  isbn_10?: string[];
  isbn_13?: string[];
  author_name?: string[];
  authors?: Array<{ key?: string; name?: string } | string>;
  publisher?: string[];
  publishers?: string[];
  publish_date?: string;
  publish_year?: number[];
  first_publish_year?: number;
  language?: string[];
  cover_i?: number;
  cover_large?: string;
  covers?: number[];
  number_of_pages?: number;
  number_of_pages_median?: number;
  subject?: string[];
  series?: string[] | string;
  edition_key?: string[];
  work_key?: string[];
  works?: Array<{ key?: string }>;
  first_sentence?: string[] | string;
  [key: string]: unknown;
}

interface OpenLibraryWorkData {
  key?: string;
  title?: string;
  description?: string | { value: string };
  subjects?: Array<string | { name: string }>;
  subject_places?: Array<string | { name: string }>;
  subject_times?: Array<string | { name: string }>;
  subject_people?: Array<string | { name: string }>;
  covers?: number[];
  first_publish_date?: string;
  series?: string[] | string;
  authors?: Array<{ author?: { name?: string } } | string>;
  languages?: string[];
}

export interface FormattedBook {
  isbn: string | null;
  isbn13: string | null;
  title: string | null;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  publishedYear: number | null;
  language: string | null;
  format: string | null;
  filetype: string | null;
  drm: string | null;
  narrator: string | null;
  runtime: string | null;
  series: string | null;
  seriesNumber: number | null;
  genres: string[] | null;
  tags: string[] | null;
  rating: number | null;
  coverUrl: string | null;
  availableCovers?: CoverOption[];
  owner: string | null;
  readDate: string | null;
  pageCount: number | null;
  description: string | null;
  urls: Record<string, string> | null;
  asin?: string;
  _openLibraryData?: {
    key: string | undefined;
    editionKey: string | undefined;
    workKey: string | undefined;
    covers: number[];
  };
  _relevanceScore?: number;
  _docLanguages?: string[];
  [key: string]: unknown;
}

interface SearchFilters {
  author?: string;
  title?: string;
  language?: string;
}

class BookApiService {
  private googleBooksBaseUrl: string;
  private openLibraryBaseUrl: string;
  private timeout: number;

  constructor() {
    this.googleBooksBaseUrl = 'https://www.googleapis.com/books/v1/volumes';
    this.openLibraryBaseUrl = 'https://openlibrary.org';
    this.timeout = 15000;
  }

  // ============================================
  // Google Books API
  // ============================================

  /**
   * Search Google Books API
   */
  async searchGoogleBooks(query: string, limit: number = 20, filters: SearchFilters = {}): Promise<FormattedBook[]> {
    try {
      const { author, title, language } = filters;

      let searchQuery = query;
      if (title && author) {
        searchQuery = `intitle:${title} inauthor:${author}`;
      } else if (title) {
        searchQuery = `intitle:${title}`;
      } else if (author) {
        searchQuery = `inauthor:${author}`;
      }

      const params: Record<string, string | number> = {
        q: searchQuery,
        maxResults: Math.min(limit * 2, 40),
        orderBy: 'relevance',
        projection: 'full'
      };

      const response: AxiosResponse<GoogleBooksSearchResponse> = await axios.get(this.googleBooksBaseUrl, { params, timeout: this.timeout });
      const data = response.data;

      if (!data.items || data.items.length === 0) {
        return [];
      }

      // Fetch full volume details for better descriptions
      const topItems = data.items.slice(0, Math.min(limit, data.items.length));
      const itemsWithFullDetails = await Promise.allSettled(
        topItems.map(async (item) => {
          try {
            const volumeResponse: AxiosResponse<GoogleBooksItem> = await axios.get(
              `${this.googleBooksBaseUrl}/${item.id}`,
              {
                params: { projection: 'full' },
                timeout: 5000,
                validateStatus: (status: number) => status < 500
              }
            );
            return { success: true, data: volumeResponse.data };
          } catch (error: unknown) {
            const err = error as { code?: string; errno?: string };
            if (isNetworkError(err)) {
              logger.warn(`Network error fetching volume ${item.id}: ${err.code || err.errno}`);
            }
            return { success: false, data: item };
          }
        })
      );

      const formattedResults = itemsWithFullDetails
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          const fulfilled = result as PromiseFulfilledResult<{ success: boolean; data: GoogleBooksItem }>;
          let itemData: GoogleBooksItem;
          if (fulfilled.value && typeof fulfilled.value === 'object' && 'data' in fulfilled.value) {
            itemData = fulfilled.value.data;
          } else {
            itemData = fulfilled.value as unknown as GoogleBooksItem;
          }
          return this.formatGoogleBook(itemData);
        })
        .filter(book => {
          if (language && language !== 'any') {
            const lang = (book.language || '').toLowerCase();
            const langMap: Record<string, string[]> = {
              'en': ['en', 'eng'], 'eng': ['en', 'eng'],
              'fr': ['fr', 'fre', 'fra'], 'fre': ['fr', 'fre', 'fra'], 'fra': ['fr', 'fre', 'fra'],
              'de': ['de', 'ger'], 'ger': ['de', 'ger'],
              'es': ['es', 'spa'], 'spa': ['es', 'spa'],
              'it': ['it', 'ita'], 'ita': ['it', 'ita'],
              'pt': ['pt', 'por'], 'por': ['pt', 'por']
            };
            const allowedLangs = langMap[language.toLowerCase()] || [language.toLowerCase()];
            return allowedLangs.includes(lang);
          }
          const lang = (book.language || '').toLowerCase();
          const preferredLangs = ['en', 'eng', 'fr', 'fre', 'fra'];
          return preferredLangs.includes(lang) || !book.language;
        })
        .slice(0, limit);

      return formattedResults;
    } catch (error: unknown) {
      const err = error as { code?: string; errno?: string; message?: string };
      if (isNetworkError(err)) {
        logger.error(`Network error searching Google Books: ${err.code || err.errno}`);
        return [];
      }
      logger.error('Error searching Google Books:', err.message || err);
      throw error;
    }
  }

  /**
   * Search Google Books by ISBN
   */
  async searchGoogleBooksByIsbn(isbn: string): Promise<FormattedBook[]> {
    try {
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      const isbnVariants: (string | null)[] = [cleanIsbn];

      if (cleanIsbn.length === 13 && cleanIsbn.startsWith('978')) {
        isbnVariants.push(isbn13ToIsbn10(cleanIsbn));
      } else if (cleanIsbn.length === 10) {
        isbnVariants.push('978' + cleanIsbn);
      }

      for (const isbnVariant of isbnVariants) {
        if (!isbnVariant) continue;
        try {
          const params = { q: `isbn:${isbnVariant}`, maxResults: 1, projection: 'full' };
          const response: AxiosResponse<GoogleBooksSearchResponse> = await axios.get(this.googleBooksBaseUrl, { params, timeout: 10000 });

          if (!response.data.items || response.data.items.length === 0) continue;

          try {
            const volumeId = response.data.items[0].id;
            const volumeResponse: AxiosResponse<GoogleBooksItem> = await axios.get(
              `${this.googleBooksBaseUrl}/${volumeId}`,
              { params: { projection: 'full' }, timeout: 10000, validateStatus: (status: number) => status < 500 }
            );
            return [this.formatGoogleBook(volumeResponse.data)];
          } catch (_volumeError) {
            return [this.formatGoogleBook(response.data.items[0])];
          }
        } catch (_variantError) {
          continue;
        }
      }

      return [];
    } catch (error: unknown) {
      const err = error as { response?: { status: number } };
      if (err.response && err.response.status === 404) return [];
      console.error('Error searching Google Books by ISBN:', error);
      throw error;
    }
  }

  /**
   * Get full volume details from Google Books
   */
  async getGoogleBookVolume(volumeId: string): Promise<FormattedBook> {
    try {
      const response: AxiosResponse<GoogleBooksItem> = await axios.get(
        `${this.googleBooksBaseUrl}/${volumeId}`,
        { params: { projection: 'full' }, timeout: 10000 }
      );
      return this.formatGoogleBook(response.data);
    } catch (error) {
      console.error('Error fetching Google Books volume:', error);
      throw error;
    }
  }

  /**
   * Format Google Books API result to our schema
   */
  formatGoogleBook(item: GoogleBooksItem): FormattedBook {
    const volumeInfo = item.volumeInfo || {};
    const volumeId = item.id;

    // Extract ISBNs
    const industryIdentifiers = volumeInfo.industryIdentifiers || [];
    let isbn: string | null = null;
    let isbn13: string | null = null;

    industryIdentifiers.forEach(identifier => {
      if (identifier.type === 'ISBN_10') isbn = identifier.identifier;
      else if (identifier.type === 'ISBN_13') isbn13 = identifier.identifier;
    });

    // Re-assert types after forEach (TS doesn't track assignments inside callbacks)
    isbn = isbn as string | null;
    isbn13 = isbn13 as string | null;

    if (!isbn && isbn13) isbn = isbn13;

    // Check if this is an ISMN (music score) - starts with 979-0
    const isIsmn = isbn13 && isbn13.replace(/[-\s]/g, '').startsWith('9790');

    // Extract covers with all sizes
    let coverUrl: string | null = null;
    let availableCovers: CoverOption[] = [];

    if (volumeInfo.imageLinks) {
      const coverSizes: Array<{ key: string; priority: number }> = [
        { key: 'large', priority: 4 },
        { key: 'medium', priority: 3 },
        { key: 'small', priority: 2 },
        { key: 'thumbnail', priority: 1 }
      ];

      coverSizes.forEach(({ key, priority }) => {
        if (volumeInfo.imageLinks![key]) {
          let url = volumeInfo.imageLinks![key];
          if (url && url.startsWith('http://')) url = url.replace('http://', 'https://');
          if (url) {
            availableCovers.push({
              source: 'Google Books', url, type: 'front', size: key, priority
            });
            if (!coverUrl && priority === 4) coverUrl = url;
          }
        }
      });

      // Add enhanced Google Books covers
      const baseImageUrl = volumeInfo.imageLinks.large || volumeInfo.imageLinks.medium ||
                          volumeInfo.imageLinks.small || volumeInfo.imageLinks.thumbnail;
      if (baseImageUrl) {
        availableCovers.push(...bookCoverService.enhanceGoogleBooksCovers(baseImageUrl));
      }

      if (!coverUrl && availableCovers.length > 0) {
        coverUrl = availableCovers.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0].url;
      }
    }

    // Fallback: construct cover URL from volume ID if no imageLinks
    if (volumeId && availableCovers.length === 0) {
      const zoomLevels: Array<{ zoom: number; priority: number; size: string }> = [
        { zoom: 1, priority: 3, size: 'medium' },
        { zoom: 0, priority: 2, size: 'small' }
      ];

      zoomLevels.forEach(({ zoom, priority, size }) => {
        const url = `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=${zoom}`;
        availableCovers.push({
          source: 'Google Books (Volume ID)',
          url,
          type: 'front',
          size,
          priority
        });
      });

      if (!coverUrl && availableCovers.length > 0) {
        coverUrl = availableCovers[0].url;
      }
    }

    // Add Amazon and OpenLibrary fallback covers (only for regular ISBNs, not ISMNs)
    if (!isIsmn) {
      availableCovers.push(...bookCoverService.generateFallbackCovers(isbn, isbn13));
    }

    // Amazon as primary cover for many books (only works with ISBN-10, not ISMN)
    const isbn10 = isbn && isbn.length === 10 ? isbn : isbn13ToIsbn10(isbn13);
    if (isbn10) {
      const amazonUrl = `https://images-eu.ssl-images-amazon.com/images/P/${isbn10}.01._SCLZZZZZZZ_.jpg`;
      availableCovers.unshift({
        source: 'Amazon-EU', url: amazonUrl, type: 'front', size: 'large', priority: 10
      });
      coverUrl = amazonUrl;
    }

    // For ISMNs (music scores), prefer Google Books cover if we have volume ID
    if (isIsmn && volumeId && !coverUrl) {
      coverUrl = `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=1`;
    }

    // Extract language
    let language: string | null = volumeInfo.language || null;
    if (language && language.length > 2) {
      const langMap: Record<string, string> = { 'eng': 'en', 'fre': 'fr', 'fra': 'fr' };
      language = langMap[language] || language;
    }

    // Extract genres from categories
    let genres: (string | null)[] = (volumeInfo.categories || [])
      .map(cat => {
        if (cat.includes(' / ')) {
          const parts = cat.split(' / ');
          const generic = parts[0].trim().toLowerCase();
          if (generic === 'fiction' && parts.length > 1) return parts[parts.length - 1].trim();
          return cat;
        }
        const lowerCat = cat.toLowerCase();
        if (['fiction', 'nonfiction', 'non-fiction'].includes(lowerCat)) return null;
        return cat;
      })
      .filter(cat => cat !== null && (cat as string).trim().length > 0);

    if (genres.length === 0 && volumeInfo.categories) genres = volumeInfo.categories;

    const filteredGenres = genres.filter(Boolean) as string[];

    if (filteredGenres.length > 0) {
      logger.info(`[Google Books] Extracted ${filteredGenres.length} genre(s): ${filteredGenres.join(', ')}`);
    }

    // Extract published year
    let publishedYear: number | null = null;
    if (volumeInfo.publishedDate) {
      const yearMatch = volumeInfo.publishedDate.match(/\d{4}/);
      if (yearMatch) publishedYear = parseInt(yearMatch[0]);
    }

    // Build URLs
    const urls: Record<string, string> = {};
    if (volumeInfo.canonicalVolumeLink) urls.googleBooks = volumeInfo.canonicalVolumeLink;
    if (volumeInfo.infoLink) urls.googleBooksInfo = volumeInfo.infoLink;
    if (volumeInfo.previewLink) urls.googleBooksPreview = volumeInfo.previewLink;

    return {
      isbn, isbn13,
      title: volumeInfo.title || null,
      subtitle: removeSurroundingQuotes(volumeInfo.subtitle || null),
      authors: volumeInfo.authors && volumeInfo.authors.length > 0 ? volumeInfo.authors : null,
      publisher: removeSurroundingQuotes(volumeInfo.publisher || null),
      publishedYear, language,
      format: null, filetype: null, drm: null, narrator: null, runtime: null,
      series: null, seriesNumber: null,
      genres: filteredGenres.length > 0 ? filteredGenres : null,
      tags: null,
      rating: volumeInfo.averageRating || null,
      coverUrl,
      availableCovers: availableCovers.length > 0 ? availableCovers : undefined,
      owner: null, readDate: null,
      pageCount: volumeInfo.pageCount || null,
      description: cleanDescription(volumeInfo.description),
      urls: Object.keys(urls).length > 0 ? urls : null
    };
  }

  // ============================================
  // OpenLibrary API
  // ============================================

  /**
   * Search OpenLibrary API
   */
  async searchOpenLibrary(query: string, limit: number = 20, language: string = 'any'): Promise<FormattedBook[]> {
    try {
      const params: Record<string, string | number> = { q: query, limit: Math.min(limit * 5, 100) };
      const response: AxiosResponse<OpenLibrarySearchResponse> = await axios.get(`${this.openLibraryBaseUrl}/search.json`, { params, timeout: this.timeout });

      if (!response.data.docs || response.data.docs.length === 0) return [];

      // Score and sort results
      const normalize = (str: string | null | undefined): string => (str || '').toLowerCase().trim();
      const queryNormalized = normalize(query);
      const queryWords = queryNormalized.split(/\s+/).filter(w => w.length > 0);

      const preferredLangCodes = language && language !== 'any'
        ? this._getLangCodes(language)
        : ['eng', 'fre', 'fra'];

      const scoredDocs = response.data.docs.map((doc, index) => {
        let score = 0;
        const docTitle = normalize(doc.title || doc.title_suggest || '');

        if (docTitle === queryNormalized) score += 100;
        else if (docTitle.startsWith(queryNormalized)) score += 50;
        else if (docTitle.includes(queryNormalized)) score += 30;
        else if (queryWords.length > 0 && queryWords.every(word => docTitle.includes(word))) score += 20;
        else if (queryWords.length > 0) {
          score += queryWords.filter(word => docTitle.includes(word)).length * 5;
        }

        if ((doc.language || []).some(lang => preferredLangCodes.includes(lang))) score += 10;
        if (doc.cover_i) score += 5;

        return { doc, index, score };
      });

      scoredDocs.sort((a, b) => b.score - a.score || a.index - b.index);
      const docsToProcess = scoredDocs.slice(0, Math.min(limit * 3, 60));

      // Fetch work details
      const resultsWithMetadata = await Promise.allSettled(
        docsToProcess.map(async ({ doc, score }) => {
          let workData: OpenLibraryWorkData | null = null;
          const workKey = doc.work_key?.[0] || doc.works?.[0]?.key;
          if (workKey) {
            try {
              const workResponse: AxiosResponse<OpenLibraryWorkData> = await axios.get(`${this.openLibraryBaseUrl}${workKey}.json`, { timeout: 5000 });
              workData = workResponse.data;
            } catch (_error) { /* ignore */ }
          }
          return { doc, workData, score };
        })
      );

      // Format and filter results
      const formattedResults = resultsWithMetadata
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          const fulfilled = result as PromiseFulfilledResult<{ doc: OpenLibraryDoc; workData: OpenLibraryWorkData | null; score: number }>;
          const { doc, workData, score } = fulfilled.value;
          const book = this.formatOpenLibraryBook(doc, workData);
          return { ...book, _relevanceScore: score, _docLanguages: doc.language || [] };
        })
        .filter(book => {
          if (language && language !== 'any') {
            const allowedLangs = this._getLangCodes(language);
            const bookLang = (book.language || '').toLowerCase();
            const docLangs = (book._docLanguages || []).map(l => l.toLowerCase());
            return [bookLang, ...docLangs].some(l => l && allowedLangs.includes(l));
          }
          const lang = (book.language || '').toLowerCase();
          return ['en', 'eng', 'fr', 'fre', 'fra'].includes(lang) || (book._relevanceScore || 0) >= 100;
        })
        .sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0))
        .slice(0, limit)
        .map(({ _relevanceScore, _docLanguages, ...book }) => book as FormattedBook);

      return formattedResults;
    } catch (error) {
      console.error('Error searching OpenLibrary:', error);
      throw error;
    }
  }

  /**
   * Search by ISBN using OpenLibrary
   */
  async searchByIsbn(isbn: string): Promise<FormattedBook[]> {
    try {
      if (!isbn) return [];

      const cleanIsbn = isbn.replace(/[-\s]/g, '').toUpperCase();
      const isIsbn10 = /^\d{9}[\dX]$/.test(cleanIsbn);
      const isIsbn13 = /^\d{13}$/.test(cleanIsbn);

      if (!isIsbn10 && !isIsbn13) {
        logger.warn(`[OpenLibrary] Invalid ISBN format: ${isbn}`);
        return [];
      }

      logger.info(`[OpenLibrary] Searching by ISBN: ${cleanIsbn}`);

      let response: AxiosResponse<OpenLibraryDoc>;
      try {
        response = await axios.get(`${this.openLibraryBaseUrl}/isbn/${cleanIsbn}.json`, { timeout: 10000 });
      } catch (error: unknown) {
        const err = error as { response?: { status: number } };
        if (cleanIsbn.length === 13 && err.response?.status === 404) {
          const isbn10 = isbn13ToIsbn10(cleanIsbn);
          if (isbn10) {
            try {
              response = await axios.get(`${this.openLibraryBaseUrl}/isbn/${isbn10}.json`, { timeout: 10000 });
            } catch (innerError: unknown) {
              const innerErr = innerError as { response?: { status: number } };
              if (innerErr.response?.status === 404) return [];
              throw innerError;
            }
          } else {
            return [];
          }
        } else if (err.response?.status === 404) {
          return [];
        } else {
          throw error;
        }
      }

      const bookData = response!.data;

      // Get work details
      let workData: OpenLibraryWorkData | null = null;
      if (bookData.works && (bookData.works as Array<{ key?: string }>).length > 0) {
        try {
          const workResponse: AxiosResponse<OpenLibraryWorkData> = await axios.get(`${this.openLibraryBaseUrl}${(bookData.works as Array<{ key?: string }>)[0].key}.json`, { timeout: 10000 });
          workData = workResponse.data;
        } catch (_error) { /* ignore */ }
      }

      // Resolve author names
      if (bookData.authors && (bookData.authors as Array<{ key?: string; name?: string }>).length > 0) {
        const authorNames = await Promise.allSettled(
          (bookData.authors as Array<{ key?: string; name?: string }>).map(async (author) => {
            if (author.key) {
              try {
                const authorResponse: AxiosResponse<{ name?: string }> = await axios.get(`${this.openLibraryBaseUrl}${author.key}.json`, { timeout: 5000 });
                return authorResponse.data.name || null;
              } catch { return author.name || null; }
            }
            return author.name || null;
          })
        );
        const resolved = authorNames.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<string | null>).value).map(r => (r as PromiseFulfilledResult<string>).value);
        if (resolved.length > 0) bookData.author_name = resolved;
      }

      return [this.formatOpenLibraryBook(bookData, workData)];
    } catch (error: unknown) {
      const err = error as { response?: { status: number } };
      if (err.response?.status === 404) return [];
      console.error('Error searching by ISBN:', error);
      throw error;
    }
  }

  /**
   * Format OpenLibrary book data to our schema
   */
  formatOpenLibraryBook(doc: OpenLibraryDoc, workData: OpenLibraryWorkData | null = null): FormattedBook {
    // Extract ISBNs
    const allIsbns = [...(doc.isbn || []), ...(doc.isbn_10 || []), ...(doc.isbn_13 || [])];
    const isbn10 = allIsbns.find(i => i && i.length === 10) || null;
    const isbn13 = allIsbns.find(i => i && i.length === 13) || null;
    const isbn = isbn10 || isbn13 || allIsbns[0] || null;

    // Extract authors
    const authors: string[] = [];
    if (workData?.authors) {
      workData.authors.forEach(author => {
        if (typeof author === 'object' && (author as { author?: { name?: string } }).author?.name) {
          authors.push((author as { author: { name: string } }).author.name);
        }
        else if (typeof author === 'string') authors.push(author);
      });
    }
    if (authors.length === 0 && doc.author_name) {
      authors.push(...doc.author_name);
    } else if (authors.length === 0 && doc.authors) {
      (doc.authors as Array<{ name?: string } | string>).forEach(author => {
        if (typeof author === 'string') authors.push(author);
        else if ((author as { name?: string }).name) authors.push((author as { name: string }).name);
      });
    }

    // Extract cover
    let coverUrl: string | null = null;
    if (doc.cover_i) coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    else if (doc.cover_large) coverUrl = doc.cover_large;
    else if (workData?.covers && workData.covers.length > 0) coverUrl = `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`;

    // Extract description
    let description: string | null = null;
    if (workData?.description) {
      description = typeof workData.description === 'string'
        ? workData.description
        : (workData.description as { value: string }).value || null;
    }
    const firstSentence = doc.first_sentence;
    const firstSentenceStr = Array.isArray(firstSentence) ? firstSentence[0] : (firstSentence as string | undefined) || null;
    description = cleanDescription(description) || firstSentenceStr;

    // Extract publish year
    let publishedYear: number | null = null;
    if (workData?.first_publish_date) {
      const match = workData.first_publish_date.match(/\d{4}/);
      if (match) publishedYear = parseInt(match[0]);
    }
    if (!publishedYear && doc.first_publish_year) publishedYear = doc.first_publish_year;
    if (!publishedYear && doc.publish_date) {
      const match = (doc.publish_date as string).match(/\d{4}/);
      if (match) publishedYear = parseInt(match[0]);
    }
    if (!publishedYear && doc.publish_year && doc.publish_year.length > 0) publishedYear = doc.publish_year[0];

    // Extract publisher
    let publisher: string | null = doc.publisher?.[0] || doc.publishers?.[0] || null;
    publisher = removeSurroundingQuotes(publisher);

    // Extract series
    const seriesField = workData?.series || doc.series;
    let series: string | null = Array.isArray(seriesField) ? seriesField[0] || null : (seriesField as string | null | undefined) || null;

    // Extract genres from subjects
    const genres: string[] = [];
    if (workData?.subjects) {
      genres.push(...workData.subjects.slice(0, 15).map(s => typeof s === 'string' ? s : ((s as { name: string }).name || String(s))));
    }
    if (genres.length === 0 && doc.subject) genres.push(...doc.subject.slice(0, 15));

    // Extract tags from additional OpenLibrary fields
    const tags: string[] = [];
    if (workData?.subject_places) {
      tags.push(...workData.subject_places.slice(0, 5).map(s => typeof s === 'string' ? s : ((s as { name: string }).name || String(s))));
    }
    if (workData?.subject_times) {
      tags.push(...workData.subject_times.slice(0, 5).map(s => typeof s === 'string' ? s : ((s as { name: string }).name || String(s))));
    }
    if (workData?.subject_people) {
      tags.push(...workData.subject_people.slice(0, 5).map(s => typeof s === 'string' ? s : ((s as { name: string }).name || String(s))));
    }

    if (genres.length > 0) {
      logger.info(`[OpenLibrary] Extracted ${genres.length} genre(s): ${genres.slice(0, 5).join(', ')}${genres.length > 5 ? '...' : ''}`);
    }
    if (tags.length > 0) {
      logger.info(`[OpenLibrary] Extracted ${tags.length} tag(s): ${tags.join(', ')}`);
    }

    // Extract language
    let language: string | null = null;
    const langCodes = doc.language || workData?.languages || [];
    if (langCodes.length > 0) {
      const langCode = Array.isArray(langCodes) ? langCodes[0] : langCodes;
      const langMap: Record<string, string> = { 'eng': 'en', 'fre': 'fr', 'fra': 'fr', 'spa': 'es', 'ger': 'de', 'ita': 'it', 'por': 'pt', 'rus': 'ru', 'jpn': 'ja', 'kor': 'ko', 'chi': 'zh' };
      language = langMap[langCode as string] || (langCode as string);
    }

    // Build URLs
    const urls: Record<string, string> = {};
    if (doc.key) urls.openlibrary = `https://openlibrary.org${doc.key}`;
    if (workData?.key) urls.openlibraryWork = `https://openlibrary.org${workData.key}`;

    // Collect available covers
    const availableCovers: CoverOption[] = [];

    if (doc.covers && Array.isArray(doc.covers)) {
      doc.covers.forEach((coverId: number, index: number) => {
        if (coverId) {
          availableCovers.push(...bookCoverService.generateOpenLibraryCoverIdCovers(coverId, index === 0 ? 'front' : 'back'));
        }
      });
    }
    if (workData?.covers && Array.isArray(workData.covers)) {
      workData.covers.forEach((coverId: number, index: number) => {
        if (coverId && !availableCovers.some(c => c.coverId === coverId)) {
          availableCovers.push(...bookCoverService.generateOpenLibraryCoverIdCovers(coverId, index === 0 ? 'front' : 'back'));
        }
      });
    }

    if (coverUrl && !availableCovers.some(c => c.url === coverUrl)) {
      availableCovers.unshift({ source: 'OpenLibrary', url: coverUrl, type: 'front' });
    }

    // Add fallback covers
    availableCovers.push(...bookCoverService.generateFallbackCovers(isbn10, isbn13));

    if (!coverUrl && availableCovers.length > 0) {
      coverUrl = availableCovers.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0].url;
    }

    return {
      isbn, isbn13,
      title: doc.title || doc.title_suggest || workData?.title || null,
      subtitle: removeSurroundingQuotes(doc.subtitle || null),
      authors: authors.length > 0 ? authors : null,
      publisher, publishedYear, language, series, seriesNumber: null,
      genres: genres.length > 0 ? genres : null,
      tags: tags.length > 0 ? tags : null,
      description, coverUrl,
      pageCount: doc.number_of_pages || doc.number_of_pages_median || null,
      urls: Object.keys(urls).length > 0 ? urls : null,
      availableCovers: availableCovers.length > 0 ? availableCovers : undefined,
      format: null, filetype: null, drm: null, narrator: null, runtime: null,
      rating: null, owner: null, readDate: null,
      _openLibraryData: {
        key: doc.key,
        editionKey: doc.edition_key?.[0],
        workKey: doc.work_key?.[0] || workData?.key,
        covers: doc.covers || workData?.covers || []
      }
    };
  }

  /**
   * Helper to get language code variants
   */
  _getLangCodes(language: string | null | undefined): string[] {
    const langMap: Record<string, string[]> = {
      'en': ['en', 'eng'], 'eng': ['en', 'eng'],
      'fr': ['fr', 'fre', 'fra'], 'fre': ['fr', 'fre', 'fra'], 'fra': ['fr', 'fre', 'fra'],
      'de': ['de', 'ger'], 'ger': ['de', 'ger'],
      'es': ['es', 'spa'], 'spa': ['es', 'spa'],
      'it': ['it', 'ita'], 'ita': ['it', 'ita'],
      'pt': ['pt', 'por'], 'por': ['pt', 'por']
    };
    return langMap[language?.toLowerCase() || ''] || [language?.toLowerCase() || ''];
  }
}

export default new BookApiService();
