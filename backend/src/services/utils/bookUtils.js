/**
 * Book utility functions
 * Pure functions for text processing and data normalization
 */

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
 * Normalize title for comparison (remove accents, lowercase, remove special chars)
 */
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize series name for comparison (remove accents, lowercase, trim)
 */
function normalizeSeriesName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Thorgal - Tome 21 - La Couronne d'Ogotaï" format (French comics)
    {
      regex: /^(.+?)\s*-\s*Tome\s+0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = match[1].trim();
        const volumeNum = parseInt(match[2], 10);
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // "Series - Tome 21" or "Series Tome 21" format (with or without dash)
    {
      regex: /\s*-\s*Tome\s+0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
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
        if (seriesName.length > 3) {
          return { series: seriesName, seriesNumber: volumeNum };
        }
        return null;
      }
    },
    // T01, T1, T02, etc. (most common for French comics)
    {
      regex: /\s+T0*(\d+)(?:\s*-|$)/i,
      extractSeries: (title, match) => {
        const seriesName = title.substring(0, match.index).trim();
        const volumeNum = parseInt(match[1], 10);
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
        const beforeNumber = title.substring(0, match.index).trim();
        if (beforeNumber.length > 3) {
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

/**
 * Check if an ISBN/ISMN is for a music score
 * Music scores use ISMN (International Standard Music Number) starting with 979-0
 */
function isMusicScore(isbn) {
  if (!isbn) return false;
  const clean = isbn.replace(/[-\s]/g, '');
  return clean.startsWith('9790');
}

/**
 * Convert ISBN-13 to ISBN-10
 * Only works for 978 prefix (979 ISBNs don't have ISBN-10 equivalent)
 */
function isbn13ToIsbn10(isbn13) {
  if (!isbn13 || isbn13.length !== 13 || !isbn13.startsWith('978')) {
    return null;
  }
  const isbn9 = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(isbn9[i]) * (10 - i);
  }
  const check = (11 - (sum % 11)) % 11;
  return isbn9 + (check === 10 ? 'X' : check.toString());
}

/**
 * Common network error codes for graceful error handling
 */
const NETWORK_ERROR_CODES = [
  'EADDRNOTAVAIL',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNABORTED',
  'ENETUNREACH'
];

/**
 * Check if an error is a network error
 */
function isNetworkError(error) {
  const errorCode = error.code || error.errno;
  return NETWORK_ERROR_CODES.includes(errorCode);
}

/**
 * Clean up description HTML
 */
function cleanDescription(description) {
  if (!description || typeof description !== 'string') return null;
  
  let cleaned = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return removeSurroundingQuotes(cleaned);
}

/**
 * Detect book type based on ISBN and genres
 * Returns 'score', 'graphic-novel', or 'book'
 * 
 * Detection logic:
 * - Score: ISBN13 starts with 9790 (ISMN) OR genres contain "Music /"
 * - Graphic Novel: genres contain "Comics & Graphic Novels", "Manga", "Bandes dessinées", or "Comic Strips"
 * - Book: default
 */
function detectBookType(isbn, genres = []) {
  // Ensure genres is an array
  const genreList = Array.isArray(genres) ? genres : [];
  
  // 1. Check for music score by ISBN (ISMN)
  if (isMusicScore(isbn)) {
    return 'score';
  }
  
  // 2. Check genres for music or comics patterns
  for (const genre of genreList) {
    if (!genre || typeof genre !== 'string') continue;
    const genreLower = genre.toLowerCase();
    
    // Check for music score
    if (genreLower.includes('music /') || genreLower.startsWith('music/')) {
      return 'score';
    }
    
    // Check for graphic novel / comics
    // Check various patterns that indicate comics/graphic novels
    if (
      genreLower.includes('comics & graphic novels') ||
      genreLower.includes('comics and graphic novels') ||
      genreLower.includes('bandes dessinées') ||
      genreLower.includes('bande dessinée') ||
      genreLower.includes('bd ') || // French abbreviation
      genreLower.includes(' comic') ||
      genreLower.includes('comic strips') ||
      genreLower.includes('comic book') ||
      genreLower.includes('manga') ||
      genreLower.includes('/manga/') ||
      genreLower.includes('graphic novel') ||
      genreLower.includes('graphicnovel') ||
      genreLower === 'comics' ||
      genreLower === 'comic' ||
      genreLower === 'bande dessinée' ||
      genreLower === 'bandes dessinées'
    ) {
      return 'graphic-novel';
    }
  }
  
  // Default to book
  return 'book';
}

module.exports = {
  removeSurroundingQuotes,
  normalizeArrayField,
  normalizeTitle,
  normalizeSeriesName,
  extractSeriesFromTitle,
  isMusicScore,
  detectBookType,
  isbn13ToIsbn10,
  isNetworkError,
  cleanDescription,
  NETWORK_ERROR_CODES
};


