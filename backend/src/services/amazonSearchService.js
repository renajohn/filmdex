const axios = require('axios');
const logger = require('../logger');

const AMAZON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

/**
 * Search Amazon.fr for book products by title, authors, and type.
 * Returns up to 5 matching products.
 *
 * @param {string} title - Book title from LLM extraction
 * @param {string[]} authors - Author names from LLM extraction
 * @param {string} bookType - book | graphic-novel | score
 * @returns {Array<{ url: string, asin: string, title: string }>}
 */
async function searchAmazonProducts(title, authors, bookType) {
  if (!title) return [];

  // Build search query
  const parts = [title];
  if (authors && authors.length > 0) {
    parts.push(authors[0]); // First author is usually enough
  }
  // Type hints for better results
  if (bookType === 'graphic-novel') parts.push('BD');
  else if (bookType === 'score') parts.push('partition');

  const query = parts.join(' ');
  const searchUrl = `https://www.amazon.fr/s?k=${encodeURIComponent(query)}&i=stripbooks`;

  logger.info(`[AmazonSearch] Searching: ${searchUrl}`);

  try {
    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: AMAZON_HEADERS
    });

    const html = response.data;

    // Extract product URLs with ASINs from search results
    // Amazon search results contain links like /dp/ASIN/ or /gp/product/ASIN/
    const asinPattern = /\/dp\/([A-Z0-9]{10})(?:\/|["?&])/g;
    const seen = new Set();
    const results = [];

    let match;
    while ((match = asinPattern.exec(html)) !== null) {
      const asin = match[1];
      if (seen.has(asin)) continue;
      seen.add(asin);

      const productUrl = `https://www.amazon.fr/dp/${asin}`;
      results.push({ url: productUrl, asin, title: null });

      if (results.length >= 5) break; // Cap at 5 results
    }

    if (results.length === 0) {
      logger.info('[AmazonSearch] No products found');
      return [];
    }

    // Try to extract titles from search result cards for the first few results
    for (const result of results) {
      // Look for title near this ASIN in the HTML
      const titlePattern = new RegExp(
        `(?:class="[^"]*a-text-normal[^"]*"[^>]*>|class="[^"]*s-line-clamp[^"]*"[^>]*>\\s*<[^>]+>)([^<]+)(?:</a>|</span>)(?:[\\s\\S]{0,500})${result.asin}|${result.asin}(?:[\\s\\S]{0,500})(?:class="[^"]*a-text-normal[^"]*"[^>]*>|class="[^"]*s-line-clamp[^"]*"[^>]*>\\s*<[^>]+>)([^<]+)`,
        'i'
      );
      const titleMatch = html.match(titlePattern);
      if (titleMatch) {
        result.title = (titleMatch[1] || titleMatch[2] || '').trim();
      }
    }

    logger.info(`[AmazonSearch] Found ${results.length} results, first: ${results[0].asin}`);
    return results;
  } catch (error) {
    logger.error(`[AmazonSearch] Search failed: ${error.message}`);
    return [];
  }
}

/**
 * Backward-compatible wrapper: returns only the first result or null.
 */
async function searchAmazonProduct(title, authors, bookType) {
  const results = await searchAmazonProducts(title, authors, bookType);
  return results.length > 0 ? results[0] : null;
}

module.exports = { searchAmazonProduct, searchAmazonProducts };
