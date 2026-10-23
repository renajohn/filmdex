import type { SearchSchema } from '../schema';
import { movieKeys } from './movies';

/**
 * The wish list's keys: its movies are searched as FilmDex's (backend), its
 * albums and books by plain words. A first version: FilmDex's keys, without
 * their suggestions, which the field never offered here.
 */
export const wishlistSchema: SearchSchema = {
  section: 'wishlist',
  keys: movieKeys(false),
  placeholder: 'Search wish list by title, director...',
  wordsHint: 'In titles, directors, artists and authors',
};
