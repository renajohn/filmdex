/**
 * Finding a movie as one types (backend movieFinderService): TMDB's movies,
 * the people and sagas a search names; adding at once, a box set, buying.
 */

export const MOVIE_FORMATS = ['Blu-ray 4K', 'Blu-ray', 'DVD', 'Digital'] as const;
export type MovieFormat = typeof MOVIE_FORMATS[number];

export interface MovieHave {
  owned: Array<{ id: number; format: string | null; title: string }>;
  wished: { id: number; format: string | null } | null;
}

export interface FinderMovie {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string | null;
  year: string | null;
  posterPath: string | null;
  directors: string[];
  have: MovieHave;
}

export interface FinderPerson {
  id: number;
  name: string;
  role: 'director' | 'actor';
  profilePath: string | null;
  posters: string[];
}

export interface FinderSaga {
  id: number;
  name: string;
  posterPath: string | null;
  movies: number;
}

export interface EditionInput {
  format: string;
  edition?: string;
  price?: string;
  acquiredDate?: string;
  comments?: string;
}

const json = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error((data as { error?: string }).error || `HTTP error! status: ${response.status}`), { status: response.status });
  return data as T;
};

const post = <T>(url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(response => json<T>(response));

const movieFinderService = {
  search: (q: string, signal?: AbortSignal) =>
    fetch(`/api/movies/finder/search?q=${encodeURIComponent(q)}`, { signal })
      .then(response => json<{ movies: FinderMovie[]; people: FinderPerson[]; sagas: FinderSaga[] }>(response)),

  person: (id: number) =>
    fetch(`/api/movies/finder/people/${id}`)
      .then(response => json<{ person: { id: number; name: string; profilePath: string | null; role: 'director' | 'actor' }; directed: FinderMovie[]; actedIn: FinderMovie[] }>(response)),

  saga: (id: number) =>
    fetch(`/api/movies/finder/sagas/${id}`).then(response => json<{ saga: { id: number; name: string; posterPath: string | null }; movies: FinderMovie[] }>(response)),

  addMovie: (movie: Pick<FinderMovie, 'id' | 'mediaType'>, titleStatus: 'owned' | 'wish', edition: EditionInput) =>
    post<{ id: number; title: string }>('/api/movies/finder/movies', { tmdbId: movie.id, mediaType: movie.mediaType, titleStatus, ...edition }),

  addBoxSet: (name: string, movies: Array<Pick<FinderMovie, 'id' | 'mediaType'>>, titleStatus: 'owned' | 'wish', edition: EditionInput) =>
    post<{ collection: { id: number; name: string }; movies: Array<{ id: number; title: string }> }>('/api/movies/finder/box-sets', {
      name, movies: movies.map(movie => ({ tmdbId: movie.id, mediaType: movie.mediaType })), titleStatus, ...edition,
    }),

  buy: (movieIds: number[], edition: EditionInput) =>
    post<Array<{ id: number; title: string }>>('/api/movies/finder/buy', { movieIds, ...edition }),
};

/** A TMDB image at a size; a poster of the collection (/images/…) as it is. */
export const tmdbImage = (path: string | null | undefined, size = 'w185'): string =>
  !path ? '' : /^\/(api\/)?images\//.test(path) || /^https?:/.test(path) ? path : `https://image.tmdb.org/t/p/${size}${path}`;

/** "4K" for a Blu-ray 4K, as the tags say it. */
export const shortFormat = (format: string | null | undefined): string => (format === 'Blu-ray 4K' ? '4K' : format || '');

export default movieFinderService;
