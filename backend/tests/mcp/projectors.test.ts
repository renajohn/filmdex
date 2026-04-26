import { projectMovie } from '../../src/mcp/projections/movieProjector';
import { projectAlbum } from '../../src/mcp/projections/albumProjector';
import { projectBook } from '../../src/mcp/projections/bookProjector';

describe('movie projector', () => {
  it('selects the documented compact field set', () => {
    const result = projectMovie({
      id: 7,
      title: 'Inception',
      director: 'Christopher Nolan',
      release_date: '2010-07-16',
      genre: 'Sci-Fi',
      format: 'Blu-ray',
      runtime: 148,
      recommended_age: 13,
      imdb_rating: 8.8,
      watch_count: 2,
      last_watched: '2024-04-01',
    });
    expect(result).toEqual({
      id: 7,
      title: 'Inception',
      director: 'Christopher Nolan',
      release_year: 2010,
      genre: 'Sci-Fi',
      format: 'Blu-ray',
      runtime: 148,
      recommended_age: 13,
      imdb_rating: 8.8,
      watched: true,
      last_watched: '2024-04-01',
    });
  });

  it('derives release_year from release_date string and watched flag from watch_count', () => {
    const r = projectMovie({ id: 1, title: 't', release_date: '1999-12-31', watch_count: 0 });
    expect(r.release_year).toBe(1999);
    expect(r.watched).toBe(false);
  });

  it('handles null and missing fields without throwing', () => {
    const r = projectMovie({ id: 2, title: null, release_date: null });
    expect(r.id).toBe(2);
    expect(r.release_year).toBeNull();
    expect(r.watched).toBe(false);
    expect(r.last_watched).toBeNull();
  });

  it('handles year-only release_date numbers', () => {
    const r = projectMovie({ id: 3, title: 't', release_date: 2005 });
    expect(r.release_year).toBe(2005);
  });
});

describe('album projector', () => {
  it('joins multi-value fields into comma-separated strings', () => {
    const r = projectAlbum({
      id: 10,
      artist: ['Pink Floyd'],
      title: 'The Wall',
      releaseYear: 1979,
      genres: ['Rock', 'Progressive'],
      labels: ['Columbia'],
      format: 'CD',
      rating: 9.5,
      totalDuration: 5234,
    });
    expect(r).toEqual({
      id: 10,
      artist: 'Pink Floyd',
      title: 'The Wall',
      release_year: 1979,
      genre: 'Rock, Progressive',
      format: 'CD',
      labels: 'Columbia',
      rating: 9.5,
      total_duration: 5234,
    });
  });

  it('returns null for empty arrays and missing fields', () => {
    const r = projectAlbum({ id: 1, artist: [], title: 't', genres: [], labels: [] });
    expect(r.artist).toBeNull();
    expect(r.genre).toBeNull();
    expect(r.labels).toBeNull();
    expect(r.release_year).toBeNull();
    expect(r.rating).toBeNull();
  });
});

describe('book projector', () => {
  it('derives read flag from readDate and joins authors/genres', () => {
    const r = projectBook({
      id: 5,
      title: 'Norwegian Wood',
      authors: ['Haruki Murakami'],
      series: null,
      seriesNumber: null,
      publishedYear: 1987,
      genres: ['Fiction', 'Drama'],
      format: 'Paperback',
      readDate: '2023-06-12',
      rating: 8,
    });
    expect(r).toEqual({
      id: 5,
      title: 'Norwegian Wood',
      authors: 'Haruki Murakami',
      series: null,
      series_number: null,
      published_year: 1987,
      genre: 'Fiction, Drama',
      format: 'Paperback',
      read: true,
      rating: 8,
    });
  });

  it('marks unread when readDate is null or empty', () => {
    expect(projectBook({ id: 1, title: 't', readDate: null }).read).toBe(false);
    expect(projectBook({ id: 2, title: 't', readDate: '' }).read).toBe(false);
  });
});
