import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WishListPage from './WishListPage';
import apiService from '../services/api';
import musicService from '../services/musicService';
import bookService from '../services/bookService';

vi.mock('../services/api', () => ({
  default: { getMoviesByStatus: vi.fn(), setMovieSpokenFor: vi.fn() },
}));
vi.mock('../services/musicService', () => ({
  default: { getAlbumsByStatus: vi.fn(), setAlbumSpokenFor: vi.fn(), getImageUrl: (p: string) => p },
}));
vi.mock('../services/bookService', () => ({
  default: { getBooksByStatus: vi.fn(), setBookSpokenFor: vi.fn(), getImageUrl: (p: string) => p },
}));

beforeEach(() => {
  vi.mocked(apiService.getMoviesByStatus).mockReset().mockResolvedValue([]);
  vi.mocked(musicService.getAlbumsByStatus).mockReset().mockResolvedValue([
    { id: 407, title: 'Back in Black', artist: ['AC/DC'], spokenFor: false },
    { id: 190, title: "L'Homme fleur", artist: ['Blankass'], spokenFor: true },
  ]);
  vi.mocked(bookService.getBooksByStatus).mockReset().mockResolvedValue([]);
  vi.mocked(musicService.setAlbumSpokenFor).mockReset().mockResolvedValue({});
});

const rowOf = async (title: string) => (await screen.findByText(title)).closest('tr') as HTMLElement;

describe('WishListPage, spoken for', () => {
  it('met en retrait un souhait déjà réglé, avec son étiquette', async () => {
    render(<MemoryRouter><WishListPage /></MemoryRouter>);
    const row = await rowOf("L'Homme fleur");
    expect(row).toHaveClass('spoken-for');
    expect(within(row).getByText('Spoken for')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'No longer spoken for' })).toHaveAttribute('aria-pressed', 'true');
    expect(await rowOf('Back in Black')).not.toHaveClass('spoken-for');
  });

  it('range les boutons : Ricardo, Spoken for, $, puis la corbeille', async () => {
    render(<MemoryRouter><WishListPage /></MemoryRouter>);
    const row = await rowOf('Back in Black');
    expect(within(row).getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['Search on Ricardo', 'Mark as spoken for', 'I bought the CD', 'Delete album']);
  });

  it('bascule d’un clic, sans ouvrir la fiche', async () => {
    render(<MemoryRouter><WishListPage /></MemoryRouter>);
    const row = await rowOf('Back in Black');
    fireEvent.click(within(row).getByRole('button', { name: 'Mark as spoken for' }));
    expect(musicService.setAlbumSpokenFor).toHaveBeenCalledWith(407, true);
    await waitFor(() => expect(row).toHaveClass('spoken-for'));
  });

  it('revient en arrière quand l’enregistrement échoue', async () => {
    vi.mocked(musicService.setAlbumSpokenFor).mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><WishListPage /></MemoryRouter>);
    const row = await rowOf('Back in Black');
    fireEvent.click(within(row).getByRole('button', { name: 'Mark as spoken for' }));
    await waitFor(() => expect(row).not.toHaveClass('spoken-for'));
    expect(await screen.findByText(/Failed to mark album as spoken for/)).toBeInTheDocument();
  });
});
