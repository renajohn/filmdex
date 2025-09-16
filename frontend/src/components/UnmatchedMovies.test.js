import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnmatchedMovies from './UnmatchedMovies';
import apiService from '../services/api';

// Mock the API service
jest.mock('../services/api');

// Mock fetch for polling
global.fetch = jest.fn();

describe('UnmatchedMovies', () => {
  const mockOnImportComplete = jest.fn();
  const testImportId = 'test-import-id';

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  it('renders loading state initially', () => {
    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    expect(screen.getByText('Checking import status...')).toBeInTheDocument();
  });

  it('shows completion message when no unmatched movies', async () => {
    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'COMPLETED',
      unmatchedMovies: []
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('🎉 All movies imported successfully!')).toBeInTheDocument();
    });
  });

  it('shows unmatched movies list', async () => {
    const unmatchedMovies = [
      { title: 'Test Movie 1', originalTitle: 'Test Movie 1 Original' },
      { title: 'Test Movie 2', originalTitle: 'Test Movie 2 Original' }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Resolve Unmatched Movies')).toBeInTheDocument();
      expect(screen.getByText('2 movie(s) need manual resolution')).toBeInTheDocument();
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
      expect(screen.getByText('Test Movie 2')).toBeInTheDocument();
    });
  });

  it('handles movie selection', async () => {
    const unmatchedMovies = [
      { title: 'Test Movie 1', originalTitle: 'Test Movie 1 Original' }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    apiService.getMovieSuggestions.mockResolvedValue({
      suggestions: []
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
    });

    const movieItem = screen.getByText('Test Movie 1');
    fireEvent.click(movieItem);

    await waitFor(() => {
      expect(screen.getByText('Resolve: Test Movie 1')).toBeInTheDocument();
    });
  });

  it('handles movie search', async () => {
    const unmatchedMovies = [
      { title: 'Test Movie 1', originalTitle: 'Test Movie 1 Original' }
    ];

    const suggestions = [
      {
        id: 1,
        title: 'Test Movie 1',
        originalTitle: 'Test Movie 1 Original',
        releaseDate: '2023-01-01',
        posterPath: '/poster.jpg',
        voteAverage: 8.5,
        overview: 'A great movie'
      }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    apiService.getMovieSuggestions.mockResolvedValue({ suggestions });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
    });

    const movieItem = screen.getByText('Test Movie 1');
    fireEvent.click(movieItem);

    await waitFor(() => {
      expect(screen.getByText('Resolve: Test Movie 1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search for movie title...');
    fireEvent.change(searchInput, { target: { value: 'Test Movie' } });

    const searchButton = screen.getByText('Search');
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(apiService.getMovieSuggestions).toHaveBeenCalledWith(testImportId, 'Test Movie', null);
    });
  });

  it('handles movie resolution', async () => {
    const unmatchedMovies = [
      { title: 'Test Movie 1', originalTitle: 'Test Movie 1 Original' }
    ];

    const suggestions = [
      {
        id: 1,
        title: 'Test Movie 1',
        originalTitle: 'Test Movie 1 Original',
        releaseDate: '2023-01-01',
        posterPath: '/poster.jpg',
        voteAverage: 8.5,
        overview: 'A great movie'
      }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    apiService.getMovieSuggestions.mockResolvedValue({ suggestions });
    apiService.resolveMovie.mockResolvedValue({
      success: true,
      movie: { id: 1, title: 'Test Movie 1' }
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
    });

    const movieItem = screen.getByText('Test Movie 1');
    fireEvent.click(movieItem);

    await waitFor(() => {
      expect(screen.getByText('Resolve: Test Movie 1')).toBeInTheDocument();
    });

    const suggestionItem = screen.getByText('Test Movie 1');
    fireEvent.click(suggestionItem);

    await waitFor(() => {
      expect(apiService.resolveMovie).toHaveBeenCalled();
    });
  });

  it('handles skip movie', async () => {
    const unmatchedMovies = [
      { title: 'Test Movie 1', originalTitle: 'Test Movie 1 Original' }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
    });

    const movieItem = screen.getByText('Test Movie 1');
    fireEvent.click(movieItem);

    await waitFor(() => {
      expect(screen.getByText('Resolve: Test Movie 1')).toBeInTheDocument();
    });

    const skipButton = screen.getByText('Skip This Movie');
    fireEvent.click(skipButton);

    await waitFor(() => {
      expect(screen.queryByText('Test Movie 1')).not.toBeInTheDocument();
    });
  });

  it('shows error messages for movies with errors', async () => {
    const unmatchedMovies = [
      { 
        title: 'Test Movie 1', 
        originalTitle: 'Test Movie 1 Original',
        error: 'No TMDB match found'
      }
    ];

    apiService.getImportStatus.mockResolvedValue({
      id: testImportId,
      status: 'PENDING_RESOLUTION',
      unmatchedMovies
    });

    render(<UnmatchedMovies importId={testImportId} onImportComplete={mockOnImportComplete} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Movie 1')).toBeInTheDocument();
      expect(screen.getByText('Error: No TMDB match found')).toBeInTheDocument();
    });
  });
});
