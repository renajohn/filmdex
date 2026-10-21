import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import configManager from '../../src/config';
import imageService from '../../src/services/imageService';
import { suggestComposer } from '../../src/utils/scoreComposer';

const tag = () => Math.random().toString(36).slice(2, 8);

const insertScore = (fields: { title: string; authors?: string[]; composer?: string | null; ebookFile?: string | null }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(`INSERT INTO books (title, authors, book_type, title_status, format, composer, ebook_file) VALUES (?, ?, 'score', 'owned', 'physical', ?, ?)`,
      [fields.title, JSON.stringify(fields.authors ?? []), fields.composer ?? null, fields.ebookFile ?? null],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

afterEach(() => jest.restoreAllMocks());

describe('le compositeur d’une partition', () => {
  it.each([
    ['BRAHMS - Valses Op.39 para Piano (Urtext)', [], 'Johannes Brahms'],
    ['Bach : suites françaises BWV 812-817 édtion Henle', ['Vladimir Ashkenazy'], 'Johann Sebastian Bach'],
    ['Deux Arabesques', ['마스트미디어편집부'], 'Claude Debussy'],
    ['Preludes', ['Frédéric Chopin'], 'Frédéric Chopin'],
    ['Lettre à Élise WoO 59', ['Sarah Clain'], 'Ludwig van Beethoven'],
    ['Consolations', ['Mária Eckhardt'], 'Franz Liszt'],
    ['Lieder ohne Worte', ['Felix Mendelssohn-Bartholdy'], 'Felix Mendelssohn'],
    ['Etudes (25) Op.100 pour les petites mains', [], 'Henri Bertini'],
    ['Improve your sight-reading !', ['Paul Harris'], null],
    ['A Dozen a Day Book 3', ['Edna Mae Burnam'], null],
  ])('« %s » : %s', (title, authors, composer) => {
    expect(suggestComposer(title, authors as string[])).toBe(composer);
  });
});

describe('la section des partitions', () => {
  it('liste les partitions, avec le compositeur suggéré quand il n’est pas gardé, et garde ceux qu’on confirme', async () => {
    const valses = await insertScore({ title: `BRAHMS - Valses Op.39 ${tag()}`, authors: [] });
    const lieder = await insertScore({ title: `Lieder ohne Worte ${tag()}`, composer: 'Felix Mendelssohn' });

    const list = (await request(app).get('/api/scores').expect(200)).body;
    expect(list.find((s: { id: number }) => s.id === valses)).toMatchObject({ composer: null, composerSuggestion: 'Johannes Brahms' });
    expect(list.find((s: { id: number }) => s.id === lieder)).toMatchObject({ composer: 'Felix Mendelssohn', composerSuggestion: null });

    await request(app).put('/api/scores/composers').send({ updates: [{ id: valses, composer: 'Johannes Brahms' }] }).expect(200, { changed: 1 });
    expect((await request(app).get(`/api/books/${valses}`).expect(200)).body).toMatchObject({ composer: 'Johannes Brahms' });
  });

  it('garde le compositeur quand le formulaire d’un livre l’enregistre sans lui', async () => {
    const id = await insertScore({ title: `Kinderszenen ${tag()}`, composer: 'Robert Schumann' });
    const book = (await request(app).get(`/api/books/${id}`).expect(200)).body;
    const { composer: _composer, ...withoutIt } = book;
    await request(app).put(`/api/books/${id}`).send(withoutIt).expect(200);
    expect((await request(app).get(`/api/books/${id}`).expect(200)).body).toMatchObject({ composer: 'Robert Schumann' });
  });

  it('une partition trouvée et ajoutée reçoit le compositeur de son titre', async () => {
    jest.spyOn(imageService, 'downloadImageFromUrl').mockResolvedValue(null as never);
    const res = await request(app).post('/api/books/finder/books')
      .send({ book: { googleId: 'x', title: `Chopin: Nocturnes ${tag()}`, authors: ['Ewald Zimmermann'], isbn13: null }, titleStatus: 'owned', bookType: 'score' }).expect(201);
    expect(res.body).toMatchObject({ bookType: 'score', composer: 'Frédéric Chopin' });
  });

  it('ouvre le PDF d’une partition dans le navigateur quand on le demande', async () => {
    const dir = configManager.getEbooksPath();
    fs.mkdirSync(dir, { recursive: true });
    const file = `book_1_${Date.now()}_suite.pdf`;
    fs.writeFileSync(path.join(dir, file), '%PDF-1.4');
    const id = await insertScore({ title: `Suite bergamasque ${tag()}`, ebookFile: file });

    const inline = await request(app).get(`/api/books/${id}/ebook/download`).query({ inline: '1' }).expect(200);
    expect(inline.headers['content-type']).toBe('application/pdf');
    expect(inline.headers['content-disposition']).toMatch(/^inline/);
    expect((await request(app).get(`/api/books/${id}/ebook/download`).expect(200)).headers['content-disposition']).toMatch(/^attachment/);
    fs.unlinkSync(path.join(dir, file));
  });
});

describe('les notes sur une série', () => {
  it('garde une note sur une série, quelle que soit l’écriture de son nom, et l’efface', async () => {
    const series = `Sorceline ${tag()}`;
    const note = (await request(app).post('/api/books/series-notes').send({ series, name: 'Oriane', note: 'Oriane a adoré cette série' }).expect(201)).body;
    expect(note).toMatchObject({ series, name: 'Oriane', note: 'Oriane a adoré cette série' });

    expect((await request(app).get('/api/books/series-notes').query({ series: series.toUpperCase() }).expect(200)).body).toEqual([expect.objectContaining({ id: note.id })]);

    await request(app).delete(`/api/books/series-notes/${note.id}`).expect(204);
    expect((await request(app).get('/api/books/series-notes').query({ series }).expect(200)).body).toEqual([]);
    await request(app).post('/api/books/series-notes').send({ series, note: '' }).expect(400);
  });

});

describe('le journal de lecture', () => {
  it('donne les livres lus, empruntés ou commentés, sans les partitions, avec leurs commentaires, le dernier lu d’abord', async () => {
    const run = (sql: string, params: unknown[]) => new Promise<number>((resolve, reject) =>
      getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));
    const t = tag();
    const read = await run(`INSERT INTO books (title, authors, book_type, title_status, read_date) VALUES (?, '[]', 'book', 'owned', '2099-01-02')`, [`Chien 51 ${t}`]);
    const borrowed = await run(`INSERT INTO books (title, authors, book_type, title_status, read_date) VALUES (?, '[]', 'book', 'borrowed', '2099-01-01')`, [`Oscar ${t}`]);
    await run(`INSERT INTO books (title, authors, book_type, title_status, read_date) VALUES (?, '[]', 'score', 'owned', '2099-01-03')`, [`Valses ${t}`]);
    const untouched = await run(`INSERT INTO books (title, authors, book_type, title_status) VALUES (?, '[]', 'book', 'owned')`, [`Unread ${t}`]);
    await run(`INSERT INTO book_comments (book_id, name, comment, date) VALUES (?, 'Renault', 'Bien écrit', '2099-01-02')`, [read]);

    const journal = (await request(app).get('/api/books/reading').expect(200)).body.filter((b: { title: string }) => b.title.endsWith(t));

    expect(journal.map((b: { id: number }) => b.id)).toEqual([read, borrowed]);
    expect(journal[0].comments).toEqual([expect.objectContaining({ name: 'Renault', comment: 'Bien écrit' })]);
    expect(journal.some((b: { id: number }) => b.id === untouched)).toBe(false);
  });

  it('garde chaque lecture d’un livre relu, chacune avec les commentaires écrits après elle', async () => {
    const t = tag();
    const book = (await request(app).post('/api/books').send({ title: `1984 ${t}`, authors: ['George Orwell'], titleStatus: 'owned', bookType: 'book', readDate: '2019-03-12' }).expect(201)).body;
    await request(app).post('/api/books/comments').send({ bookId: book.id, name: 'Renault', comment: 'Glaçant', date: '2019-03-14T10:00:00Z' }).expect(201);

    // Read again from the finder: a second reading, the first one kept.
    await request(app).post('/api/books/finder/books').send({ book: { title: `1984 ${t}`, authors: ['George Orwell'] }, titleStatus: 'owned', readDate: '2026-04-26' }).expect(201);
    await request(app).post('/api/books/comments').send({ bookId: book.id, name: 'Renault', comment: 'Toujours aussi juste', date: '2026-04-27T10:00:00Z' }).expect(201);

    const readings = (await request(app).get(`/api/books/${book.id}/readings`).expect(200)).body;
    expect(readings.map((r: { readDate: string }) => r.readDate)).toEqual(['2019-03-12', '2026-04-26']);
    expect((await request(app).get(`/api/books/${book.id}`).expect(200)).body.readDate).toBe('2026-04-26');

    const journal = (await request(app).get('/api/books/reading').expect(200)).body.filter((b: { title: string }) => b.title.endsWith(t));
    expect(journal.map((e: { readDate: string; readNumber: number }) => [e.readDate, e.readNumber])).toEqual([['2026-04-26', 2], ['2019-03-12', 1]]);
    expect(journal[0].comments.map((c: { comment: string }) => c.comment)).toEqual(['Toujours aussi juste']);
    expect(journal[1].comments.map((c: { comment: string }) => c.comment)).toEqual(['Glaçant']);
    expect(journal[1].readDates).toEqual(['2019-03-12', '2026-04-26']);

    // A word added later on the first reading stays with it.
    await request(app).post('/api/books/comments').send({ bookId: book.id, name: 'Renault', comment: 'Relu les notes', readingId: readings[0].id }).expect(201);
    const again = (await request(app).get('/api/books/reading').expect(200)).body.filter((b: { title: string }) => b.title.endsWith(t));
    expect(again[1].comments.map((c: { comment: string }) => c.comment)).toEqual(['Glaçant', 'Relu les notes']);

    // A date corrected, a reading taken away: the book's date follows the last one.
    await request(app).put(`/api/books/readings/${readings[1].id}`).send({ date: '2026-05-01' }).expect(200);
    expect((await request(app).get(`/api/books/${book.id}`).expect(200)).body.readDate).toBe('2026-05-01');
    await request(app).delete(`/api/books/readings/${readings[1].id}`).expect(204);
    expect((await request(app).get(`/api/books/${book.id}`).expect(200)).body.readDate).toBe('2019-03-12');
    await request(app).post(`/api/books/${book.id}/readings`).send({ date: 'hier' }).expect(400);
  });

  it('suit la date du formulaire : corrige la dernière lecture plutôt que d’en ajouter une', async () => {
    const book = (await request(app).post('/api/books').send({ title: `Dune ${tag()}`, authors: [], titleStatus: 'owned', bookType: 'book', readDate: '2020-01-01' }).expect(201)).body;
    await request(app).post(`/api/books/${book.id}/readings`).send({ date: '2024-06-01' }).expect(201);
    const full = (await request(app).get(`/api/books/${book.id}`).expect(200)).body;

    await request(app).put(`/api/books/${book.id}`).send({ ...full, readDate: '2024-06-02' }).expect(200);

    expect((await request(app).get(`/api/books/${book.id}/readings`).expect(200)).body.map((r: { readDate: string }) => r.readDate)).toEqual(['2020-01-01', '2024-06-02']);
  });
});
