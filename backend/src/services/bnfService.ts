import axios from 'axios';

/**
 * The Bibliothèque nationale de France's catalogue, by its SRU API (free, no
 * key): every book published in France is there by legal deposit, with its
 * authors and their roles (a comic's script and drawing), its series and
 * volume, its publisher, its pages, sometimes a summary. No covers.
 * A reprint often has an ISBN of its own the catalogue does not hold, so a
 * book not found by its ISBN is looked for by its series and volume.
 */

const SRU = 'https://catalogue.bnf.fr/api/SRU';
const TIMEOUT_MS = 20000;

export interface BnfBook {
  /** Its notice: https://catalogue.bnf.fr/ark:/12148/… */
  url: string | null;
  title: string;
  subtitle: string | null;
  series: string | null;
  seriesNumber: string | null;
  /** Who wrote it: author, a comic's script. */
  authors: string[];
  /** Who drew it. */
  artists: string[];
  publisher: string | null;
  year: number | null;
  pageCount: number | null;
  summary: string | null;
  /** Drawn: an illustrator and pages in colour, a comic rather than a novel. */
  drawn: boolean;
}

type Field = Record<string, string[]>;

const unescape = (text: string) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

/** A record's fields of a tag, each a map of its subfields. */
const fieldsOf = (record: string, tag: string): Field[] =>
  [...record.matchAll(new RegExp(`<mxc:datafield tag="${tag}"[^>]*>([\\s\\S]*?)</mxc:datafield>`, 'g'))].map(match => {
    const field: Field = {};
    for (const [, code, value] of match[1].matchAll(/<mxc:subfield code="(\w)">([^<]*)<\/mxc:subfield>/g)) {
      (field[code] ||= []).push(unescape(value).trim());
    }
    return field;
  });

const first = (fields: Field[], code: string): string | null => fields.find(field => field[code]?.[0])?.[code]?.[0] ?? null;

/** "Domergue" "Agnès": "Agnès Domergue". */
const nameOf = (field: Field): string => [field.b?.[0], field.a?.[0]].filter(Boolean).join(' ').trim();

/** UNIMARC roles: 070 author (a comic's script), 440 illustrator (its drawing). */
const AUTHOR = new Set(['070', '072', '690']);
const ARTIST = new Set(['440', '760']);

/** A notice of the catalogue read. */
export const parseRecord = (record: string): BnfBook | null => {
  const title = fieldsOf(record, '200');
  if (!first(title, 'a')) return null;
  const series = [...fieldsOf(record, '225'), ...fieldsOf(record, '461')];
  const people = ['700', '701', '702'].flatMap(tag => fieldsOf(record, tag));
  const roles = (field: Field) => field['4'] || [];
  const year = first(fieldsOf(record, '214'), 'd') ?? first(fieldsOf(record, '210'), 'd');
  const pages = first(fieldsOf(record, '215'), 'a')?.match(/(\d+)\s*p\./)?.[1];
  const ark = record.match(/ark:\/12148\/[\w]+/)?.[0];
  return {
    url: ark ? `https://catalogue.bnf.fr/${ark}` : null,
    title: first(title, 'a')!,
    subtitle: first(title, 'e'),
    series: first(series, 'a') ?? first(series, 't'),
    seriesNumber: first(series, 'v') ?? first(title, 'h'),
    authors: [...new Set(people.filter(p => roles(p).some(role => AUTHOR.has(role))).map(nameOf).filter(Boolean))],
    artists: [...new Set(people.filter(p => roles(p).some(role => ARTIST.has(role))).map(nameOf).filter(Boolean))],
    publisher: first(fieldsOf(record, '214'), 'c') ?? first(fieldsOf(record, '210'), 'c'),
    year: year?.match(/\d{4}/) ? Number(year.match(/\d{4}/)![0]) : null,
    pageCount: pages ? Number(pages) : null,
    summary: first(fieldsOf(record, '330'), 'a'),
    drawn: people.some(p => roles(p).includes('440')) && /ill\.\s*en\s*coul/i.test(first(fieldsOf(record, '215'), 'c') || ''),
  };
};

const ask = async (query: string, max: number): Promise<string[]> => {
  const { data } = await axios.get(SRU, {
    params: { version: '1.2', operation: 'searchRetrieve', recordSchema: 'unimarcxchange', maximumRecords: max, query },
    timeout: TIMEOUT_MS,
    responseType: 'text',
  });
  return [...String(data).matchAll(/<srw:record>([\s\S]*?)<\/srw:record>/g)].map(match => match[1]);
};

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const quoted = (text: string) => `"${text.replace(/"/g, ' ').trim()}"`;

/** A book by its ISBN. */
const byIsbn = async (isbn: string): Promise<BnfBook | null> => {
  const digits = isbn.replace(/[^\dX]/gi, '');
  if (digits.length !== 10 && digits.length !== 13) return null;
  const [record] = await ask(`bib.isbn all ${quoted(digits)}`, 1);
  return record ? parseRecord(record) : null;
};

/**
 * A volume of a series (Sorceline 4), or a book by its title when it has no
 * volume; the series' words, its number and an author's surname must agree.
 */
const byVolume = async (series: string, number: string | number | null, author: string | null,
  like: { bookType?: string | null; pageCount?: number | null } = {}): Promise<BnfBook | null> => {
  const words = plain(series);
  if (!words) return null;
  const surname = author ? plain(author).split(' ').slice(-1)[0] : '';
  const records = await ask(`bib.title all ${quoted(words)}${surname ? ` and bib.author all ${quoted(surname)}` : ''}`, 30);
  const wanted = number === null || number === undefined || number === '' ? null : Number(String(number).match(/\d+/)?.[0]);
  for (const record of records) {
    const book = parseRecord(record);
    if (!book) continue;
    const named = plain(`${book.series || ''} ${book.title}`);
    if (!words.split(' ').every(word => named.includes(word))) continue;
    if (wanted === null ? !plain(book.title).includes(words) : Number(String(book.seriesNumber || '').match(/\d+/)?.[0]) !== wanted) continue;
    // A novel and its comic share a series, a volume and an author (Les Royaumes de Feu): their pages tell them apart
    // (384 and 216), else their kind; a comic filed as a book (Le jour où…) has the pages of its notice.
    if (like.pageCount && book.pageCount) {
      if (Math.abs(book.pageCount - like.pageCount) > Math.max(like.pageCount, book.pageCount) * 0.25) continue;
    } else if (like.bookType === 'book' && book.drawn) continue;
    return book;
  }
  return null;
};

/** A book of the library: by its ISBN, else by its series and volume, else by its title. */
const find = async (book: { isbn13?: string | null; isbn?: string | null; title: string; series?: string | null; seriesNumber?: string | number | null;
  authors?: string[] | null; bookType?: string | null; pageCount?: number | null }): Promise<BnfBook | null> => {
  for (const isbn of [book.isbn13, book.isbn].filter(Boolean) as string[]) {
    const found = await byIsbn(isbn);
    if (found) return found;
  }
  const author = book.authors?.[0] || null;
  const like = { bookType: book.bookType, pageCount: book.pageCount };
  if (book.series) return byVolume(book.series, book.seriesNumber ?? null, author, like);
  return byVolume(book.title, null, author, like);
};

export default { byIsbn, byVolume, find };
