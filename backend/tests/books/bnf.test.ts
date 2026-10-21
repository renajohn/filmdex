import fs from 'fs';
import path from 'path';
import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import bnfService, { parseRecord, unpaced } from '../../src/services/bnfService';
import bookBnfService from '../../src/services/bookBnfService';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

/** A notice of the catalogue as its SRU answers it: Les mondes perdus 1, Le crâne de Lubaantun (Dupuis, 2024). */
const ANSWER = fs.readFileSync(path.join(__dirname, 'fixtures/bnf-mondes-perdus-1.xml'), 'utf8');
const NONE = '<srw:searchRetrieveResponse><srw:numberOfRecords>0</srw:numberOfRecords></srw:searchRetrieveResponse>';
const record = ANSWER.match(/<srw:record>([\s\S]*?)<\/srw:record>/)![1];
/** The same notice as volume n of another series. */
const volume = (series: string, n: number) => record.replace(/Les mondes perdus/g, series).replace(/code="v">1</g, `code="v">${n}<`);

beforeAll(() => unpaced());
afterEach(() => jest.restoreAllMocks());

describe('le catalogue de la BnF', () => {
  it('lit une notice : ses auteurs selon leur rôle, sa série, son tome, son éditeur, ses pages', () => {
    expect(parseRecord(record)).toEqual({
      url: 'https://catalogue.bnf.fr/ark:/12148/cb47436435z',
      title: 'Le crâne de Lubaantun', subtitle: null, series: 'Les mondes perdus', seriesNumber: '1',
      authors: ['Aucha'], artists: ['Isabelle Lemaux-Piedfert'],
      publisher: 'Dupuis', year: 2024, pageCount: 73, summary: null, drawn: true,
    });
  });

  it('cherche par l’ISBN, puis une réimpression par sa série et son tome', async () => {
    const asked = jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config?: { params?: { query?: string } }) => {
      const query = String(config?.params?.query);
      if (query.includes('9782808501972')) return { data: ANSWER } as never;
      if (query.startsWith('bib.title')) return { data: `<srw:record>${volume('Sorceline', 3)}</srw:record><srw:record>${volume('Sorceline', 4)}</srw:record>` } as never;
      return { data: NONE } as never;
    });
    expect((await bnfService.find({ isbn13: '978-2-8085-0197-2', title: 'x' }))?.title).toBe('Le crâne de Lubaantun');
    const fourth = await bnfService.find({ isbn13: '9782302099999', title: 'Sorceline - Tome 04', series: 'Sorceline', seriesNumber: 4, authors: ['Sylvia Douyé'] });
    expect(fourth).toMatchObject({ series: 'Sorceline', seriesNumber: '4' });
    expect(asked.mock.calls.at(-1)?.[1]).toMatchObject({ params: { query: 'bib.title all "sorceline" and bib.author all "douye"' } });
    expect(await bnfService.find({ isbn13: '9782302099999', title: 'x', series: 'Sorceline', seriesNumber: 9 })).toBeNull();
    // A novel is not its comic of the same series and volume, nor a book of half its pages.
    expect(await bnfService.find({ isbn13: '9782302099999', title: 'x', series: 'Sorceline', seriesNumber: 4, bookType: 'book' })).toBeNull();
    expect(await bnfService.find({ isbn13: '9782302099999', title: 'x', series: 'Sorceline', seriesNumber: 4, pageCount: 384 })).toBeNull();
    expect(await bnfService.find({ isbn13: '9782302099999', title: 'x', series: 'Sorceline', seriesNumber: 4, bookType: 'book', pageCount: 70 })).not.toBeNull();
  });
  it('attend quand le catalogue dit 429, puis redemande', async () => {
    let calls = 0;
    jest.spyOn(axios, 'get').mockImplementation(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } });
      return { data: ANSWER } as never;
    });
    expect((await bnfService.byIsbn('9782808501972'))?.title).toBe('Le crâne de Lubaantun');
    expect(calls).toBe(2);
  });
});

describe('un livre complété par la BnF', () => {
  beforeEach(() => {
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config?: { params?: { query?: string } }) =>
      ({ data: String(config?.params?.query).includes('9782808501972') ? ANSWER : NONE }) as never);
    // The translation is not what these tests are about.
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('no LLM here'));
  });

  it('gagne ce qui lui manque, son dessinateur d’abord, et garde ce qu’il a', async () => {
    const id = await run(`INSERT INTO books (title, authors, artists, book_type, title_status, language, isbn13, series, series_number, publisher, urls, description)
      VALUES ('Les Mondes perdus - Tome 1', '["Aucha"]', '[]', 'graphic-novel', 'owned', 'fr', '9782808501972', 'Les Mondes perdus', 1, 'Dupuis', '{}', 'Indiana Jones chez les Mayas.')`);
    expect(await bookBnfService.enrichBook(id)).toEqual({ found: true, gained: ['artists', 'year', 'pages', 'notice'] });
    expect((await request(app).get(`/api/books/${id}`).expect(200)).body).toMatchObject({
      authors: ['Aucha'], artists: ['Isabelle Lemaux-Piedfert'], series: 'Les Mondes perdus', seriesNumber: 1, publishedYear: 2024, pageCount: 73,
      description: 'Indiana Jones chez les Mayas.', urls: { bnf: 'https://catalogue.bnf.fr/ark:/12148/cb47436435z' },
    });
    // Asked again, it has nothing more to gain.
    expect(await bookBnfService.enrichBook(id)).toEqual({ found: true, gained: [] });
  });

  it('ne demande rien pour un livre anglais ni pour une partition', async () => {
    const english = await run(`INSERT INTO books (title, authors, book_type, title_status, language, isbn13, urls) VALUES ('X', '[]', 'book', 'owned', 'en', '9782808501972', '{}')`);
    const score = await run(`INSERT INTO books (title, authors, book_type, title_status, language, isbn13, urls) VALUES ('Y', '[]', 'score', 'owned', 'fr', '9782808501972', '{}')`);
    expect(await bookBnfService.enrichBook(english)).toEqual({ found: false, gained: [] });
    expect(await bookBnfService.enrichBook(score)).toEqual({ found: false, gained: [] });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('complète un livre ajouté, sans faire attendre l’ajout, et tous ceux de la bibliothèque sur demande', async () => {
    const added = (await request(app).post('/api/books').send({ title: 'Le Crâne de Lubaantun', authors: ['Aucha'], language: 'fr', isbn: '978-2-8085-0197-2', bookType: 'graphic-novel' }).expect(201)).body;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect((await request(app).get(`/api/books/${added.id}`).expect(200)).body.artists).toEqual(['Isabelle Lemaux-Piedfert']);

    const unknown = await run(`INSERT INTO books (title, authors, book_type, title_status, language, isbn13, urls) VALUES ('Inconnu', '[]', 'book', 'owned', 'fr', '9782000000000', '{}')`);
    const done = (await request(app).post('/api/books/bnf').expect(200)).body;
    expect(done.notFound.map((b: { id: number }) => b.id)).toContain(unknown);
    expect(done.failed).toEqual([]);
  });
});
