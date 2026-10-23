import fs from 'fs';
import path from 'path';
import axios from 'axios';
import filmages, {
  parseAge, parseFilm, parseSearch, queriesFor, sameDirector, titleKeys,
} from '../../src/services/filmagesService';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

afterEach(() => jest.restoreAllMocks());

describe('lecture des pages', () => {
  it('lit les lignes d’une recherche', () => {
    expect(parseSearch(fixture('search-truman.html'))).toEqual([
      { id: 9762, titleFrench: 'Truman', titleOriginal: 'Truman', director: 'Cesc Gay' },
      { id: 6628, titleFrench: 'Truman Capote', titleOriginal: 'Capote', director: 'Bennett Miller' },
      { id: 3259, titleFrench: 'Truman show (Le)', titleOriginal: 'Truman show (The)', director: 'Peter Weir' },
    ]);
  });

  it('lit les âges, les éléments avec leur définition et la synthèse', () => {
    const film = parseFilm(12966, fixture('detail-12966.html'));
    expect(film).toMatchObject({ id: 12966, year: 2021, ageLegal: 12, ageSuggested: 14 });
    expect(film.indications.map(e => e.label)).toEqual(['Intérêt culturel ou thématique', 'Suscite réflexion ou discussion']);
    expect(film.counterIndications.map(e => e.label)).toEqual([
      'Plan physiologique', 'Relations psychologiques pesantes, perverses, …, tension', 'Violence',
    ]);
    expect(film.indications[1].description).toMatch(/^Signale que le film suscitera/);
    // Each <br /> is one line, not the page's own line break as well.
    expect(film.counterIndications[0].description).toContain("Il peut s'agir :\n• de la durée du film");
    expect(film.synthesis).toMatch(/Pour des adolescents et adultes fans du genre\.$/);
  });

  it('un vieux film sans âge suggéré ni éléments', () => {
    const film = parseFilm(435, fixture('detail-435.html'));
    expect(film).toMatchObject({ ageLegal: 14, ageSuggested: null, indications: [], counterIndications: [] });
  });

  it.each([['16 ans', 16], ['0 ans', 0], ['-', null], ['', null], [null, null]])('lit l’âge « %s »', (value, age) => {
    expect(parseAge(value as string | null)).toBe(age);
  });
});

describe('correspondances', () => {
  it('reconnaît un réalisateur parmi plusieurs, sans accents', () => {
    expect(sameDirector('Éric Toledano', 'Eric Toledano, Olivier Nakache')).toBe(true);
    expect(sameDirector('Guillermo del Toro', 'Guillermo Del Toro')).toBe(true);
    expect(sameDirector('Paul Feig', 'Ivan Reitman')).toBe(false);
    expect(sameDirector('Jennifer Yuh Nelson', 'Jennifer Yuh')).toBe(true);
  });

  it('remet l’article en tête et sépare les deux titres', () => {
    expect(titleKeys('Truman show (Le)')).toEqual(expect.arrayContaining(['le truman show']));
    expect(titleKeys("Ocean's 13 - Ocean's Thirteen")).toEqual(expect.arrayContaining(['oceans thirteen', 'oceans 13']));
  });

  it('cherche le titre original, le titre, puis chacun sans son sous-titre', () => {
    expect(queriesFor({
      title: "Donjons & Dragons : L'Honneur des voleurs",
      original_title: 'Dungeons & Dragons: Honor Among Thieves',
    })).toEqual([
      'Dungeons & Dragons: Honor Among Thieves', "Donjons & Dragons : L'Honneur des voleurs",
      'Dungeons & Dragons', 'Donjons & Dragons',
    ]);
  });
});

