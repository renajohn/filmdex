import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddMusicDialog from './AddMusicDialog';

// jsdom cannot decode images or rasterise a canvas, so the downscaling step is
// covered by its own test and stubbed here.
vi.mock('../utils/downscaleImage', () => ({
  downscaleImage: vi.fn().mockResolvedValue({ base64: 'c2xlZXZl', mimeType: 'image/jpeg' }),
  default: vi.fn()
}));

vi.mock('../services/musicService', () => ({
  default: {
    getCoverArt: vi.fn().mockResolvedValue(null),
    searchMusicBrainz: vi.fn().mockResolvedValue([]),
    searchByBarcode: vi.fn().mockResolvedValue([]),
    searchByCatalogNumber: vi.fn().mockResolvedValue([]),
    scanAlbumCover: vi.fn(),
    addAlbumFromMusicBrainz: vi.fn().mockResolvedValue({ id: 1 }),
    getAlbumById: vi.fn().mockResolvedValue({ id: 1 })
  }
}));

import musicService from '../services/musicService';

const release = (over: Record<string, unknown> = {}) => ({
  musicbrainzReleaseId: 'mbid-1',
  title: 'Kind of Blue',
  artist: ['Miles Davis'],
  releaseYear: 1959,
  format: 'CD',
  ...over
});

const renderDialog = (props: Record<string, unknown> = {}) =>
  render(<AddMusicDialog show={true} onHide={vi.fn()} {...props} />);

const photoFile = () =>
  new File([new Uint8Array([1, 2, 3])], 'sleeve.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  (musicService.scanAlbumCover as any).mockResolvedValue({
    llm_result: { artist: 'Miles Davis', title: 'Kind of Blue', year: 1959 },
    results: [release()],
    confidence: 'high'
  });
});

describe('AddMusicDialog — photo mode', () => {
  it('offers a photo option next to the text searches', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /^photo$/i })).toBeInTheDocument();
  });

  it('uses the rear camera for the capture input', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    expect(input).toHaveAttribute('capture', 'environment');
    expect(input).toHaveAttribute('accept', expect.stringContaining('image/'));
  });

  it('scans as soon as a photo is picked, with no extra tap', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');

    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(musicService.scanAlbumCover).toHaveBeenCalled());
  });

  it('sends base64 without the data-url prefix, plus the mime type', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(musicService.scanAlbumCover).toHaveBeenCalled());

    const [base64, mimeType] = (musicService.scanAlbumCover as any).mock.calls[0];
    expect(base64).not.toMatch(/^data:/);
    expect(mimeType).toMatch(/^image\//);
  });

  it('shows the identified release as a result', async () => {
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText('Kind of Blue')).toBeInTheDocument());
  });

  it('reports a cover it could not identify instead of staying silent', async () => {
    (musicService.scanAlbumCover as any).mockRejectedValue(new Error('Could not identify album'));
    renderDialog();

    const input = await screen.findByTestId('album-photo-input');
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText(/could not identify/i)).toBeInTheDocument());
  });

  it('lets the same photo be picked again after a failure', async () => {
    (musicService.scanAlbumCover as any).mockRejectedValueOnce(new Error('Network down'));
    renderDialog();

    const input = (await screen.findByTestId('album-photo-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [photoFile()] } });

    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument());
    // A file input keeps its value, so re-picking the same file fires no change
    // event unless the value was cleared.
    expect(input.value).toBe('');
  });
});

describe('AddMusicDialog — empty text search', () => {
  it('tells the user when a search found nothing', async () => {
    (musicService.searchMusicBrainz as any).mockResolvedValue([]);
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.type(screen.getByPlaceholderText(/album title/i), 'zzzz');
    userEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByText(/no (results|match)/i)).toBeInTheDocument());
  });
});

describe('AddMusicDialog — photo is the default path', () => {
  it('opens straight on the photo option', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /take a photo/i })).toBeInTheDocument();
  });

  it('opens the camera on the very first tap, with no mode tap in between', async () => {
    renderDialog();

    const input = screen.getByTestId('album-photo-input');
    const clickSpy = vi.spyOn(input, 'click');

    userEvent.click(screen.getByRole('button', { name: /take a photo/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it('opens the camera directly when coming back from a text search', async () => {
    renderDialog();

    const input = screen.getByTestId('album-photo-input');
    const clickSpy = vi.spyOn(input, 'click');

    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.click(screen.getByRole('button', { name: /^photo$/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  it('still lets the user fall back to typing a title', async () => {
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /album title/i }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/album title/i)).toBeInTheDocument()
    );
  });
});

describe('AddMusicDialog — text search query building', () => {
  const searchFor = (title: string, artist?: string) => {
    renderDialog();
    userEvent.click(screen.getByRole('button', { name: /album title/i }));
    userEvent.type(screen.getByPlaceholderText(/album title/i), title);
    if (artist) userEvent.type(screen.getByPlaceholderText(/artist/i), artist);
    userEvent.click(screen.getByRole('button', { name: /^search$/i }));
  };

  const lastQuery = () =>
    (musicService.searchMusicBrainz as any).mock.calls.at(-1)[0] as string;

  it('quotes a title containing a slash, so "AC/DC" does not break the query', async () => {
    searchFor('Back in Black', 'AC/DC');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('artist:"AC/DC"');
  });

  it('quotes a title containing a colon', async () => {
    searchFor('Live: 1975');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('"Live: 1975"');
  });

  it('escapes a double quote instead of producing an unbalanced query', async () => {
    searchFor('The "Chirping" Crickets');

    await waitFor(() => expect(musicService.searchMusicBrainz).toHaveBeenCalled());
    expect(lastQuery()).toContain('\\"Chirping\\"');
  });
});

describe('AddMusicDialog — barcode entry', () => {
  it('asks for a numeric keypad on the barcode field', async () => {
    renderDialog();

    userEvent.click(screen.getByRole('button', { name: /^barcode$/i }));

    const input = await screen.findByPlaceholderText(/barcode/i);
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });
});
