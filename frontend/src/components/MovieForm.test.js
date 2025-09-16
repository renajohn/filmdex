import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieForm from './MovieForm';

// Mock the API service
jest.mock('../services/api', () => ({
  createMovie: jest.fn(),
  updateMovie: jest.fn(),
  fetchRatings: jest.fn()
}));

import apiService from '../services/api';

describe('MovieForm', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly for adding new movie', () => {
    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Add New Movie')).toBeInTheDocument();
    expect(screen.getByLabelText('Title *')).toBeInTheDocument();
    expect(screen.getByText('Add Movie')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render correctly for editing existing movie', () => {
    const movie = {
      id: 1,
      title: 'Test Movie',
      genre: 'Action',
      director: 'Test Director',
      cast: ['Actor 1', 'Actor 2'],
      release_date: '2023-01-01',
      format: 'Blu-ray',
      imdb_rating: 8.5,
      rotten_tomato_rating: 85,
      plot: 'Test plot',
      acquired_date: '2023-12-01',
      imdb_link: 'https://www.imdb.com/title/tt1234567/',
      price: 19.99
    };

    render(
      <MovieForm
        movie={movie}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Edit Movie')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Movie')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Action')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Director')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Actor 1, Actor 2')).toBeInTheDocument();
    expect(screen.getByText('Update Movie')).toBeInTheDocument();
  });

  it('should pre-fill form with movie data', () => {
    const movie = {
      id: 1,
      title: 'Test Movie',
      genre: 'Action',
      director: 'Test Director',
      cast: ['Actor 1', 'Actor 2'],
      release_date: '2023-01-01',
      format: 'Blu-ray',
      imdb_rating: 8.5,
      rotten_tomato_rating: 85,
      plot: 'Test plot',
      acquired_date: '2023-12-01',
      imdb_link: 'https://www.imdb.com/title/tt1234567/',
      price: 19.99
    };

    render(
      <MovieForm
        movie={movie}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByDisplayValue('Test Movie')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Action')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Director')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Actor 1, Actor 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2023-01-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Blu-ray')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('85')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test plot')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2023-12-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://www.imdb.com/title/tt1234567/')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19.99')).toBeInTheDocument();
  });

  it('should handle form submission for new movie', async () => {
    apiService.createMovie.mockResolvedValue({ id: 1, title: 'New Movie' });

    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByLabelText('Title *');
    const submitButton = screen.getByText('Add Movie');

    fireEvent.change(titleInput, { target: { value: 'New Movie' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(apiService.createMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Movie',
          cast: [],
          release_date: null,
          imdb_rating: null,
          rotten_tomato_rating: null
        })
      );
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('should handle form submission for updating movie', async () => {
    const movie = {
      id: 1,
      title: 'Original Title',
      genre: 'Action'
    };

    apiService.updateMovie.mockResolvedValue({ id: 1, title: 'Updated Title' });

    render(
      <MovieForm
        movie={movie}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByDisplayValue('Original Title');
    const submitButton = screen.getByText('Update Movie');

    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(apiService.updateMovie).toHaveBeenCalledWith(1, 
        expect.objectContaining({
          title: 'Updated Title'
        })
      );
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('should handle fetch ratings functionality', async () => {
    const mockRatings = {
      imdbRating: 8.5,
      rottenTomatoRating: 85
    };
    apiService.fetchRatings.mockResolvedValue(mockRatings);

    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByLabelText('Title *');
    const fetchRatingsButton = screen.getByText('Auto-fetch Ratings');

    fireEvent.change(titleInput, { target: { value: 'Inception' } });
    fireEvent.click(fetchRatingsButton);

    await waitFor(() => {
      expect(apiService.fetchRatings).toHaveBeenCalledWith('Inception', null);
      expect(screen.getByDisplayValue('8.5')).toBeInTheDocument();
      expect(screen.getByDisplayValue('85')).toBeInTheDocument();
    });
  });

  it('should handle fetch ratings with year', async () => {
    const mockRatings = {
      imdbRating: 8.5,
      rottenTomatoRating: 85
    };
    apiService.fetchRatings.mockResolvedValue(mockRatings);

    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByLabelText('Title *');
    const releaseDateInput = screen.getByLabelText('Release Date');
    const fetchRatingsButton = screen.getByText('Auto-fetch Ratings');

    fireEvent.change(titleInput, { target: { value: 'Inception' } });
    fireEvent.change(releaseDateInput, { target: { value: '2010-07-16' } });
    fireEvent.click(fetchRatingsButton);

    await waitFor(() => {
      expect(apiService.fetchRatings).toHaveBeenCalledWith('Inception', 2010);
    });
  });

  it('should handle form validation', async () => {
    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const submitButton = screen.getByText('Add Movie');
    
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Title is required, so form should not submit
    expect(apiService.createMovie).not.toHaveBeenCalled();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should handle cancel button', () => {
    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should handle cast field as comma-separated string', async () => {
    apiService.createMovie.mockResolvedValue({ id: 1, title: 'Test Movie' });

    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByLabelText('Title *');
    const castInput = screen.getByLabelText('Cast (comma-separated)');
    const submitButton = screen.getByText('Add Movie');

    fireEvent.change(titleInput, { target: { value: 'Test Movie' } });
    fireEvent.change(castInput, { target: { value: 'Actor 1, Actor 2, Actor 3' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(apiService.createMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          cast: ['Actor 1', 'Actor 2', 'Actor 3']
        })
      );
    });
  });

  it('should show error message on API failure', async () => {
    apiService.createMovie.mockRejectedValue(new Error('API Error'));

    render(
      <MovieForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const titleInput = screen.getByLabelText('Title *');
    const submitButton = screen.getByText('Add Movie');

    fireEvent.change(titleInput, { target: { value: 'Test Movie' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save movie: API Error')).toBeInTheDocument();
    });
  });
});
