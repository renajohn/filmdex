import musicService from '../../src/services/musicService';
import musicbrainzService from '../../src/services/musicbrainzService';
import imageService from '../../src/services/imageService';

describe('attachCoverArt — only fetches cover art from trusted hosts', () => {
  let downloadSpy: jest.SpyInstance;

  beforeEach(() => {
    downloadSpy = jest
      .spyOn(imageService, 'downloadImageFromUrl')
      .mockResolvedValue('/api/images/cd/x.jpg');
    jest.spyOn(imageService, 'resizeImage').mockResolvedValue(undefined as any);
    jest.spyOn(musicbrainzService, 'getCoverArt').mockResolvedValue(null as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const attach = (frontCoverUrl: string) =>
    musicService.attachCoverArt(1, 'mbid', { coverArtData: { frontCoverUrl } } as any);

  it('accepts a Cover Art Archive url', async () => {
    await attach('https://coverartarchive.org/release/abc/123-500.jpg');

    expect(downloadSpy).toHaveBeenCalled();
  });

  it('accepts the archive.org host Cover Art Archive redirects to', async () => {
    await attach('https://ia800407.us.archive.org/16/items/mbid-abc/mbid-abc-123.jpg');

    expect(downloadSpy).toHaveBeenCalled();
  });

  it('refuses a host on the local network', async () => {
    await attach('http://192.168.86.1/admin/status');

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('refuses the cloud metadata endpoint', async () => {
    await attach('http://169.254.169.254/latest/meta-data/');

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('refuses an arbitrary external host', async () => {
    await attach('https://evil.example.com/payload.jpg');

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('is not fooled by a lookalike domain', async () => {
    await attach('https://coverartarchive.org.evil.example.com/x.jpg');

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('refuses a non-http scheme', async () => {
    await attach('file:///etc/passwd');

    expect(downloadSpy).not.toHaveBeenCalled();
  });
});
