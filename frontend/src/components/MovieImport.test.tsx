import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieImport from './MovieImport';

/**
 * The component picks a file and hands it to the caller; it does not talk to
 * the API itself, which is why there is no service mock here any more.
 */

const csv = (name = 'movies.csv') =>
  new File(['title,format\nHeat,DVD'], name, { type: 'text/csv' });

const fileInput = () => document.getElementById('csv-file') as HTMLInputElement;

const select = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });

describe('MovieImport', () => {
  const onFileUpload = vi.fn();
  const onError = vi.fn();

  const renderImport = () =>
    render(<MovieImport onFileUpload={onFileUpload} onError={onError} />);

  beforeEach(() => {
    vi.clearAllMocks();
    onFileUpload.mockResolvedValue(undefined);
  });

  it('renders the import form', () => {
    renderImport();

    expect(screen.getByText('Import Movies from CSV')).toBeInTheDocument();
    expect(screen.getByText(/Upload a CSV file to import multiple movies at once/)).toBeInTheDocument();
    expect(screen.getByText('Start Import')).toBeInTheDocument();
  });

  it('shows file requirements', () => {
    renderImport();

    expect(screen.getByText('CSV Format Requirements')).toBeInTheDocument();
    expect(screen.getByText('Required columns:')).toBeInTheDocument();
    expect(screen.getByText('Optional columns:')).toBeInTheDocument();
  });

  it('accepts only CSV files from the picker', () => {
    renderImport();

    expect(fileInput()).toHaveAttribute('accept', '.csv');
  });

  it('handles file selection', () => {
    renderImport();

    select(csv());

    expect(screen.getByText('movies.csv')).toBeInTheDocument();
  });

  it('handles file removal', () => {
    renderImport();
    select(csv());

    fireEvent.click(screen.getByText('✕'));

    expect(screen.queryByText('movies.csv')).not.toBeInTheDocument();
    expect(screen.getByText('Click to select')).toBeInTheDocument();
  });

  it('cannot start an import before a file is chosen', () => {
    renderImport();

    expect(screen.getByText('Start Import')).toBeDisabled();

    select(csv());

    expect(screen.getByText('Start Import')).toBeEnabled();
  });

  it('hands the chosen file to the caller', async () => {
    renderImport();
    const file = csv();
    select(file);

    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(onFileUpload).toHaveBeenCalledWith(file));
  });

  it('validates CSV file type', async () => {
    renderImport();
    // The picker filters by extension, but a drop does not.
    const notCsv = new File(['nope'], 'movies.txt', { type: 'text/plain' });

    fireEvent.drop(document.querySelector('.file-drop-zone')!, {
      dataTransfer: { files: [notCsv] }
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Please select a CSV file'));
  });

  it('shows loading state during upload', async () => {
    renderImport();
    let release: () => void = () => {};
    onFileUpload.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    select(csv());

    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(screen.getByText('Uploading...')).toBeInTheDocument());
    expect(screen.getByText('Uploading...')).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByText('Start Import')).toBeInTheDocument());
  });

  it('handles import error', async () => {
    renderImport();
    onFileUpload.mockRejectedValue(new Error('Import failed'));
    select(csv());

    fireEvent.click(screen.getByText('Start Import'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Import failed'));
  });
});
