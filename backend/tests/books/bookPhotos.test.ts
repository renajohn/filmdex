import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import fs from 'fs';
import path from 'path';
import { unshout } from '../../src/services/coverScanService';
import { unpaced } from '../../src/services/bnfService';

const answer = (content: string) => ({ data: { choices: [{ message: { content }, finish_reason: 'stop' }] } });
const PHOTO = { image: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', mimeType: 'image/jpeg' };

afterEach(() => jest.restoreAllMocks());

describe('un livre lu sur ses photos', () => {
  it('écrit les capitales d’une couverture comme on écrit les mots', () => {
    expect(unshout('BRET EASTON ELLIS')).toBe('Bret Easton Ellis');
    expect(unshout("L'Évangile selon Pilate")).toBe("L'Évangile selon Pilate");
    expect(unshout('American Psycho')).toBe('American Psycho');
  });

  it('lit son recto et son verso : ce qu’il est, sa quatrième, son ISBN, son traducteur', async () => {
    jest.spyOn(axios, 'post').mockImplementation(async (_url: string, body: any) => {
      const prompt = JSON.stringify(body.messages);
      return (prompt.includes('BACK COVER')
        ? answer('{"blurb":"Avec son sourire carnassier, Patrick Bateman est l\'incarnation du golden boy new-yorkais.","isbn":"ISBN : 978-2-264-03937-8","publisher":"10/18","translators":["Alain Defossé"],"language":"fr"}')
        : answer('{"title":"AMERICAN PSYCHO","authors":["BRET EASTON ELLIS"],"series":"10/18","publisher":"10/18","kind":"book","language":"fr"}')) as never;
    });
    const read = (await request(app).post('/api/books/read-photos').send({ front: PHOTO, back: PHOTO }).expect(200)).body;
    expect(read.draft).toEqual({
      title: 'American Psycho', subtitle: null, authors: ['Bret Easton Ellis'], artists: [], translators: ['Alain Defossé'],
      series: null, seriesNumber: null, publisher: '10/18', isbn13: '9782264039378',
      description: 'Avec son sourire carnassier, Patrick Bateman est l\'incarnation du golden boy new-yorkais.', language: 'fr', bookType: 'book',
    });
    await request(app).post('/api/books/read-photos').send({}).expect(400);
  });

  it('complète par la BnF, sur demande, ce que les photos ne disent pas : son dessinateur, son année, ses pages', async () => {
    unpaced();
    jest.spyOn(axios, 'post').mockImplementation(async (_url: string, body: any) => (JSON.stringify(body.messages).includes('BACK COVER')
      ? answer('{"blurb":"Un crâne de cristal.","isbn":"978-2-8085-0197-2","publisher":"Dupuis","language":"fr"}')
      : answer('{"title":"Le crâne de Lubaantun","authors":["Aucha"],"series":"Les mondes perdus","volume":1,"kind":"graphic-novel","language":"fr"}')) as never);
    const notice = fs.readFileSync(path.join(__dirname, 'fixtures/bnf-mondes-perdus-1.xml'), 'utf8');
    jest.spyOn(axios, 'get').mockResolvedValue({ data: notice } as never);

    const read = (await request(app).post('/api/books/read-photos').send({ front: PHOTO, back: PHOTO, complete: true }).expect(200)).body;
    expect(read.draft).toMatchObject({
      title: 'Le crâne de Lubaantun', authors: ['Aucha'], artists: ['Isabelle Lemaux-Piedfert'], isbn13: '9782808501972',
      description: 'Un crâne de cristal.', publishedYear: 2024, pageCount: 73, bnf: 'https://catalogue.bnf.fr/ark:/12148/cb47436435z',
    });
    // Without asking, the photos alone.
    expect((await request(app).post('/api/books/read-photos').send({ back: PHOTO }).expect(200)).body.draft.artists).toEqual([]);
  });
});
