import { artistLetter, artistSortKey, artistSortName } from './artistOrder';

const order = {
  1: { sortName: 'Chapman, Tracy', key: 'chapman tracy\u00011988 crossroads' },
  2: { sortName: 'M', key: 'm\u00012003 qui de nous deux' },
};

describe('the collection sorted by artist, as the shelves stand', () => {
  it('files a person under the surname the shelves give', () => {
    const tracy = { id: 1, artist: ['Tracy Chapman'], title: 'Crossroads' };
    expect(artistSortName(tracy, order)).toBe('Chapman, Tracy');
    expect(artistLetter(tracy, order)).toBe('C');
  });

  it('files -M- under M', () => {
    expect(artistLetter({ id: 2, artist: ['‐M‐'], title: 'Qui de nous deux' }, order)).toBe('M');
    expect(artistLetter({ id: 9, artist: ['-M-'], title: 'Je dis aime' }, {})).toBe('M');
  });

  it('sorts by the shelves\' key, and without it by the artist bar the article', () => {
    const albums = [
      { id: 1, artist: ['Tracy Chapman'], title: 'Crossroads' },
      { id: 2, artist: ['‐M‐'], title: 'Qui de nous deux' },
      { id: 3, artist: ['The Beatles'], title: 'Abbey Road', releaseYear: 1969 },
    ];
    const sorted = [...albums].sort((a, b) => (artistSortKey(a, order) < artistSortKey(b, order) ? -1 : 1));
    expect(sorted.map(album => album.id)).toEqual([3, 1, 2]);
  });
});
