import axios from 'axios';
import musicbrainzService from '../../src/services/musicbrainzService';
import searchCoverService from '../../src/services/searchCoverService';

const tag = () => Math.random().toString(36).slice(2, 8);

const deezer = (albums: Array<{ title: string; cover_big?: string }>) =>
  jest.spyOn(axios, 'get').mockResolvedValue({ data: { data: albums } });

afterEach(() => jest.restoreAllMocks());

describe('pochettes des résultats de recherche', () => {
  it('donne celle de Cover Art Archive pour le groupe, puis celle de Deezer, en https', async () => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt').mockResolvedValue({
      front: { url: 'http://coverartarchive.org/rg-1200.jpg', thumbnails: { '500': 'http://coverartarchive.org/rg-500.jpg' } },
    });
    deezer([{ title: 'Other album', cover_big: 'https://deezer.test/other.jpg' }, { title: '21 (Deluxe)', cover_big: 'https://deezer.test/21.jpg' }]);

    expect(await searchCoverService.coversOf(`rg-${tag()}`, 'Adele', '21'))
      .toEqual(['https://coverartarchive.org/rg-500.jpg', 'https://deezer.test/21.jpg']);
  });

  it('se contente de Deezer quand archive.org ne répond pas, et sans groupe', async () => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt').mockResolvedValue(null);
    deezer([{ title: 'Brothers in Arms', cover_big: 'https://deezer.test/bia.jpg' }]);

    expect(await searchCoverService.coversOf(`rg-${tag()}`, 'Dire Straits', 'Brothers in Arms')).toEqual(['https://deezer.test/bia.jpg']);
    expect(await searchCoverService.coversOf(null, 'Dire Straits', `Brothers in Arms`)).toEqual(['https://deezer.test/bia.jpg']);
  });

  it('ne prend pas la pochette d’un autre album de Deezer', async () => {
    jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt').mockResolvedValue(null);
    deezer([{ title: 'Greatest Hits', cover_big: 'https://deezer.test/gh.jpg' }]);

    expect(await searchCoverService.coversOf(`rg-${tag()}`, 'Queen', 'A Night at the Opera')).toEqual([]);
  });

  it('garde ce qu’il a trouvé, et cherche de nouveau ce qu’il n’a pas trouvé', async () => {
    const caa = jest.spyOn(musicbrainzService, 'getReleaseGroupCoverArt').mockResolvedValue(null);
    const get = deezer([]);
    const group = `rg-${tag()}`;
    await searchCoverService.coversOf(group, 'Moby', 'Play');
    await searchCoverService.coversOf(group, 'Moby', 'Play');
    expect(caa).toHaveBeenCalledTimes(2);

    get.mockResolvedValue({ data: { data: [{ title: 'Play', cover_big: 'https://deezer.test/play.jpg' }] } });
    expect(await searchCoverService.coversOf(group, 'Moby', 'Play')).toEqual(['https://deezer.test/play.jpg']);
    await searchCoverService.coversOf(group, 'Moby', 'Play');
    expect(caa).toHaveBeenCalledTimes(3);
  });
});
