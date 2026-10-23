import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Book from '../../src/models/book';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/**
 * The search's filters as the pills write them (yes/no, -key:, quotes, commas)
 * and as the old links wrote them (has_ebook:true…), on a handful of books
 * sharing a word of their titles.
 */
describe('la recherche de livres, ses filtres', () => {
  const word = `cherche${Math.random().toString(36).slice(2, 8)}`;
  const books = [
    { n: 'a', authors: '["Ursula K. Le Guin"]', series: 'Earthsea', owner: 'Alice', year: 1968, rating: 5, ebook: '/e/a.epub', type: 'book', genres: '["Fantasy"]', status: 'owned', title: 'Vol: 2' },
    { n: 'b', authors: '["Moebius"]', series: null, owner: 'Oriane', year: 1980, rating: 3, ebook: null, type: 'graphic-novel', genres: '["Sci-Fi"]', status: 'borrowed', title: 'Incal' },
    { n: 'c', authors: '["Bach"]', series: null, owner: null, year: null, rating: null, ebook: '', type: 'score', genres: null, status: 'owned', title: 'Suites' },
    { n: 'd', authors: '["Tolkien"]', series: 'Middle-earth', owner: 'Renault', year: 1954, rating: 4.5, ebook: null, type: 'book', genres: '["Fantasy"]', status: 'wish', title: 'Rings' },
  ];

  beforeAll(async () => {
    for (const b of books) {
      await run(
        `INSERT INTO books (title, authors, series, owner, published_year, rating, ebook_file, book_type, genres, title_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${word} ${b.n} ${b.title}`, b.authors, b.series, b.owner, b.year, b.rating, b.ebook, b.type, b.genres, b.status],
      );
    }
  });

  const found = async (q: string) => {
    const res = await request(app).get('/api/books/search').query({ q: `${word} ${q}`.trim() }).expect(200);
    return (res.body as Array<{ title: string }>).map(b => b.title.split(' ')[1]).sort().join('');
  };

  it('lit has_ebook en yes/no, et les anciens mots', async () => {
    expect(await found('has_ebook:yes')).toBe('a');
    expect(await found('has_ebook:no')).toBe('bc');
    expect(await found('has_ebook:true')).toBe('a');
    expect(await found('has_ebook:false')).toBe('bc');
    expect(await found('has_ebook:with')).toBe('a');
    expect(await found('has_ebook:0')).toBe('bc');
    expect(await found('-has_ebook:yes')).toBe('bc');
    expect(await found('!has_ebook:no')).toBe('a');
  });

  it('exclut avec - ou !, en gardant les livres sans la valeur', async () => {
    expect(await found('-series:Earthsea')).toBe('bc');
    expect(await found('!author:moebius')).toBe('ac');
    expect(await found('-type:score')).toBe('ab');
    expect(await found('-type:score,graphic-novel')).toBe('a');
    expect(await found('-genre:fantasy')).toBe('bc');
  });

  it('prend les valeurs séparées par des virgules, et entre guillemets', async () => {
    expect(await found('type:book,score')).toBe('ac');
    expect(await found('author:"Le Guin",Bach')).toBe('ac');
    expect(await found('title:"Vol: 2"')).toBe('a');
  });

  it('exclut des propriétaires, et ceux de personne', async () => {
    expect(await found('-owner:Alice')).toBe('bc');
    expect(await found('-owner:none')).toBe('ab');
    expect(await found('-owner:Alice,none')).toBe('b');
  });

  it('compare les années et les étoiles, exclut une plage', async () => {
    expect(await found('year:>=1968')).toBe('ab');
    expect(await found('year:1960-1970')).toBe('a');
    expect(await found('-year:1960-1970')).toBe('bc');
    expect(await found('year:1968,1980')).toBe('ab');
    expect(await found('rating:>=4')).toBe('a');
    expect(await found('rating:<4')).toBe('b');
    expect(await found('-rating:5')).toBe('bc');
  });

  it('lit title_status, et son exclusion parmi les livres montrés', async () => {
    expect(await found('title_status:wish')).toBe('d');
    expect(await found('title_status:owned,wish')).toBe('acd');
    expect(await found('-title_status:borrowed')).toBe('ac');
    expect(await found('rating:4.5 title_status:wish')).toBe('d');
  });

  it("laisse un mot dont la clé n'existe pas, et ignore une clé sans valeur", () => {
    expect(Book._parseSearchQuery('foo:bar dune').cleanedQuery).toBe('foo:bar dune');
    const empty = Book._parseSearchQuery('owner: dune');
    expect(empty.cleanedQuery).toBe('dune');
    expect(empty.whereClauses).toEqual([]);
    expect(Book._parseSearchQuery('OWNER:alice').whereClauses).toHaveLength(1);
  });
});
