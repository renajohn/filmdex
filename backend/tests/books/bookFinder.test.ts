import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import { googleBooks } from '../../src/services/bookApiService';
import imageService from '../../src/services/imageService';
import { forgetBookFinderAnswers } from '../../src/services/bookFinderService';
import { extractSeriesFromTitle } from '../../src/services/utils/bookUtils';

const tag = () => Math.random().toString(36).slice(2, 8);
let isbnSeed = 9782000000000 + Math.floor(Math.random() * 900000) * 10;
const isbn = () => String(++isbnSeed);

const volume = (id: string, title: string, fields: { isbn13?: string; authors?: string[]; year?: string; language?: string; categories?: string[] } = {}) => ({
  id,
  volumeInfo: {
    title, authors: fields.authors ?? ['Sylvia Douyé'], publishedDate: fields.year ?? '2020', language: fields.language ?? 'fr',
    categories: fields.categories, publisher: "Vents d'Ouest",
    industryIdentifiers: fields.isbn13 ? [{ type: 'ISBN_13', identifier: fields.isbn13 }] : [],
    imageLinks: { thumbnail: `http://books.google.com/books/content?id=${id}&zoom=1&edge=curl` },
  },
});

const google = (pages: Record<string, unknown[]> | unknown[]) =>
  jest.spyOn(googleBooks, 'get').mockImplementation(async (_url: string, config?: { params?: Record<string, unknown> }) => {
    const q = String(config?.params?.q || '');
    const items = Array.isArray(pages) ? pages : (pages[q] ?? []);
    return { data: { items } } as never;
  });

