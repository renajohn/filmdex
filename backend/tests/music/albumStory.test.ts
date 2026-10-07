import axios from 'axios';
import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import albumStoryService from '../../src/services/albumStoryService';
import musicbrainzService from '../../src/services/musicbrainzService';
import musicbrainzLinkService from '../../src/services/musicbrainzLinkService';

const insertAlbum = (releaseId: string | null, releaseGroupId: string | null) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, musicbrainz_release_id, musicbrainz_release_group_id, title_status)
       VALUES (?, '["Test"]', ?, ?, 'owned')`,
      [`Story album ${Math.random()}`, releaseId, releaseGroupId],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

const EXTRACT = [
  'Invisible Touch is the thirteenth studio album by Genesis.',
  '',
  '',
  '== Background ==',
  'In February 1984, the band completed their tour.',
  '',
  '== Writing and recording ==',
  '=== Songs ===',
  'The songs came from jams.',
  '',
  '== Track listing ==',
  '1. Invisible Touch',
  '=== Side two ===',
  '5. Domino',
  '== Personnel ==',
  '=== Genesis ===',
  'Phil Collins – drums',
  '== Reception ==',
  'It reached No. 1.',
  '== References ==',
  '',
].join('\n');

/**
 * Answers Wikidata and Wikipedia as they answered for Invisible Touch. Each
 * language tells the same extract unless a test gives it its own.
 */
const mockWikis = (
  sitelinks: Record<string, { title: string }>,
  extract: string | null = EXTRACT,
  extracts: Record<string, string> = {},
) =>
  jest.spyOn(axios, 'get').mockImplementation(async (url: string) => {
    if (url.includes('wikidata.org')) return { data: { entities: { Q1141350: { sitelinks } } } };
    if (url.includes('wikipedia.org')) {
      const text = extracts[url.match(/\/\/([a-z-]+)\./)![1]] ?? extract;
      const page = text === null ? { title: 'Invisible Touch', missing: '' } : { title: 'Invisible Touch', extract: text };
      return { data: { query: { pages: { 1: page } } } };
    }
    throw new Error(`unexpected request ${url}`);
  });

beforeEach(() => {
  // No works unless a test says otherwise: the fallback must not reach MusicBrainz.
  jest.spyOn(musicbrainzService, 'getFirstReleaseOfGroup').mockResolvedValue(null);
  jest.spyOn(musicbrainzService, 'getReleaseTrackWorks').mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe('parseExtract', () => {
  it('garde l’intro et les sections narratives, sans les listes', () => {
    const { intro, sections } = albumStoryService.parseExtract(EXTRACT);
    expect(intro).toBe('Invisible Touch is the thirteenth studio album by Genesis.');
    expect(sections).toEqual([
      { heading: 'Background', level: 2, text: 'In February 1984, the band completed their tour.' },
      { heading: 'Writing and recording', level: 2, text: '' },
      { heading: 'Songs', level: 3, text: 'The songs came from jams.' },
      { heading: 'Reception', level: 2, text: 'It reached No. 1.' },
    ]);
  });

  it('écarte aussi les sections françaises de références', () => {
    const { sections } = albumStoryService.parseExtract(
      'Intro.\n== Genèse ==\nPuccini assiste.\n== Liste des titres ==\n1. Un\n== Notes et références ==\n'
    );
    expect(sections.map(s => s.heading)).toEqual(['Genèse']);
  });

  it('lit la langue et le titre d’un lien Wikipedia', () => {
    expect(albumStoryService.parseArticleUrl('https://en.wikipedia.org/wiki/Mezzanine_(album)'))
      .toEqual({ lang: 'en', title: 'Mezzanine (album)' });
    expect(albumStoryService.parseArticleUrl('https://www.discogs.com/master/1')).toBeNull();
  });
});

describe('getStory', () => {
  it('suit MusicBrainz, Wikidata puis Wikipedia, raconte l’article le plus complet et lie les deux', async () => {
    const id = await insertAlbum('rel-1', 'rg-1');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ frwiki: { title: 'Invisible Touch' }, enwiki: { title: 'Invisible Touch' } }, EXTRACT, {
      fr: 'Invisible Touch est un album de Genesis.\n== Liste des titres ==\n1. Invisible Touch, un long titre qui ne compte pas',
    });

    const story = await albumStoryService.getStory(id);

    expect(story).toMatchObject({
      found: true, lang: 'en', title: 'Invisible Touch', url: 'https://en.wikipedia.org/wiki/Invisible_Touch',
    });
    expect(story.sections.map(s => s.heading)).toContain('Background');
    expect(story.links).toEqual([
      { lang: 'fr', title: 'Invisible Touch', url: 'https://fr.wikipedia.org/wiki/Invisible_Touch' },
      { lang: 'en', title: 'Invisible Touch', url: 'https://en.wikipedia.org/wiki/Invisible_Touch' },
    ]);
  });

  it('raconte le français quand il en dit plus, et à égalité', async () => {
    const id = await insertAlbum('rel-1b', 'rg-1b');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ frwiki: { title: 'Invisible Touch' }, enwiki: { title: 'Invisible Touch' } }, EXTRACT, {
      fr: `${EXTRACT}\n== Genèse ==\nLe groupe enregistre aux Fisher Lane Farm Studios pendant tout l’hiver.`,
    });
    expect(await albumStoryService.getStory(id)).toMatchObject({ found: true, lang: 'fr' });

    const tie = await insertAlbum('rel-1c', 'rg-1c');
    mockWikis({ frwiki: { title: 'Invisible Touch' }, enwiki: { title: 'Invisible Touch' } });
    expect(await albumStoryService.getStory(tie)).toMatchObject({ found: true, lang: 'fr' });
  });

  it('se contente d’une seule langue', async () => {
    const id = await insertAlbum('rel-2', 'rg-2');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ enwiki: { title: 'Invisible Touch' } });

    const story = await albumStoryService.getStory(id);
    expect(story).toMatchObject({ found: true, lang: 'en' });
    expect(story.links.map(link => link.lang)).toEqual(['en']);
  });

  it('relit une histoire gardée avant que les deux langues soient lues', async () => {
    const id = await insertAlbum('rel-old', 'rg-old');
    await new Promise<void>((resolve, reject) => getDatabase().run(
      `INSERT INTO album_stories (album_id, found, lang, title, url, intro, sections, works, links, fetched_at)
       VALUES (?, 1, 'en', 'Invisible Touch', 'https://en.wikipedia.org/wiki/Invisible_Touch', 'Old.', '[]', '[]', NULL, ?)`,
      [id, new Date().toISOString()],
      (err: Error | null) => (err ? reject(err) : resolve())
    ));
    const links = jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ frwiki: { title: 'Invisible Touch' }, enwiki: { title: 'Invisible Touch' } });

    const story = await albumStoryService.getStory(id);
    expect(links).toHaveBeenCalledTimes(1);
    expect(story.links).toHaveLength(2);
  });

  it('retrouve et garde le release group d’un album qui n’a que sa release', async () => {
    const id = await insertAlbum('rel-3', null);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: 'rg-3' } } as any);
    const links = jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: null, wikipedia: [] });

    expect(await albumStoryService.getStory(id)).toMatchObject({ found: false, reason: 'no_article' });
    expect(links).toHaveBeenCalledWith('rg-3');
    expect((await Album.findById(id))!.musicbrainzReleaseGroupId).toBe('rg-3');
  });

  it('dit quand l’album n’est pas lié à MusicBrainz et que le rattrapage échoue', async () => {
    const id = await insertAlbum(null, null);
    const link = jest.spyOn(musicbrainzLinkService, 'linkAlbum').mockResolvedValue(null);
    expect(await albumStoryService.getStory(id)).toMatchObject({ found: false, reason: 'no_musicbrainz' });
    expect(link).toHaveBeenCalledWith(id);
  });

  it('répond depuis le cache, et ne relance qu’au rafraîchissement', async () => {
    const id = await insertAlbum('rel-4', 'rg-4');
    const links = jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ enwiki: { title: 'Invisible Touch' } });

    await albumStoryService.getStory(id);
    await albumStoryService.getStory(id);
    expect(links).toHaveBeenCalledTimes(1);

    await albumStoryService.getStory(id, { refresh: true });
    expect(links).toHaveBeenCalledTimes(2);
  });

  it('garde l’histoire connue quand un service ne répond pas', async () => {
    const id = await insertAlbum('rel-5', 'rg-5');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ enwiki: { title: 'Invisible Touch' } });
    await albumStoryService.getStory(id);

    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockRejectedValue(new Error('busy'));
    await expect(albumStoryService.getStory(id, { refresh: true })).rejects.toThrow('busy');
    expect(await albumStoryService.getStory(id)).toMatchObject({ found: true, lang: 'en' });
  });
});

describe('routes de l’histoire d’un album', () => {
  it('répond 404 pour un album inconnu', async () => {
    expect((await request(app).get('/api/music/albums/99999999/story')).status).toBe(404);
  });

  it('répond 502 quand MusicBrainz ne répond pas', async () => {
    const id = await insertAlbum('rel-6', 'rg-6');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockRejectedValue(new Error('busy'));
    expect((await request(app).get(`/api/music/albums/${id}/story`)).status).toBe(502);
  });

  it('renvoie l’histoire, puis la rafraîchit', async () => {
    const id = await insertAlbum('rel-7', 'rg-7');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: 'Q1141350', wikipedia: [] });
    mockWikis({ enwiki: { title: 'Invisible Touch' } });

    const res = await request(app).get(`/api/music/albums/${id}/story`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ albumId: id, found: true, intro: expect.stringContaining('Genesis') });
    expect((await request(app).post(`/api/music/albums/${id}/story/refresh`)).status).toBe(200);
  });
});

describe('repli sur les œuvres', () => {
  const work = (id: string, title: string, parentIds: string[] = [], wikidata: string | null = null) => ({ id, title, parentIds, wikidata });

  /** Wikidata answers for every id it is asked, Wikipedia with an article named after it. */
  const mockWorkWikis = (articles: Record<string, string>) =>
    jest.spyOn(axios, 'get').mockImplementation(async (url: string, config?: any) => {
      if (url.includes('wikidata.org')) {
        const id = config.params.ids;
        return { data: { entities: { [id]: { sitelinks: articles[id] ? { enwiki: { title: articles[id] } } : {} } } } };
      }
      if (url.includes('wikipedia.org')) {
        const title = config.params.titles;
        return { data: { query: { pages: { 1: { title, extract: `${title} was composed in 1904.\n== Roles ==\nCio-Cio-San\n== History ==\nIt failed.` } } } } };
      }
      throw new Error(`unexpected request ${url}`);
    });

  beforeEach(() => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: null, wikipedia: [] });
  });

  it('remonte des airs à l’opéra, une seule fois par œuvre', async () => {
    const id = await insertAlbum(null, 'rg-butterfly');
    jest.spyOn(musicbrainzService, 'getFirstReleaseOfGroup').mockResolvedValue('rel-butterfly');
    jest.spyOn(musicbrainzService, 'getReleaseTrackWorks').mockResolvedValue([
      [work('aria-1', 'Atto I. Dovunque', ['act-1'])],
      [work('aria-2', 'Atto I. Viene la sera', ['act-1'])],
      [work('aria-3', 'Atto II. Un bel dì', ['act-2'])],
    ]);
    const getWork = jest.spyOn(musicbrainzService, 'getWork').mockImplementation(async (workId: string) => ({
      'act-1': work('act-1', 'Atto I', ['opera']),
      'act-2': work('act-2', 'Atto II', ['opera']),
      'opera': work('opera', 'Madama Butterfly', [], 'Q201480'),
    } as Record<string, ReturnType<typeof work>>)[workId]);
    mockWorkWikis({ Q201480: 'Madama Butterfly' });

    const story = await albumStoryService.getStory(id);

    expect(story).toMatchObject({ found: true, url: null });
    expect(story.works).toEqual([{
      workTitle: 'Madama Butterfly', tracks: 3, lang: 'en', title: 'Madama Butterfly',
      url: 'https://en.wikipedia.org/wiki/Madama_Butterfly', intro: 'Madama Butterfly was composed in 1904.',
      sections: [{ heading: 'History', level: 2, text: 'It failed.' }],
      links: [{ lang: 'en', title: 'Madama Butterfly', url: 'https://en.wikipedia.org/wiki/Madama_Butterfly' }],
    }]);
    expect(getWork.mock.calls.map(call => call[0]).sort()).toEqual(['act-1', 'act-2', 'opera']);
  });

  it('garde plusieurs œuvres, les plus jouées d’abord, sans celles qui n’ont pas d’article', async () => {
    const id = await insertAlbum('rel-chopin', 'rg-chopin');
    jest.spyOn(musicbrainzService, 'getReleaseTrackWorks').mockResolvedValue([
      [work('sonata-1', 'Sonata: I', ['sonata'])],
      [work('prelude-1', 'Prelude 1', ['preludes'])],
      [work('prelude-2', 'Prelude 2', ['preludes'])],
      [work('song', 'A song')],
    ]);
    jest.spyOn(musicbrainzService, 'getWork').mockImplementation(async (workId: string) => ({
      sonata: work('sonata', 'Sonata no. 2', [], 'Q2'),
      preludes: work('preludes', '24 Préludes', [], 'Q1'),
      song: work('song', 'A song', [], 'Q3'),
    } as Record<string, ReturnType<typeof work>>)[workId]);
    mockWorkWikis({ Q1: 'Preludes (Chopin)', Q2: 'Piano Sonata No. 2 (Chopin)' });

    const story = await albumStoryService.getStory(id);

    expect(story.works.map(w => [w.title, w.tracks])).toEqual([['Preludes (Chopin)', 2], ['Piano Sonata No. 2 (Chopin)', 1]]);
  });

  it('ne cherche pas les œuvres d’un recueil de chansons', async () => {
    const id = await insertAlbum('rel-songs', 'rg-songs');
    jest.spyOn(musicbrainzService, 'getReleaseTrackWorks').mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => [work(`song-${i}`, `Song ${i}`)])
    );
    const getWork = jest.spyOn(musicbrainzService, 'getWork');

    expect(await albumStoryService.getStory(id)).toMatchObject({ found: false, reason: 'no_article', works: [] });
    expect(getWork).not.toHaveBeenCalled();
  });

  it('écarte la distribution et les numéros d’un opéra', () => {
    const { sections } = albumStoryService.parseExtract(
      'Intro.\n== Roles ==\nCio-Cio-San\n== Musical numbers ==\n=== Act 1 ===\nDovunque\n== Synopsis ==\nNagasaki, 1904.\n'
    );
    expect(sections.map(s => s.heading)).toEqual(['Synopsis']);
  });
});
