import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';

const get = (sql: string, params: unknown[] = []): Promise<any> =>
  new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const readOwnership = (id: number) =>
  get('SELECT condition, ownership_notes, purchased_at, price_chf FROM albums WHERE id = ?', [id]);

describe('Album.create — ownership persistence', () => {
  it('persists ownership fields sent in the flat shape used by AlbumMetadataForm', async () => {
    const album = await Album.create({
      title: 'Kind of Blue',
      artist: ['Miles Davis'],
      condition: 'Near Mint',
      notes: 'bought at the flea market',
      purchasedAt: '2026-03-04',
      priceChf: '18.50'
    } as any);

    const row = await readOwnership(album.id);

    expect(row.condition).toBe('NM');
    expect(row.ownership_notes).toBe('bought at the flea market');
    expect(row.purchased_at).toBe('2026-03-04');
    expect(row.price_chf).toBe(18.5);
  });

  it('still persists ownership fields sent in the nested shape used by MusicForm', async () => {
    const album = await Album.create({
      title: 'Spirit of Eden',
      artist: ['Talk Talk'],
      ownership: {
        condition: 'VG+',
        notes: 'original pressing',
        purchasedAt: '2026-03-05',
        priceChf: 25
      }
    } as any);

    const row = await readOwnership(album.id);

    expect(row.condition).toBe('VG+');
    expect(row.ownership_notes).toBe('original pressing');
    expect(row.purchased_at).toBe('2026-03-05');
    expect(row.price_chf).toBe(25);
  });

  it('rejects an unsupported condition label before it reaches the CHECK constraint', async () => {
    await expect(
      Album.create({ title: 'Loveless', artist: ['My Bloody Valentine'], condition: 'Poor' } as any)
    ).rejects.toThrow(/Invalid condition/);
  });
});

describe('Album.update — ownership persistence', () => {
  it('keeps flat ownership fields sent by the edit form', async () => {
    const album = await Album.create({ title: 'Homogenic', artist: ['Björk'] } as any);

    await Album.update(album.id, {
      title: 'Homogenic',
      artist: ['Björk'],
      condition: 'Mint',
      notes: 'gatefold',
      purchasedAt: '2026-04-01',
      priceChf: '30'
    } as any);

    const row = await readOwnership(album.id);

    expect(row.condition).toBe('M');
    expect(row.ownership_notes).toBe('gatefold');
    expect(row.purchased_at).toBe('2026-04-01');
    expect(row.price_chf).toBe(30);
  });
});
