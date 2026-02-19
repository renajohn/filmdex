const fs = require('fs');
const path = require('path');
const coverScanService = require('../src/services/coverScanService');
const { expect } = require('@jest/globals');

// Path to the evaluation set
const EVAL_DIR = path.join(__dirname, '../../evalsets/book import');

// Get all book cover images and their corresponding YAML files
const bookFiles = fs.readdirSync(EVAL_DIR)
  .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
  .map(file => ({
    image: file,
    yaml: file.replace(/\.(jpg|jpeg|png|webp)$/i, '.yml')
  }))
  .filter(file => fs.existsSync(path.join(EVAL_DIR, file.yaml)));

// Normalize for comparison (strip casing, punctuation, extra whitespace)
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim();

// Load expected metadata for each book
const testCases = bookFiles.map(file => {
  const yamlContent = fs.readFileSync(path.join(EVAL_DIR, file.yaml), 'utf-8');
  const expected = require('js-yaml').load(yamlContent).expected;
  return { ...file, expected, name: `${file.image} (${expected.title})` };
});

describe('Book Cover Import', () => {
  test.each(testCases.map(tc => [tc.name, tc]))(
    '%s',
    async (_name, { image, expected }) => {
      const imagePath = path.join(EVAL_DIR, image);
      const imageData = fs.readFileSync(imagePath);
      const base64Image = imageData.toString('base64');

      const mimeType = image.endsWith('.jpg') || image.endsWith('.jpeg')
        ? 'image/jpeg'
        : image.endsWith('.png') ? 'image/png'
        : image.endsWith('.webp') ? 'image/webp'
        : 'image/jpeg';

      const result = await coverScanService.analyzeBookImage(base64Image, mimeType);

      // Structural checks (must always pass)
      expect(result.title).toBeDefined();
      expect(result.title).not.toEqual('');
      expect(result.authors).toBeDefined();
      expect(Array.isArray(result.authors)).toBe(true);
      expect(result.book_type).toBeDefined();
      expect(['book', 'graphic-novel', 'score'].includes(result.book_type)).toBe(true);
      expect(result.language).toBeDefined();
      expect(typeof result.language).toBe('string');

      // Accuracy checks (case-insensitive, fuzzy title match)
      const normResult = normalize(result.title);
      const normExpected = normalize(expected.title);
      const titleMatch = normResult.includes(normExpected) || normExpected.includes(normResult);
      if (!titleMatch) {
        console.warn(`  Title mismatch for ${image}: expected "${expected.title}", got "${result.title}"`);
      }
      expect(titleMatch).toBe(true);

      // Author check (at least first expected author found, case-insensitive)
      // Handles reversed names (e.g. "Kanata Konami" vs "Konami Kanata")
      // and abbreviations (e.g. "J.S. Bach" vs "Johann Sebastian Bach")
      if (expected.authors && expected.authors.length > 0 && result.authors.length > 0) {
        const authorMatches = (a, b) => {
          const na = normalize(a);
          const nb = normalize(b);
          if (na.includes(nb) || nb.includes(na)) return true;
          // Check if all name parts of one appear in the other (handles reversed order)
          const partsA = na.split(' ').filter(p => p.length > 1);
          const partsB = nb.split(' ').filter(p => p.length > 1);
          const allAinB = partsA.every(p => partsB.some(q => q.includes(p) || p.includes(q)));
          const allBinA = partsB.every(p => partsA.some(q => q.includes(p) || p.includes(q)));
          if (allAinB || allBinA) return true;
          // Last name match (last word of each)
          const lastA = partsA[partsA.length - 1];
          const lastB = partsB[partsB.length - 1];
          return lastA === lastB;
        };
        const matchedAuthor = result.authors.find(author =>
          expected.authors.some(ea => authorMatches(author, ea))
        );
        if (!matchedAuthor) {
          console.warn(`  Author mismatch for ${image}: expected ${JSON.stringify(expected.authors)}, got ${JSON.stringify(result.authors)}`);
        }
        expect(matchedAuthor).toBeDefined();
      }

      // Book type and language
      if (result.book_type !== expected.book_type) {
        console.warn(`  Type mismatch for ${image}: expected "${expected.book_type}", got "${result.book_type}"`);
      }
      expect(result.book_type).toBe(expected.book_type);
      expect(result.language).toBe(expected.language);

      console.log(`  ✓ Passed: ${image}`);
    },
    120000
  );
});
