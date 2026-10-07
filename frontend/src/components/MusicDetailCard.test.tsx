import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MusicDetailCard from './MusicDetailCard';

vi.mock('../services/musicService', () => ({
  default: {
    getListenNextAlbums: vi.fn(() => Promise.resolve([])),
    getNavidromeTracks: vi.fn(() => Promise.resolve({ configured: true, found: false, tracks: [] })),
    getAlbumStory: vi.fn(() => Promise.resolve({ found: false, reason: 'no_musicbrainz' })),
    getImageUrl: vi.fn((path: string | null | undefined) => (path ? `/images/${path}` : null)),
    toggleListenNext: vi.fn(() => Promise.resolve({})),
    openAppleMusic: vi.fn(),
    getAppleMusicUrl: vi.fn(() => Promise.resolve({ url: 'https://music.apple.com/x' })),
    syncAlbumRating: vi.fn(() => Promise.resolve({ userRating: null })),
    setAlbumRating: vi.fn((_id: number, rating: number) => Promise.resolve({ userRating: rating || null, navidrome: 'synced' })),
    getAlbumNotes: vi.fn(() => Promise.resolve([])),
    refreshFromMusicBrainz: vi.fn(() => Promise.resolve({})),
    getAlbumById: vi.fn(() => Promise.resolve({ rating: 4.15 })),
  },
}));

import musicService from '../services/musicService';

const ripped = {
  configured: true, found: true, album: { id: 'nd-1', name: 'Abbey Road', url: 'https://music.lab/album/nd-1' },
  tracks: [1, 2, 3].map(track => ({
    discNumber: 1, track, title: `T${track}`, durationSec: 180, suffix: 'flac', bitRate: 900,
    bitDepth: 16, samplingRate: 44100, channelCount: 2, size: 20_000_000, path: `${track}.flac`,
  })),
};

const cd = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Abbey Road',
  artist: ['The Beatles'],
  cover: 'covers/1.jpg',
  releaseYear: 2009,
  country: 'GB',
  format: 'CD',
  releaseGroupFirstReleaseDate: '1969-09-26',
  labels: ['Apple Records'],
  catalogNumber: '0946 3 82468 2 4',
  barcode: '094638246824',
  genres: ['Rock', 'Pop'],
  musicbrainzReleaseId: 'rel-1',
  urls: { discogs: 'https://www.discogs.com/release/1' },
  discs: [{ number: 1, tracks: [1, 2, 3].map(no => ({ no, title: `Track ${no}`, durationSec: 1560 })) }],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (musicService.getNavidromeTracks as any).mockResolvedValue({ configured: true, found: false, tracks: [] });
});

