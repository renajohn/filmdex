import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoverFinder from './CoverFinder';

vi.mock('../services/musicService', () => ({
  default: {
    getCoverCandidates: vi.fn(),
    useCoverCandidate: vi.fn(() => Promise.resolve('/api/images/cd/album_405_front_1.jpg')),
  },
}));

import musicService from '../services/musicService';

const candidate = (over: Record<string, unknown> = {}) => ({
  url: 'https://coverartarchive.org/release/cd/front-1200.jpg',
  thumbnail: 'https://coverartarchive.org/release/cd/front-500.jpg',
  source: 'Other edition', country: 'DE', year: '1991', catalogNumber: '811 746-2',
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('CoverFinder', () => {
  it('lists the covers found and keeps the one chosen', async () => {
    vi.mocked(musicService.getCoverCandidates).mockResolvedValue([
      candidate(),
      candidate({ url: 'https://i.discogs.com/front.jpg', thumbnail: 'https://i.discogs.com/front.jpg', source: 'Discogs', catalogNumber: 'DMCL 1746' }),
    ]);
    const onFound = vi.fn();
    render(<CoverFinder albumId={405} side="front" title="Second Helping" artist={['Lynyrd Skynyrd']} onClose={vi.fn()} onFound={onFound} />);

    expect(await screen.findByText('2 covers found:')).toBeInTheDocument();
    expect(musicService.getCoverCandidates).toHaveBeenCalledWith(405, 'front');
    expect(screen.getByText('DMCL 1746')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Discogs'));
    fireEvent.click(screen.getByRole('button', { name: 'Use this cover' }));

    await waitFor(() => expect(onFound).toHaveBeenCalledWith('/api/images/cd/album_405_front_1.jpg'));
    expect(musicService.useCoverCandidate).toHaveBeenCalledWith(405, 'front', 'https://i.discogs.com/front.jpg');
  });

  it('says so when nothing is found, and cannot be confirmed', async () => {
    vi.mocked(musicService.getCoverCandidates).mockResolvedValue([]);
    render(<CoverFinder albumId={405} side="back" title="Second Helping" artist="Lynyrd Skynyrd" onClose={vi.fn()} onFound={vi.fn()} />);

    expect(await screen.findByText(/has a back cover for this album/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this back cover' })).toBeDisabled();
  });

  it('tells why the cover could not be kept', async () => {
    vi.mocked(musicService.getCoverCandidates).mockResolvedValue([candidate()]);
    vi.mocked(musicService.useCoverCandidate).mockRejectedValueOnce(new Error('The image could not be downloaded'));
    const onFound = vi.fn();
    render(<CoverFinder albumId={405} side="front" title="Second Helping" artist="Lynyrd Skynyrd" onClose={vi.fn()} onFound={onFound} />);

    fireEvent.click(await screen.findByText('Other edition'));
    fireEvent.click(screen.getByRole('button', { name: 'Use this cover' }));

    expect(await screen.findByText('The image could not be downloaded')).toBeInTheDocument();
    expect(onFound).not.toHaveBeenCalled();
  });
});
