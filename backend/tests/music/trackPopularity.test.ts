import { isCompilation, popularTracks } from '../../src/services/trackPopularityService';

const byRank = (ranks: number[]) => ranks.map((rank, i) => ({ discNumber: 1, trackNumber: i + 1, rank, listens: null }));
const byListens = (listens: number[], rank = 600000) => listens.map((count, i) => ({ discNumber: 1, trackNumber: i + 1, rank, listens: count }));
const marked = (set: Set<string>) => [...set].sort();

describe('popularTracks', () => {
  it('marks the tracks above the deepest clean break among the first four', () => {
    // Eagles, Hotel California: the hit far ahead, then two more before Wasted Time.
    const ranks = byListens([1507705, 233337, 133831, 116057, 105561, 262732, 76364, 55786, 90000]);
    expect(marked(popularTracks(ranks, 9))).toEqual(['1-1', '1-2', '1-6']);
  });

  it('marks pieces that hold together, not only the first', () => {
    // Pink Floyd, Animals: three long pieces, two short ones.
    expect(marked(popularTracks(byListens([33153, 716412, 594928, 728800, 27079]), 5))).toEqual(['1-2', '1-3', '1-4']);
  });

  it('takes ListenBrainz when enough listen there', () => {
    // Dire Straits, Brothers in Arms: Deezer squeezes every track around 600 000.
    const ranks = byListens([523540, 1118843, 962748, 263452, 201835, 171869, 179141, 162129, 920988]);
    expect(marked(popularTracks(ranks, 9))).toEqual(['1-1', '1-2', '1-3', '1-9']);
  });

  it('takes Deezer, with a finer break, when too few listen on ListenBrainz', () => {
    // The Killers, Hot Fuss.
    const ranks = byRank([467056, 404913, 353887, 314661, 300985, 297708, 280000, 270000, 260000, 250000, 240000]);
    expect(marked(popularTracks(ranks, 11))).toEqual(['1-1', '1-2', '1-3']);
  });

  it('marks none when nothing stands out', () => {
    expect(popularTracks(byListens([157618, 150000, 148000, 152000, 149000, 151000]), 6).size).toBe(0);
  });

  it('marks none when too few of the tracks are known', () => {
    expect(popularTracks(byRank([900000, 1000, 1000, 1000]), 10).size).toBe(0);
  });
});

describe('isCompilation', () => {
  it('knows a best-of by MusicBrainz or by its title, not an album with a word alike', () => {
    expect(isCompilation({ title: 'Anthology 1', releaseGroupSecondaryTypes: ['Compilation'] })).toBe(true);
    expect(isCompilation({ title: 'The Greatest Hits' })).toBe(true);
    expect(isCompilation({ title: 'Love Over Gold', releaseGroupSecondaryTypes: [] })).toBe(false);
  });
});
