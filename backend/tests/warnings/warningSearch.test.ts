import { getDatabase } from '../../src/database';
import Movie from '../../src/models/movie';
import MovieWarning from '../../src/models/movieWarning';
import { classify } from '../../src/warnings/rules';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

const PREFIX = 'Grille araignées';
const expected = new Map<number, string>();

beforeAll(async () => {
  // Every vote pair around the thresholds, so the SQL and TypeScript rules must agree everywhere.
  let n = 0;
  for (let yes = 0; yes <= 7; yes++) {
    for (let no = 0; no <= 30; no++) {
      const id = await run(
        `INSERT INTO movies (title, tmdb_id, genre, title_status) VALUES (?, ?, ?, 'owned')`,
        [`${PREFIX} ${yes}-${no}`, 700000 + n++, no % 2 ? 'Comedy' : 'Drama']
      );
      await MovieWarning.saveVotes(id, 'spiders', yes, no, '2026-09-23T00:00:00.000Z');
      expected.set(id, classify(yes, no));
    }
  }
  const overridden = await run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, 699999, 'owned')`, [`${PREFIX} override`]);
  await MovieWarning.saveVotes(overridden, 'spiders', 1, 1, '2026-09-23T00:00:00.000Z');
  await MovieWarning.setOverride(overridden, 'spiders', 'without', '2026-09-23T00:00:00.000Z');
  expected.set(overridden, 'without');
});

const idsFor = async (searchText: string) =>
  (await Movie.search({ searchText: `${searchText} title:"${PREFIX}"` } as any)).map(m => (m as any).id as number);

describe('prédicats spiders:', () => {
  it.each(['with', 'without'])('spiders:%s concorde avec classify pour chaque paire de votes', async status => {
    const ids = await idsFor(`spiders:${status}`);
    const want = [...expected].filter(([, s]) => s === status).map(([id]) => id);
    expect(ids.sort()).toEqual(want.sort());
  });

  it('classe unknown un film sans aucune ligne', async () => {
    const id = await run(`INSERT INTO movies (title, tmdb_id, title_status) VALUES (?, 699998, 'owned')`, [`${PREFIX} sans ligne`]);
    expect(await idsFor('spiders:unknown')).toContain(id);
    expect(await idsFor('snakes:unknown')).toContain(id);
  });

  it('se combine avec un autre prédicat', async () => {
    const ids = await idsFor('spiders:without genre:"Comedy"');
    expect(ids.length).toBeGreaterThan(0);
    const rows = await Movie.search({ searchText: `spiders:without genre:"Comedy" title:"${PREFIX}"` } as any);
    for (const movie of rows as any[]) {
      expect(movie.genre).toBe('Comedy');
      expect(movie.spiders_status).toBe('without');
    }
  });

  it('ne lève pas d’erreur sur une valeur invalide', async () => {
    await expect(Movie.search({ searchText: 'spiders:maybe' } as any)).resolves.toBeDefined();
  });
});

describe('colonnes de classement', () => {
  it('ajoute spiders_status et snakes_status aux films de la collection', async () => {
    const movies = await Movie.findByStatus('owned');
    const sample = (movies as any[]).find(m => expected.has(m.id))!;
    expect(sample.spiders_status).toBe(expected.get(sample.id));
    expect(sample.snakes_status).toBe('unknown');
  });
});
