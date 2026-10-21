import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { unshout } from '../../src/services/coverScanService';

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
});
