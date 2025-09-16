import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

// Mock the API service
jest.mock('./services/api', () => ({
  getAllMovies: jest.fn(() => Promise.resolve([
    {
      id: 1,
      title: 'Test Movie',
      plot: 'A test movie plot',
      genre: 'Action',
      imdb_rating: 8.5,
      rotten_tomatoes_rating: 85,
      year: 2023,
      format: 'Blu-ray',
      acquired_date: '2023-01-01'
    }
  ])),
  getMovieDetails: jest.fn(() => Promise.resolve({
    title: 'Test Movie',
    plot: 'A test movie plot',
    genre: 'Action',
    imdb_rating: 8.5,
    rotten_tomatoes_rating: 85,
    year: 2023,
    format: 'Blu-ray',
    date_of_acquisition: '2023-01-01',
    poster_path: '/test-poster.jpg',
    adult: false,
    overview: 'A test movie overview',
    release_date: '2023-01-01',
    genres: [{ id: 28, name: 'Action' }],
    credits: {
      cast: [
        { name: 'Actor One', profile_path: '/actor1.jpg' },
        { name: 'Actor Two', profile_path: '/actor2.jpg' }
      ]
    },
    videos: {
      results: [
        { key: 'test-key', site: 'YouTube', type: 'Trailer' }
      ]
    }
  }))
}));

test('renders movie collection manager', () => {
  render(<App />);
  const headerElement = screen.getByText(/Movie Collection Manager/i);
  expect(headerElement).toBeInTheDocument();
});

test('renders search form', () => {
  render(<App />);
  
  // Check if search form elements are present
  expect(screen.getByRole('heading', { name: 'Search Movies' })).toBeInTheDocument();
  expect(screen.getByLabelText('Title:')).toBeInTheDocument();
  expect(screen.getByLabelText('Genre:')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Searching...' })).toBeInTheDocument();
});
