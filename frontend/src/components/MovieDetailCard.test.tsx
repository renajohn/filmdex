import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieDetailCard from './MovieDetailCard';

vi.mock('../services/api', () => ({
  default: {
    getMovieCast: vi.fn(() => Promise.resolve([])),
    getCollectionNames: vi.fn(() => Promise.resolve([])),
    getBoxSetNames: vi.fn(() => Promise.resolve([])),
    getMoviesInCollection: vi.fn(() => Promise.resolve({ movies: [] })),
    updateMovie: vi.fn(() => Promise.resolve({})),
    getMovieWarnings: vi.fn(() => Promise.resolve({
      movieId: 1, dddId: null, dddUrl: null, matchedBy: null, checkedAt: null, topics: []
    })),
  }
}));

import apiService from '../services/api';

const movie = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Test Movie',
  plot: 'A test movie plot',
  overview: 'A test movie plot',
  genres: 'Action',
  imdb_rating: 8.5,
  rotten_tomato_rating: 85,
  year: 2023,
  release_date: '2023-01-01',
  format: 'Blu-ray',
  acquired_date: '2023-01-01',
  trailer_key: 'test-key',
  trailer_site: 'YouTube',
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getMovieCast as any).mockResolvedValue([]);
});

describe('MovieDetailCard', () => {
  it('shows the title and the overview', async () => {
    render(<MovieDetailCard movieDetails={movie()} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Test Movie')).toBeInTheDocument());
    expect(screen.getByText('A test movie plot')).toBeInTheDocument();
  });

  it('shows the cast it fetches for the movie', async () => {
    // The cast is no longer part of the movie payload; the card asks for it.
    (apiService.getMovieCast as any).mockResolvedValue([
      { name: 'Actor One', character: 'Someone' },
      { name: 'Actor Two', character: 'Someone Else' }
    ]);

    render(<MovieDetailCard movieDetails={movie()} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Actor One')).toBeInTheDocument());
    expect(screen.getByText('Actor Two')).toBeInTheDocument();
    expect(apiService.getMovieCast).toHaveBeenCalledWith(1);
  });

  it('offers to play the trailer when the movie has one', async () => {
    render(<MovieDetailCard movieDetails={movie()} onClose={() => {}} />);

    const button = await screen.findByRole('button', { name: /play trailer/i });
    expect(button).toBeEnabled();
  });

  it('says so instead when there is no trailer', async () => {
    render(<MovieDetailCard movieDetails={movie({ trailer_key: undefined })} onClose={() => {}} />);

    const button = await screen.findByRole('button', { name: /no trailer available/i });
    expect(button).toBeDisabled();
  });

  it('renders a movie with almost nothing on it', async () => {
    render(
      <MovieDetailCard
        movieDetails={{ id: 2, title: 'Incomplete Movie' }}
        onClose={() => {}}
      />
    );

    // A movie with no poster renders its title in the placeholder as well.
    await waitFor(() => expect(screen.getAllByText('Incomplete Movie').length).toBeGreaterThan(0));
    expect(screen.getByText(/click to add overview/i)).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const onClose = vi.fn();
    render(<MovieDetailCard movieDetails={movie()} onClose={onClose} />);

    await waitFor(() => expect(document.querySelector('.movie-detail-close')).toBeInTheDocument());
    (document.querySelector('.movie-detail-close') as HTMLButtonElement).click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
