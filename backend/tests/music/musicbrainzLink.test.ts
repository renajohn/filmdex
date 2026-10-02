import request from 'supertest';
import app from '../../index';
import { getDatabase } from '../../src/database';
import Album from '../../src/models/album';
import discogsService from '../../src/services/discogsService';
import musicbrainzService from '../../src/services/musicbrainzService';
import musicbrainzLinkService from '../../src/services/musicbrainzLinkService';
import albumStoryService from '../../src/services/albumStoryService';

const NOTHING = { releaseIds: [], releaseGroupIds: [] };

const release = (title: string, releaseGroupId: string, artists: string[], barcode?: string) => ({
  id: `rel-${Math.random()}`, title, barcode, 'release-group': { id: releaseGroupId },
  'artist-credit': artists.map(name => ({ name, artist: { name } })),
});

const insertAlbum = (fields: { title: string; artist: string[]; barcode?: string; discogs?: string; releaseGroupId?: string }) =>
  new Promise<number>((resolve, reject) =>
    getDatabase().run(
      `INSERT INTO albums (title, artist, barcode, discogs_release_id, musicbrainz_release_group_id, title_status)
       VALUES (?, ?, ?, ?, ?, 'owned')`,
      [fields.title, JSON.stringify(fields.artist), fields.barcode ?? null, fields.discogs ?? `${Math.random()}`, fields.releaseGroupId ?? null],
      function (this: { lastID: number }, err: Error | null) { if (err) reject(err); else resolve(this.lastID); }
    ));

beforeEach(() => {
  jest.spyOn(musicbrainzService, 'findByDiscogsUrl').mockResolvedValue(NOTHING);
  jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([]);
  jest.spyOn(discogsService, 'isConfigured').mockReturnValue(true);
  jest.spyOn(discogsService, 'getRelease').mockResolvedValue({ master_id: undefined } as any);
  jest.spyOn(musicbrainzService, 'getFirstReleaseOfGroup').mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

describe('findReleaseGroup', () => {
  it('suit d’abord le lien de l’édition Discogs', async () => {
    jest.spyOn(musicbrainzService, 'findByDiscogsUrl').mockResolvedValue({ releaseIds: ['mb-rel'], releaseGroupIds: [] });
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: 'rg-edition' } } as any);

    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'X', artist: ['Y'], discogsReleaseId: '1' }))
      .toEqual({ releaseGroupId: 'rg-edition', method: 'discogs_release' });
  });

  it('remonte au master Discogs quand l’édition n’est pas liée', async () => {
    jest.spyOn(discogsService, 'getRelease').mockResolvedValue({ master_id: 105818 } as any);
    const lookup = jest.spyOn(musicbrainzService, 'findByDiscogsUrl').mockImplementation(async (url: string) =>
      url.endsWith('/master/105818') ? { releaseIds: [], releaseGroupIds: ['rg-telling'] } : NOTHING);

    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'Telling Stories', artist: ['Tracy Chapman'], discogsReleaseId: '38122269' }))
      .toEqual({ releaseGroupId: 'rg-telling', method: 'discogs_master' });
    expect(lookup).toHaveBeenCalledWith('https://www.discogs.com/release/38122269');
  });

  it('saute le master quand Discogs n’est pas configuré', async () => {
    jest.spyOn(discogsService, 'isConfigured').mockReturnValue(false);
    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'X', artist: ['Y'], discogsReleaseId: '1' })).toBeNull();
    expect(discogsService.getRelease).not.toHaveBeenCalled();
  });

  it('trouve par code-barres, zéros de tête compris', async () => {
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Eye in the Sky', 'rg-eye', ['The Alan Parsons Project'], '078221803328'),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'Eye In The Sky', artist: ['The Alan Parsons Project'], barcode: '78221803328' }))
      .toEqual({ releaseGroupId: 'rg-eye', method: 'barcode' });
  });

  it('trouve par titre quand le titre et deux artistes concordent', async () => {
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Madama Butterfly', 'rg-sinopoli', ['Giacomo Puccini', 'Mirella Freni', 'Giuseppe Sinopoli']),
      release('Madama Butterfly', 'rg-sinopoli', ['Giacomo Puccini', 'Mirella Freni', 'José Carreras']),
      release('Madama Butterfly', 'rg-karajan', ['Giacomo Puccini', 'Herbert von Karajan']),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({
      title: 'MADAMA BUTTERFLY', artist: ['GIACOMO PUCCINI', 'Mirella Freni', 'José Carreras', 'GIUSEPPE SINOPOLI'],
    })).toEqual({ releaseGroupId: 'rg-sinopoli', method: 'title' });
  });

  it('départage des enregistrements qui partagent le compositeur et l’orchestre', async () => {
    const album = ['Giacomo Puccini', 'Mirella Freni', 'José Carreras', 'Teresa Berganza', 'Philharmonia Orchestra', 'Giuseppe Sinopoli'];
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Madama Butterfly', 'rg-maazel', ['Giacomo Puccini', 'Renata Scotto', 'Philharmonia Orchestra', 'Lorin Maazel']),
      release('Madama Butterfly', 'rg-karajan', ['Giacomo Puccini', 'Mirella Freni', 'Herbert von Karajan']),
      release('Madama Butterfly', 'rg-sinopoli', album),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'Madama Butterfly', artist: album }))
      .toEqual({ releaseGroupId: 'rg-sinopoli', method: 'title' });
  });

  it('refuse quand le meilleur candidat ne partage pas la moitié des artistes', async () => {
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Madama Butterfly', 'rg-karajan', ['Giacomo Puccini', 'Mirella Freni', 'Herbert von Karajan']),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({
      title: 'Madama Butterfly', artist: ['Giacomo Puccini', 'Mirella Freni', 'José Carreras', 'Teresa Berganza', 'Juan Pons'],
    })).toBeNull();
  });

  it('refuse un enregistrement de la même œuvre par d’autres interprètes', async () => {
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Water Music', 'rg-other', ['Georg Friedrich Händel']),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({
      title: 'Water Music', artist: ['Musici Di San Marco', 'Luigi Varese'],
    })).toBeNull();
  });

  it('refuse quand les résultats hésitent entre plusieurs albums', async () => {
    jest.spyOn(musicbrainzService, 'searchRelease').mockResolvedValue([
      release('Greatest Hits', 'rg-1', ['Queen']),
      release('Greatest Hits', 'rg-2', ['Queen']),
    ] as any);

    expect(await musicbrainzLinkService.findReleaseGroup({ title: 'Greatest Hits', artist: ['Queen'] })).toBeNull();
  });
});

