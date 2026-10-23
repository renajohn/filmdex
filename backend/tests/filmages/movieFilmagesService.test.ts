import { getDatabase } from '../../src/database';
import Movie from '../../src/models/movie';
import MovieFilmages from '../../src/models/movieFilmages';
import filmages, { FilmagesFilm } from '../../src/services/filmagesService';
import movieFilmagesService from '../../src/services/movieFilmagesService';
import ageRecommendationService from '../../src/services/ageRecommendationService';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

let seq = 0;
const insertMovie = (age: number | null = 12) => {
  seq += 1;
  return run(
    `INSERT INTO movies (title, original_title, director, tmdb_id, release_date, recommended_age, title_status)
     VALUES (?, ?, 'Peter Weir', ?, '1998-06-05', ?, 'owned')`,
    [`FilmAges film ${seq}`, `FilmAges film ${seq}`, 700000 + seq, age]
  );
};

const film = (over: Partial<FilmagesFilm> = {}): FilmagesFilm => ({
  id: 3259, year: 1998, ageLegal: 7, ageSuggested: 14,
  indications: [{ label: 'Humour', description: 'Le film fait rire.' }],
  counterIndications: [{ label: 'Plan physiologique', description: 'Durée.' }],
  synthesis: 'Pour adolescents.', ...over,
});

beforeEach(() => { delete process.env.FILMAGES_OFFLINE; });
afterEach(() => { process.env.FILMAGES_OFFLINE = '1'; jest.restoreAllMocks(); });

const movieAge = async (id: number) => {
  const movie = await Movie.findById(id) as { recommended_age: number | null; age_source: string | null };
  return { age: movie.recommended_age, source: movie.age_source };
};

describe('refreshMovie', () => {
  it('enregistre la fiche et donne au film l’âge suggéré', async () => {
    const id = await insertMovie(12);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(film());

    expect(await movieFilmagesService.refreshMovie(id)).toBe('updated');
    expect(await movieAge(id)).toEqual({ age: 14, source: 'filmages' });
    expect(await movieFilmagesService.getMovieFilmages(id)).toMatchObject({
      filmagesId: 3259, filmagesUrl: 'https://www.filmages.ch/films/detail/items/3259.html',
      ageLegal: 7, ageSuggested: 14, matchedBy: 'auto', movieAge: 14, ageSource: 'filmages',
      indications: [{ label: 'Humour', description: 'Le film fait rire.' }],
    });
  });

  it('prend l’âge légal quand FilmAges n’en suggère pas', async () => {
    const id = await insertMovie(12);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(film({ ageSuggested: null, ageLegal: 0 }));
    await movieFilmagesService.refreshMovie(id);
    expect(await movieAge(id)).toEqual({ age: 0, source: 'filmages' });
  });

  it('laisse la médiane TMDB/OMDB d’un film que FilmAges ne connaît pas', async () => {
    const id = await insertMovie(12);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(null);
    expect(await movieFilmagesService.refreshMovie(id)).toBe('not_found');
    expect(await movieAge(id)).toEqual({ age: 12, source: null });
    expect((await movieFilmagesService.getMovieFilmages(id)).checkedAt).not.toBeNull();
  });

  it('ne va pas sur filmages.ch hors ligne', async () => {
    process.env.FILMAGES_OFFLINE = '1';
    const find = jest.spyOn(filmages, 'findMatch');
    expect(await movieFilmagesService.refreshMovie(await insertMovie())).toBe('skipped');
    expect(find).not.toHaveBeenCalled();
  });
});

describe('lien manuel', () => {
  it('un film choisi à la main l’emporte et n’est plus cherché', async () => {
    const id = await insertMovie(12);
    jest.spyOn(filmages, 'getFilm').mockResolvedValue(film({ id: 42, ageSuggested: 10 }));
    const find = jest.spyOn(filmages, 'findMatch');

    expect(await movieFilmagesService.setManualLink(id, 42)).toMatchObject({ filmagesId: 42, matchedBy: 'manual', movieAge: 10 });
    await movieFilmagesService.refreshMovie(id);
    expect(find).not.toHaveBeenCalled();
    expect((await MovieFilmages.get(id))?.matched_by).toBe('manual');
  });

  it('« pas sur FilmAges » rend au film la médiane TMDB/OMDB', async () => {
    const id = await insertMovie(12);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(film());
    await movieFilmagesService.refreshMovie(id);
    jest.spyOn(ageRecommendationService, 'getRecommendedAge').mockResolvedValue(11);

    const data = await movieFilmagesService.setManualLink(id, null);
    expect(data).toMatchObject({ filmagesId: null, matchedBy: 'manual', movieAge: 11, ageSource: null });
    expect(await MovieFilmages.listDue(new Date(Date.now() + 365 * 86400000).toISOString(), 1000)).not.toContain(id);
  });
});

describe('runSweep', () => {
  it('cherche les films jamais vus, puis ceux introuvables depuis longtemps', async () => {
    const fresh = await insertMovie();
    const found = await insertMovie();
    const missedLongAgo = await insertMovie();
    const missedYesterday = await insertMovie();
    await MovieFilmages.save(found, film(), 'auto', '2020-01-01T00:00:00.000Z');
    await MovieFilmages.save(missedLongAgo, null, null, '2020-01-01T00:00:00.000Z');
    await MovieFilmages.save(missedYesterday, null, null, new Date(Date.now() - 86400000).toISOString());

    const due = await MovieFilmages.listDue(new Date(Date.now() - 30 * 86400000).toISOString(), 10000);
    expect(due).toEqual(expect.arrayContaining([fresh, missedLongAgo]));
    expect(due).not.toContain(found);
    expect(due).not.toContain(missedYesterday);
    expect(due.indexOf(fresh)).toBeLessThan(due.indexOf(missedLongAgo));
  });
});

describe('listes de films', () => {
  it('portent les âges et les éléments FilmAges pour l’infobulle de la pochette', async () => {
    const id = await insertMovie(16);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(film({
      counterIndications: [{ label: 'Violence', description: '' }, { label: 'Angoisse', description: '' }],
    }));
    await movieFilmagesService.refreshMovie(id);
    const rows = await Movie.search({ searchText: `title:"FilmAges film ${seq}"` } as any) as unknown as Array<Record<string, unknown>>;
    expect(rows.find(r => r.id === id)).toMatchObject({
      age_source: 'filmages', filmages_age_legal: 7, filmages_age_suggested: 14,
      filmages_for: 'Humour', filmages_against: 'Violence · Angoisse',
    });
  });
});

describe('recherche recommended_age', () => {
  it('suit l’âge FilmAges, plus la médiane qu’il remplace', async () => {
    const id = await insertMovie(16);
    jest.spyOn(filmages, 'findMatch').mockResolvedValue(film({ ageSuggested: 9 }));
    await movieFilmagesService.refreshMovie(id);
    const title = `title:"FilmAges film ${seq}"`;
    const ids = async (q: string) => ((await Movie.search({ searchText: `${q} ${title}` } as any)) as Array<{ id: number }>).map(m => m.id);
    expect(await ids('recommended_age:9')).toEqual([id]);
    expect(await ids('recommended_age:<=10')).toEqual([id]);
    expect(await ids('recommended_age:16')).toEqual([]);
  });
});
