import { describe, it, expect } from 'vitest';
import { thumbUrl, thumbProps } from './thumb';

describe('thumb', () => {
  it('asks the backend for a stored image at a width', () => {
    expect(thumbUrl('/api/images/cd/a.jpg', 240)).toBe('/api/images/cd/a.jpg?w=240');
    expect(thumbUrl('/images/posters/p.jpg', 120)).toBe('/images/posters/p.jpg?w=120');
    expect(thumbUrl('/api/images/cd/a.jpg?x=1', 240)).toBe('/api/images/cd/a.jpg?x=1&w=240');
  });

  it('leaves an image from elsewhere as it is', () => {
    expect(thumbUrl('https://image.tmdb.org/t/p/w200/p.jpg', 240)).toBe('https://image.tmdb.org/t/p/w200/p.jpg');
    expect(thumbProps('https://coverartarchive.org/x.jpg')).toEqual({ src: 'https://coverartarchive.org/x.jpg' });
  });

  it('offers twice the width to a sharp screen', () => {
    expect(thumbProps('/api/images/book/b.jpg')).toEqual({
      src: '/api/images/book/b.jpg?w=240',
      srcSet: '/api/images/book/b.jpg?w=240 1x, /api/images/book/b.jpg?w=480 2x',
    });
  });
});
