import type { SearchSchema } from '../schema';
import { booksSchema } from './books';
import { moviesSchema } from './movies';
import { musicSchema } from './music';
import { scoresSchema } from './scores';
import { wishlistSchema } from './wishlist';

/** The search keys of the section a path shows, or null where the header has no search. */
export const getSearchSchema = (pathname: string): SearchSchema | null => {
  switch (pathname) {
    case '/filmdex': return moviesSchema;
    case '/musicdex': return musicSchema;
    case '/bookdex': return booksSchema;
    case '/scores': return scoresSchema;
    case '/wishlist': return wishlistSchema;
    default: return null;
  }
};

export { booksSchema, moviesSchema, musicSchema, scoresSchema, wishlistSchema };
