import apiService from '../../../../services/api';
import { suggestFrom, type SearchKey, type SearchSchema } from '../schema';

/**
 * FilmDex's keys, as backend/src/models/movie.ts reads them. A first version,
 * the keys and words the field had before its pills: the words the backend
 * knows are kept as they are (has_comments:true, spiders:without) until its
 * parser learns yes/no.
 */
const fromMovies = (field: string, describe?: (row: Record<string, unknown>) => string | undefined) =>
  suggestFrom((f, typed) => apiService.getAutocompleteSuggestions(f, typed), field, { describe });

const collectionKind = (row: Record<string, unknown>) => (row.collection_type === 'box_set' ? 'Box set' : 'Collection');

const compare = (what: string): SearchKey['shortcuts'] => [
  { value: '>=', desc: `${what} or more` },
  { value: '<=', desc: `${what} or less` },
];

/** The keys of a movie, with or without their suggestions (the wish list has none). */
export const movieKeys = (withSuggestions: boolean): SearchKey[] => {
  const from = (field: string, describe?: (row: Record<string, unknown>) => string | undefined) =>
    (withSuggestions ? { suggest: fromMovies(field, describe) } : {});
  return [
    { key: 'actor', group: 'Who', type: 'text', desc: 'An actor of its cast', example: 'actor:"Tom Hanks"', ...from('actor') },
    { key: 'director', group: 'Who', type: 'text', desc: 'Its director', example: 'director:Kubrick', ...from('director') },
    { key: 'title', group: 'What', type: 'text', desc: 'Words of its title', example: 'title:alien', valuesForWords: false, ...from('title') },
    { key: 'genre', group: 'What', type: 'text', desc: 'One of its genres', example: 'genre:Drama', ...from('genre') },
    { key: 'collection', group: 'What', type: 'list', desc: 'One of your collections', example: 'collection:"Christmas"', ...from('collection', collectionKind) },
    { key: 'box_set', group: 'What', type: 'list', desc: 'The box set it came in', example: 'box_set:"Star Wars"', ...from('box_set', collectionKind) },
    { key: 'format', group: 'What', type: 'text', desc: 'Its format: DVD, Blu-ray, Blu-ray 4K', example: 'format:DVD', ...from('format') },
    { key: 'original_language', aliases: ['lang'], group: 'What', type: 'text', desc: 'Its original language', example: 'original_language:fr', ...from('original_language') },
    { key: 'media_type', group: 'What', type: 'text', desc: 'A movie or a TV show', example: 'media_type:tv', values: [{ value: 'movie', desc: 'A movie' }, { value: 'tv', desc: 'A TV show' }] },
    { key: 'spiders', group: 'Warnings', type: 'enum', desc: 'Spiders on screen', values: [
      { value: 'with', desc: 'Movies showing spiders' }, { value: 'without', desc: 'Movies without spiders' }, { value: 'unknown', desc: 'Spiders not reported yet' },
    ] },
    { key: 'snakes', group: 'Warnings', type: 'enum', desc: 'Snakes on screen', values: [
      { value: 'with', desc: 'Movies showing snakes' }, { value: 'without', desc: 'Movies without snakes' }, { value: 'unknown', desc: 'Snakes not reported yet' },
    ] },
    { key: 'recommended_age', group: 'Warnings', type: 'number', desc: 'The age it is recommended from', example: 'recommended_age:<=9', shortcuts: [
      { value: '0-3', desc: 'All ages (0-3)' }, { value: '4-9', desc: 'Children (4-9)' }, { value: '10-14', desc: 'Pre-teens (10-14)' }, { value: '>=15', desc: 'Teens and adults (15+)' },
    ] },
    { key: 'year', group: 'When', type: 'number', desc: 'Its year, exactly or compared', example: 'year:>=2000', shortcuts: compare('That year') },
    { key: 'watched', group: 'When', type: 'number', desc: 'Watched, or how many times', example: 'watched:>=2', values: [
      { value: 'true', desc: 'Movies you have watched' }, { value: 'false', desc: 'Movies you haven’t watched' },
    ], shortcuts: [{ value: '>1', desc: 'Watched more than once' }, { value: '>=2', desc: 'Watched at least twice' }] },
    { key: 'last_watched', group: 'When', type: 'date', desc: 'When you last watched it', example: 'last_watched:>2024-01-01', shortcuts: [
      { value: 'today', desc: 'Watched today' }, { value: 'yesterday', desc: 'Watched yesterday' }, { value: 'week', desc: 'Watched in the last 7 days' },
      { value: 'month', desc: 'Watched in the last 30 days' }, { value: 'year', desc: 'Watched in the last year' },
    ] },
    { key: 'imdb_rating', group: 'Ratings', type: 'number', desc: 'Its IMDb rating', example: 'imdb_rating:>=7', shortcuts: [{ value: '>=8', desc: '8 or more' }, { value: '>=7', desc: '7 or more' }] },
    { key: 'tmdb_rating', group: 'Ratings', type: 'number', desc: 'Its TMDB rating', example: 'tmdb_rating:>=7', shortcuts: [{ value: '>=8', desc: '8 or more' }, { value: '>=7', desc: '7 or more' }] },
    { key: 'rotten_tomato_rating', group: 'Ratings', type: 'number', desc: 'Its Rotten Tomatoes rating', example: 'rotten_tomato_rating:>=80', shortcuts: [{ value: '>=90', desc: '90 or more' }, { value: '>=80', desc: '80 or more' }] },
    { key: 'price', group: 'Yours', type: 'number', desc: 'What you paid for it', example: 'price:<10', shortcuts: compare('That price') },
    { key: 'has_comments', group: 'Yours', type: 'enum', desc: 'You wrote comments on it', values: [
      { value: 'true', desc: 'Movies with comments' }, { value: 'false', desc: 'Movies without comments' },
    ] },
  ];
};

export const moviesSchema: SearchSchema = {
  section: 'movies',
  keys: movieKeys(true),
  placeholder: 'Search FilmDex by title, director...',
  wordsHint: 'In titles, directors and casts',
};
