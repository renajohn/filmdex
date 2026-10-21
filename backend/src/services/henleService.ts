import axios from 'axios';

/**
 * G. Henle Verlag's editions, by their HN number: its title, its composer,
 * its page and its cover, as henle.de's search suggestions give them, and its
 * difficulty level from its page. An ISMN of 979-0-2018 is Henle's, and holds
 * the number: 979-0-2018-0383-8 is HN 383. Google Books and Open Library know
 * none of these by their ISMN.
 */

const SITE = 'https://www.henle.de';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (DexVault; personal collection)' };

export interface HenleEdition {
  number: string;
  title: string;
  composer: string | null;
  url: string;
  cover: string | null;
  /** Henle's level, 1 (easy) to 9 (very difficult), when its page gives it. */
  level: number | null;
}

/** The HN number an ISMN holds, when the ISMN is Henle's. */
export const henleNumberOf = (code: string | null | undefined): number | null => {
  const digits = String(code || '').replace(/[^\d]/g, '');
  if (digits.length !== 13 || !digits.startsWith('97902018')) return null;
  const number = Number(digits.slice(8, 12));
  return number > 0 ? number : null;
};

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

const cache = new Map<number, HenleEdition | null>();

/** An edition by its number, read once; null when henle.de does not know it. */
const edition = async (number: number): Promise<HenleEdition | null> => {
  if (cache.has(number)) return cache.get(number)!;
  const suggest = (await axios.get(`${SITE}/suggest`, { params: { search: `HN ${number}` }, headers: HEADERS, timeout: 15000 })).data as string;
  const link = [...suggest.matchAll(/<a[^>]+href="(https:\/\/www\.henle\.de\/[^"]+\/HN-(\d+))"[^>]*>([\s\S]*?)<\/a>/g)]
    .find(match => Number(match[2]) === number);
  if (!link) { cache.set(number, null); return null; }
  const composer = link[3].match(/class="product-componist-name"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const title = link[3].match(/class="product-name"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  const cover = link[3].match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  let level: number | null = null;
  try {
    const page = text((await axios.get(link[1], { headers: HEADERS, timeout: 15000 })).data as string);
    // "Levels of Difficulty Piano Difficult 7": its block in the shop, not the menu's "Level of Difficulty".
    const found = page.match(/Shop Levels of Difficulty\s+[\p{L} ]{2,40}?\s+(?:Very easy|Easy|Medium|Difficult|Very difficult)\s+(\d)\b/u);
    level = found ? Number(found[1]) : null;
  } catch { /* its level is a nicety */ }
  const result: HenleEdition = {
    number: `HN ${number}`,
    title: text(title || '') || text(link[3]),
    composer: composer ? text(composer) || null : null,
    url: link[1],
    cover,
    level,
  };
  cache.set(number, result);
  return result;
};

export default { edition };