describe('linkAll et l’histoire', () => {
  it('lie les albums sans release group et laisse les autres', async () => {
    const linked = await insertAlbum({ title: `Linkable ${Math.random()}`, artist: ['A'], discogs: '777' });
    const already = await insertAlbum({ title: 'Linked', artist: ['B'], releaseGroupId: 'rg-kept' });
    jest.spyOn(musicbrainzService, 'findByDiscogsUrl').mockImplementation(async (url: string) =>
      url.endsWith('/release/777') ? { releaseIds: ['mb-777'], releaseGroupIds: [] } : NOTHING);
    jest.spyOn(musicbrainzService, 'getReleaseDetails').mockResolvedValue({ 'release-group': { id: 'rg-777' } } as any);

    const res = await request(app).post('/api/music/albums/link-musicbrainz');

    expect(res.status).toBe(200);
    expect(res.body.results).toContainEqual({ id: linked, title: expect.any(String), releaseGroupId: 'rg-777', method: 'discogs_release' });
    expect(res.body.results.map((r: { id: number }) => r.id)).not.toContain(already);
    expect((await Album.findById(linked))!.musicbrainzReleaseGroupId).toBe('rg-777');
  });

  it('relance une histoire « pas de MusicBrainz » dès que l’album est lié', async () => {
    const id = await insertAlbum({ title: `Unlinked ${Math.random()}`, artist: ['C'] });
    // beforeEach leaves every source empty: the lookup finds nothing, offline.
    expect(await albumStoryService.getStory(id)).toMatchObject({ found: false, reason: 'no_musicbrainz' });

    await Album.setReleaseGroupId(id, 'rg-later');
    jest.spyOn(musicbrainzService, 'getReleaseGroupWikiLinks').mockResolvedValue({ wikidata: null, wikipedia: [] });

    expect(await albumStoryService.getStory(id)).toMatchObject({ found: false, reason: 'no_article' });
  });
});