const insertBook = (fields: { title: string; series?: string; number?: number; isbn13?: string; status: string; price?: number }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO books (title, authors, series, series_number, isbn13, title_status, price_chf, format, book_type) VALUES (?, '["Sylvia Douyé"]', ?, ?, ?, ?, ?, 'physical', 'graphic-novel')`,
      [fields.title, fields.series ?? null, fields.number ?? null, fields.isbn13 ?? null, fields.status, fields.price ?? null],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

beforeEach(() => {
  forgetBookFinderAnswers();
  jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as never);
});
afterEach(() => jest.restoreAllMocks());

describe('les séries lues dans les titres', () => {
  it('ne garde pas le tiret d’un volume, et lit « T09: »', () => {
    expect(extractSeriesFromTitle("Le Grimoire d'Elfie - Volume 02 - Le Dit des cigales")).toEqual({ series: "Le Grimoire d'Elfie", seriesNumber: 2 });
    expect(extractSeriesFromTitle('La Rose écarlate T09: Me pardonneras-tu ?')).toEqual({ series: 'La Rose écarlate', seriesNumber: 9 });
  });
});

describe('le chercheur de livres', () => {
  it('trouve les livres, ce qu’on en a, la série qu’ils forment, une série d’un seul type', async () => {
    const series = `Sorceline ${tag()}`;
    const owned = isbn();
    await insertBook({ title: `${series} - Tome 03`, series, number: 3, isbn13: owned, status: 'owned' });
    google([
      volume('a', `${series} - Tome 03`, { isbn13: owned }),
      volume('b', `${series} - Tome 06`, { isbn13: isbn(), categories: ['Comics & Graphic Novels'] }),
      volume('c', `${series} Journal`, { isbn13: isbn() }),
      volume('d', `${series} Book 2`, { isbn13: isbn(), language: 'it' }),
    ]);

    const res = await request(app).get('/api/books/finder/search').query({ q: series, language: 'fr' }).expect(200);

    expect(res.body.books.map((b: { title: string }) => b.title)).toEqual([`${series} - Tome 03`, `${series} - Tome 06`, `${series} Journal`]);
    expect(res.body.books[0]).toMatchObject({ have: { status: 'owned' }, seriesNumber: 3, bookType: 'graphic-novel', cover: expect.stringMatching(/^https:.*zoom=1$/) });
    expect(res.body.series).toEqual([expect.objectContaining({ name: series, volumes: 2 })]);
  });

  it('demande aussi les BD à Google quand on cherche une BD, celles-là d’abord', async () => {
    const get = google({ 'elle subject:comics': [volume('e', 'Elle - Tome 1 - La nouvelle Elle', { isbn13: isbn(), categories: ['Comics & Graphic Novels'] })], elle: [volume('f', 'Témoin malgré elle', { isbn13: isbn() })] });

    const res = await request(app).get('/api/books/finder/search').query({ q: 'elle', kind: 'graphic-novel' }).expect(200);

    expect(get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: expect.objectContaining({ q: 'elle subject:comics' }) }));
    expect(res.body.books[0]).toMatchObject({ title: 'Elle - Tome 1 - La nouvelle Elle', bookType: 'graphic-novel' });
  });

  it('demande à Open Library quand Google ne répond pas', async () => {
    jest.spyOn(googleBooks, 'get').mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }));
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { docs: [{ key: '/works/OL1W', title: 'Sorceline', author_name: ['Sylvia Douyé'], first_publish_year: 2018, isbn: ['9782331034718'], language: ['fre'] }] } });

    const res = await request(app).get('/api/books/finder/search').query({ q: `sorceline ${tag()}` }).expect(200);

    expect(res.body.books[0]).toMatchObject({ title: 'Sorceline', isbn13: '9782331034718', language: 'fr', year: '2018' });
  }, 15000);

  it('donne les tomes d’une série, ceux que la bibliothèque a et que Google ne connaît pas, et ceux qui manquent', async () => {
    const series = `Les Sisters ${tag()}`;
    await insertBook({ title: `${series} - Tome 1`, series, number: 1, isbn13: isbn(), status: 'owned' });
    google([volume('t3', `${series} - Tome 3`, { isbn13: isbn() }), volume('t4', `${series} - Tome 4`, { isbn13: isbn() }), volume('x', 'Another book')]);

    const res = await request(app).get('/api/books/finder/series').query({ name: series }).expect(200);

    expect(res.body.volumes.map((v: { seriesNumber: number; have: { status: string } | null }) => [v.seriesNumber, v.have?.status ?? null]))
      .toEqual([[1, 'owned'], [3, null], [4, null]]);
    expect(res.body.missingNumbers).toEqual([2]);
  });

  it('souhaite un livre, refuse le même deux fois, et fait d’un souhait acheté le livre de la bibliothèque', async () => {
    const book = { googleId: 'z', title: `Elle - Tome 2 ${tag()}`, authors: ['Kid Toussaint'], isbn13: isbn(), series: 'Elle', seriesNumber: 2, cover: 'https://books.google.com/x?zoom=1' };

    const wished = await request(app).post('/api/books/finder/books').send({ book, titleStatus: 'wish', bookType: 'graphic-novel' }).expect(201);
    expect(wished.body).toMatchObject({ title: book.title, titleStatus: 'wish', bookType: 'graphic-novel', priceChf: null });
    expect(imageService.downloadImageFromUrl).toHaveBeenCalledWith('https://books.google.com/x?zoom=0', 'book', expect.any(String));

    await request(app).post('/api/books/finder/books').send({ book, titleStatus: 'wish' }).expect(409);

    const bought = await request(app).post('/api/books/finder/books').send({ book, titleStatus: 'owned', priceChf: '15.90', purchasedAt: '2026-10-20' }).expect(201);
    expect(bought.body).toMatchObject({ id: wished.body.id, titleStatus: 'owned', priceChf: 15.9, purchasedAt: '2026-10-20' });
  });

  it('ajoute plusieurs tomes à la fois, le prix partagé', async () => {
    const series = `Sorceline ${tag()}`;
    const books = [1, 2, 3].map(n => ({ book: { title: `${series} - Tome ${n}`, isbn13: isbn(), series, seriesNumber: n }, titleStatus: 'owned', bookType: 'graphic-novel' }));

    const res = await request(app).post('/api/books/finder/books/batch').send({ books, priceChf: 45 }).expect(201);

    expect(res.body.errors).toEqual([]);
    expect(res.body.added.map((b: { priceChf: number; seriesNumber: number }) => [b.seriesNumber, b.priceChf])).toEqual([[1, 15], [2, 15], [3, 15]]);
  });

  it('achète des livres souhaités, et garde leur prix quand le formulaire les enregistre', async () => {
    const a = await insertBook({ title: `Oeil de dragon ${tag()}`, status: 'wish' });
    const b = await insertBook({ title: `Les soeurs Grémillet ${tag()}`, status: 'wish' });

    const res = await request(app).post('/api/books/finder/buy').send({ bookIds: [a, b], priceChf: 30, purchasedAt: '2026-10-21' }).expect(200);
    expect(res.body.map((x: { titleStatus: string; priceChf: number; purchasedAt: string }) => [x.titleStatus, x.priceChf, x.purchasedAt]))
      .toEqual([['owned', 15, '2026-10-21'], ['owned', 15, '2026-10-21']]);

    const book = (await request(app).get(`/api/books/${a}`).expect(200)).body;
    const { priceChf: _price, purchasedAt: _date, ...withoutThem } = book;
    await request(app).put(`/api/books/${a}`).send({ ...withoutThem, title: `${book.title}!` }).expect(200);
    expect((await request(app).get(`/api/books/${a}`).expect(200)).body).toMatchObject({ priceChf: 15, purchasedAt: '2026-10-21' });
  });

  it('ajoute un livre emprunté, sans prix, à qui il est ; un souhait emprunté devient ce livre', async () => {
    const book = { googleId: 'b', title: `Les Sisters - Tome 18 ${tag()}`, authors: ['Cazenove'], isbn13: isbn(), series: 'Les Sisters', seriesNumber: 18 };

    const res = await request(app).post('/api/books/finder/books').send({ book, titleStatus: 'borrowed', owner: 'La bibliothèque', priceChf: 12 }).expect(201);
    expect(res.body).toMatchObject({ titleStatus: 'borrowed', owner: 'La bibliothèque', priceChf: null, purchasedAt: null });

    const wishedBook = { ...book, googleId: 'c', title: `Les Sisters - Tome 19 ${tag()}`, isbn13: isbn(), seriesNumber: 19 };
    const wished = await request(app).post('/api/books/finder/books').send({ book: wishedBook, titleStatus: 'wish' }).expect(201);
    const borrowed = await request(app).post('/api/books/finder/books').send({ book: wishedBook, titleStatus: 'borrowed', owner: 'Léa' }).expect(201);
    expect(borrowed.body).toMatchObject({ id: wished.body.id, titleStatus: 'borrowed', owner: 'Léa' });
  });
});

describe('un ISBN dans le chercheur', () => {
  it('trouve l’édition qu’il nomme, quelle que soit la langue, chez Google d’abord', async () => {
    const code = isbn();
    google({ [`isbn:${code}`]: [volume('ap', 'American Psycho', { isbn13: code, authors: ['Bret Easton Ellis'], language: 'en' }), volume('other', 'Autre', { isbn13: isbn() })] });
    const found = (await request(app).get('/api/books/finder/search').query({ q: `978-${code.slice(3)}`.replace(/^978-978/, '978-'), language: 'fr' }).expect(200)).body;
    expect(found.books.map((b: { title: string }) => b.title)).toEqual(['American Psycho']);
    expect(found.series).toEqual([]);
  });

  it('prend l’édition d’Open Library par son ISBN quand Google ne la connaît pas', async () => {
    const code = isbn();
    google([]);
    jest.spyOn(axios, 'get').mockImplementation(async (url: string) => (String(url).endsWith(`/isbn/${code}.json`)
      ? { data: { title: 'American Psycho', publishers: ['10/18'], number_of_pages: 526, covers: [12552916], authors: [{ key: '/authors/OL217475A' }], languages: [{ key: '/languages/fre' }], publish_date: '1998' } }
      : String(url).includes('/authors/') ? { data: { name: 'Bret Easton Ellis' } } : { data: {} }) as never);
    const found = (await request(app).get('/api/books/finder/search').query({ q: code }).expect(200)).body;
    expect(found.books).toEqual([expect.objectContaining({ title: 'American Psycho', authors: ['Bret Easton Ellis'], publisher: '10/18', year: '1998', language: 'fr',
      pageCount: 526, isbn13: code, cover: 'https://covers.openlibrary.org/b/id/12552916-L.jpg' })]);
  });

  it('demande à la BnF une édition que Google et Open Library ne connaissent pas', async () => {
    const code = isbn();
    google([]);
    jest.spyOn(axios, 'get').mockImplementation(async (url: string) => (String(url).includes('catalogue.bnf.fr')
      ? { data: `<srw:record><mxc:record id="ark:/12148/cb1"><mxc:datafield tag="200"><mxc:subfield code="a">American psycho</mxc:subfield></mxc:datafield><mxc:datafield tag="700"><mxc:subfield code="a">Ellis</mxc:subfield><mxc:subfield code="b">Bret Easton</mxc:subfield><mxc:subfield code="4">070</mxc:subfield></mxc:datafield><mxc:datafield tag="214"><mxc:subfield code="c">10-18</mxc:subfield><mxc:subfield code="d">DL 2005</mxc:subfield></mxc:datafield></mxc:record></srw:record>` }
      : { data: { docs: [] } }) as never);
    const found = (await request(app).get('/api/books/finder/search').query({ q: code }).expect(200)).body;
    expect(found.books).toEqual([expect.objectContaining({ title: 'American psycho', authors: ['Bret Easton Ellis'], publisher: '10-18', year: '2005', isbn13: code, cover: null })]);
  });
});

describe('une lecture sans date', () => {
  it('ajoute du journal un livre lu sans savoir quand, et le journal le tient', async () => {
    const code = isbn();
    google([volume('nd', `Lu un jour ${tag()}`, { isbn13: code })]);
    const added = (await request(app).post('/api/books/finder/books').send({
      book: { googleId: 'nd', title: 'Lu un jour', isbn13: code, authors: ['A'] }, titleStatus: 'owned', format: 'physical', language: 'fr', read: true, readDate: '',
    }).expect(201)).body;
    const journal = (await request(app).get('/api/books/reading').expect(200)).body as Array<{ id: number; readDate: string | null; readingId: number | null }>;
    expect(journal.find(e => e.id === added.id)).toMatchObject({ readDate: null, readingId: expect.any(Number) });
  });
});
