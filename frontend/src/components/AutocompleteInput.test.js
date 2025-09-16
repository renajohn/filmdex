import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AutocompleteInput from './AutocompleteInput';

// Mock the API service
jest.mock('../services/api', () => ({
  getAutocompleteSuggestions: jest.fn()
}));

import apiService from '../services/api';

describe('AutocompleteInput', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly with basic props', () => {
    render(
      <AutocompleteInput
        field="title"
        value=""
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    const input = screen.getByPlaceholderText('Enter movie title');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('should call search API on input change', async () => {
    const mockSuggestions = ['Inception', 'Interstellar', 'The Dark Knight'];
    apiService.getAutocompleteSuggestions.mockResolvedValue(mockSuggestions);

    render(
      <AutocompleteInput
        field="title"
        value=""
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    const input = screen.getByPlaceholderText('Enter movie title');
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Inception' } });
    });

    await waitFor(() => {
      expect(apiService.getAutocompleteSuggestions).toHaveBeenCalledWith('title', 'Inception');
    });
  });

  it('should display suggestions when available', async () => {
    const mockSuggestions = ['Inception', 'Interstellar', 'The Dark Knight'];
    apiService.getAutocompleteSuggestions.mockResolvedValue(mockSuggestions);

    render(
      <AutocompleteInput
        field="title"
        value="Inception"
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Inception')).toBeInTheDocument();
      expect(screen.getByText('Interstellar')).toBeInTheDocument();
      expect(screen.getByText('The Dark Knight')).toBeInTheDocument();
    });
  });

  it('should handle suggestion click', async () => {
    const mockSuggestions = ['Inception', 'Interstellar'];
    apiService.getAutocompleteSuggestions.mockResolvedValue(mockSuggestions);

    render(
      <AutocompleteInput
        field="title"
        value="Inception"
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    await waitFor(() => {
      const suggestion = screen.getByText('Interstellar');
      fireEvent.click(suggestion);
    });

    expect(mockOnChange).toHaveBeenCalledWith({ target: { value: 'Interstellar' } });
  });

  it('should handle keyboard navigation', async () => {
    const mockSuggestions = ['Inception', 'Interstellar', 'The Dark Knight'];
    apiService.getAutocompleteSuggestions.mockResolvedValue(mockSuggestions);

    render(
      <AutocompleteInput
        field="title"
        value="Inception"
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    const input = screen.getByPlaceholderText('Enter movie title');

    await waitFor(() => {
      expect(screen.getByText('Inception')).toBeInTheDocument();
    });

    // Test arrow down
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    expect(screen.getByText('Inception')).toHaveClass('highlighted');

    // Test enter key with highlighted suggestion
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(mockOnChange).toHaveBeenCalledWith({ target: { value: 'Inception' } });
  });

  it('should render select field when options are provided', () => {
    const options = ['Blu-ray', 'DVD', 'Digital'];
    
    render(
      <AutocompleteInput
        field="format"
        value="Blu-ray"
        onChange={mockOnChange}
        placeholder="Select format"
        options={options}
      />
    );

    const select = screen.getByDisplayValue('Blu-ray');
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
  });

  it('should show loading state while fetching suggestions', async () => {
    // Create a promise that we can control
    let resolvePromise;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    apiService.getAutocompleteSuggestions.mockReturnValue(promise);

    render(
      <AutocompleteInput
        field="title"
        value=""
        onChange={mockOnChange}
        placeholder="Enter movie title"
      />
    );

    const input = screen.getByPlaceholderText('Enter movie title');
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Inception' } });
    });

    // Should show loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    // Resolve the promise
    resolvePromise(['Inception']);
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });
});
