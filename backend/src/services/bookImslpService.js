/**
 * IMSLP (Petrucci Music Library) Service
 * Integration for music scores - search and download PDF references
 */

const axios = require('axios');
const https = require('https');
const logger = require('../logger');

/**
 * Music Score Publisher Detection from ISMN
 * ISMN format: 979-0-XXX-YYYYY-Z where XXX is the publisher code
 */
const MUSIC_PUBLISHERS = {
  '201': { name: 'G. Henle Verlag', code: 'henle' },
  '001': { name: 'Schott Music', code: 'schott' },
  '2001': { name: 'Schott Music', code: 'schott' },
  '006': { name: 'Bärenreiter', code: 'barenreiter' },
  '004': { name: 'Peters Edition', code: 'peters' },
  '048': { name: 'Universal Edition', code: 'universal' },
  '051': { name: 'Breitkopf & Härtel', code: 'breitkopf' },
  '014': { name: 'Boosey & Hawkes', code: 'boosey' },
  '044': { name: 'Durand-Salabert-Eschig', code: 'durand' },
};

class BookImslpService {
  constructor() {
    // IMSLP sometimes has SSL certificate issues
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    this.timeout = 15000;
  }

  /**
   * Detect music publisher from ISMN
   */
  detectMusicPublisher(ismn) {
    if (!ismn) return null;
    const cleanIsmn = ismn.replace(/[-\s]/g, '');
    if (!cleanIsmn.startsWith('9790')) return null;
    
    const afterPrefix = cleanIsmn.slice(4);
    const sortedCodes = Object.keys(MUSIC_PUBLISHERS).sort((a, b) => b.length - a.length);
    
    for (const code of sortedCodes) {
      if (afterPrefix.startsWith(code)) {
        return { ...MUSIC_PUBLISHERS[code], publisherCode: code, ismn: cleanIsmn };
      }
    }
    return null;
  }

