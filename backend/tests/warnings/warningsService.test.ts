import { getDatabase } from '../../src/database';
import MovieWarning from '../../src/models/movieWarning';
import ddd, { DddQuotaError } from '../../src/services/doesTheDogDieService';
import warningsService from '../../src/services/warningsService';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(sql, params, function (this: { lastID: number }, err: Error | null) {
      if (err) reject(err); else resolve(this.lastID);
    }));

let seq = 0;
const insertMovie = (over: { imdb_id?: string | null; tmdb_id?: number } = {}) => {
  seq += 1;
  return run(
    `INSERT INTO movies (title, imdb_id, tmdb_id, release_date, title_status) VALUES (?, ?, ?, '2002-01-01', 'owned')`,
    [`Service film ${seq}`, over.imdb_id ?? `tt9${seq}`, over.tmdb_id ?? 800000 + seq]
  );
};

const VOTES = { spiders: { yes: 125, no: 0 }, snakes: { yes: 1, no: 13 } };

beforeEach(() => {
  jest.spyOn(ddd, 'isConfigured').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('refreshMovie', () => {
  it('trouve la fiche, enregistre les votes et classe', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockResolvedValue({ dddId: 9880, matchedBy: 'tmdb' });
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    expect(await warningsService.refreshMovie(id)).toBe('updated');

    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 9880, matchedBy: 'tmdb', dddUrl: 'https://www.doesthedogdie.com/media/9880' });
    expect(w.topics).toEqual([
      expect.objectContaining({ topic: 'spiders', status: 'with', yes: 125, no: 0 }),
      expect.objectContaining({ topic: 'snakes', status: 'without', yes: 1, no: 13 }),
    ]);
  });

  it('réutilise le lien connu : une seule requête, pas de recherche', async () => {
    const id = await insertMovie();
    await MovieWarning.saveLink(id, 9880, 'tmdb', '2026-01-01T00:00:00.000Z');
    const find = jest.spyOn(ddd, 'findMatch');
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    await warningsService.refreshMovie(id);
    expect(find).not.toHaveBeenCalled();
  });

  it('ne remet jamais en cause un lien manuel ni une correction', async () => {
    const id = await insertMovie();
    await warningsService.setOverride(id, 'spiders', 'without');
    await MovieWarning.saveLink(id, 22644, 'manual', null);
    jest.spyOn(ddd, 'getVotes').mockResolvedValue(VOTES);

    await warningsService.refreshMovie(id);
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 22644, matchedBy: 'manual' });
    expect(w.topics[0]).toMatchObject({ topic: 'spiders', status: 'without', override: 'without', yes: 125 });
  });

  it('note un film introuvable sans votes', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockResolvedValue(null);
    expect(await warningsService.refreshMovie(id)).toBe('not_found');
    const w = await warningsService.getMovieWarnings(id);
    expect(w.dddId).toBeNull();
    expect(w.checkedAt).not.toBeNull();
    expect(w.topics.map(t => t.status)).toEqual(['unknown', 'unknown']);
  });

  it('ne fait rien sans clé', async () => {
    (ddd.isConfigured as jest.Mock).mockReturnValue(false);
    const find = jest.spyOn(ddd, 'findMatch');
    expect(await warningsService.refreshMovie(await insertMovie())).toBe('skipped');
    expect(find).not.toHaveBeenCalled();
  });

  it('propage DddQuotaError', async () => {
    const id = await insertMovie();
    jest.spyOn(ddd, 'findMatch').mockRejectedValue(new DddQuotaError(429));
    await expect(warningsService.refreshMovie(id)).rejects.toBeInstanceOf(DddQuotaError);
  });
});

describe('getMovieWarnings', () => {
  it('renvoie tous les sujets, inconnus, pour un film jamais vérifié', async () => {
    const w = await warningsService.getMovieWarnings(await insertMovie());
    expect(w).toMatchObject({ dddId: null, dddUrl: null, matchedBy: null, checkedAt: null });
    expect(w.topics).toEqual([
      expect.objectContaining({ topic: 'spiders', status: 'unknown', yes: 0, no: 0, override: null }),
      expect.objectContaining({ topic: 'snakes', status: 'unknown', yes: 0, no: 0, override: null }),
    ]);
  });
});

