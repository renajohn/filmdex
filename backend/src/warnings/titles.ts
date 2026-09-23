// Only trailing groups are DexVault suffixes: "(500) Days of Summer" keeps its "(500)".
const TRAILING_GROUPS = /(\s*(\[[^\]]*\]|\([^)]*\)))+\s*$/;

/**
 * Strip what DexVault adds to a title and DoesTheDogDie does not know about:
 * "[fr]", "(zone A)" at the end, "- FINAL CUT", "- Director's Cut", ", the complete series".
 */
export const cleanTitle = (title: string): string =>
  title
    .replace(TRAILING_GROUPS, '')
    .replace(/\s+-\s+(final cut|director'?s cut)\b.*$/i, '')
    .replace(/,?\s*the complete series$/i, '')
    .replace(TRAILING_GROUPS, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:,]+|[\s\-:,]+$/g, '');

/**
 * Comparison key for a title: no accents, no case, no punctuation, and "et",
 * "&" and "and" dropped, so "Astérix & Obélix" meets "Astérix et Obélix".
 */
export const normalizeTitle = (title: string): string =>
  cleanTitle(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(et|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