describe('MusicDetailCard', () => {
  it('shows the edition in one grid: who, what, when, label, codes and links', async () => {
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    expect(screen.getByRole('button', { name: 'The Beatles' })).toBeInTheDocument();
    expect(screen.getByText('CD · 3 tracks · 1 h 18 min')).toBeInTheDocument();
    expect(screen.getByText('2009 · GB')).toBeInTheDocument();
    expect(screen.getByText('First release')).toBeInTheDocument();
    expect(screen.getByText('1969-09-26')).toBeInTheDocument();
    expect(screen.getByText('Apple Records')).toBeInTheDocument();
    expect(screen.queryByText('094638246824')).not.toBeInTheDocument();
    expect(screen.getByText(/^added /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MusicBrainz' })).toHaveAttribute('href', 'https://musicbrainz.org/release/rel-1');
    expect(screen.getByRole('link', { name: 'Discogs' })).toHaveAttribute('href', 'https://www.discogs.com/release/1');
    expect(screen.getByRole('img', { name: 'Abbey Road front cover' })).toHaveAttribute('src', '/images/covers/1.jpg');

    await waitFor(() => expect(screen.getByText('Not ripped yet.')).toBeInTheDocument());
  });

  it('folds the identifiers away until asked', () => {
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByText('0946 3 82468 2 4')).toBeInTheDocument();
    expect(screen.getByText('094638246824')).toBeInTheDocument();
    expect(screen.getByText('rel-1')).toBeInTheDocument();
  });

  it('leaves out what it does not know, and a first release in the same year', () => {
    render(<MusicDetailCard cd={cd({
      country: undefined, labels: [], catalogNumber: undefined, barcode: undefined, genres: [],
      releaseGroupFirstReleaseDate: '2009-09-09', musicbrainzReleaseId: null, urls: {},
    })} onClose={() => {}} onDelete={() => {}} />);

    expect(screen.getByText('2009')).toBeInTheDocument();
    expect(screen.queryByText('First release')).not.toBeInTheDocument();
    expect(screen.queryByText(/Label/)).not.toBeInTheDocument();
    expect(screen.queryByText('Barcode')).not.toBeInTheDocument();
    expect(screen.queryByText('Genres')).not.toBeInTheDocument();
    expect(screen.queryByText('Links')).not.toBeInTheDocument();
  });

  it('says how the rip stands in Navidrome and offers to listen to it', async () => {
    (musicService.getNavidromeTracks as any).mockResolvedValue(ripped);
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    await waitFor(() => expect(screen.getByText('Lossless')).toBeInTheDocument());
    expect(screen.getByText('· FLAC · 16-bit · 44.1 kHz · stereo · 3 of 3 tracks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Apple Music' })).not.toBeInTheDocument();
  });

  it('marks a lossy rip, still to be ripped again', async () => {
    (musicService.getNavidromeTracks as any).mockResolvedValue({
      ...ripped, tracks: ripped.tracks.map(file => ({ ...file, suffix: 'mp3', bitDepth: null, samplingRate: null })),
    });
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    await waitFor(() => expect(screen.getByText('Lossy')).toBeInTheDocument());
    expect(screen.getByText('Lossy')).toHaveClass('album-head-lossy');
  });

  it('falls back to Apple Music when the CD is not ripped', async () => {
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    const apple = await screen.findByRole('button', { name: 'Apple Music' });
    fireEvent.click(apple);
    await waitFor(() => expect(musicService.openAppleMusic).toHaveBeenCalledWith('https://music.apple.com/x'));
  });

  it('searches the collection from the artist and a genre, closing the card', () => {
    const onSearch = vi.fn();
    const onClose = vi.fn();
    render(<MusicDetailCard cd={cd()} onClose={onClose} onDelete={() => {}} onSearch={onSearch} />);

    fireEvent.click(screen.getByRole('button', { name: 'The Beatles' }));
    expect(onSearch).toHaveBeenCalledWith('artist:"The Beatles"');
    fireEvent.click(screen.getByRole('button', { name: 'Pop' }));
    expect(onSearch).toHaveBeenCalledWith('genre:"Pop"');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the owner\'s facts in the grid and the edit action in the footer', () => {
    const onEdit = vi.fn();
    render(<MusicDetailCard cd={cd({
      ownership: { condition: 'NM', priceChf: 12, notes: 'Bought at the flea market' },
      editionNotes: '2009 remaster', producer: ['George Martin'],
    })} onClose={() => {}} onDelete={() => {}} onEdit={onEdit} />);

    expect(screen.getByText('Near Mint · CHF 12')).toBeInTheDocument();
    expect(screen.getByText('Bought at the flea market')).toBeInTheDocument();
    expect(screen.getByText('2009 remaster')).toBeInTheDocument();
    expect(screen.getByText('George Martin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('gives the CD stars, and takes them away with a second click on the same star', async () => {
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await waitFor(() => expect(musicService.setAlbumRating).toHaveBeenCalledWith(1, 4));
    await waitFor(() => expect(screen.getByRole('button', { name: '4 stars' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await waitFor(() => expect(musicService.setAlbumRating).toHaveBeenLastCalledWith(1, 0));
  });

  it('shows the stars given in Navidrome since, as the album opens', async () => {
    vi.mocked(musicService.syncAlbumRating).mockResolvedValueOnce({ userRating: 5 });
    render(<MusicDetailCard cd={cd()} onClose={() => {}} onDelete={() => {}} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '5 stars' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('shows the MusicBrainz community rating beside the owner\'s', () => {
    render(<MusicDetailCard cd={cd({ rating: 4.25 })} onClose={() => {}} onDelete={() => {}} />);

    expect(screen.getByText('4.3', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/community/)).toBeInTheDocument();
  });

  it('rereads the edition on MusicBrainz from the loop beside its rating', async () => {
    render(<MusicDetailCard cd={cd({ rating: null })} onClose={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('No community rating')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh from MusicBrainz' }));

    await screen.findByText('4.2', { exact: false });
    expect(musicService.refreshFromMusicBrainz).toHaveBeenCalledWith(1);
  });
});
