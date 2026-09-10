import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UnmatchedMovies from './UnmatchedMovies';

vi.mock('../services/api', () => ({
  default: {
    getImportStatus: vi.fn(),
    getMovieSuggestions: vi.fn(),
    resolveMovie: vi.fn(),
    ignoreMovie: vi.fn(),
    searchMovies: vi.fn()
  }
}));

import apiService from '../services/api';

/**
 * The step that asks the user to settle the rows the import could not match on
 * its own: pick a TMDB suggestion, search for something else, or ignore the
 * row. It resolves nothing until "Continue processing..." is pressed.
 */

const testImportId = 42;

const unmatched = (over: Record<string, unknown> = {}) => ({
  title: 'Test Movie 1',
  original_title: 'Test Movie 1 Original',
  csvData: { format: 'DVD', price: '9.99', comments: '' },
  ...over
});

const suggestion = (over: Record<string, unknown> = {}) => ({
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  releaseDate: '1999-03-30',
  mediaType: 'movie',
  voteAverage: 8.2,
  posterPath: null,
  ...over
});

const renderList = () => {
  const onImportComplete = vi.fn();
  const setCurrentStep = vi.fn();
  render(
    <UnmatchedMovies
      importId={testImportId}
      onImportComplete={onImportComplete}
      setCurrentStep={setCurrentStep}
    />
  );
  return { onImportComplete, setCurrentStep };
};

const importPending = (movies: Array<Record<string, unknown>>) =>
  (apiService.getImportStatus as any).mockResolvedValue({
    id: testImportId,
    status: 'PENDING_RESOLUTION',
    unmatchedMovies: movies
  });

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getMovieSuggestions as any).mockResolvedValue({ suggestions: [] });
});

describe('UnmatchedMovies', () => {
  it('renders loading state initially', () => {
    importPending([]);

    renderList();

    expect(screen.getByText('Checking import status...')).toBeInTheDocument();
  });

  it('shows completion message when nothing is left to resolve', async () => {
    (apiService.getImportStatus as any).mockResolvedValue({
      id: testImportId,
      status: 'COMPLETED',
      unmatchedMovies: []
    });

    const { onImportComplete } = renderList();

    await waitFor(() => expect(screen.getByText('🎉 All movies processed!')).toBeInTheDocument());
    expect(onImportComplete).toHaveBeenCalled();
  });

  it('shows unmatched movies list', async () => {
    importPending([unmatched(), unmatched({ title: 'Test Movie 2', original_title: 'Test Movie 2 Original' })]);

    renderList();

    await waitFor(() => expect(screen.getByText('Test Movie 1')).toBeInTheDocument());
    expect(screen.getByText('Test Movie 2')).toBeInTheDocument();
    expect(screen.getByText('2 movie(s) need resolution')).toBeInTheDocument();
  });

  it('shows the error the import recorded for a row', async () => {
    importPending([unmatched({ error: 'No TMDB match found' })]);

    renderList();

    await waitFor(() => expect(screen.getByText('Error: No TMDB match found')).toBeInTheDocument());
  });

  it('offers the suggestions it fetched for each movie', async () => {
    importPending([unmatched()]);
    (apiService.getMovieSuggestions as any).mockResolvedValue({ suggestions: [suggestion()] });

    renderList();

    await waitFor(() => expect(screen.getByText('The Matrix')).toBeInTheDocument());
    expect(apiService.getMovieSuggestions).toHaveBeenCalledWith(
      String(testImportId),
      'Test Movie 1 Original'
    );
  });

  it('opens a manual search for one movie', async () => {
    importPending([unmatched()]);

    renderList();
    await waitFor(() => expect(screen.getByText('Search...')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Search...'));

    expect(screen.getByPlaceholderText('Search for movie title...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Year (optional)')).toBeInTheDocument();
  });

  it('drops an ignored movie from the ones needing resolution', async () => {
    importPending([unmatched()]);

    renderList();
    await waitFor(() => expect(screen.getByText('Ignore')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Ignore'));

    // The only row was ignored, so nothing is left to resolve.
    await waitFor(() => expect(screen.getByText('🎉 All movies processed!')).toBeInTheDocument());
  });

  it('resolves each movie against its selected suggestion on continue', async () => {
    importPending([unmatched()]);
    (apiService.getMovieSuggestions as any).mockResolvedValue({ suggestions: [suggestion()] });
    (apiService.resolveMovie as any).mockResolvedValue({});

    const { setCurrentStep } = renderList();
    await waitFor(() => expect(screen.getByText('Continue processing...')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Continue processing...'));

    await waitFor(() =>
      expect(apiService.resolveMovie).toHaveBeenCalledWith(
        String(testImportId),
        'Test Movie 1',
        // The TMDB id is what the backend resolves on; the rest comes from the CSV row.
        expect.objectContaining({ id: 603, title: 'The Matrix', format: 'DVD', price: 9.99 })
      )
    );
    expect(setCurrentStep).toHaveBeenCalledWith('processing');
  });
});
