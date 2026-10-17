import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AlbumPlayButton from './AlbumPlayButton';

const state = { album: null as null | { id: number }, playing: false };
vi.mock('../../services/player', () => ({
  player: { toggle: vi.fn() },
  usePlayer: (select: (s: typeof state) => unknown) => select(state),
}));
vi.mock('../../utils/playAlbum', () => ({ playAlbumById: vi.fn() }));

import { player } from '../../services/player';
import { playAlbumById } from '../../utils/playAlbum';

beforeEach(() => {
  vi.clearAllMocks();
  state.album = null;
  state.playing = false;
});

describe('AlbumPlayButton', () => {
  it('plays an album that is not playing, from the start', async () => {
    vi.mocked(playAlbumById).mockResolvedValue(true);
    const onUnripped = vi.fn();
    render(<AlbumPlayButton albumId={5} title="Blue" offerPlay onUnripped={onUnripped} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Blue' }));
    await waitFor(() => expect(playAlbumById).toHaveBeenCalledWith(5));
    expect(onUnripped).not.toHaveBeenCalled();
  });

  it('opens something else for an album with no rip', async () => {
    vi.mocked(playAlbumById).mockResolvedValue(false);
    const onUnripped = vi.fn();
    render(<AlbumPlayButton albumId={5} title="Blue" offerPlay onUnripped={onUnripped} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Blue' }));
    await waitFor(() => expect(onUnripped).toHaveBeenCalled());
  });

  it('shows only on the album playing when ▶ is not offered, and pauses it', () => {
    const { rerender } = render(<AlbumPlayButton albumId={5} title="Blue" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    state.album = { id: 5 };
    state.playing = true;
    rerender(<AlbumPlayButton albumId={5} title="Blue" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause Blue' }));
    expect(player.toggle).toHaveBeenCalled();
    expect(playAlbumById).not.toHaveBeenCalled();
  });
});
