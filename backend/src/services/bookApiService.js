/**
 * Book API Service
 * Handles external API integration with Google Books and OpenLibrary
 */

const axios = require('axios');
const logger = require('../logger');
const bookCoverService = require('./bookCoverService');
const { 
  removeSurroundingQuotes, 
  cleanDescription, 
  isbn13ToIsbn10,
  isNetworkError 
} = require('./utils/bookUtils');

class BookApiService {
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
  async searchGoogleBooks(query, limit = 20, filters = {}) {
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
      
      const params = {
        q: searchQuery,
        maxResults: Math.min(limit * 2, 40),
        orderBy: 'relevance',
        projection: 'full'
      };
      
      const response = await axios.get(this.googleBooksBaseUrl, { params, timeout: this.timeout });
      const data = response.data;
      
      if (!data.items || data.items.length === 0) {
        return [];
      }
      
      // Fetch full volume details for better descriptions
      const topItems = data.items.slice(0, Math.min(limit, data.items.length));
      const itemsWithFullDetails = await Promise.allSettled(
        topItems.map(async (item) => {
          try {
            const volumeResponse = await axios.get(
              `${this.googleBooksBaseUrl}/${item.id}`,
              { 
                params: { projection: 'full' }, 
                timeout: 5000,
                validateStatus: (status) => status < 500
              }
            );
            return { success: true, data: volumeResponse.data };
          } catch (error) {
            if (isNetworkError(error)) {
              logger.warn(`Network error fetching volume ${item.id}: ${error.code || error.errno}`);
            }
            return { success: false, data: item };
          }
        })
      );
      
      const formattedResults = itemsWithFullDetails
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          let itemData;
          if (result.value && typeof result.value === 'object' && 'data' in result.value) {
            itemData = result.value.data;
          } else {
            itemData = result.value;
          }
          return this.formatGoogleBook(itemData);
        })
        .filter(book => {
          if (language && language !== 'any') {
            const lang = (book.language || '').toLowerCase();
            const langMap = {
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
    } catch (error) {
      if (isNetworkError(error)) {
        logger.error(`Network error searching Google Books: ${error.code || error.errno}`);
        return [];
      }
      logger.error('Error searching Google Books:', error.message || error);
      throw error;
    }
  }

  /**
   * Search Google Books by ISBN
   */
  async searchGoogleBooksByIsbn(isbn) {
    try {
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      const isbnVariants = [cleanIsbn];
      
      if (cleanIsbn.length === 13 && cleanIsbn.startsWith('978')) {
        isbnVariants.push(isbn13ToIsbn10(cleanIsbn));
      } else if (cleanIsbn.length === 10) {
        isbnVariants.push('978' + cleanIsbn);
      }
      
      for (const isbnVariant of isbnVariants) {
        if (!isbnVariant) continue;
        try {
          const params = { q: `isbn:${isbnVariant}`, maxResults: 1, projection: 'full' };
          const response = await axios.get(this.googleBooksBaseUrl, { params, timeout: 10000 });
          
          if (!response.data.items || response.data.items.length === 0) continue;
          
          try {
            const volumeId = response.data.items[0].id;
            const volumeResponse = await axios.get(
              `${this.googleBooksBaseUrl}/${volumeId}`, 
              { params: { projection: 'full' }, timeout: 10000, validateStatus: (status) => status < 500 }
            );
            return [this.formatGoogleBook(volumeResponse.data)];
          } catch (volumeError) {
            return [this.formatGoogleBook(response.data.items[0])];
          }
        } catch (variantError) {
          continue;
        }
      }
      
      return [];
    } catch (error) {
      if (error.response && error.response.status === 404) return [];
      console.error('Error searching Google Books by ISBN:', error);
      throw error;
    }
  }

  /**
   * Get full volume details from Google Books
   */
  async getGoogleBookVolume(volumeId) {
    try {
      const response = await axios.get(
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
  formatGoogleBook(item) {
    const volumeInfo = item.volumeInfo || {};
    const volumeId = item.id; // Google Books volume ID (e.g., "NowHAQAAMAAJ")
    
    // Extract ISBNs
    const industryIdentifiers = volumeInfo.industryIdentifiers || [];
    let isbn = null;
    let isbn13 = null;
    
    industryIdentifiers.forEach(identifier => {
      if (identifier.type === 'ISBN_10') isbn = identifier.identifier;
      else if (identifier.type === 'ISBN_13') isbn13 = identifier.identifier;
    });
    
    if (!isbn && isbn13) isbn = isbn13;
    
    // Check if this is an ISMN (music score) - starts with 979-0
    const isIsmn = isbn13 && isbn13.replace(/[-\s]/g, '').startsWith('9790');
    
    // Extract covers with all sizes
    let coverUrl = null;
    let availableCovers = [];
    
    if (volumeInfo.imageLinks) {
      const coverSizes = [
        { key: 'large', priority: 4 },
        { key: 'medium', priority: 3 },
        { key: 'small', priority: 2 },
        { key: 'thumbnail', priority: 1 }
      ];
      
      coverSizes.forEach(({ key, priority }) => {
        if (volumeInfo.imageLinks[key]) {
          let url = volumeInfo.imageLinks[key];
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
        coverUrl = availableCovers.sort((a, b) => b.priority - a.priority)[0].url;
      }
    }
    
    // Fallback: construct cover URL from volume ID if no imageLinks
    // Google Books serves covers at a predictable URL pattern
    if (volumeId && availableCovers.length === 0) {
      // Try multiple zoom levels - higher zoom = larger image
      const zoomLevels = [
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
    let language = volumeInfo.language || null;
    if (language && language.length > 2) {
      const langMap = { 'eng': 'en', 'fre': 'fr', 'fra': 'fr' };
      language = langMap[language] || language;
    }
    
    // Extract genres from categories - actively search for genre information
    let genres = (volumeInfo.categories || [])
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
      .filter(cat => cat !== null && cat.trim().length > 0);
    
    if (genres.length === 0 && volumeInfo.categories) genres = volumeInfo.categories;
    
    // Log genre extraction
    if (genres.length > 0) {
      logger.info(`[Google Books] Extracted ${genres.length} genre(s): ${genres.join(', ')}`);
    }
    
    // Extract published year
    let publishedYear = null;
    if (volumeInfo.publishedDate) {
      const yearMatch = volumeInfo.publishedDate.match(/\d{4}/);
      if (yearMatch) publishedYear = parseInt(yearMatch[0]);
    }
    
    // Build URLs
    const urls = {};
    if (volumeInfo.canonicalVolumeLink) urls.googleBooks = volumeInfo.canonicalVolumeLink;
    if (volumeInfo.infoLink) urls.googleBooksInfo = volumeInfo.infoLink;
    if (volumeInfo.previewLink) urls.googleBooksPreview = volumeInfo.previewLink;
    
    return {
      isbn, isbn13,
      title: volumeInfo.title || null,
      subtitle: removeSurroundingQuotes(volumeInfo.subtitle || null),
      authors: volumeInfo.authors?.length > 0 ? volumeInfo.authors : null,
      publisher: removeSurroundingQuotes(volumeInfo.publisher || null),
      publishedYear, language,
      format: null, filetype: null, drm: null, narrator: null, runtime: null,
      series: null, seriesNumber: null,
      genres: genres.length > 0 ? genres : null,
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
  async searchOpenLibrary(query, limit = 20, language = 'any') {
    try {
      const params = { q: query, limit: Math.min(limit * 5, 100) };
      const response = await axios.get(`${this.openLibraryBaseUrl}/search.json`, { params, timeout: this.timeout });
      
      if (!response.data.docs || response.data.docs.length === 0) return [];
      
      // Score and sort results
      const normalize = (str) => (str || '').toLowerCase().trim();
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
          let workData = null;
          const workKey = doc.work_key?.[0] || doc.works?.[0]?.key;
          if (workKey) {
            try {
              const workResponse = await axios.get(`${this.openLibraryBaseUrl}${workKey}.json`, { timeout: 5000 });
              workData = workResponse.data;
            } catch (error) { /* ignore */ }
          }
          return { doc, workData, score };
        })
      );
      
      // Format and filter results
      const formattedResults = resultsWithMetadata
        .filter(result => result.status === 'fulfilled')
        .map(result => {
          const { doc, workData, score } = result.value;
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
          return ['en', 'eng', 'fr', 'fre', 'fra'].includes(lang) || book._relevanceScore >= 100;
        })
        .sort((a, b) => b._relevanceScore - a._relevanceScore)
        .slice(0, limit)
        .map(({ _relevanceScore, _docLanguages, ...book }) => book);
      
      return formattedResults;
    } catch (error) {
      console.error('Error searching OpenLibrary:', error);
      throw error;
    }
  }

  /**
   * Search by ISBN using OpenLibrary
   */
  async searchByIsbn(isbn) {
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
      
      let response;
      try {
        response = await axios.get(`${this.openLibraryBaseUrl}/isbn/${cleanIsbn}.json`, { timeout: 10000 });
      } catch (error) {
        if (cleanIsbn.length === 13 && error.response?.status === 404) {
          const isbn10 = isbn13ToIsbn10(cleanIsbn);
          if (isbn10) {
            try {
              response = await axios.get(`${this.openLibraryBaseUrl}/isbn/${isbn10}.json`, { timeout: 10000 });
            } catch (innerError) {
              if (innerError.response?.status === 404) return [];
              throw innerError;
            }
          } else {
            return [];
          }
        } else if (error.response?.status === 404) {
          return [];
        } else {
          throw error;
        }
      }
      
      const bookData = response.data;
      
      // Get work details
      let workData = null;
      if (bookData.works && bookData.works.length > 0) {
        try {
          const workResponse = await axios.get(`${this.openLibraryBaseUrl}${bookData.works[0].key}.json`, { timeout: 10000 });
          workData = workResponse.data;
        } catch (error) { /* ignore */ }
      }
      
      // Resolve author names
      if (bookData.authors && bookData.authors.length > 0) {
        const authorNames = await Promise.allSettled(
          bookData.authors.map(async (author) => {
            if (author.key) {
              try {
                const authorResponse = await axios.get(`${this.openLibraryBaseUrl}${author.key}.json`, { timeout: 5000 });
                return authorResponse.data.name || null;
              } catch { return author.name || null; }
            }
            return author.name || null;
          })
        );
        const resolved = authorNames.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
        if (resolved.length > 0) bookData.author_name = resolved;
      }
      
      return [this.formatOpenLibraryBook(bookData, workData)];
    } catch (error) {
      if (error.response?.status === 404) return [];
      console.error('Error searching by ISBN:', error);
      throw error;
    }
  }

  /**
   * Format OpenLibrary book data to our schema
   */
  formatOpenLibraryBook(doc, workData = null) {
    // Extract ISBNs
    const allIsbns = [...(doc.isbn || []), ...(doc.isbn_10 || []), ...(doc.isbn_13 || [])];
    const isbn10 = allIsbns.find(i => i && i.length === 10) || null;
    const isbn13 = allIsbns.find(i => i && i.length === 13) || null;
    const isbn = isbn10 || isbn13 || allIsbns[0] || null;
    
    // Extract authors
    const authors = [];
    if (workData?.authors) {
      workData.authors.forEach(author => {
        if (typeof author === 'object' && author.author?.name) authors.push(author.author.name);
        else if (typeof author === 'string') authors.push(author);
      });
    }
    if (authors.length === 0 && doc.author_name) {
      authors.push(...doc.author_name);
    } else if (authors.length === 0 && doc.authors) {
      doc.authors.forEach(author => {
        if (typeof author === 'string') authors.push(author);
        else if (author.name) authors.push(author.name);
      });
    }
    
    // Extract cover
    let coverUrl = null;
    if (doc.cover_i) coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    else if (doc.cover_large) coverUrl = doc.cover_large;
    else if (workData?.covers?.length > 0) coverUrl = `https://covers.openlibrary.org/b/id/${workData.covers[0]}-L.jpg`;
    
    // Extract description
    let description = null;
    if (workData?.description) {
      description = typeof workData.description === 'string' 
        ? workData.description 
        : workData.description.value || null;
    }
    description = cleanDescription(description) || (doc.first_sentence?.[0] || doc.first_sentence || null);
    
    // Extract publish year
    let publishedYear = null;
    if (workData?.first_publish_date) {
      const match = workData.first_publish_date.match(/\d{4}/);
      if (match) publishedYear = parseInt(match[0]);
    }
    if (!publishedYear && doc.first_publish_year) publishedYear = doc.first_publish_year;
    if (!publishedYear && doc.publish_date) {
      const match = doc.publish_date.match(/\d{4}/);
      if (match) publishedYear = parseInt(match[0]);
    }
    if (!publishedYear && doc.publish_year?.length > 0) publishedYear = parseInt(doc.publish_year[0]);
    
    // Extract publisher
    let publisher = doc.publisher?.[0] || doc.publishers?.[0] || null;
    publisher = removeSurroundingQuotes(publisher);
    
    // Extract series
    let series = workData?.series?.[0] || workData?.series || doc.series?.[0] || doc.series || null;
    
    // Extract genres from subjects - actively search for genre/tag information
    const genres = [];
    if (workData?.subjects) {
      genres.push(...workData.subjects.slice(0, 15).map(s => typeof s === 'string' ? s : (s.name || s)));
    }
    if (genres.length === 0 && doc.subject) genres.push(...doc.subject.slice(0, 15));
    
    // Extract tags from additional OpenLibrary fields (subject_places, subject_times, subject_people)
    const tags = [];
    if (workData?.subject_places) {
      tags.push(...workData.subject_places.slice(0, 5).map(s => typeof s === 'string' ? s : (s.name || s)));
    }
    if (workData?.subject_times) {
      tags.push(...workData.subject_times.slice(0, 5).map(s => typeof s === 'string' ? s : (s.name || s)));
    }
    if (workData?.subject_people) {
      tags.push(...workData.subject_people.slice(0, 5).map(s => typeof s === 'string' ? s : (s.name || s)));
    }
    
    // Log genre/tag extraction
    if (genres.length > 0) {
      logger.info(`[OpenLibrary] Extracted ${genres.length} genre(s): ${genres.slice(0, 5).join(', ')}${genres.length > 5 ? '...' : ''}`);
    }
    if (tags.length > 0) {
      logger.info(`[OpenLibrary] Extracted ${tags.length} tag(s): ${tags.join(', ')}`);
    }
    
    // Extract language
    let language = null;
    const langCodes = doc.language || workData?.languages || [];
    if (langCodes.length > 0) {
      const langCode = Array.isArray(langCodes) ? langCodes[0] : langCodes;
      const langMap = { 'eng': 'en', 'fre': 'fr', 'fra': 'fr', 'spa': 'es', 'ger': 'de', 'ita': 'it', 'por': 'pt', 'rus': 'ru', 'jpn': 'ja', 'kor': 'ko', 'chi': 'zh' };
      language = langMap[langCode] || langCode;
    }
    
    // Build URLs
    const urls = {};
    if (doc.key) urls.openlibrary = `https://openlibrary.org${doc.key}`;
    if (workData?.key) urls.openlibraryWork = `https://openlibrary.org${workData.key}`;
    
    // Collect available covers
    const availableCovers = [];
    
    // Add covers from doc and work
    if (doc.covers && Array.isArray(doc.covers)) {
      doc.covers.forEach((coverId, index) => {
        if (coverId) {
          availableCovers.push(...bookCoverService.generateOpenLibraryCoverIdCovers(coverId, index === 0 ? 'front' : 'back'));
        }
      });
    }
    if (workData?.covers && Array.isArray(workData.covers)) {
      workData.covers.forEach((coverId, index) => {
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
  _getLangCodes(language) {
    const langMap = {
      'en': ['en', 'eng'], 'eng': ['en', 'eng'],
      'fr': ['fr', 'fre', 'fra'], 'fre': ['fr', 'fre', 'fra'], 'fra': ['fr', 'fre', 'fra'],
      'de': ['de', 'ger'], 'ger': ['de', 'ger'],
      'es': ['es', 'spa'], 'spa': ['es', 'spa'],
      'it': ['it', 'ita'], 'ita': ['it', 'ita'],
      'pt': ['pt', 'por'], 'por': ['pt', 'por']
    };
    return langMap[language?.toLowerCase()] || [language?.toLowerCase()];
  }
}

module.exports = new BookApiService();

