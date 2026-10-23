import { getDatabase } from '../../src/database';
import Movie from '../../src/models/movie';
import MovieWarning from '../../src/models/movieWarning';
import { parseMovieSearch } from '../../src/models/movieSearch';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

const PREFIX = 'Recherche pastilles';
const ids: Record<string, number> = {};

beforeAll(async () => {
  const add = async (name: string, fields: Record<string, unknown>) => {
    const cols = ['title', 'tmdb_id', 'title_status', ...Object.keys(fields)];
    const values = [`${PREFIX} ${name}`, 810000 + Object.keys(ids).length, 'owned', ...Object.values(fields)];
    ids[name] = await run(`INSERT INTO movies (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, values);
  };
  await add('Alpha', {
    director: 'Stanley Kubrick', genre: 'Drama, Science Fiction', cast: '["Keir Dullea","Gary Lockwood"]',
    release_date: '1968-04-02', imdb_rating: 8.3, recommended_age: 12, price: 9.5, watch_count: 2,
    last_watched: '2026-10-20', comments: 'Superbe', original_language: 'en', media_type: 'movie', format: 'Blu-ray',
  });
  await add('Beta', {
    director: 'Agnès Varda', genre: 'Comedy', cast: '["Corinne Marchand"]',
    release_date: '1962-04-11', imdb_rating: 7.6, recommended_age: 6, price: 20, watch_count: 0,
    original_language: 'fr', media_type: 'movie', format: 'DVD',
  });
  await add('Gamma', {
    director: 'Hayao Miyazaki', genre: null, cast: '[]',
    release_date: '2001-07-20', imdb_rating: null, recommended_age: 4, watch_count: 1,
    last_watched: '2025-03-01', comments: '', original_language: 'ja', media_type: 'tv', format: 'Blu-ray 4K',
  });
  await MovieWarning.saveVotes(ids.Alpha, 'spiders', 9, 0, '2026-10-22T00:00:00.000Z');
  await MovieWarning.saveVotes(ids.Beta, 'spiders', 0, 9, '2026-10-22T00:00:00.000Z');
  await MovieWarning.saveVotes(ids.Beta, 'snakes', 0, 9, '2026-10-22T00:00:00.000Z');
});

/** The names of the test's movies a search finds. */
const found = async (searchText: string) => {
  const rows = await Movie.search({ searchText: `${searchText} title:"${PREFIX}"` } as any);
  const byId = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
  return (rows as any[]).map(m => byId.get(m.id)).filter(Boolean).sort();
};

describe('parseMovieSearch', () => {
  it('reads -key: and !key: as an exclusion', () => {
    expect(parseMovieSearch('-genre:Horror').filters).toEqual([{ kind: 'text', key: 'genre', negate: true, values: ['Horror'] }]);
    expect(parseMovieSearch('!genre:Horror').filters[0]).toMatchObject({ negate: true });
  });

  it('reads commas as one or the other, quotes keeping spaces and colons', () => {
    expect(parseMovieSearch('actor:"Tom Hanks","Meg Ryan" title:"Vol: 2"').filters).toEqual([
      { kind: 'text', key: 'actor', negate: false, values: ['Tom Hanks', 'Meg Ryan'] },
      { kind: 'text', key: 'title', negate: false, values: ['Vol: 2'] },
    ]);
  });

  it.each(['yes', 'true', 'with', 'y', '1', 'YES'])('has_comments:%s is yes', word => {
    expect(parseMovieSearch(`has_comments:${word}`).filters).toEqual([{ kind: 'comments', negate: false, values: ['yes'] }]);
  });

  it.each(['no', 'false', 'without', 'n', '0'])('has_comments:%s is no', word => {
    expect(parseMovieSearch(`has_comments:${word}`).filters).toEqual([{ kind: 'comments', negate: false, values: ['no'] }]);
  });

  it.each([['yes', 'with'], ['with', 'with'], ['true', 'with'], ['no', 'without'], ['without', 'without'], ['false', 'without'], ['unknown', 'unknown']])(
    'spiders:%s is %s', (word, status) => {
      expect(parseMovieSearch(`spiders:${word}`).filters).toEqual([{ kind: 'warning', key: 'spiders', negate: false, values: [status] }]);
    });

  it('reads watched as a count first, then yes/no', () => {
    expect(parseMovieSearch('watched:1').filters[0]).toMatchObject({ kind: 'number', values: [{ op: '=', a: 1 }] });
    expect(parseMovieSearch('watched:>=2').filters[0]).toMatchObject({ kind: 'number', values: [{ op: '>=', a: 2 }] });
    expect(parseMovieSearch('watched:yes').filters[0]).toEqual({ kind: 'watchedBool', negate: false, values: ['yes'] });
    expect(parseMovieSearch('watched:false').filters[0]).toEqual({ kind: 'watchedBool', negate: false, values: ['no'] });
  });

  it('reads numbers, comparisons and ranges', () => {
    expect(parseMovieSearch('year:1960-1969 imdb_rating:>=7.5 price:<10').filters).toEqual([
      { kind: 'number', key: 'year', negate: false, values: [{ op: 'range', a: 1960, b: 1969 }] },
      { kind: 'number', key: 'imdb_rating', negate: false, values: [{ op: '>=', a: 7.5 }] },
      { kind: 'number', key: 'price', negate: false, values: [{ op: '<', a: 10 }] },
    ]);
  });

  it('reads last_watched words and dates', () => {
    const today = new Date(2026, 9, 23);
    expect(parseMovieSearch('last_watched:today', today).filters[0]).toMatchObject({ values: [{ op: '=', date: '2026-10-23' }] });
    expect(parseMovieSearch('last_watched:week', today).filters[0]).toMatchObject({ values: [{ op: '>=', date: '2026-10-16' }] });
    expect(parseMovieSearch('last_watched:>2024-01-01', today).filters[0]).toMatchObject({ values: [{ op: '>', date: '2024-01-01' }] });
    expect(parseMovieSearch('last_watched:2025', today).filters[0]).toMatchObject({ values: [{ op: '=', date: '2025' }] });
  });

  it('keeps lang as original_language, a key it does not know and a value a key does not take as words', () => {
    expect(parseMovieSearch('lang:fr').filters[0]).toMatchObject({ key: 'original_language', values: ['fr'] });
    const { filters, words } = parseMovieSearch('spiders:maybe colour:red alien');
    expect(filters).toEqual([]);
    expect(words).toEqual(['spiders:maybe', 'colour:red', 'alien']);
  });

  it('leaves out a key without its value yet', () => {
    expect(parseMovieSearch('actor: year:>= alien')).toEqual({ filters: [], words: ['alien'] });
  });

  it('does not read watched: inside last_watched:', () => {
    expect(parseMovieSearch('last_watched:2024').filters).toEqual([{ kind: 'lastWatched', negate: false, values: [{ op: '=', date: '2024' }] }]);
  });
});

describe('Movie.search with the pills’ vocabulary', () => {
  it('excludes with -key:, keeping the movies without the field', async () => {
    expect(await found('-genre:Comedy')).toEqual(['Alpha', 'Gamma']);
    expect(await found('!director:Kubrick')).toEqual(['Beta', 'Gamma']);
  });

  it('finds one value or the other', async () => {
    expect(await found('director:Kubrick,Varda')).toEqual(['Alpha', 'Beta']);
    expect(await found('actor:"Keir Dullea","Corinne Marchand"')).toEqual(['Alpha', 'Beta']);
  });

  it.each([['yes'], ['true'], ['with']])('has_comments:%s', async word => {
    expect(await found(`has_comments:${word}`)).toEqual(['Alpha']);
  });

  it.each([['no'], ['false'], ['without']])('has_comments:%s', async word => {
    expect(await found(`has_comments:${word}`)).toEqual(['Beta', 'Gamma']);
  });

  it.each([['yes'], ['with']])('spiders:%s', async word => {
    expect(await found(`spiders:${word}`)).toEqual(['Alpha']);
  });

  it.each([['no'], ['without']])('spiders:%s', async word => {
    expect(await found(`spiders:${word}`)).toEqual(['Beta']);
  });

  it('spiders:unknown, spiders:no,unknown and -spiders:yes', async () => {
    expect(await found('spiders:unknown')).toEqual(['Gamma']);
    expect(await found('spiders:no,unknown')).toEqual(['Beta', 'Gamma']);
    expect(await found('-spiders:yes')).toEqual(['Beta', 'Gamma']);
    expect(await found('spiders:no snakes:no')).toEqual(['Beta']);
  });

  it('watched as yes/no and as a count', async () => {
    expect(await found('watched:yes')).toEqual(['Alpha', 'Gamma']);
    expect(await found('watched:true')).toEqual(['Alpha', 'Gamma']);
    expect(await found('watched:no')).toEqual(['Beta']);
    expect(await found('watched:>=2')).toEqual(['Alpha']);
    expect(await found('watched:1')).toEqual(['Gamma']);
  });

  it('numbers: ranges, comparisons, negation', async () => {
    expect(await found('year:1960-1969')).toEqual(['Alpha', 'Beta']);
    expect(await found('-year:1960-1969')).toEqual(['Gamma']);
    expect(await found('imdb_rating:>=8')).toEqual(['Alpha']);
    expect(await found('-imdb_rating:>=8')).toEqual(['Beta', 'Gamma']);
    expect(await found('recommended_age:4-9')).toEqual(['Beta', 'Gamma']);
    expect(await found('recommended_age:>=4 recommended_age:<=9')).toEqual(['Beta', 'Gamma']);
    expect(await found('price:<10')).toEqual(['Alpha']);
  });

  it('last_watched dates', async () => {
    expect(await found('last_watched:2025')).toEqual(['Gamma']);
    expect(await found('last_watched:>2025')).toEqual(['Alpha']);
    expect(await found('last_watched:>=2025-03')).toEqual(['Alpha', 'Gamma']);
    expect(await found('last_watched:<2026-01-01')).toEqual(['Gamma']);
  });

  it('text keys: format, language, media type, lang', async () => {
    expect(await found('format:"Blu-ray 4K"')).toEqual(['Gamma']);
    expect(await found('original_language:fr')).toEqual(['Beta']);
    expect(await found('lang:ja')).toEqual(['Gamma']);
    expect(await found('media_type:tv')).toEqual(['Gamma']);
  });

  it('plain words each find something', async () => {
    expect(await found('Kubrick')).toEqual(['Alpha']);
    expect(await found('Alpha Kubrick')).toEqual(['Alpha']);
    expect(await found('Alpha Varda')).toEqual([]);
  });

  it('plain words without their accents, in any order', async () => {
    expect(await found('agnes')).toEqual(['Beta']);
    expect(await found('VARDÀ agnès')).toEqual(['Beta']);
    expect(await found('superbe kubrick')).toEqual(['Alpha']);
  });

  it('a value a key does not take finds nothing, without an error', async () => {
    await expect(Movie.search({ searchText: 'spiders:maybe' } as any)).resolves.toBeDefined();
    expect(await found('spiders:maybe')).toEqual([]);
  });
});
