import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MusicForm from './MusicForm';

/**
 * The cover field of an album that already exists. Picking a new photo goes
 * through the straightening step; so does adjusting a cover already stored,
 * which is the only way to fix framing without shooting the sleeve again.
 */

vi.mock('../services/musicService', () => ({
  default: {
    uploadCover: vi.fn().mockResolvedValue({ coverPath: '/api/images/cd/custom/new.jpg' }),
    uploadBackCover: vi.fn().mockResolvedValue({ backCoverPath: '/api/images/cd/custom/newb.jpg' }),
    getImageUrl: (p: string | null | undefined) => (p ? `https://host${p}` : ''),
    getAutocompleteSuggestions: vi.fn().mockResolvedValue([]),
    addAlbum: vi.fn(),
    updateAlbum: vi.fn()
  }
}));

vi.mock('./CoverCropDialog', () => ({
  default: ({ show, slot, onConfirm }: any) =>
    show ? (
      <div data-testid="crop-dialog" data-slot={slot}>
        <button
          onClick={() =>
            onConfirm(
              { topLeft: [0, 0], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 1] },
              new File(['x'], 'confirmed.jpg', { type: 'image/jpeg' })
            )
          }
        >
          confirm crop
        </button>
      </div>
    ) : null
}));

import musicService from '../services/musicService';

const album = {
  id: 7,
  title: 'Stored Album',
  artist: ['Someone'],
  cover: '/api/images/cd/custom/cd_7.jpg',
  backCover: '/api/images/cd/custom/cd_7_back.jpg',
  discs: []
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['x'], { type: 'image/jpeg' })
  }) as unknown as typeof fetch;
});

const renderForm = () =>
  render(<MusicForm cd={album} onSave={vi.fn()} onCancel={vi.fn()} />);

describe('MusicForm — adjusting a cover already stored', () => {
  it('offers to adjust the framing of each stored cover', () => {
    renderForm();

    expect(screen.getByTestId('reframe-front')).toBeInTheDocument();
    expect(screen.getByTestId('reframe-back')).toBeInTheDocument();
  });

  it('opens the straightening step on the stored image', async () => {
    renderForm();

    fireEvent.click(screen.getByTestId('reframe-front'));

    await waitFor(() => expect(screen.getByTestId('crop-dialog')).toBeInTheDocument());
    // Fetched from where it is stored, rather than asking for a new photo.
    expect(global.fetch).toHaveBeenCalledWith('https://host/api/images/cd/custom/cd_7.jpg');
  });

  it('does not open the file picker as well', async () => {
    // The tile behind the button opens the OS picker; the click must not reach it.
    renderForm();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const picker = vi.spyOn(input, 'click');

    fireEvent.click(screen.getByTestId('reframe-front'));

    await waitFor(() => expect(screen.getByTestId('crop-dialog')).toBeInTheDocument());
    expect(picker).not.toHaveBeenCalled();
  });

  it('sends the adjusted framing back to the cover it came from', async () => {
    renderForm();

    fireEvent.click(screen.getByTestId('reframe-back'));
    await waitFor(() => expect(screen.getByTestId('crop-dialog')).toHaveAttribute('data-slot', 'back'));
    fireEvent.click(screen.getByText('confirm crop'));

    await waitFor(() => expect(musicService.uploadBackCover).toHaveBeenCalled());
    // The front must not be touched by adjusting the back.
    expect(musicService.uploadCover).not.toHaveBeenCalled();
    const [, , corners] = (musicService.uploadBackCover as any).mock.calls[0];
    expect(corners.bottomRight).toEqual([1, 1]);
  });

  it('says so when the stored cover cannot be read', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });
    renderForm();

    fireEvent.click(screen.getByTestId('reframe-front'));

    await waitFor(() => expect(screen.getByText(/could not open that cover/i)).toBeInTheDocument());
    expect(screen.queryByTestId('crop-dialog')).not.toBeInTheDocument();
  });
});
