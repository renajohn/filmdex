import { describe, it, expect } from 'vitest';
import { thumbUrl, thumbProps } from './thumb';

describe('thumb', () => {
  it('asks the backend for a stored image at a width', () => {
    expect(thumbUrl('/api/images/cd/a.jpg', 240)).toBe('/api/images/cd/a.jpg?w=240');
    expect(thumbUrl('/images/posters/p.jpg', 120)).toBe('/images/posters/p.jpg?w=120');
    expect(thumbUrl('/api/images/cd/a.jpg?x=1', 240)).toBe('/api/images/cd/a.jpg?x=1&w=240');
  });

  it('asks TMDB for a poster at the first of its widths as wide as asked', () => {
    expect(thumbUrl('https://image.tmdb.org/t/p/original/p.jpg', 240)).toBe('https://image.tmdb.org/t/p/w342/p.jpg');
    expect(thumbUrl('https://image.tmdb.org/t/p/w200/p.jpg', 480)).toBe('https://image.tmdb.org/t/p/w500/p.jpg');
    expect(thumbUrl('https://image.tmdb.org/t/p/w500/p.jpg', 1000)).toBe('https://image.tmdb.org/t/p/original/p.jpg');
    expect(thumbProps('https://image.tmdb.org/t/p/original/p.jpg')).toEqual({
      src: 'https://image.tmdb.org/t/p/w342/p.jpg',
      srcSet: 'https://image.tmdb.org/t/p/w342/p.jpg 1x, https://image.tmdb.org/t/p/w500/p.jpg 2x',
    });
  });

  it('leaves an image from elsewhere as it is', () => {
    expect(thumbProps('https://coverartarchive.org/x.jpg')).toEqual({ src: 'https://coverartarchive.org/x.jpg' });
  });

  it('offers twice the width to a sharp screen', () => {
    expect(thumbProps('/api/images/book/b.jpg')).toEqual({
      src: '/api/images/book/b.jpg?w=240',
      srcSet: '/api/images/book/b.jpg?w=240 1x, /api/images/book/b.jpg?w=480 2x',
    });
  });
});
