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
        <button onClick={() => onConfirm(new File(['x'], 'confirmed.jpg', { type: 'image/jpeg' }))}>
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
    // Already-straightened pixels, so no second argument to interpret.
    const [, photo] = (musicService.uploadBackCover as any).mock.calls[0];
    expect(photo.name).toBe('confirmed.jpg');
  });

  it('says so when the stored cover cannot be read', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });
    renderForm();

    fireEvent.click(screen.getByTestId('reframe-front'));

    await waitFor(() => expect(screen.getByText(/could not open that cover/i)).toBeInTheDocument());
    expect(screen.queryByTestId('crop-dialog')).not.toBeInTheDocument();
  });
});

describe('MusicForm — editing a track', () => {
  const credited = {
    ...album,
    discs: [{
      number: 1,
      tracks: [{
        no: 1, title: 'Voiles', durationSec: 176, isrc: 'CHA000300002', musicbrainzRecordingId: 'rec-2',
        work: 'Préludes, Book 1', artist: [], composers: ['Claude Debussy'],
        performers: [{ name: 'Ruth Schmid-Gagnebin', role: 'piano' }],
      }],
    }],
  };

  it('edits the credits and sends every field of the track back', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MusicForm cd={credited} onSave={onSave} onCancel={vi.fn()} />);

    expect(screen.getByText('Claude Debussy — Ruth Schmid-Gagnebin (piano)')).toBeInTheDocument();
    const row = screen.getByText('Voiles').closest('tr')!;
    fireEvent.click(row.querySelector('.btn-outline-primary')!);

    expect(screen.getByDisplayValue('Préludes, Book 1')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Claude Debussy'), { target: { value: 'Claude Debussy; Someone Else' } });
    fireEvent.change(screen.getByDisplayValue('piano'), { target: { value: 'piano (Steinway)' } });
    fireEvent.click(screen.getByRole('button', { name: /Add$/ }));
    fireEvent.change(screen.getAllByLabelText('Performer name')[1], { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Album' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [track] = onSave.mock.calls[0][0].discs[0].tracks;
    expect(track).toMatchObject({
      title: 'Voiles',
      durationSec: 176,
      isrc: 'CHA000300002',
      musicbrainzRecordingId: 'rec-2',
      work: 'Préludes, Book 1',
      composers: ['Claude Debussy', 'Someone Else'],
      // The empty row added and left blank is dropped.
      performers: [{ name: 'Ruth Schmid-Gagnebin', role: 'piano (Steinway)' }],
    });
  });
});

