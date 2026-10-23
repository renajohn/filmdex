/** What a movie row says of its age (the lists carry FilmAges' columns). */
export interface AgeFields {
  age_source?: string | null;
  filmages_age_legal?: number | null;
  filmages_age_suggested?: number | null;
  filmages_for?: string | null;
  filmages_against?: string | null;
}

const age = (value: number | null | undefined) => (value == null ? '—' : `${value}+`);

/**
 * The age tag's tooltip: where the age comes from and, from FilmAges, both ages and
 * the elements weighed. One line each.
 */
export const ageTooltip = (movie: AgeFields): string => {
  if (movie.age_source !== 'filmages') return 'TMDB/OMDB';
  return [
    'FilmAges',
    `Legal ${age(movie.filmages_age_legal)} · Suggested ${age(movie.filmages_age_suggested)}`,
    movie.filmages_for && `For: ${movie.filmages_for}`,
    movie.filmages_against && `Against: ${movie.filmages_against}`,
  ].filter(Boolean).join('\n');
};

/** What a movie row says of its ratings. */
export interface ScoreFields {
  tmdb_rating?: number | string | null;
  imdb_rating?: number | string | null;
  rotten_tomato_rating?: number | string | null;
}

const rated = (value: number | string | null | undefined): value is number | string =>
  value !== null && value !== undefined && value !== '' && value !== 'N/A';

/** The score tag's tooltip: the ratings it is made of, one a line. */
export const scoreTooltip = (movie: ScoreFields): string =>
  [
    rated(movie.tmdb_rating) && `TMDB ${Number(movie.tmdb_rating).toFixed(1)}`,
    rated(movie.imdb_rating) && `IMDb ${Number(movie.imdb_rating).toFixed(1)}`,
    rated(movie.rotten_tomato_rating) && `Rotten Tomatoes ${parseFloat(String(movie.rotten_tomato_rating))} %`,
  ].filter(Boolean).join('\n');
