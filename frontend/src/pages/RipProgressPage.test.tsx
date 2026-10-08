import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RipProgressPage from './RipProgressPage';
import musicService, { type RipStatus } from '../services/musicService';

vi.mock('../services/musicService', () => ({
  default: {
    getRipStatus: vi.fn(),
    syncRipStatus: vi.fn(),
    getAlbumById: vi.fn(),
    deleteAlbum: vi.fn(),
    setDigitalWished: vi.fn(),
    getImageUrl: (path: string | null) => path,
    navidromeCoverUrl: (id: string) => `/api/music/navidrome-cover/${id}`,
  },
}));

vi.mock('../components/MusicDetailCard', () => ({
  default: ({ cd, onClose }: { cd: { title: string }; onClose: () => void }) => (
    <div role="dialog">
      {cd.title}
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const STATUS: RipStatus = {
  configured: true,
  counts: { none: 1, lossy: 0, lossless: 0 },
  albums: [{
    id: 7, title: 'Mezzanine', artist: ['Massive Attack'], cover: null, musicbrainzReleaseId: null,
    state: 'none', formats: [], matches: [],
  }],
  digital: [
    { navidromeId: 'nd-18', name: '18', artist: 'Moby', songCount: 18, formats: ['MP3'], wishAlbumId: 42 },
    { navidromeId: 'nd-play', name: 'Play', artist: 'Moby', songCount: 18, formats: ['MP3'], wishAlbumId: null },
  ],
};

beforeEach(() => {
  vi.mocked(musicService.getRipStatus).mockResolvedValue(STATUS);
  vi.mocked(musicService.syncRipStatus).mockResolvedValue({ editions: [], status: STATUS });
});

describe('RipProgressPage', () => {
  it('ouvre la boîte de détail du CD quand on clique sa ligne', async () => {
    vi.mocked(musicService.getAlbumById).mockResolvedValue({ id: 7, title: 'Mezzanine (detail)' });
    render(<RipProgressPage />);

    fireEvent.click(await screen.findByText('Mezzanine'));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Mezzanine (detail)');
    expect(musicService.getAlbumById).toHaveBeenCalledWith(7);
  });

  it('liste les albums seulement en digital, dit lesquels sont dans la wishlist et les y met', async () => {
    vi.mocked(musicService.setDigitalWished).mockResolvedValue({ ...STATUS.digital![1], wishAlbumId: 99 });
    render(<RipProgressPage />);

    fireEvent.click(await screen.findByRole('tab', { name: /Digital only/ }));

    expect(screen.getByText('Play')).toBeInTheDocument();
    expect(screen.queryByText('Mezzanine')).not.toBeInTheDocument();
    expect(screen.getAllByText('In wishlist')).toHaveLength(1);

    const toggle = screen.getAllByRole('checkbox', { name: 'Wishlist' })[1];
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getAllByText('In wishlist')).toHaveLength(2));
    expect(musicService.setDigitalWished).toHaveBeenCalledWith('nd-play', true);
  });

  it('retire de la wishlist un album qui y est', async () => {
    vi.mocked(musicService.setDigitalWished).mockResolvedValue({ ...STATUS.digital![0], wishAlbumId: null });
    render(<RipProgressPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Digital only/ }));

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Wishlist' })[0]);

    await waitFor(() => expect(screen.queryByText('In wishlist')).not.toBeInTheDocument());
    expect(musicService.setDigitalWished).toHaveBeenCalledWith('nd-18', false);
  });
});
