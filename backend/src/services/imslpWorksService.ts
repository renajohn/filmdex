import axios from 'axios';
import musicbrainzService from './musicbrainzService';

/**
 * Musical works as IMSLP's pages tell them: found among a composer's works by
 * their title ("4 Ballades (Chopin, Frédéric)"), with their catalogue number
 * and the list of their pieces as the page writes it, each with the number
 * that finds it in MusicBrainz. What neither MusicBrainz nor Wikidata details:
 * Bertini's études, Mendelssohn's eight books of Lieder ohne Worte.
 *
 * IMSLP has no API for a work's contents: its wiki text is read, its
 * templates ({{LinkWork|Ballade No.1|Op.23|Chopin|Frédéric}}, {{K|E}}) undone.
 */

const API = 'https://imslp.org/api.php';

export interface ImslpPiece {
  title: string;
  /** Its own number, "op. 23", or the set's with its place, "op. 100 no. 4". */
  catalogue: string | null;
  /** Its own page, when the list links one. */
  page: string | null;
}

export interface ImslpWork {
  page: string;
  /** The page's title without the composer: "4 Ballades". */
  title: string;
  catalogue: string | null;
  pieces: ImslpPiece[];
}

const get = async <T>(params: Record<string, string>): Promise<T> => (await axios.get(API, {
  params: { format: 'json', ...params },
  headers: { 'User-Agent': musicbrainzService.userAgent },
  timeout: 15000,
})).data as T;

/** "Op.10 No.3" as MusicBrainz writes it: "op. 10 no. 3"; null for what MusicBrainz does not search by (MWV U 86). */
export const catalogueFor = (text: string | null | undefined): string | null => {
  const m = (text || '').match(/\b(Op(?:us)?|BWV|K|KV|WoO|D|S|L|Hob)\.?\s*([\dIVX]+[a-z]?)(?:[\s,/]*(?:No|Nr|n°)\.?\s*(\d+))?/i);
  if (!m) return null;
  const system = /^op/i.test(m[1]) ? 'op.' : /^kv?$/i.test(m[1]) ? 'K.' : /^(d|s|l)$/i.test(m[1]) ? `${m[1].toUpperCase()}.` : m[1];
  return `${system} ${m[2]}${m[3] ? ` no. ${m[3]}` : ''}`;
};

/** A line of wiki text as words: templates, links, emphasis and tags undone. */
export const unwiki = (text: string): string => text
  .replace(/\{\{K\|([^}|]+)\}\}/g, (_, key: string) => `in ${key.replace(/b$/, '-flat').replace(/#$/, '-sharp')}`)
  .replace(/\{\{(?:MWV|BWV|KV|WoO)\|([^}]+)\}\}/g, (_, args: string) => args.split('|').join(' '))
  .replace(/\{\{[^{}]*\}\}/g, ' ')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/'{2,}/g, '')
  .replace(/\s+/g, ' ')
  .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
  .trim();

/** A page's field: "|Opus/Catalogue Number=Op.100". */
const field = (text: string, name: string): string | null => {
  const m = text.match(new RegExp(`\\n\\|\\s*${name.replace(/[/]/g, '\\/')}\\s*=([^\\n]*)`));
  return m ? m[1].trim() || null : null;
};

/** The pieces a page lists under "Number of Movements/Sections", or as many numbered as it counts. */
export const piecesOf = (text: string, setCatalogue: string | null): ImslpPiece[] => {
  const m = text.match(/\n\|\s*Number of Movements\/Sections\s*=([^\n]*)\n((?:[#*:][^\n]*\n?)*)/);
  if (!m) return [];
  const lines = m[2].split('\n').map(line => line.replace(/^[#*:]+\s*/, '')).filter(Boolean);
  if (lines.length) {
    return lines.map((line, index) => {
      const link = line.match(/\{\{LinkWork\|([^|}]+)\|([^|}]*)\|([^|}]*)\|([^|}]*)\}\}/);
      if (link) {
        const [, title, catalogue, surname, first] = link;
        return { title: unwiki(title), catalogue: catalogueFor(catalogue), page: `${title}${catalogue ? `, ${catalogue}` : ''} (${surname}, ${first})` };
      }
      const set = catalogueFor(setCatalogue);
      return { title: unwiki(line) || `No. ${index + 1}`, catalogue: catalogueFor(line) || (set && !/no\./.test(set) ? `${set} no. ${index + 1}` : null), page: null };
    });
  }
  // "25 studies": as many pieces, numbered within the set.
  const count = Number(m[1].match(/^\s*(\d+)/)?.[1]);
  const set = catalogueFor(setCatalogue);
  if (!Number.isFinite(count) || count < 2 || count > 60) return [];
  return Array.from({ length: count }, (_, index) => ({ title: `No. ${index + 1}`, catalogue: set ? `${set} no. ${index + 1}` : null, page: null }));
};

const cache = new Map<string, ImslpWork | null>();

/** A work's page, read once. */
const work = async (page: string): Promise<ImslpWork | null> => {
  if (cache.has(page)) return cache.get(page)!;
  const data = await get<{ parse?: { wikitext?: { '*'?: string } } }>({ action: 'parse', page, prop: 'wikitext', redirects: '1' });
  const text = data.parse?.wikitext?.['*'];
  const found = text ? (() => {
    const catalogue = unwiki(field(text, 'Opus/Catalogue Number') || '') || null;
    return { page, title: page.replace(/\s*\([^()]*\)\s*$/, ''), catalogue, pieces: piecesOf(text, catalogue) };
  })() : null;
  cache.set(page, found);
  return found;
};

/** A composer's works whose page titles hold these words: "(Chopin, Frédéric)" pages only. */
const searchWorks = async (words: string, composer: string): Promise<string[]> => {
  const surname = composer.split(' ').slice(-1)[0];
  const data = await get<{ query?: { search?: Array<{ title: string }> } }>({
    action: 'query', list: 'search', srsearch: `${words} ${surname}`, srnamespace: '0', srlimit: '8',
  });
  const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // "(Bach, Johann Sebastian)", not "(Bach, Carl Philipp Emanuel)".
  const first = plain(composer.split(' ')[0]);
  return (data.query?.search || []).map(hit => hit.title)
    .filter(title => plain(title).match(/\(([^(),]+),\s*([^()]+)\)\s*$/)?.slice(1).every((part, n) => (n === 0 ? part === plain(surname) : part.startsWith(first))));
};

export default { work, searchWorks };
