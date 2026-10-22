import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookPhotoSteps from './BookPhotoSteps';
import Dialog from './shared/Dialog';
import bookService from '../services/bookService';
import { straightenIfSure } from '../utils/straightenPhoto';
import { isCameraPhoto } from '../utils/isCameraPhoto';

vi.mock('../services/bookService', () => ({ default: { readPhotos: vi.fn() } }));
vi.mock('../utils/downscaleImage', () => ({
  downscaleImage: vi.fn(async (file: File) => ({ base64: file.name, mimeType: 'image/jpeg' })),
  base64ToFile: vi.fn(() => new File(['x'], 'x.jpg')),
}));
// Pictures from the web: kept as they are, nothing to square.
vi.mock('../utils/isCameraPhoto', () => ({ isCameraPhoto: vi.fn(async () => false) }));
// A photograph from the camera: squared, the detector sure.
vi.mock('../utils/straightenPhoto', () => ({ straightenIfSure: vi.fn(async () => new File(['s'], 'squared.jpg', { type: 'image/jpeg' })) }));

const DRAFT = { title: 'Les étoiles de Noa', subtitle: null, authors: ['C. Durand'], artists: [], translators: [], series: 'Noa', seriesNumber: 2,
  publisher: 'Dupuis', isbn13: '9791034760000', description: 'Noa repart.', language: 'fr', bookType: 'graphic-novel' as const };
const BACK = { base64: 'back', mimeType: 'image/jpeg' };
const photo = (name: string) => ({ target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });

const steps = (props: Partial<React.ComponentProps<typeof BookPhotoSteps>> = {}) => {
  const handlers = { onDraft: vi.fn(), onManual: vi.fn() };
  render(<Dialog show onClose={() => undefined} title="Its page"><BookPhotoSteps reason="photo" wide={false} {...handlers} {...props} /></Dialog>);
  return handlers;
};

beforeEach(() => {
  vi.mocked(straightenIfSure).mockClear();
  vi.mocked(isCameraPhoto).mockClear();
  vi.mocked(bookService.readPhotos).mockReset().mockResolvedValue({ draft: DRAFT, sources: { front: true, back: true }, truncated: false });
});

describe('its page made from its photos, on a phone', () => {
  it('after a back that found nothing: its back done, its cover asked, then read without a button', async () => {
    const { onDraft } = steps({ photos: { back: BACK }, isbn: '9791034760000' });
    expect(screen.getByText(/ISBN 9791034760000 is unknown/)).toBeInTheDocument();
    expect(screen.getByText('its ISBN and blurb read')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('steps-front-input'), photo('cover.jpg'));

    await waitFor(() => expect(bookService.readPhotos).toHaveBeenCalledWith({ back: BACK, front: { base64: 'squared.jpg', mimeType: 'image/jpeg' } }, { complete: true }));
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(DRAFT, expect.objectContaining({ back: BACK })));
  });

  it('without its cover, reads its back all the same', async () => {
    const { onDraft } = steps({ photos: { back: BACK } });
    fireEvent.click(screen.getByRole('button', { name: /No cover: fill in the rest from its back/ }));
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(DRAFT, { back: BACK }));
  });

  it('after words that found nothing: its cover first, its back optional, skipped', async () => {
    const { onDraft } = steps({ reason: 'search' });
    expect(screen.getByRole('button', { name: /Photograph its cover/ })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('steps-front-input'), photo('cover.jpg'));
    fireEvent.click(await screen.findByRole('button', { name: /Skip: its cover is enough/ }));
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(bookService.readPhotos).toHaveBeenCalledWith({ front: { base64: 'squared.jpg', mimeType: 'image/jpeg' } }, { complete: true });
  });

  it('squares a cover handed over by the finder, and offers to type it all by hand', async () => {
    const { onManual } = steps({ reason: 'search', files: { front: new File(['x'], 'given.jpg', { type: 'image/jpeg' }) } });
    expect(await screen.findByRole('button', { name: /Photograph its back/ })).toBeInTheDocument();
    expect(screen.getByAltText('Its cover')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip: its cover is enough/ }));
    await waitFor(() => expect(bookService.readPhotos).toHaveBeenCalled());
    expect(onManual).not.toHaveBeenCalled();
  });

  it('squares a photo from the camera even without its EXIF, which Safari strips', async () => {
    steps({ photos: { back: BACK } });
    fireEvent.change(screen.getByTestId('steps-front-input'), photo('IMG_0001.jpg'));
    await waitFor(() => expect(straightenIfSure).toHaveBeenCalledWith(expect.any(File), 'book'));
    expect(isCameraPhoto).not.toHaveBeenCalled();
  });

  it('says what failed and does not read again by itself', async () => {
    vi.mocked(bookService.readPhotos).mockRejectedValue(new Error('Cover scan service is not available'));
    steps({ photos: { back: BACK } });
    fireEvent.change(screen.getByTestId('steps-front-input'), photo('cover.jpg'));
    expect(await screen.findByText('Cover scan service is not available')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(bookService.readPhotos).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Read them again' })).toBeInTheDocument();
  });
});

describe('its page made from its images, on a laptop', () => {
  it('two zones to drop them on, read on asking', async () => {
    const { onDraft, onManual } = steps({ reason: 'search', wide: true });
    expect(screen.getByRole('button', { name: 'Read them' })).toBeDisabled();
    fireEvent.drop(screen.getByText('Its cover').closest('button')!, { dataTransfer: { files: [new File(['x'], 'cover.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Read them' })).not.toBeDisabled());
    expect(bookService.readPhotos).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read them' }));
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Type it by hand' }));
    expect(onManual).toHaveBeenCalled();
  });
});
