import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AlbumStory from './AlbumStory';
import musicService from '../services/musicService';

vi.mock('../services/musicService', () => ({
  default: { getAlbumStory: vi.fn() },
}));

const FR = { lang: 'fr', title: 'Dancetaria', url: 'https://fr.wikipedia.org/wiki/Dancetaria' };
const EN = { lang: 'en', title: 'Dancetaria (album)', url: 'https://en.wikipedia.org/wiki/Dancetaria_(album)' };

describe('AlbumStory', () => {
  it('raconte l’article le plus complet et lie aussi l’autre langue', async () => {
    vi.mocked(musicService.getAlbumStory).mockResolvedValue({
      albumId: 127, found: true, reason: null, ...FR, intro: 'Dancetaria est le septième album d’Indochine.',
      sections: [], works: [], links: [FR, EN], fetchedAt: '2026-10-07T12:00:00Z',
    });

    render(<AlbumStory albumId={127} />);

    expect(await screen.findByText('Dancetaria est le septième album d’Indochine.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wikipedia \(fr\): Dancetaria/ })).toHaveAttribute('href', FR.url);
    expect(screen.getByRole('link', { name: /also in English/ })).toHaveAttribute('href', EN.url);
  });

  it('ne lie qu’une fois quand une seule langue a un article', async () => {
    vi.mocked(musicService.getAlbumStory).mockResolvedValue({
      albumId: 127, found: true, reason: null, ...EN, intro: 'An album by Indochine.',
      sections: [], works: [], links: [EN], fetchedAt: '2026-10-07T12:00:00Z',
    });

    render(<AlbumStory albumId={127} />);

    await screen.findByText('An album by Indochine.');
    expect(screen.queryByText(/also in/)).not.toBeInTheDocument();
  });
});
