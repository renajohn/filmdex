import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import bookLanguageService, { languageOf, needsTranslation } from '../../src/services/bookLanguageService';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

const GERMAN = 'Bachs Inventionen und Sinfonien gelten zu Recht als unverzichtbar im Leben eines Pianisten. Der Komponist schrieb sie für seinen Sohn, und sie sind auch heute noch ein Muss.';
const SPANISH = 'El libro cuenta la historia de una familia que vive en el campo, con sus alegrías y sus penas, por muchos años.';
const FRENCH = 'Le livre raconte l’histoire d’une famille qui vit à la campagne, avec ses joies et ses peines, pendant des années.';
const ENGLISH = 'Bach’s Inventions and Sinfonias are rightly considered as indispensable to every pianist, and this edition is the one to have.';

afterEach(() => jest.restoreAllMocks());

describe('la langue d’une fiche de livre', () => {
  it('reconnaît le français et l’anglais, et ce qui est à traduire', () => {
    expect(languageOf(FRENCH)).toBe('fr');
    expect(languageOf(ENGLISH)).toBe('en');
    expect(languageOf(GERMAN)).toBe('de');
    expect(languageOf(SPANISH)).toBe('es');
    expect(needsTranslation('Chokerende afsløring af den amerikanske drøms bagside. Hovedpersonen er en ung finansmand i New York, som har det hele.')).toBe(true);
    expect(needsTranslation('Une série d’enquêtes fraîches et sucrées entre bande dessinée et carnet intime, pour les petites et les grandes.')).toBe(false);
    expect(languageOf('Préludes')).toBeNull();
    expect(needsTranslation(GERMAN)).toBe(true);
    expect(needsTranslation(SPANISH)).toBe(true);
    expect(needsTranslation(FRENCH)).toBe(false);
    expect(needsTranslation(ENGLISH)).toBe(false);
    expect(needsTranslation(null)).toBe(false);
  });

  it('traduit en français par l’LLM une fiche dans une autre langue, et laisse les autres', async () => {
    const asked = jest.spyOn(axios, 'post').mockResolvedValue({ data: { choices: [{ message: { content: `<think>…</think>${FRENCH}` } }] } });
    const spanish = await run(`INSERT INTO books (title, authors, title_status, description) VALUES ('Libro', '[]', 'owned', ?)`, [SPANISH]);
    const english = await run(`INSERT INTO books (title, authors, title_status, description) VALUES ('Book', '[]', 'owned', ?)`, [ENGLISH]);

    const done = (await request(app).post('/api/books/descriptions/translate').expect(200)).body;

    expect(done.translated.map((b: { id: number }) => b.id)).toContain(spanish);
    expect(done.translated.map((b: { id: number }) => b.id)).not.toContain(english);
    expect((await request(app).get(`/api/books/${spanish}`).expect(200)).body.description).toBe(FRENCH);
    expect((await request(app).get(`/api/books/${english}`).expect(200)).body.description).toBe(ENGLISH);
    expect(asked.mock.calls[0][1]).toMatchObject({ messages: [expect.anything(), { role: 'user', content: SPANISH }] });
  });

  it('garde la fiche quand la traduction échoue ou n’est pas en français', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { choices: [{ message: { content: GERMAN } }] } });
    const id = await run(`INSERT INTO books (title, authors, title_status, description) VALUES ('Buch', '[]', 'owned', ?)`, [GERMAN]);
    await expect(bookLanguageService.translateBook(id)).rejects.toThrow(/not in French/);
    expect((await request(app).get(`/api/books/${id}`).expect(200)).body.description).toBe(GERMAN);
  });

  it('traduit après l’ajout, sans le faire attendre', async () => {
    let answer: (value: unknown) => void = () => undefined;
    jest.spyOn(axios, 'post').mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    const added = (await request(app).post('/api/books').send({ title: 'Ein Buch', authors: ['A'], description: GERMAN }).expect(201)).body;
    expect(added.description).toBe(GERMAN);
    await new Promise(resolve => setTimeout(resolve, 20));
    answer({ data: { choices: [{ message: { content: FRENCH } }] } });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect((await request(app).get(`/api/books/${added.id}`).expect(200)).body.description).toBe(FRENCH);
  });
});
