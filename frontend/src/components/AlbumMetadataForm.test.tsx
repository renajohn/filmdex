import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AlbumMetadataForm from './AlbumMetadataForm';

vi.mock('../services/musicService', () => ({
  default: {
    getCoverArt: vi.fn().mockResolvedValue(null),
    addAlbumFromMusicBrainz: vi.fn().mockResolvedValue({ id: 42 }),
    getAlbumById: vi.fn().mockResolvedValue({ id: 42 }),
    uploadCover: vi.fn(),
    uploadBackCover: vi.fn()
  }
}));

import musicService from '../services/musicService';

const releaseA = {
  title: 'Kind of Blue',
  artist: ['Miles Davis'],
  musicbrainzReleaseId: 'mbid-a'
};

const releaseB = {
  title: 'Spirit of Eden',
  artist: ['Talk Talk'],
  musicbrainzReleaseId: 'mbid-b'
};

const renderForm = (release: any, onHide = vi.fn()) =>
  render(
    <AlbumMetadataForm show={true} onHide={onHide} release={release} allReleasesInGroup={[release]} />
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlbumMetadataForm — ownership payload', () => {
  it('sends a condition code the database accepts', async () => {
    renderForm(releaseA);

    userEvent.selectOptions(screen.getByLabelText('Condition'), 'NM');
    userEvent.click(screen.getByRole('button', { name: 'Add Album' }));

    await waitFor(() => expect(musicService.addAlbumFromMusicBrainz).toHaveBeenCalled());

    const [, payload] = (musicService.addAlbumFromMusicBrainz as any).mock.calls[0];
    expect(payload.condition).toBe('NM');
  });

  it('offers only the condition codes the albums table allows', () => {
    renderForm(releaseA);

    const values = Array.from(
      (screen.getByLabelText('Condition') as HTMLSelectElement).options
    )
      .map((option) => option.value)
      .filter((value) => value !== '');

    expect(values).toEqual(['M', 'NM', 'VG+', 'VG']);
  });
});

describe('AlbumMetadataForm — state between two consecutive adds', () => {
  it('clears the ownership fields after a successful add', async () => {
    const { rerender } = renderForm(releaseA);

    userEvent.type(screen.getByLabelText('Price (CHF)'), '12.5');
    userEvent.selectOptions(screen.getByLabelText('Condition'), 'NM');
    userEvent.click(screen.getByRole('button', { name: 'Add Album' }));

    await waitFor(() => expect(musicService.addAlbumFromMusicBrainz).toHaveBeenCalled());

    // The dialog stays mounted in MusicDex, so the next release reuses this instance.
    rerender(
      <AlbumMetadataForm
        show={true}
        onHide={vi.fn()}
        release={releaseB}
        allReleasesInGroup={[releaseB]}
      />
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Price (CHF)') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Condition') as HTMLSelectElement).value).toBe('');
    });
  });
});

describe('AlbumMetadataForm — failure keeps the context', () => {
  it('keeps the dialog open and shows the error when the add fails', async () => {
    (musicService.addAlbumFromMusicBrainz as any).mockRejectedValueOnce(new Error('Network down'));
    const onHide = vi.fn();
    const onAddStart = vi.fn();

    render(
      <AlbumMetadataForm
        show={true}
        onHide={onHide}
        release={releaseA}
        allReleasesInGroup={[releaseA]}
        onAddStart={onAddStart}
      />
    );

    userEvent.click(screen.getByRole('button', { name: 'Add Album' }));

    await waitFor(() => expect(screen.getByText(/Network down/)).toBeInTheDocument());
    expect(onHide).not.toHaveBeenCalled();
    expect(onAddStart).not.toHaveBeenCalled();
  });

  it('closes the dialog once the add succeeded', async () => {
    const onHide = vi.fn();

    render(
      <AlbumMetadataForm
        show={true}
        onHide={onHide}
        release={releaseA}
        allReleasesInGroup={[releaseA]}
      />
    );

    userEvent.click(screen.getByRole('button', { name: 'Add Album' }));

    await waitFor(() => expect(onHide).toHaveBeenCalled());
  });
});
