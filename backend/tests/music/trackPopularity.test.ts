import { popularTracks } from '../../src/services/trackPopularityService';

const album = (ranks: number[]) => ranks.map((rank, i) => ({ discNumber: 1, trackNumber: i + 1, rank }));

describe('popularTracks', () => {
  it('points at the few tracks well above the album, at most a quarter of it', () => {
    // Renaud, Boucan d'enfer, as Deezer counted it.
    const ranks = album([701058, 5473, 370719, 42142, 927260, 376306, 370487, 499952, 361774, 362859, 342327, 310935, 332214, 555882]);
    expect([...popularTracks(ranks, 14)].sort()).toEqual(['1-1', '1-14', '1-5', '1-8']);
  });

  it('points at none when nothing stands out', () => {
    // Steely Dan, Aja: every track a hit.
    expect(popularTracks(album([497376, 468244, 471724, 521915, 445365, 300000, 420000]), 7).size).toBe(0);
  });

  it('points at none when Deezer knows too few of the tracks', () => {
    expect(popularTracks(album([900000, 1000, 1000, 1000]), 10).size).toBe(0);
  });

  it('points at two at most on a short album', () => {
    expect(popularTracks(album([900000, 800000, 700000, 1000, 1000, 1000]), 6).size).toBe(2);
  });
});
