import { describe, expect, it } from 'vitest';
import { parseWishlistSearch } from './wishlistSearch';

const blue = { title: 'Blue', artist: ['Joni Mitchell'], genres: ['Folk'], releaseYear: 1971, titleStatus: 'wish' };
const kind = { title: 'Kind of Blue', artist: ['Miles Davis'], genres: ['Jazz'], releaseYear: 1959, titleStatus: 'wish' };
const hobbit = { title: 'The Hobbit', authors: ['J.R.R. Tolkien'], genres: ['Fantasy'], publishedYear: 1937, series: 'Middle-earth', titleStatus: 'wish' };
const dune = { title: 'Dune', authors: ['Frank Herbert'], genres: ['Science Fiction'], publishedYear: 1965, titleStatus: 'wish' };

const albums = (q: string) => [blue, kind].filter(parseWishlistSearch(q).matchAlbum).map(a => a.title);
const books = (q: string) => [hobbit, dune].filter(parseWishlistSearch(q).matchBook).map(b => b.title);
const movies = (q: string) => parseWishlistSearch(q).movieQuery;

describe('parseWishlistSearch', () => {
  it('finds each plain word in the albums and books, and sends it for the movies', () => {
    expect(albums('blue')).toEqual(['Blue', 'Kind of Blue']);
    expect(albums('blue miles')).toEqual(['Kind of Blue']);
    expect(books('tolkien')).toEqual(['The Hobbit']);
    expect(books('middle-earth')).toEqual(['The Hobbit']);
    expect(movies('blue miles')).toBe('blue miles');
  });

  it('reads title, genre and year for all three, - and ! excluding', () => {
    expect(albums('genre:jazz,folk')).toEqual(['Blue', 'Kind of Blue']);
    expect(albums('-genre:jazz')).toEqual(['Blue']);
    expect(albums('!genre:jazz')).toEqual(['Blue']);
    expect(books('year:1960-1969')).toEqual(['Dune']);
    expect(albums('year:<1960')).toEqual(['Kind of Blue']);
    expect(books('title:"the hobbit"')).toEqual(['The Hobbit']);
    expect(movies('!genre:Drama year:>=2000')).toBe('-genre:Drama year:>=2000');
  });

  it('keeps one kind with type, or leaves one out', () => {
    expect(movies('type:album')).toBeNull();
    expect(albums('type:album')).toEqual(['Blue', 'Kind of Blue']);
    expect(books('type:album')).toEqual([]);
    expect(movies('-type:album')).toBe('');
    expect(albums('-type:album')).toEqual([]);
    expect(books('kind:book,album')).toEqual(['The Hobbit', 'Dune']);
  });

  it('finds albums by artist and books by author, and nothing else', () => {
    expect(albums('artist:joni')).toEqual(['Blue']);
    expect(books('artist:joni')).toEqual([]);
    expect(movies('artist:joni')).toBeNull();
    expect(books('author:herbert')).toEqual(['Dune']);
    expect(albums('author:herbert')).toEqual([]);
    expect(albums('-artist:joni')).toEqual(['Kind of Blue']);
    expect(movies('-artist:joni')).toBe('');
  });

  it('sends a movie’s key to the backend, written yes/no, and leaves the albums and books out unless it excludes', () => {
    expect(movies('has_comments:true !spiders:yes')).toBe('has_comments:yes -spiders:yes');
    expect(albums('director:Kubrick')).toEqual([]);
    expect(books('director:Kubrick')).toEqual([]);
    expect(albums('-director:Kubrick')).toEqual(['Blue', 'Kind of Blue']);
  });

  it('reads an old word as the yes/no it stands for, and sends that', () => {
    expect(movies('spiders:without')).toBe('spiders:no');
    expect(albums('spiders:without')).toEqual([]);
  });

  it('leaves a key without a value out', () => {
    expect(albums('genre:')).toEqual(['Blue', 'Kind of Blue']);
    expect(movies('genre:')).toBe('');
  });
});
