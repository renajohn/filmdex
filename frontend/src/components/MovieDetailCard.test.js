import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieDetailCard from './MovieDetailCard';

describe('MovieDetailCard', () => {
  const mockMovieDetails = {
    title: 'Test Movie',
    plot: 'A test movie plot',
    genre: 'Action',
    imdb_rating: 8.5,
    rotten_tomato_rating: 85,
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
  };

  it('renders movie details correctly', () => {
    render(<MovieDetailCard movieDetails={mockMovieDetails} onClose={() => {}} />);
    
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByText('A test movie plot')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('Blu-ray')).toBeInTheDocument();
    expect(screen.getByText('1/1/2023')).toBeInTheDocument();
  });

  it('renders cast members', () => {
    render(<MovieDetailCard movieDetails={mockMovieDetails} onClose={() => {}} />);
    
    expect(screen.getByText('Actor One')).toBeInTheDocument();
    expect(screen.getByText('Actor Two')).toBeInTheDocument();
  });

  it('renders trailer link when available', () => {
    render(<MovieDetailCard movieDetails={mockMovieDetails} onClose={() => {}} />);
    
    const trailerLink = screen.getByText('Watch Trailer');
    expect(trailerLink).toBeInTheDocument();
    expect(trailerLink.closest('a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=test-key');
  });

  it('handles missing data gracefully', () => {
    const incompleteMovie = {
      title: 'Incomplete Movie',
      plot: null,
      imdb_rating: null,
      rotten_tomato_rating: null,
      credits: { cast: [] },
      videos: { results: [] }
    };

    render(<MovieDetailCard movieDetails={incompleteMovie} onClose={() => {}} />);
    
    expect(screen.getByText('Incomplete Movie')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(4); // For missing ratings and other fields
  });

  it('calls onClose when close button is clicked', () => {
    const mockOnClose = jest.fn();
    render(<MovieDetailCard movieDetails={mockMovieDetails} onClose={mockOnClose} />);
    
    const closeButton = screen.getByText('×');
    closeButton.click();
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
