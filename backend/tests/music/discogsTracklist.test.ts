import discogsService from '../../src/services/discogsService';

const releaseWith = (tracklist: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => ({
  id: 42,
  title: 'Test',
  artists: [{ name: 'Test Artist', id: 1 }],
  formats: [{ name: 'Vinyl' }],
  tracklist,
  ...over
});

describe('discogsService.formatRelease — track positions', () => {
  it('splits a 2xLP across two discs instead of stacking four "track 1"', () => {
    const formatted = discogsService.formatRelease(releaseWith([
      { position: 'A1', title: 'One', type_: 'track' },
      { position: 'A2', title: 'Two', type_: 'track' },
      { position: 'B1', title: 'Three', type_: 'track' },
      { position: 'C1', title: 'Four', type_: 'track' },
      { position: 'D1', title: 'Five', type_: 'track' }
    ]) as never);

    expect(formatted.discCount).toBe(2);

    // Sides A and B are the first record, C and D the second.
    const [first, second] = formatted.discs;
    expect(first.tracks.map(t => t.title)).toEqual(['One', 'Two', 'Three']);
    expect(second.tracks.map(t => t.title)).toEqual(['Four', 'Five']);

    // Numbering restarts on every side, so the disc is renumbered in sleeve order.
    expect(first.tracks.map(t => t.trackNumber)).toEqual([1, 2, 3]);
    expect(second.tracks.map(t => t.trackNumber)).toEqual([1, 2]);
  });

  it('reads a medium-prefixed position such as "CD2-3"', () => {
    const formatted = discogsService.formatRelease(releaseWith([
      { position: 'CD1-1', title: 'One', type_: 'track' },
      { position: 'CD1-2', title: 'Two', type_: 'track' },
      { position: 'CD2-1', title: 'Three', type_: 'track' }
    ]) as never);

    expect(formatted.discCount).toBe(2);
    expect(formatted.discs[0].tracks.map(t => t.trackNumber)).toEqual([1, 2]);
    expect(formatted.discs[1].tracks.map(t => t.trackNumber)).toEqual([1]);
  });

  it('still reads a plain numeric multi-disc position', () => {
    const formatted = discogsService.formatRelease(releaseWith([
      { position: '1-1', title: 'One', type_: 'track' },
      { position: '2-5', title: 'Two', type_: 'track' }
    ]) as never);

    expect(formatted.discs[0].number).toBe(1);
    expect(formatted.discs[1].tracks[0].trackNumber).toBe(5);
  });

  it('leaves a single-disc CD numbered as printed', () => {
    const formatted = discogsService.formatRelease(releaseWith([
      { position: '1', title: 'One', type_: 'track' },
      { position: '2', title: 'Two', type_: 'track' },
      { position: '3', title: 'Three', type_: 'track' }
    ]) as never);

    expect(formatted.discCount).toBe(1);
    expect(formatted.discs[0].tracks.map(t => t.trackNumber)).toEqual([1, 2, 3]);
  });
});

describe('discogsService.formatRelease — artist names', () => {
  it('drops the numeric suffix Discogs adds to disambiguate a name', () => {
    const formatted = discogsService.formatRelease(releaseWith([], {
      artists: [{ name: 'Nirvana (2)', id: 1 }, { name: 'Muse', id: 2 }]
    }) as never);

    expect(formatted.artist).toEqual(['Nirvana', 'Muse']);
  });

  it('keeps a parenthesised part that is not a disambiguation counter', () => {
    const formatted = discogsService.formatRelease(releaseWith([], {
      artists: [{ name: 'Simon & Garfunkel (Duo)', id: 1 }]
    }) as never);

    expect(formatted.artist).toEqual(['Simon & Garfunkel (Duo)']);
  });
});
