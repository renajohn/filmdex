import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieForm from './MovieForm';

/**
 * The form only edits what the user owns -- format, price, when it was
 * acquired, notes, whether it has been watched. Everything descriptive comes
 * from TMDB and is edited on the detail card instead, which is why there is no
 * genre, cast, release date or ratings field here any more.
 */

vi.mock('../services/api', () => ({
  default: {
    createMovie: vi.fn(),
    updateMovie: vi.fn()
  }
}));

import apiService from '../services/api';

describe('MovieForm', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly for adding new movie', () => {
    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByText('Add New Movie')).toBeInTheDocument();
    expect(screen.getByLabelText('Title *')).toBeInTheDocument();
    expect(screen.getByText('Add Movie')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should render correctly for editing existing movie', () => {
    render(
      <MovieForm
        movie={{ id: 1, title: 'Test Movie', format: 'Blu-ray' }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Edit Movie')).toBeInTheDocument();
    expect(screen.getByText('Update Movie')).toBeInTheDocument();
  });

  it('should pre-fill form with the fields it owns', () => {
    render(
      <MovieForm
        movie={{
          id: 1,
          title: 'Test Movie',
          format: 'Blu-ray 4K',
          price: 19.99,
          acquired_date: '2023-12-01',
          comments: 'Bought secondhand'
        }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByLabelText('Title *')).toHaveValue('Test Movie');
    expect(screen.getByLabelText('Format')).toHaveValue('Blu-ray 4K');
    expect(screen.getByLabelText('Price (CHF)')).toHaveValue(19.99);
    expect(screen.getByLabelText('Acquired Date')).toHaveValue('2023-12-01');
    expect(screen.getByLabelText('Comments')).toHaveValue('Bought secondhand');
  });

  it('offers only the formats the collection uses', () => {
    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    const values = Array.from((screen.getByLabelText('Format') as HTMLSelectElement).options).map(
      o => o.value
    );

    expect(values).toEqual(['', 'Blu-ray', 'Blu-ray 4K', 'DVD', 'Digital']);
  });

  it('should handle form submission for new movie', async () => {
    (apiService.createMovie as any).mockResolvedValue({ id: 1, title: 'New Movie' });

    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'New Movie' } });
    fireEvent.click(screen.getByText('Add Movie'));

    await waitFor(() => {
      expect(apiService.createMovie).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Movie' })
      );
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('should handle form submission for updating movie', async () => {
    (apiService.updateMovie as any).mockResolvedValue({ id: 1, title: 'Updated Title' });

    render(
      <MovieForm
        movie={{ id: 1, title: 'Original Title' }}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.change(screen.getByDisplayValue('Original Title'), {
      target: { value: 'Updated Title' }
    });
    fireEvent.click(screen.getByText('Update Movie'));

    await waitFor(() => {
      expect(apiService.updateMovie).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: 'Updated Title' })
      );
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('sends the ownership fields the user filled in', async () => {
    (apiService.createMovie as any).mockResolvedValue({ id: 1 });

    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Heat' } });
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'DVD' } });
    fireEvent.change(screen.getByLabelText('Price (CHF)'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText('Comments'), { target: { value: 'Flea market' } });
    fireEvent.click(screen.getByText('Add Movie'));

    await waitFor(() =>
      expect(apiService.createMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Heat',
          format: 'DVD',
          price: 12.5,
          comments: 'Flea market'
        })
      )
    );
  });

  it('records a movie the user has not watched yet', async () => {
    (apiService.createMovie as any).mockResolvedValue({ id: 1 });

    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Unwatched' } });
    fireEvent.click(screen.getByLabelText(/never seen/i));
    fireEvent.click(screen.getByText('Add Movie'));

    await waitFor(() =>
      expect(apiService.createMovie).toHaveBeenCalledWith(
        expect.objectContaining({ never_seen: true })
      )
    );
  });

  it('should handle form validation', async () => {
    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Add Movie'));
    });

    // Title is required, so form should not submit
    expect(apiService.createMovie).not.toHaveBeenCalled();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should handle cancel button', () => {
    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show error message on API failure', async () => {
    (apiService.createMovie as any).mockRejectedValue(new Error('API Error'));

    render(<MovieForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Test Movie' } });
    fireEvent.click(screen.getByText('Add Movie'));

    await waitFor(() =>
      expect(screen.getByText('Failed to save movie: API Error')).toBeInTheDocument()
    );
  });
});
