import { describe, expect, it } from 'vitest';
import { canonicalQuery, findKey, parseToken } from '../query';
import { moviesSchema } from './movies';
import { wishlistSchema } from './wishlist';

const { keys } = moviesSchema;

/** The keys backend/src/models/movieSearch.ts reads (MOVIE_SEARCH_KEYS). */
const BACKEND_KEYS = [
  'actor', 'director', 'title', 'genre', 'format', 'original_language', 'media_type', 'collection', 'box_set',
  'year', 'imdb_rating', 'tmdb_rating', 'rotten_tomato_rating', 'recommended_age', 'price', 'watched',
  'has_comments', 'spiders', 'snakes', 'last_watched',
];

describe('FilmDex’s search keys', () => {
  it('are the keys the backend reads, each once', () => {
    expect(keys.map(k => k.key).sort()).toEqual([...BACKEND_KEYS].sort());
    const names = keys.flatMap(k => [k.key, ...(k.aliases || [])]);
    expect(new Set(names).size).toBe(names.length);
    expect(findKey('lang', keys)?.key).toBe('original_language');
  });

  it('each says what it finds, in a sentence, under a group kept together', () => {
    for (const k of keys) expect(k.desc, k.key).toMatch(/^[A-Z]/);
    const groups = keys.map(k => k.group).filter((g, i, all) => all.indexOf(g) === i);
    expect(groups).toEqual(['People', 'Film', 'Collection', 'Ratings', 'Your watching', 'Warnings']);
    const order = keys.map(k => groups.indexOf(k.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('give examples written as they are read', () => {
    for (const k of keys.filter(k => k.example)) {
      const t = parseToken(k.example!, keys);
      expect(t.def?.key, k.key).toBe(k.key);
      expect(t.error, k.key).toBeUndefined();
    }
  });

  it('offer shortcuts each number key reads', () => {
    for (const k of keys.filter(k => k.type === 'number')) {
      for (const s of [...(k.values || []), ...(k.shortcuts || [])]) {
        expect(parseToken(`${k.key}:${s.value}`, keys).error, `${k.key}:${s.value}`).toBeUndefined();
      }
    }
  });

  it('write has_comments yes/no, the old words still read', () => {
    expect(canonicalQuery('has_comments:true -has_comments:false', keys)).toBe('has_comments:yes -has_comments:no');
    expect(canonicalQuery('!has_comments:y', keys)).toBe('-has_comments:yes');
  });

  it('take spiders and snakes as yes, no or unknown', () => {
    const spiders = findKey('spiders', keys)!;
    expect(spiders.type).toBe('enum');
    expect(spiders.values!.map(v => [v.value, v.desc])).toEqual([
      ['yes', 'Shows spiders'], ['no', 'No spiders on screen'], ['unknown', 'Spiders not reported yet'],
    ]);
    expect(canonicalQuery('spiders:no,unknown !snakes:yes', keys)).toBe('spiders:no,unknown -snakes:yes');
  });

  it('take watched as yes/no or a count', () => {
    for (const v of ['yes', 'no', '2', '>=2', '1-3']) expect(parseToken(`watched:${v}`, keys).error, v).toBeUndefined();
  });

  it('give the values of the collection to the text keys', () => {
    for (const name of ['actor', 'director', 'title', 'genre', 'collection', 'box_set', 'format', 'original_language']) {
      expect(findKey(name, keys)?.suggest, name).toBeTypeOf('function');
    }
  });
});

describe('The wish list’s search keys', () => {
  const wish = wishlistSchema.keys;

  it('are type, artist, author and the movies’ keys, each once', () => {
    expect(wish.map(k => k.key).sort()).toEqual([...BACKEND_KEYS, 'type', 'artist', 'author'].sort());
    const names = wish.flatMap(k => [k.key, ...(k.aliases || [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('put what all three have first, the movies’ own keys last', () => {
    const groups = wish.map(k => k.group).filter((g, i, all) => all.indexOf(g) === i);
    expect(groups).toEqual(['Everything', 'Albums', 'Books', 'Movies']);
    expect(wish.filter(k => k.group === 'Everything').map(k => k.key)).toEqual(['type', 'title', 'genre', 'year']);
    expect(canonicalQuery('kind:album', wish)).toBe('type:album');
  });
});