describe('findMatch', () => {
  const page = (rows: Array<[number, string, string, string]>) =>
    `<table>${rows.map(([id, fr, orig, dir]) => `<tr class="item">
      <td class="field title_french"><a href="films/detail/items/${id}.html">${fr}</a></td>
      <td class="field title_original">${orig}</td>
      <td class="field director">${dir}</td></tr>`).join('')}</table>`;
  const detail = (year: number, legal: string, suggested: string) => `
    <div class="field age_legal"><div class="label">Âge légal</div><div class="value">${legal}</div></div>
    <div class="field age_suggested"><div class="label">Âge suggéré</div><div class="value">${suggested}</div></div>
    <div class="field year"><div class="label">Année</div><div class="value">${year}</div></div>`;

  const serve = (pages: Record<string, string>) =>
    jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      const key = Object.keys(pages).find(k => url.includes(k));
      return { data: key ? pages[key] : '<table></table>' } as any;
    });

  it('prend le film du même réalisateur au même titre, et envoie le Referer', async () => {
    const get = serve({
      'search/The%20Maze%20Runner.html': page([
        [1, 'Le labyrinthe', 'The Maze Runner', 'Wes Ball'],
        [2, 'Le labyrinthe : La terre brûlée', 'Maze Runner : The Scorch Trials', 'Wes Ball'],
      ]),
      'items/1.html': detail(2014, '12 ans', '14 ans'),
    });
    const film = await filmages.findMatch({ title: 'Le Labyrinthe', original_title: 'The Maze Runner', director: 'Wes Ball', release_date: '2014-09-19' });
    expect(film).toMatchObject({ id: 1, ageLegal: 12, ageSuggested: 14 });
    expect(get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Referer: 'https://www.filmages.ch/films/recherche.html' }),
    }));
  });

  it('refuse le seul film du réalisateur quand l’année ne va pas (Alien : Covenant pour Alien)', async () => {
    serve({
      'search/Alien.html': page([[10347, 'Alien : Covenant', 'Alien : Covenant', 'Ridley Scott']]),
      'items/10347.html': detail(2017, '16 ans', '16 ans'),
    });
    expect(await filmages.findMatch({ title: 'Alien', original_title: 'Alien', director: 'Ridley Scott', release_date: '1979-05-25' })).toBeNull();
  });

  it('passe par le réalisateur quand le titre est traduit au-delà du reconnaissable', async () => {
    serve({
      'search/Miyazaki.html': page([[2, 'Château dans le ciel (Le) - Laputa', 'Tenkû no shiro Rapyuta', 'Hayao Miyazaki']]),
      'items/2.html': detail(1986, '7 ans', '-'),
    });
    expect(await filmages.findMatch({
      title: 'Le Château dans le ciel', original_title: '天空の城ラピュタ', director: 'Hayao Miyazaki', release_date: '1986-08-02',
    })).toMatchObject({ id: 2, ageLegal: 7, ageSuggested: null });
  });

  it('reconnaît une suite numérotée autrement, à la même année', async () => {
    serve({
      'search/Gunn.html': page([
        [3, 'Les gardiens de la Galaxie', 'Guardians of the Galaxy', 'James Gunn'],
        [4, 'Les gardiens de la galaxie 3', 'Guardians of the Galaxy 3', 'James Gunn'],
      ]),
      'items/4.html': detail(2023, '12 ans', '12 ans'),
      'items/3.html': detail(2014, '12 ans', '12 ans'),
    });
    expect(await filmages.findMatch({
      title: 'Guardians of the Galaxy Vol. 3', original_title: 'Guardians of the Galaxy Vol. 3', director: 'James Gunn', release_date: '2023-05-03',
    })).toMatchObject({ id: 4 });
  });

  it('prend le seul film du réalisateur sorti la même année, faute de titre commun', async () => {
    serve({
      'search/Miyazaki.html': page([
        [5, 'Voyage de Chihiro (Le)', 'Sen to Chihiro no kamikakushi', 'Hayao Miyazaki'],
        [6, 'Château ambulant (Le)', 'Hauru no ugoku shiro', 'Hayao Miyazaki'],
      ]),
      'items/5.html': detail(2001, '7 ans', '10 ans'),
      'items/6.html': detail(2004, '10 ans', '12 ans'),
    });
    expect(await filmages.findMatch({
      title: 'Spirited Away', original_title: '千と千尋の神隠し', director: 'Hayao Miyazaki', release_date: '2001-07-20',
    })).toMatchObject({ id: 5 });
  });

  it('ne cherche rien sans réalisateur', async () => {
    const get = serve({});
    expect(await filmages.findMatch({ title: 'X', director: null })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
