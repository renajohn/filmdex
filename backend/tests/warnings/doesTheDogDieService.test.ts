import axios from 'axios';
import ddd, { DddQuotaError, pickMatch, DddItem } from '../../src/services/doesTheDogDieService';
import tmdbService from '../../src/services/tmdbService';

const item = (over: Partial<DddItem>): DddItem => ({
  id: 1, name: 'x', releaseYear: null, imdbId: null, tmdbid: null, ...over
});

const PANS = [item({ id: 10812, name: "Pan's Labyrinth", releaseYear: '2006', imdbId: 'tt0457430', tmdbid: null })];
const OCEANS = [item({ id: 17560, name: "Ocean's Thirteen", releaseYear: 'Unknown' })];
const ASTERIX = [item({ id: 775091, name: 'Astérix & Obélix: Mission Cléopâtre', releaseYear: '2002', tmdbid: 822678 })];
const CITE = [
  item({ id: 22644, name: 'La Cité De La Peur', releaseYear: '1994' }),
  item({ id: 1739404, name: 'La Cité de La Peur Suédé', releaseYear: 'Unknown', tmdbid: 1703590 }),
];

const MEDIA = {
  item: { id: 9880 },
  topicItemStats: [
    { TopicId: 165, yesSum: 125, noSum: 0 },
    { TopicId: 214, yesSum: 87, noSum: 0 },
    { TopicId: 153, yesSum: 3, noSum: 40 },
  ],
};

beforeEach(() => { process.env.DOES_DOG_DIE = 'test-key'; });
afterEach(() => { delete process.env.DOES_DOG_DIE; jest.restoreAllMocks(); });

describe('requêtes', () => {
  it('envoie la clé, un User-Agent explicite et un délai', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: PANS } } as any);
    await ddd.search("Pan's Labyrinth");
    expect(spy).toHaveBeenCalledWith('https://www.doesthedogdie.com/dddsearch', expect.objectContaining({
      params: { q: "Pan's Labyrinth" },
      timeout: 10000,
      headers: expect.objectContaining({ 'X-API-KEY': 'test-key', 'User-Agent': expect.stringMatching(/^DexVault\//) }),
    }));
  });

  it('lit les votes des deux sujets et ignore les autres', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: MEDIA } as any);
    expect(await ddd.getVotes(9880)).toEqual({ spiders: { yes: 125, no: 0 }, snakes: { yes: 87, no: 0 } });
  });

  it('compte zéro vote pour un sujet absent de la fiche', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { topicItemStats: [] } } as any);
    expect(await ddd.getVotes(1)).toEqual({ spiders: { yes: 0, no: 0 }, snakes: { yes: 0, no: 0 } });
  });

  it.each([403, 429])('transforme un HTTP %i en DddQuotaError', async status => {
    jest.spyOn(axios, 'get').mockRejectedValue({ isAxiosError: true, response: { status } });
    await expect(ddd.search('Alien')).rejects.toBeInstanceOf(DddQuotaError);
  });

  it('compte chaque requête envoyée', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    const before = ddd.getRequestCount();
    await ddd.search('a');
    await ddd.search('b');
    expect(ddd.getRequestCount() - before).toBe(2);
  });

  it('se dit non configuré sans clé', () => {
    delete process.env.DOES_DOG_DIE;
    expect(ddd.isConfigured()).toBe(false);
  });
});

describe('pickMatch', () => {
  it('préfère l’IMDb ID, même sans tmdbid sur la fiche', () => {
    expect(pickMatch(PANS, { title: "Pan's Labyrinth (zone A)", imdb_id: 'tt0457430', tmdb_id: 1417 }))
      .toEqual({ dddId: 10812, matchedBy: 'imdb' });
  });

  it('se rabat sur le titre et l’année quand la fiche n’a aucun identifiant', () => {
    expect(pickMatch(CITE, { title: 'La cité de la peur', release_date: '1994-03-09', imdb_id: 'tt0109440', tmdb_id: 15097 }))
      .toEqual({ dddId: 22644, matchedBy: 'title_year' });
  });

  it('accepte une année inconnue côté DDD si le titre concorde', () => {
    expect(pickMatch(OCEANS, { title: "Ocean's Thirteen", release_date: '2007-06-08', tmdb_id: 298 }))
      .toEqual({ dddId: 17560, matchedBy: 'title_year' });
  });

  it('passe outre un tmdbid erroné grâce au titre et à l’année', () => {
    expect(pickMatch(ASTERIX, { title: 'Astérix et Obélix mission Cléopatre', release_date: '2002-01-30', tmdb_id: 2899 }))
      .toEqual({ dddId: 775091, matchedBy: 'title_year' });
  });

  it('refuse un titre identique à plus d’un an d’écart', () => {
    expect(pickMatch([item({ id: 5, name: 'Alien', releaseYear: '2025' })], { title: 'Alien', release_date: '1979-05-25' }))
      .toBeNull();
  });
});

describe('findMatch', () => {
  it('essaie le titre nettoyé, puis l’original, puis le titre anglais TMDB', async () => {
    const queries: string[] = [];
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config: any) => {
      queries.push(config.params.q);
      const items = config.params.q === 'Amélie'
        ? [item({ id: 14134, name: 'Amélie', releaseYear: '2001', imdbId: 'tt0211915' })]
        : [];
      return { data: { items } } as any;
    });
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({ title: 'Amélie' } as any);

    const match = await ddd.findMatch({
      title: "Le Fabuleux destin d'Amélie Poulain", original_title: "Le Fabuleux Destin d'Amélie Poulain",
      imdb_id: 'tt0211915', tmdb_id: 194, release_date: '2001-04-25', media_type: 'movie'
    });

    expect(match).toEqual({ dddId: 14134, matchedBy: 'imdb' });
    expect(queries).toEqual(["Le Fabuleux destin d'Amélie Poulain", "Le Fabuleux Destin d'Amélie Poulain", 'Amélie']);
  });

  it('ne recherche pas deux fois le même titre', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    jest.spyOn(tmdbService, 'getMovieDetails').mockResolvedValue({ title: 'Alien' } as any);
    expect(await ddd.findMatch({ title: 'Alien', original_title: 'Alien', tmdb_id: 348, media_type: 'movie' })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('interroge TMDB en mode série pour une série', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } } as any);
    const tv = jest.spyOn(tmdbService, 'getTVShowDetails').mockResolvedValue(null);
    await ddd.findMatch({ title: 'Kaamelott', tmdb_id: 11466, media_type: 'tv' });
    expect(tv).toHaveBeenCalledWith(11466);
  });
});
