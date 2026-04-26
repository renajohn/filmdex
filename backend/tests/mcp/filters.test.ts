import { normalizeMovieFilters, extractRuntimeMax } from '../../src/mcp/filters/movieFilters';
import { normalizeAlbumFilters, extractAlbumFormat } from '../../src/mcp/filters/albumFilters';
import { normalizeBookFilters, extractReadFilter } from '../../src/mcp/filters/bookFilters';

describe('movie filter normalizer', () => {
  it('returns empty searchText for empty input', () => {
    expect(normalizeMovieFilters(undefined).searchText).toBe('');
    expect(normalizeMovieFilters({}).searchText).toBe('');
  });

  it('preserves the free-text query alongside typed filters', () => {
    const c = normalizeMovieFilters({ query: 'inception', genre: 'Sci-Fi' });
    expect(c.searchText).toContain('inception');
    expect(c.searchText).toContain('genre:Sci-Fi');
  });

  it('quotes filter values with spaces', () => {
    const c = normalizeMovieFilters({ director: 'Christopher Nolan' });
    expect(c.searchText).toContain('director:"Christopher Nolan"');
  });

  it('encodes year_min/year_max as a year range', () => {
    expect(normalizeMovieFilters({ year_min: 2010, year_max: 2020 }).searchText).toContain('year:2010-2020');
    expect(normalizeMovieFilters({ year_min: 2010 }).searchText).toContain('year:>=2010');
    expect(normalizeMovieFilters({ year_max: 2020 }).searchText).toContain('year:<=2020');
  });

  it('encodes max_age as recommended_age:<=N', () => {
    expect(normalizeMovieFilters({ max_age: 12 }).searchText).toContain('recommended_age:<=12');
  });

  it('encodes min_imdb as imdb_rating:>=X', () => {
    expect(normalizeMovieFilters({ min_imdb: 7.5 }).searchText).toContain('imdb_rating:>=7.5');
  });

  it('encodes watched boolean correctly', () => {
    expect(normalizeMovieFilters({ watched: true }).searchText).toContain('watched:true');
    expect(normalizeMovieFilters({ watched: false }).searchText).toContain('watched:false');
  });

  it('combines multiple filters into a single searchText', () => {
    const c = normalizeMovieFilters({
      query: 'star',
      genre: 'Action',
      director: 'Nolan',
      year_min: 2000,
      year_max: 2010,
      max_age: 13,
      min_imdb: 7,
      watched: false,
    });
    const t = c.searchText!;
    expect(t).toContain('star');
    expect(t).toContain('genre:Action');
    expect(t).toContain('director:Nolan');
    expect(t).toContain('year:2000-2010');
    expect(t).toContain('recommended_age:<=13');
    expect(t).toContain('imdb_rating:>=7');
    expect(t).toContain('watched:false');
  });

  it('extractRuntimeMax returns the integer value or null', () => {
    expect(extractRuntimeMax({ runtime_max: 120 })).toBe(120);
    expect(extractRuntimeMax({ runtime_max: 90.7 })).toBe(90);
    expect(extractRuntimeMax({})).toBeNull();
    expect(extractRuntimeMax(undefined)).toBeNull();
  });
});

describe('album filter normalizer', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeAlbumFilters(undefined)).toBe('');
    expect(normalizeAlbumFilters({})).toBe('');
  });

  it('builds artist, genre, year:range from typed input', () => {
    const q = normalizeAlbumFilters({ artist: 'Pink Floyd', genre: 'Rock', year_min: 1970, year_max: 1980 });
    expect(q).toContain('artist:"Pink Floyd"');
    expect(q).toContain('genre:Rock');
    expect(q).toContain('year:1970-1980');
  });

  it('preserves free-text query', () => {
    expect(normalizeAlbumFilters({ query: 'wall' })).toContain('wall');
  });

  it('extractAlbumFormat returns the trimmed format or null', () => {
    expect(extractAlbumFormat({ format: 'Vinyl' })).toBe('Vinyl');
    expect(extractAlbumFormat({ format: '  ' })).toBeNull();
    expect(extractAlbumFormat({})).toBeNull();
  });
});

describe('book filter normalizer', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeBookFilters(undefined)).toBe('');
  });

  it('emits author: and genre: with quoting', () => {
    const q = normalizeBookFilters({ author: 'Haruki Murakami', genre: 'Fiction' });
    expect(q).toContain('author:"Haruki Murakami"');
    expect(q).toContain('genre:Fiction');
  });

  it('preserves free-text query', () => {
    expect(normalizeBookFilters({ query: 'norwegian' })).toContain('norwegian');
  });

  it('extractReadFilter returns the boolean or null', () => {
    expect(extractReadFilter({ read: true })).toBe(true);
    expect(extractReadFilter({ read: false })).toBe(false);
    expect(extractReadFilter({})).toBeNull();
  });
});
