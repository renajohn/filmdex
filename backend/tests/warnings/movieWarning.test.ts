import { getDatabase } from '../../src/database';
import MovieWarning from '../../src/models/movieWarning';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

let seq = 0;
const insertMovie = () =>
  run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, ?, 'owned')`, [`Film ${++seq}`, 900000 + seq]);

describe('MovieWarning', () => {
  it('enregistre les votes sans toucher à la correction, et inversement', async () => {
    const id = await insertMovie();
    await MovieWarning.setOverride(id, 'spiders', 'without', '2026-09-23T10:00:00.000Z');
    await MovieWarning.saveVotes(id, 'spiders', 1, 1, '2026-09-23T11:00:00.000Z');

    let [row] = await MovieWarning.getWarnings(id);
    expect(row).toMatchObject({ topic: 'spiders', yes_votes: 1, no_votes: 1, override: 'without' });

    await MovieWarning.setOverride(id, 'spiders', null, '2026-09-24T10:00:00.000Z');
    [row] = await MovieWarning.getWarnings(id);
    expect(row).toMatchObject({ yes_votes: 1, no_votes: 1, override: null });
  });

  it('remplace le lien existant', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 10812, 'imdb', '2026-09-23T00:00:00.000Z');
    await MovieWarning.saveLink(id, 22644, 'manual', null);
    expect(await MovieWarning.getLink(id)).toEqual({
      movie_id: id, ddd_id: 22644, matched_by: 'manual', checked_at: null
    });
  });

  it('une écriture automatique ne remplace jamais un lien manuel, une manuelle toujours', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 22644, 'manual', null);
    await MovieWarning.saveLink(id, 10812, 'imdb', '2026-09-23T00:00:00.000Z');
    await MovieWarning.saveLink(id, null, null, '2026-09-23T00:00:00.000Z');
    expect(await MovieWarning.getLink(id)).toMatchObject({ ddd_id: 22644, matched_by: 'manual', checked_at: null });

    await MovieWarning.saveLink(id, 7, 'manual', '2026-09-24T00:00:00.000Z');
    expect(await MovieWarning.getLink(id)).toMatchObject({ ddd_id: 7, matched_by: 'manual' });
  });

  it('liste les films jamais vérifiés ou vérifiés avant la date donnée', async () => {
    const never = await insertMovie();
    const old = await insertMovie();
    const fresh = await insertMovie();
    await MovieWarning.saveLink(old, 1, 'tmdb', '2026-01-01T00:00:00.000Z');
    await MovieWarning.saveLink(fresh, 2, 'tmdb', '2026-09-20T00:00:00.000Z');

    const due = await MovieWarning.listDueForRefresh('2026-08-24T00:00:00.000Z', 10000);
    expect(due).toEqual(expect.arrayContaining([never, old]));
    expect(due).not.toContain(fresh);
  });

  it('respecte la limite demandée', async () => {
    await insertMovie();
    await insertMovie();
    expect(await MovieWarning.listDueForRefresh('2026-08-24T00:00:00.000Z', 1)).toHaveLength(1);
  });

  it('efface les lignes d’un film supprimé', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 5, 'tmdb', '2026-09-23T00:00:00.000Z');
    await MovieWarning.saveVotes(id, 'snakes', 3, 1, '2026-09-23T00:00:00.000Z');
    await run('DELETE FROM movies WHERE id = ?', [id]);
    expect(await MovieWarning.getLink(id)).toBeNull();
    expect(await MovieWarning.getWarnings(id)).toEqual([]);
  });
});
