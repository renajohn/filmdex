import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import musicbrainzService from '../../src/services/musicbrainzService';
import wikidataWorksService from '../../src/services/wikidataWorksService';
import imslpWorksService from '../../src/services/imslpWorksService';
import sharp from 'sharp';
import henleService, { henleNumberOf } from '../../src/services/henleService';
import { henleNumberOfBook, isShopNoise } from '../../src/services/scoreAddService';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));
const uuid = (n: number) => `abcdef01-0000-0000-0000-${String(n).padStart(12, '0')}`;

const SUGGEST = `<div><a href="https://www.henle.de/Preludes-Premier-livre/HN-383" title="Préludes, Premier livre" class="search-suggest-product-link">
  <img src="https://www.henle.de/media/9e/HN-0383-1-sync.jpg" />
  <p class="product-componist-name">Claude Debussy</p><p class="product-name">Préludes, Premier livre</p><div>HN 383</div></a>
  <a href="https://www.henle.de/Something/HN-3830"><p class="product-name">Else</p></a></div>`;
const PAGE = `<meta property="og:image"
          content="https://www.henle.de/media/9e/HN-0383-big.jpg"/>
  <div>Search shop: Composer Level of Difficulty</div><div>Shop Levels of Difficulty</div><div>Piano</div><div>Difficult 7</div><p>Claude Debussy Préludes</p>
  <p class="cms-section-werbetext-bio">In 1910 the Préludes were published. This first volume became an immediate success.<br /><br />Read more about this edition in the <a href="x">Henle Blog.</a></p>`;

