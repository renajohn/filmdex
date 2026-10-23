import axios from 'axios';
import { cleanTitle, normalizeTitle } from '../warnings/titles';

/**
 * FilmAges (filmages.ch), the cinema commissions of Vaud and Geneva: a legal age, a
 * suggested age, and the elements the commission weighed to set them. No API: the
 * search and the film pages are read as HTML, one request at a time.
 */
const BASE_URL = 'https://www.filmages.ch';
const USER_AGENT = 'DexVault/1.0 +https://github.com/renajohn/filmdex';
const TIMEOUT_MS = 15000;
/** A director's search lists 25 films a page; Spielberg fills three. */
const MAX_DIRECTOR_PAGES = 4;
/** Film pages read at most to find a director's film by its year alone. */
const MAX_YEAR_LOOKUPS = 15;

export interface FilmagesRow {
  id: number;
  titleFrench: string;
  titleOriginal: string;
  director: string;
}

export interface FilmagesElement {
  label: string;
  description: string;
}

export interface FilmagesFilm {
  id: number;
  year: number | null;
  ageLegal: number | null;
  ageSuggested: number | null;
  indications: FilmagesElement[];
  counterIndications: FilmagesElement[];
  synthesis: string | null;
}

export interface MatchInput {
  title: string;
  original_title?: string | null;
  director?: string | null;
  release_date?: string | null;
}

let requestCount = 0;
export const getRequestCount = (): number => requestCount;

/** FILMAGES_OFFLINE=1 keeps DexVault off filmages.ch (the tests set it). */
export const isEnabled = (): boolean => process.env.FILMAGES_OFFLINE !== '1';

export const filmagesUrl = (id: number): string => `${BASE_URL}/films/detail/items/${id}.html`;

