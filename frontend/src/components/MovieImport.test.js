import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieImport from './MovieImport';
import apiService from '../services/api';

// Mock the API service
jest.mock('../services/api');

describe('MovieImport', () => {
  const mockOnImportStart = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the import form', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    expect(screen.getByText('Import Movies from CSV')).toBeInTheDocument();
    expect(screen.getByText('Upload a CSV file to import multiple movies at once.')).toBeInTheDocument();
    expect(screen.getByText('Start Import')).toBeInTheDocument();
  });

  it('shows file requirements', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    expect(screen.getByText('CSV Format Requirements')).toBeInTheDocument();
    expect(screen.getByText('Required columns:')).toBeInTheDocument();
    expect(screen.getByText('Optional columns:')).toBeInTheDocument();
  });

  it('handles file selection', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(screen.getByText('test.csv')).toBeInTheDocument();
    expect(screen.getByText('Start Import')).not.toBeDisabled();
  });

  it('handles file removal', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('test.csv')).toBeInTheDocument();
    
    const removeButton = screen.getByText('✕');
    fireEvent.click(removeButton);
    
    expect(screen.queryByText('test.csv')).not.toBeInTheDocument();
    expect(screen.getByText('Start Import')).toBeDisabled();
  });

  it('validates CSV file type', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(mockOnError).toHaveBeenCalledWith('Please select a CSV file');
  });

  it('handles successful import', async () => {
    apiService.importCsv.mockResolvedValue({ importId: 'test-import-id' });
    
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    
    const submitButton = screen.getByText('Start Import');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(apiService.importCsv).toHaveBeenCalledWith(file);
      expect(mockOnImportStart).toHaveBeenCalledWith('test-import-id');
    });
  });

  it('handles import error', async () => {
    apiService.importCsv.mockRejectedValue(new Error('Import failed'));
    
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    
    const submitButton = screen.getByText('Start Import');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith('Import failed');
    });
  });

  it('shows loading state during upload', async () => {
    apiService.importCsv.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/click to select/i);
    
    fireEvent.change(input, { target: { files: [file] } });
    
    const submitButton = screen.getByText('Start Import');
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it('prevents submission without file', () => {
    render(<MovieImport onImportStart={mockOnImportStart} onError={mockOnError} />);
    
    const submitButton = screen.getByText('Start Import');
    expect(submitButton).toBeDisabled();
    
    fireEvent.click(submitButton);
    expect(mockOnError).toHaveBeenCalledWith('Please select a CSV file');
  });
});