beforeEach(() => {
  jest.spyOn(wikidataWorksService, 'byMusicBrainz').mockResolvedValue(null);
  jest.spyOn(wikidataWorksService, 'searchWorks').mockResolvedValue([]);
  jest.spyOn(wikidataWorksService, 'works').mockResolvedValue([]);
  jest.spyOn(imslpWorksService, 'searchWorks').mockResolvedValue([]);
  jest.spyOn(imslpWorksService, 'work').mockResolvedValue(null);
  jest.spyOn(musicbrainzService, 'searchWorks').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('Henle', () => {
  it('lit le numéro HN dans un ISMN de Henle, et seulement là', () => {
    expect(henleNumberOf('979-0-2018-0383-8')).toBe(383);
    expect(henleNumberOf('9790201812588')).toBe(1258);
    expect(henleNumberOf('9790230954983')).toBeNull();
    expect(henleNumberOf('9781854727152')).toBeNull();
  });

  it('lit une édition sur henle.de : son titre, son compositeur, sa couverture, son niveau', async () => {
    jest.spyOn(axios, 'get').mockImplementation(async (url: string) => ({ data: url.endsWith('/suggest') ? SUGGEST : PAGE }) as never);
    expect(await henleService.edition(383)).toEqual({
      number: 'HN 383', title: 'Préludes, Premier livre', composer: 'Claude Debussy',
      url: 'https://www.henle.de/Preludes-Premier-livre/HN-383', cover: 'https://www.henle.de/media/9e/HN-0383-big.jpg', level: 7,
      description: 'In 1910 the Préludes were published. This first volume became an immediate success.',
    });
  });

  it('reconnaît une partition Henle à son ISMN, au numéro de son titre ou à sa page ; et le bruit d’une boutique', () => {
    expect(henleNumberOfBook({ isbn13: '9790201803838', title: 'Préludes' })).toBe(383);
    expect(henleNumberOfBook({ isbn13: null, title: 'Deux Arabesques (HN 380)' })).toBe(380);
    expect(henleNumberOfBook({ title: 'Berceuse', urls: { henle: 'https://www.henle.de/Berceuse/HN-1258' } })).toBe(1258);
    expect(henleNumberOfBook({ isbn13: '9790230954983', title: 'Kinderszenen' })).toBeNull();
    expect(isShopNoise('Support - PartitionInstrumentation - KlavierGenre - Classique')).toBe(true);
    expect(isShopNoise('Search\n   opt')).toBe(true);
    expect(isShopNoise('')).toBe(true);
    expect(isShopNoise('L’été 1844 fut déjà le cinquième que Chopin passa à Nohant.')).toBe(false);
  });
});

describe('ajouter une partition', () => {
  it('trouve par son ISMN de Henle l’édition et l’œuvre qu’elle tient', async () => {
    jest.spyOn(henleService, 'edition').mockResolvedValue({
      number: 'HN 465', title: 'Consolations (including first edition of the early version)', composer: 'Franz Liszt',
      url: 'https://www.henle.de/Consolations/HN-465', cover: 'https://www.henle.de/media/HN-0465.jpg', level: null, description: null,
    });
    jest.spyOn(musicbrainzService, 'searchWorks').mockResolvedValue([
      { id: uuid(172), title: 'Consolations, S. 172', score: 100, composers: ['Franz Liszt'], disambiguation: null },
    ]);
    jest.spyOn(musicbrainzService, 'getWorkWithParts').mockImplementation(async id => ({ id, title: 'Consolations, S. 172', parentIds: [], parents: [], parts: [{ id: uuid(1), title: 'Consolation no. 1' }] }));

    const found = (await request(app).get('/api/scores/lookup').query({ q: '979-0-2018-0465-1' }).expect(200)).body;

    expect(found.from).toBe('henle');
    expect(found.edition).toMatchObject({ publisher: 'G. Henle Verlag', number: 'HN 465', composer: 'Franz Liszt', code: '9790201804651' });
    expect(found.works.map((w: { workId: string }) => w.workId)).toEqual([uuid(172)]);
  });

  it('garde la partition avec son numéro, son niveau, sa page et ses pièces', async () => {
    jest.spyOn(musicbrainzService, 'getWorkWithParts').mockImplementation(async id => ({ id, title: 'Préludes, Livre I', parentIds: [], parents: [], parts: [] }));
    const { id } = (await request(app).post('/api/scores').send({
      title: 'Préludes, Premier livre', composer: 'Claude Debussy', publisher: 'G. Henle Verlag', number: 'HN 383', code: '979-0-2018-0383-8',
      level: 7, url: 'https://www.henle.de/Preludes-Premier-livre/HN-383', priceChf: '24,50', workIds: [uuid(383)],
    }).expect(201)).body;

    const book = (await request(app).get(`/api/books/${id}`).expect(200)).body;
    expect(book).toMatchObject({
      title: 'Préludes, Premier livre (HN 383)', bookType: 'score', composer: 'Claude Debussy', publisher: 'G. Henle Verlag',
      isbn13: '9790201803838', difficulty: 7, priceChf: 24.5, titleStatus: 'owned', urls: { henle: 'https://www.henle.de/Preludes-Premier-livre/HN-383' },
    });
    expect((await request(app).get(`/api/scores/${id}/pieces`).expect(200)).body.map((p: { workId: string }) => p.workId)).toEqual([uuid(383)]);
    // Its level and page stay when the score is edited.
    await request(app).put(`/api/books/${id}`).send({ ...book, title: 'Préludes I (HN 383)' }).expect(200);
    expect((await request(app).get(`/api/books/${id}`).expect(200)).body).toMatchObject({ difficulty: 7, urls: { henle: expect.any(String) } });
    await request(app).post('/api/scores').send({ composer: 'X' }).expect(400);
  });

  it('lit une fois la page et le niveau Henle d’une partition déjà là', async () => {
    const id = await run(`INSERT INTO books (title, authors, book_type, title_status, isbn13, urls) VALUES ('Berceuse', '[]', 'score', 'owned', '9790201812588', '{}')`);
    const asked = jest.spyOn(henleService, 'edition').mockResolvedValue({ number: 'HN 1258', title: 'Berceuse', composer: 'Frédéric Chopin', url: 'https://www.henle.de/Berceuse/HN-1258', cover: null, level: 7, description: null });

    expect((await request(app).get(`/api/scores/${id}/henle`).expect(200)).body).toEqual({ url: 'https://www.henle.de/Berceuse/HN-1258', level: 7, changed: false });
    expect((await request(app).get(`/api/scores/${id}/henle`).expect(200)).body).toEqual({ url: 'https://www.henle.de/Berceuse/HN-1258', level: 7 });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledWith(1258);
  });

  it('relit henle.de pour les partitions Henle : leurs mots s’ils n’en ont pas de vrais, leur couverture si elle est plus grande', async () => {
    const big = await sharp({ create: { width: 585, height: 773, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const noisy = await run(`INSERT INTO books (title, authors, book_type, title_status, urls, description) VALUES ('Deux Arabesques (HN 380)', '[]', 'score', 'owned', '{}', 'Support - PartitionInstrumentation - Klavier')`);
    const written = await run(`INSERT INTO books (title, authors, book_type, title_status, isbn13, urls, description) VALUES ('Berceuse', '[]', 'score', 'owned', '9790201812588', '{}', 'L’été 1844 à Nohant.')`);
    await run(`INSERT INTO books (title, authors, book_type, title_status, urls) VALUES ('Kinderszenen', '[]', 'score', 'owned', '{}')`);
    jest.spyOn(henleService, 'edition').mockImplementation(async number => ({
      number: `HN ${number}`, title: 'X', composer: null, url: `https://www.henle.de/X/HN-${number}`, cover: `https://www.henle.de/media/HN-${number}.jpg`, level: 4,
      description: `Henle on ${number}.`,
    }));
    jest.spyOn(axios, 'get').mockImplementation(async () => ({ data: big, status: 200, headers: { 'content-type': 'image/jpeg' } }) as never);

    const read = (await request(app).post('/api/scores/henle').expect(200)).body as Array<{ id: number; cover: boolean; description: boolean }>;

    expect(read.find(r => r.id === noisy)).toMatchObject({ cover: true, description: true, level: 4 });
    expect(read.find(r => r.id === written)).toMatchObject({ description: false });
    const arabesques = (await request(app).get(`/api/books/${noisy}`).expect(200)).body;
    expect(arabesques).toMatchObject({ description: 'Henle on 380.', difficulty: 4, urls: { henle: 'https://www.henle.de/X/HN-380' } });
    expect(arabesques.cover).toMatch(/^\/api\/images\/book\//);
    expect((await request(app).get(`/api/books/${written}`).expect(200)).body.description).toBe('L’été 1844 à Nohant.');
  });

  it('par des mots : le compositeur qu’ils nomment, écrit comme les partitions l’écrivent ; jamais deviné', async () => {
    await run(`INSERT INTO books (title, authors, book_type, title_status, composer) VALUES ('Berceuse', '[]', 'score', 'owned', 'Frédéric Chopin')`);
    jest.spyOn(musicbrainzService, 'searchWorks').mockImplementation(async query => (/sketchbook/i.test(query)
      ? [{ id: uuid(9), title: 'Sketchbook III', score: 100, composers: ['Michael Karmon'], disambiguation: null }]
      : /kinderszenen/i.test(query) ? [
        { id: uuid(1), title: 'Kinderszenen', score: 100, composers: ['Raphael Petri'], disambiguation: null },
        { id: uuid(15), title: 'Kinderszenen, op. 15', score: 98, composers: ['Robert Schumann'], disambiguation: null },
        { id: uuid(16), title: 'Kinderszenen, op. 15: Träumerei', score: 95, composers: ['Robert Schumann'], disambiguation: null },
      ]
      : [{ id: uuid(23), title: 'Ballade no. 1 in G minor, op. 23', score: 100, composers: ['Fryderyk Chopin'], disambiguation: null }]));

    const chopin = (await request(app).get('/api/scores/lookup').query({ q: 'ballades chopin' }).expect(200)).body;
    expect(chopin.edition.composer).toBe('Frédéric Chopin');

    expect((await request(app).get('/api/scores/lookup').query({ q: 'kinderszenen' }).expect(200)).body.edition.composer).toBe('Robert Schumann');

    const anthology = (await request(app).get('/api/scores/lookup').query({ q: 'romantic sketchbook' }).expect(200)).body;
    expect(anthology.edition).toMatchObject({ composer: null, title: 'romantic sketchbook' });
    expect(anthology.works).toEqual([]);
  });
});
