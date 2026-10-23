import apiService from '../../../../services/api';
import { suggestFrom, yesNo, type SearchKey, type SearchSchema, type SearchValue, type SuggestedValue } from '../schema';

/**
 * FilmDex's keys, as backend/src/models/movieSearch.ts reads them: -key: to
 * exclude, a,b for one or the other, yes/no (true/false, with/without still
 * understood), numbers exactly, compared (>=7) or in a range (1960-1969).
 * The values come from the movies' autocomplete (all the movies, the wish
 * list's too).
 */
type Describe = (row: Record<string, unknown>) => string | undefined;

const fromMovies = (field: string, describe?: Describe) =>
  suggestFrom((f, typed) => apiService.getAutocompleteSuggestions(f, typed), field, { describe });

const collectionKind: Describe = row => (row.collection_type === 'box_set' ? 'Box set' : 'Collection');

const decades: SearchValue[] = [
  ...[2020, 2010, 2000, 1990, 1980, 1970, 1960].map(y => ({ value: `${y}-${y + 9}`, desc: `${y}s` })),
  { value: '<1960', desc: 'Before 1960' },
];

const ratings = (top: number, good: number, fair: number, scale: string): SearchValue[] => [
  { value: `>=${top}`, desc: `${top} or more${scale}` },
  { value: `>=${good}`, desc: `${good} or more${scale}` },
  { value: `>=${fair}`, desc: `${fair} or more${scale}` },
  { value: `<${fair}`, desc: `Under ${fair}${scale}` },
];

/** The age groups of the ▾, each one pill. */
export const AGE_GROUPS: Array<{ label: string; value: string }> = [
  { label: 'All Ages (0-3)', value: '0-3' },
  { label: 'Children (4-9)', value: '4-9' },
  { label: 'Pre-teens (10-14)', value: '10-14' },
  { label: 'Teens & Adults (15+)', value: '>=15' },
];

const warning = (animal: string): SearchValue[] => [
  { value: 'yes', desc: `Shows ${animal}` },
  { value: 'no', desc: `No ${animal} on screen` },
  { value: 'unknown', desc: `${animal[0].toUpperCase()}${animal.slice(1)} not reported yet` },
];

/** A key's suggestions, or none (`withSuggestions` false). */
type From = (field: string, describe?: Describe) => { suggest?: (typed: string) => Promise<SuggestedValue[]> };

/**
 * The keys of a movie. `from` gives a key its suggestions: FilmDex's from the
 * movies' autocomplete, the wish list's from its own movies.
 */
export const movieKeys = (from: From = (field, describe) => ({ suggest: fromMovies(field, describe) })): SearchKey[] => [
  // People
  { key: 'actor', group: 'People', type: 'text', desc: 'An actor in its cast', example: 'actor:"Tom Hanks"', ...from('actor') },
  { key: 'director', group: 'People', type: 'text', desc: 'Its director', example: 'director:Kubrick', ...from('director') },

  // Film
  { key: 'title', group: 'Film', type: 'text', desc: 'Words of its title or original title', example: 'title:alien', valuesForWords: false, ...from('title') },
  { key: 'genre', group: 'Film', type: 'text', desc: 'One of its genres', example: 'genre:Drama', ...from('genre') },
  { key: 'year', group: 'Film', type: 'number', desc: 'Its release year, exactly, compared or a range', example: 'year:1960-1969', shortcuts: decades },
  { key: 'original_language', aliases: ['lang'], group: 'Film', type: 'text', desc: 'Its original language, as a code', example: 'lang:fr', ...from('original_language') },
  { key: 'media_type', group: 'Film', type: 'enum', desc: 'A movie or a TV show', example: 'media_type:tv', values: [
    { value: 'movie', desc: 'A movie' }, { value: 'tv', desc: 'A TV show' },
  ] },

  // Collection
  { key: 'format', group: 'Collection', type: 'list', desc: 'Its format (Blu-ray finds the 4K ones too)', example: 'format:DVD', values: [
    { value: 'Blu-ray 4K', desc: 'Blu-ray 4K' }, { value: 'Blu-ray', desc: 'Blu-ray, 4K included' }, { value: 'DVD', desc: 'DVD' },
  ], ...from('format') },
  { key: 'collection', group: 'Collection', type: 'list', desc: 'One of your collections or box sets', example: 'collection:Christmas', ...from('collection', collectionKind) },
  { key: 'box_set', group: 'Collection', type: 'list', desc: 'The box set it came in', example: 'box_set:"Star Wars"', ...from('box_set', collectionKind) },
  { key: 'price', group: 'Collection', type: 'number', desc: 'What you paid for it', example: 'price:<10', shortcuts: [
    { value: '<10', desc: 'Under 10' }, { value: '10-20', desc: 'Between 10 and 20' }, { value: '>20', desc: 'More than 20' },
  ] },

  // Ratings
  { key: 'imdb_rating', group: 'Ratings', type: 'number', desc: 'Its IMDb rating, out of 10', example: 'imdb_rating:>=7', shortcuts: ratings(8, 7, 6, '') },
  { key: 'tmdb_rating', group: 'Ratings', type: 'number', desc: 'Its TMDB rating, out of 10', example: 'tmdb_rating:>=7', shortcuts: ratings(8, 7, 6, '') },
  { key: 'rotten_tomato_rating', group: 'Ratings', type: 'number', desc: 'Its Rotten Tomatoes score, in percent', example: 'rotten_tomato_rating:>=80', shortcuts: ratings(90, 75, 60, '%') },

  // Your watching
  { key: 'watched', group: 'Your watching', type: 'number', desc: 'Watched or not, or how many times', example: 'watched:no', values: yesNo('Watched at least once', 'Never watched'), shortcuts: [
    { value: '1', desc: 'Watched once' }, { value: '>=2', desc: 'Watched at least twice' },
  ] },
  { key: 'last_watched', group: 'Your watching', type: 'date', desc: 'When you last watched it', example: 'last_watched:>2025-01-01', shortcuts: [
    { value: 'today', desc: 'Watched today' }, { value: 'yesterday', desc: 'Watched yesterday' }, { value: 'week', desc: 'In the last 7 days' },
    { value: 'month', desc: 'In the last 30 days' }, { value: 'year', desc: 'In the last 12 months' },
    { value: String(new Date().getFullYear()), desc: 'This calendar year' },
    { value: `<${new Date().getFullYear() - 1}`, desc: 'Not since the year before last' },
  ] },
  { key: 'has_comments', group: 'Your watching', type: 'bool', desc: 'You wrote comments on it', values: yesNo('With your comments', 'Without comments') },

  // Warnings
  { key: 'spiders', group: 'Warnings', type: 'enum', desc: 'Spiders on screen, as DoesTheDogDie reports', example: 'spiders:no', values: warning('spiders') },
  { key: 'snakes', group: 'Warnings', type: 'enum', desc: 'Snakes on screen, as DoesTheDogDie reports', example: 'snakes:no', values: warning('snakes') },
  { key: 'recommended_age', group: 'Warnings', type: 'number', desc: 'The age it is recommended from: FilmAges first, else TMDB/OMDB', example: 'recommended_age:<=9', shortcuts: [
    ...AGE_GROUPS.map(g => ({ value: g.value, desc: g.label })),
  ] },
];

export const moviesSchema: SearchSchema = {
  section: 'movies',
  keys: movieKeys(),
  placeholder: 'Search FilmDex: words, or a filter like director:Kubrick',
  wordsHint: 'In titles, directors, comments and collections',
};
