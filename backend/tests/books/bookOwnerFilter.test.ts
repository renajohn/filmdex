import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';

const run = (sql: string, params: unknown[] = []) => new Promise<number>((resolve, reject) =>
  getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }));

describe('le filtre owner: des livres', () => {
  const word = `proprio${Math.random().toString(36).slice(2, 8)}`;
  beforeAll(async () => {
    for (const owner of ['Alice', 'Oriane', 'Renault', null]) {
      await run('INSERT INTO books (title, owner, title_status) VALUES (?, ?, ?)', [`${word} ${owner ?? 'personne'}`, owner, 'owned']);
    }
  });

  const owners = async (q: string) => {
    const res = await request(app).get('/api/books/search').query({ q: `${word} ${q}` }).expect(200);
    return (res.body as Array<{ owner: string | null }>).map(b => b.owner).sort();
  };

  it('prend un nom exact, ou plusieurs séparés par des virgules', async () => {
    expect(await owners('owner:alice')).toEqual(['Alice']);
    expect(await owners('owner:Alice,Oriane')).toEqual(['Alice', 'Oriane']);
    expect(await owners('owner:"Alice",Oriane')).toEqual(['Alice', 'Oriane']);
    expect(await owners('owner:Ali')).toEqual([]);
  });

  it('prend none pour les livres de personne, seul ou avec des noms', async () => {
    expect(await owners('owner:none')).toEqual([null]);
    expect(await owners('owner:Alice,none')).toEqual(['Alice', null]);
  });
});