describe('importSnapshot', () => {
  it('importe les liens et les votes sans appeler l’API', async () => {
    const id = await insertMovie({ imdb_id: 'tt0109440', tmdb_id: 15097 });
    const find = jest.spyOn(ddd, 'findMatch');
    const votes = jest.spyOn(ddd, 'getVotes');

    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: 'tt0109440', tmdb_id: 15097, ddd_id: 22644, matched_by: 'title_year',
                 spiders: { yes: 1, no: 1 }, snakes: { yes: 0, no: 1 } }],
    });

    expect(result).toEqual({ imported: 1, skipped: [] });
    expect(find).not.toHaveBeenCalled();
    expect(votes).not.toHaveBeenCalled();
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 22644, matchedBy: 'title_year', checkedAt: '2026-09-23T00:00:00.000Z' });
    expect(w.topics[0]).toMatchObject({ status: 'with', yes: 1, no: 1 });
  });

  it('ignore une ligne dont les identifiants ne concordent pas', async () => {
    const id = await insertMovie({ imdb_id: 'tt1111111', tmdb_id: 111 });
    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: 'tt2222222', tmdb_id: 222, ddd_id: 5, matched_by: 'tmdb',
                 spiders: { yes: 9, no: 0 }, snakes: { yes: 0, no: 9 } }],
    });
    expect(result.skipped).toEqual([{ movie_id: id, reason: 'mismatch' }]);
    expect((await warningsService.getMovieWarnings(id)).dddId).toBeNull();
  });

  it('accepte la ligne si un seul des deux identifiants concorde', async () => {
    const id = await insertMovie({ imdb_id: null, tmdb_id: 9421 });
    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [{ movie_id: id, imdb_id: null, tmdb_id: 9421, ddd_id: 1484671, matched_by: 'title_year',
                 spiders: { yes: 0, no: 1 }, snakes: { yes: 0, no: 1 } }],
    });
    expect(result.imported).toBe(1);
  });

  it('signale un film absent et ne touche pas un lien manuel', async () => {
    const id = await insertMovie({ imdb_id: 'tt3333333', tmdb_id: 333 });
    await MovieWarning.saveLink(id, 42, 'manual', null);
    await warningsService.setOverride(id, 'spiders', 'without');

    const result = await warningsService.importSnapshot({
      fetched_at: '2026-09-23',
      movies: [
        { movie_id: 99999999, imdb_id: 'tt0', tmdb_id: 0, ddd_id: 1, matched_by: 'tmdb', spiders: null, snakes: null },
        { movie_id: id, imdb_id: 'tt3333333', tmdb_id: 333, ddd_id: 7, matched_by: 'tmdb',
          spiders: { yes: 50, no: 0 }, snakes: { yes: 0, no: 5 } },
      ],
    });

    expect(result.skipped).toEqual([
      { movie_id: 99999999, reason: 'missing' },
      { movie_id: id, reason: 'manual' },
    ]);
    const w = await warningsService.getMovieWarnings(id);
    expect(w).toMatchObject({ dddId: 42, matchedBy: 'manual' });
    expect(w.topics[0]).toMatchObject({ override: 'without', yes: 0 });
  });
});

describe('runDailyRefresh', () => {
  it('s’arrête au premier refus de quota', async () => {
    await insertMovie();
    await insertMovie();
    const find = jest.spyOn(ddd, 'findMatch').mockRejectedValue(new DddQuotaError(429));

    const result = await warningsService.runDailyRefresh({ delayMs: 0 });
    expect(result.stoppedByQuota).toBe(true);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('s’arrête une fois le budget de requêtes consommé', async () => {
    await insertMovie();
    await insertMovie();
    await insertMovie();
    // Every refresh that finds its entry calls getVotes once, whatever the path
    // (known link, manual link, or fresh match): charging the whole cost there
    // makes each refresh cost exactly 3, whichever movies the file left behind.
    let count = 0;
    jest.spyOn(ddd, 'getRequestCount').mockImplementation(() => count);
    jest.spyOn(ddd, 'findMatch').mockResolvedValue({ dddId: 1, matchedBy: 'tmdb' });
    jest.spyOn(ddd, 'getVotes').mockImplementation(async () => { count += 3; return VOTES; });

    const result = await warningsService.runDailyRefresh({ maxRequests: 5, delayMs: 0 });
    expect(result.refreshed).toBe(2); // 3 requêtes, puis 6 ≥ 5 : arrêt
  });

  it('ne fait rien sans clé', async () => {
    (ddd.isConfigured as jest.Mock).mockReturnValue(false);
    const find = jest.spyOn(ddd, 'findMatch');
    expect(await warningsService.runDailyRefresh({ delayMs: 0 })).toEqual({ refreshed: 0, stoppedByQuota: false });
    expect(find).not.toHaveBeenCalled();
  });
});