  /**
   * Search IMSLP for a musical work by title and composer
   */
  async searchWork(title, composer) {
    try {
      const cleanTitle = title.replace(/op\.\s*\d+/gi, '').trim();
      const searchQuery = `${cleanTitle} ${composer || ''}`.trim();
      
      logger.info(`[IMSLP] Searching for: "${searchQuery}"`);
      
      const searchUrl = `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srnamespace=0&srlimit=10&format=json`;
      
      const response = await axios.get(searchUrl, { 
        timeout: this.timeout, 
        httpsAgent: this.httpsAgent 
      });
      const results = response.data?.query?.search || [];
      
      if (results.length === 0) {
        logger.info(`[IMSLP] No results found for "${searchQuery}"`);
        return null;
      }
      
      // Find the best matching work page (work pages have composer name in parentheses)
      let bestMatch = null;
      for (const result of results) {
        const pageTitle = result.title;
        if (pageTitle.includes('(') && pageTitle.includes(')')) {
          bestMatch = result;
          break;
        }
      }
      
      if (!bestMatch) {
        bestMatch = results[0];
      }
      
      logger.info(`[IMSLP] Found work: "${bestMatch.title}"`);
      
      return {
        title: bestMatch.title,
        pageId: bestMatch.pageid,
        pageUrl: `https://imslp.org/wiki/${encodeURIComponent(bestMatch.title.replace(/ /g, '_'))}`
      };
    } catch (error) {
      logger.warn(`[IMSLP] Search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get available PDF files from an IMSLP work page
   */
  async getFiles(pageTitle) {
    try {
      const apiUrl = `https://imslp.org/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=text`;
      
      const response = await axios.get(apiUrl, { 
        timeout: this.timeout, 
        httpsAgent: this.httpsAgent 
      });
      const htmlContent = response.data?.parse?.text?.['*'] || '';
      
      // Extract PDF file references
      const pdfPattern = /href="\/images\/[^"]+\/(PMLP[0-9]+-[^"]+\.pdf)"/g;
      const files = [];
      let match;
      
      while ((match = pdfPattern.exec(htmlContent)) !== null) {
        const filename = match[1];
        
        // Determine quality/priority based on filename
        let priority = 0;
        const lowerFilename = filename.toLowerCase();
        
        // Highest priority: Henle and Urtext editions
        if (lowerFilename.includes('henle')) priority += 100;
        if (lowerFilename.includes('urtext')) priority += 90;
        
        // High priority: Major publishers
        if (lowerFilename.includes('peters')) priority += 50;
        if (lowerFilename.includes('breitkopf')) priority += 50;
        if (lowerFilename.includes('schirmer')) priority += 40;
        if (lowerFilename.includes('durand')) priority += 40;
        
        // Medium priority: Complete scores
        if (!lowerFilename.includes('no.') && !lowerFilename.includes('no_')) priority += 20;
        
        // Lower priority: Arrangements
        if (lowerFilename.includes('arr') || lowerFilename.includes('arrangement')) priority -= 30;
        
        files.push({
          filename,
          priority,
          isHenle: lowerFilename.includes('henle'),
          isUrtext: lowerFilename.includes('urtext')
        });
      }
      
      // Sort by priority and remove duplicates
      const uniqueFiles = [...new Map(files.map(f => [f.filename, f])).values()];
      uniqueFiles.sort((a, b) => b.priority - a.priority);
      
      logger.info(`[IMSLP] Found ${uniqueFiles.length} PDF files`);
      
      return uniqueFiles;
    } catch (error) {
      logger.warn(`[IMSLP] Error getting files: ${error.message}`);
      return [];
    }
  }

  /**
   * Get the download URL for an IMSLP file
   */
  async getDownloadUrl(filename) {
    try {
      const filePageUrl = `https://imslp.org/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&format=json`;
      
      const response = await axios.get(filePageUrl, { 
        timeout: this.timeout, 
        httpsAgent: this.httpsAgent 
      });
      const pages = response.data?.query?.pages || {};
      
      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId];
        if (page.imageinfo && page.imageinfo.length > 0) {
          let url = page.imageinfo[0].url;
          if (url.startsWith('//')) {
            url = 'https:' + url;
          }
          logger.info(`[IMSLP] Got download URL for ${filename}`);
          return url;
        }
      }
      
      return null;
    } catch (error) {
      logger.warn(`[IMSLP] Error getting download URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Search IMSLP and get the best available score PDF
   * Prioritizes Henle and Urtext editions
   */
  async findBestScore(title, composer = null) {
    try {
      const work = await this.searchWork(title, composer);
      if (!work) return null;
      
      const files = await this.getFiles(work.title);
      if (files.length === 0) return null;
      
      const bestFile = files[0];
      const downloadUrl = await this.getDownloadUrl(bestFile.filename);
      if (!downloadUrl) return null;
      
      return {
        workTitle: work.title,
        pageUrl: work.pageUrl,
        filename: bestFile.filename,
        downloadUrl,
        isHenle: bestFile.isHenle,
        isUrtext: bestFile.isUrtext,
        source: 'IMSLP'
      };
    } catch (error) {
      logger.error(`[IMSLP] Error finding best score: ${error.message}`);
      return null;
    }
  }

  /**
   * Add IMSLP data to book if it's a music score
   */
  async enrichMusicScore(bookData) {
    const isbnToCheck = bookData.isbn13 || bookData.isbn;
    const publisher = this.detectMusicPublisher(isbnToCheck);
    
    if (!publisher) return bookData;
    
    logger.info(`[IMSLP] Music score detected - Publisher: ${publisher.name}`);
    
    const composer = bookData.authors?.[0] || null;
    const title = bookData.title;
    
    try {
      logger.info(`[IMSLP] Searching for: "${title}" by ${composer || 'unknown composer'}`);
      const imslpScore = await this.findBestScore(title, composer);
      
      if (!imslpScore) {
        logger.info(`[IMSLP] No score found for "${title}"`);
        return bookData;
      }
      
      logger.info(`[IMSLP] Found score: ${imslpScore.filename} (Henle: ${imslpScore.isHenle}, Urtext: ${imslpScore.isUrtext})`);
      
      // Add IMSLP page URL to the book's URLs
      let urlsObj = bookData.urls;
      if (typeof urlsObj === 'string') {
        try {
          urlsObj = JSON.parse(urlsObj);
        } catch (e) {
          urlsObj = {};
        }
      }
      if (!urlsObj || typeof urlsObj !== 'object' || Array.isArray(urlsObj)) {
        urlsObj = {};
      }
      
      const editionLabel = imslpScore.isHenle ? 'IMSLP (Henle edition)' : 
                           imslpScore.isUrtext ? 'IMSLP (Urtext edition)' : 
                           'IMSLP';
      
      urlsObj[editionLabel] = imslpScore.pageUrl;
      
      const editionNote = imslpScore.isHenle ? 'Henle edition available on IMSLP' : 
                          imslpScore.isUrtext ? 'Urtext edition available on IMSLP' : 
                          'PDF available on IMSLP';
      
      return {
        ...bookData,
        urls: urlsObj,
        annotation: bookData.annotation 
          ? `${bookData.annotation}. ${editionNote}` 
          : editionNote
      };
    } catch (imslpError) {
      logger.warn(`[IMSLP] Enrichment error: ${imslpError.message}`);
      return bookData;
    }
  }
}

module.exports = new BookImslpService();


