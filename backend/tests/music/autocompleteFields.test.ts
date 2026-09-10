import request from 'supertest';
import app from '../../index';
import Album from '../../src/models/album';
import Book from '../../src/models/book';

describe('GET /api/music/autocomplete', () => {
  it('answers on a mood filter instead of failing', async () => {
    // The search bar offers `mood:`, so the model has to accept it: it used to
    // reject the field and the suggestion list came back as a 500.
    const res = await request(app).get('/api/music/autocomplete').query({ field: 'mood', value: 'ca' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects an unknown field as a client error, not a server one', async () => {
    const res = await request(app)
      .get('/api/music/autocomplete')
      .query({ field: 'title WHERE 1=1 --', value: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('Album.autocomplete', () => {
  it('refuses a field that is not in the column map', async () => {
    await expect(Album.autocomplete('rowid', 'x')).rejects.toThrow(/Invalid field/);
  });
});

describe('Book.autocomplete', () => {
  it('maps the artist field to its column instead of querying "undefined"', async () => {
    // Without the mapping this used to run `SELECT DISTINCT undefined FROM books`
    // and reject with "no such column".
    const rows = await Book.autocomplete('artist', 'x');
    expect(Array.isArray(rows)).toBe(true);
  });

  it('refuses a field that is not in the column map', async () => {
    await expect(Book.autocomplete('rowid', 'x')).rejects.toThrow(/Invalid field/);
  });
});