const fetchHtml = async (url: string): Promise<string> => {
  requestCount += 1;
  const response = await axios.get<string>(url, {
    timeout: TIMEOUT_MS,
    responseType: 'text',
    // The site refuses a request that does not come from itself.
    headers: { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/films/recherche.html` },
  });
  return response.data;
};

const decode = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const textOf = (fragment: string): string =>
  // The page's own line breaks are layout; only its <br />s are lines.
  decode(fragment.replace(/\s*\n\s*/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ''))
    .split('\n').map(line => line.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** "16 ans" is 16; "-" or nothing is no age. */
export const parseAge = (value: string | null | undefined): number | null => {
  const match = value?.match(/(\d+)\s*ans?/);
  return match ? Number(match[1]) : null;
};

export const parseSearch = (html: string): FilmagesRow[] =>
  (html.match(/<tr class="item[\s\S]*?<\/tr>/g) || []).flatMap(row => {
    const id = row.match(/items\/(\d+)\.html/);
    if (!id) return [];
    const field = (name: string) => {
      const cell = row.match(new RegExp(`class="field ${name}">([\\s\\S]*?)</td>`));
      return cell ? textOf(cell[1]) : '';
    };
    return [{
      id: Number(id[1]),
      titleFrench: field('title_french'),
      titleOriginal: field('title_original'),
      director: field('director'),
    }];
  });

/** The inside of `<div class="field name">…<div class="value">…</div>`, up to the field's end. */
const fieldValue = (html: string, name: string): string | null => {
  const start = html.indexOf(`<div class="field ${name}">`);
  if (start < 0) return null;
  const valueAt = html.indexOf('<div class="value">', start);
  if (valueAt < 0) return null;
  const from = valueAt + '<div class="value">'.length;
  // A value holds no div of its own: the next closing div ends it.
  const end = html.indexOf('</div>', from);
  return html.slice(from, end < 0 ? undefined : end);
};

/** Each element is a glossary link: its label, then its definition in a <dfn>. */
const parseElements = (fragment: string | null): FilmagesElement[] =>
  fragment
    ? [...fragment.matchAll(/<a class="glossarylink[^"]*">([\s\S]*?)<dfn class="glossarydescription">([\s\S]*?)<\/dfn><\/a>/g)]
      .map(([, label, description]) => ({ label: textOf(label), description: textOf(description) }))
      .filter(element => element.label)
    : [];

export const parseFilm = (id: number, html: string): FilmagesFilm => {
  const text = (name: string) => {
    const value = fieldValue(html, name);
    return value === null ? null : textOf(value) || null;
  };
  const year = text('year')?.match(/\d{4}/);
  return {
    id,
    year: year ? Number(year[0]) : null,
    ageLegal: parseAge(text('age_legal')),
    ageSuggested: parseAge(text('age_suggested')),
    indications: parseElements(fieldValue(html, 'indication')),
    counterIndications: parseElements(fieldValue(html, 'counter_indication')),
    synthesis: text('final_remark'),
  };
};

/** A slash would end the search's path: the site searches words, so a space does as well. */
const searchUrl = (query: string, page: number): string =>
  `${BASE_URL}/films/recherche/search/${encodeURIComponent(query.replace(/\//g, ' '))}.html${page > 1 ? `?page=${page}` : ''}`;

const search = async (query: string, pages = 1): Promise<FilmagesRow[]> => {
  const rows: FilmagesRow[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const found = parseSearch(await fetchHtml(searchUrl(query, page)));
    rows.push(...found);
    if (found.length < 25) break;
  }
  return rows;
};

const getFilm = async (id: number): Promise<FilmagesFilm> => parseFilm(id, await fetchHtml(filmagesUrl(id)));

const nameWords = (name: string): string[] => normalizeTitle(name).split(' ').filter(Boolean);

/**
 * "Steven Spielberg" meets "Eric Toledano, Olivier Nakache"'s kind of list; a surname
 * found anywhere in the other name will do: "Jennifer Yuh" is "Jennifer Yuh Nelson".
 */
export const sameDirector = (ours: string | null | undefined, theirs: string): boolean => {
  const mine = (ours || '').split(',').map(nameWords).filter(words => words.length);
  const listed = theirs.split(',').map(nameWords).filter(words => words.length);
  return mine.some(a => listed.some(b => b.includes(a[a.length - 1]) || a.includes(b[b.length - 1])));
};

/**
 * The keys a FilmAges title answers to: "Truman show (Le)" is also "Le Truman show",
 * and "Ocean's 13 - Ocean's Thirteen" is each of its halves.
 */
export const titleKeys = (title: string): string[] => {
  const keys = new Set<string>();
  const add = (value: string) => { const key = normalizeTitle(value); if (key) keys.add(key); };
  const variants = [title, ...title.split(/\s+-\s+/)];
  for (const variant of variants) {
    add(variant);
    const article = variant.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (article) add(`${article[2]} ${article[1]}`.replace(/' /g, "'"));
  }
  return [...keys];
};

const yearOf = (date: string | null | undefined): number | null => {
  const match = date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
};

/** The queries tried in order: the original title, the title, each without its subtitle. */
export const queriesFor = (movie: MatchInput): string[] => {
  const queries: string[] = [];
  const add = (value: string | null | undefined) => {
    const cleaned = value ? cleanTitle(value) : '';
    if (cleaned && !queries.some(q => q.toLowerCase() === cleaned.toLowerCase())) queries.push(cleaned);
  };
  add(movie.original_title);
  add(movie.title);
  for (const title of [movie.original_title, movie.title]) {
    const head = title?.split(/\s*[:–]\s+|\s+-\s+/)[0];
    if (head && head.length >= 4 && head !== title) add(head);
  }
  return queries;
};

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
const FILLERS = new Set(['the', 'le', 'la', 'les', 'l', 'a', 'an', 'un', 'une', 'de', 'des', 'du', 'of', 'vol', 'volume', 'vs', 'chapitre', 'part', 'partie']);

/** The words that carry a title: no articles, "III" is "3". */
export const titleWords = (title: string): string[] =>
  normalizeTitle(title).split(' ').map(word => ROMAN[word] ?? word).filter(word => word && !FILLERS.has(word));

type Candidate = { row: FilmagesRow; exact: boolean; shared: boolean };

const rank = (movie: MatchInput, rows: FilmagesRow[]): Candidate[] => {
  const titles = [movie.original_title, movie.title].filter(Boolean) as string[];
  const ours = new Set(titles.map(normalizeTitle));
  const words = new Set(titles.flatMap(titleWords).filter(word => word.length >= 3 || /^\d+$/.test(word)));
  return rows
    .filter(row => sameDirector(movie.director, row.director))
    .map(row => ({
      row,
      exact: [...titleKeys(row.titleOriginal), ...titleKeys(row.titleFrench)].some(key => ours.has(key)),
      shared: [row.titleOriginal, row.titleFrench].flatMap(titleWords).some(word => words.has(word)),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.shared) - Number(a.shared));
};

/**
 * The film of a movie, or null. A candidate must share a director; its title must be
 * the movie's (original or French); or share a word of it and come out within a year
 * of it ("Guardians of the Galaxy Vol. 3" is "Les gardiens de la galaxie 3"); or be the
 * only one a title's search found by that director. Its year, when both know it, may
 * differ by two with the same title, by one without.
 */
const findMatch = async (movie: MatchInput): Promise<FilmagesFilm | null> => {
  if (!movie.director) return null;
  const year = yearOf(movie.release_date);
  const tried = new Set<number>();

  // Without the same title, a film must share a word of it, and its year must be known
  // on both sides. At most a few pages are read for that.
  const accept = async (candidates: Candidate[], loose: boolean): Promise<FilmagesFilm | null> => {
    const usable = candidates
      .filter(c => c.exact || (c.shared && year !== null) || (loose && candidates.length === 1))
      .slice(0, 4);
    for (const { row, exact } of usable) {
      if (tried.has(row.id)) continue;
      tried.add(row.id);
      const film = await getFilm(row.id);
      // FilmAges gives the year a film was made, TMDB the year it came out: two apart at times.
      if (year === null || film.year === null) {
        if (exact || loose) return film;
      } else if (Math.abs(film.year - year) <= (exact ? 2 : 1)) {
        return film;
      }
    }
    return null;
  };

  for (const query of queriesFor(movie)) {
    const film = await accept(rank(movie, await search(query)), true);
    if (film) return film;
  }
  // Titles translated beyond recognition ("Mary to majo no hana"): the director's films.
  const surname = movie.director.split(',')[0].trim().split(/\s+/).pop();
  if (!surname || surname.length < 3) return null;
  const candidates = rank(movie, await search(surname, MAX_DIRECTOR_PAGES));
  const film = await accept(candidates, false);
  if (film || year === null) return film;
  // "Spirited Away" is "Le voyage de Chihiro": the director's only film of that very year.
  const sameYear: FilmagesFilm[] = [];
  for (const { row } of candidates.slice(0, MAX_YEAR_LOOKUPS)) {
    if (tried.has(row.id)) continue;
    const other = await getFilm(row.id);
    if (other.year === year) sameYear.push(other);
  }
  return sameYear.length === 1 ? sameYear[0] : null;
};

export default { search, getFilm, findMatch, filmagesUrl, getRequestCount, isEnabled };
