import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MovieFinder, { MovieBuying } from './MovieFinder';
import Dialog from './shared/Dialog';
import movieFinderService, { FinderMovie } from '../services/movieFinderService';
import apiService from '../services/api';

vi.mock('../services/movieFinderService', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/movieFinderService')>()),
  default: { search: vi.fn(), person: vi.fn(), saga: vi.fn(), addMovie: vi.fn(), addBoxSet: vi.fn(), buy: vi.fn() },
}));
vi.mock('../services/api', () => ({ default: { deleteMovie: vi.fn() } }));

const movie = (id: number, title: string, fields: Partial<FinderMovie> = {}): FinderMovie => ({
  id, mediaType: 'movie', title, originalTitle: null, year: '2002', posterPath: `/${id}.jpg`, directors: ['Doug Liman'],
  have: { owned: [], wished: null }, ...fields,
});

const open = (mode: 'wish' | 'owned', buying?: MovieBuying) => {
  const handlers = { onHead: vi.fn(), onChanged: vi.fn(), onClose: vi.fn() };
  render(<Dialog show onClose={() => undefined} title="Add"><MovieFinder mode={mode} buying={buying} {...handlers} /></Dialog>);
  return handlers;
};

const type = (words: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: /search for a movie/i }), { target: { value: words } });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* none */ }
  vi.mocked(movieFinderService.search).mockReset().mockResolvedValue({
    movies: [movie(2501, 'The Bourne Identity', { have: { owned: [{ id: 7, format: 'DVD', title: 'The Bourne Identity' }], wished: null } }), movie(2502, 'The Bourne Supremacy', { year: '2004' })],
    people: [{ id: 1, name: 'Jean-Pierre Jeunet', role: 'director', profilePath: null, posters: [] }],
    sagas: [{ id: 31562, name: 'The Bourne Collection', posterPath: null, movies: 5 }],
  });
  vi.mocked(movieFinderService.addMovie).mockReset().mockResolvedValue({ id: 42, title: 'The Bourne Supremacy' });
  vi.mocked(movieFinderService.addBoxSet).mockReset().mockResolvedValue({ collection: { id: 9, name: 'The Bourne Collection, 2 movies' }, movies: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] });
  vi.mocked(movieFinderService.buy).mockReset().mockResolvedValue([{ id: 5, title: 'Die Hard' }]);
  vi.mocked(movieFinderService.saga).mockReset().mockResolvedValue({
    saga: { id: 31562, name: 'The Bourne Collection', posterPath: null },
    movies: [movie(2501, 'The Bourne Identity', { have: { owned: [{ id: 7, format: 'DVD', title: 'The Bourne Identity' }], wished: null } }), movie(2502, 'The Bourne Supremacy'), movie(2503, 'The Bourne Ultimatum')],
  });
  vi.mocked(movieFinderService.person).mockReset().mockResolvedValue({
    person: { id: 1, name: 'Jean-Pierre Jeunet', profilePath: null, role: 'director' },
    directed: [movie(892, 'Delicatessen', { year: '1991' }), movie(194, 'Amélie', { year: '2001' })], actedIn: [],
  });
  vi.mocked(apiService.deleteMovie).mockReset().mockResolvedValue({});
});

describe('MovieFinder', () => {
  it('trouve les films avec leur réalisateur et ce qu’on en a, et les pastilles de saga et de personne', async () => {
    open('wish');
    type('bourne');

    expect(await screen.findByText('The Bourne Supremacy')).toBeInTheDocument();
    expect(screen.getAllByText(/Doug Liman/).length).toBeGreaterThan(0);
    expect(within(screen.getByText('The Bourne Identity').closest('[role=option]') as HTMLElement).getByText('DVD')).toBeInTheDocument();
    expect(screen.getByTitle('The movies of The Bourne Collection, or its box set')).toBeInTheDocument();
    expect(screen.getByTitle('All the movies of Jean-Pierre Jeunet')).toBeInTheDocument();
  });

  it('sur la wish list, un clic souhaite le film dans le format choisi, la fenêtre restant ouverte', async () => {
    const { onChanged, onClose } = open('wish');
    fireEvent.click(screen.getByRole('radio', { name: 'DVD' }));
    type('bourne');

    fireEvent.click(await screen.findByText('The Bourne Supremacy'));

    await waitFor(() => expect(movieFinderService.addMovie).toHaveBeenCalledWith(expect.objectContaining({ id: 2502 }), 'wish', { format: 'DVD' }));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /take it off the wish list/i }));
    await waitFor(() => expect(apiService.deleteMovie).toHaveBeenCalledWith(42));
  });

  it('la pastille d’une personne ouvre ses films, du plus ancien au plus récent', async () => {
    open('wish');
    type('jeunet');
    fireEvent.click(await screen.findByTitle('All the movies of Jean-Pierre Jeunet'));

    expect(await screen.findByText('Delicatessen')).toBeInTheDocument();
    expect(movieFinderService.person).toHaveBeenCalledWith(1);
    fireEvent.change(screen.getByRole('textbox', { name: /filter the movies of jean-pierre jeunet/i }), { target: { value: 'amel' } });
    expect(screen.queryByText('Delicatessen')).not.toBeInTheDocument();
  });

  it('une saga se souhaite en coffret, sans ce qu’on a déjà', async () => {
    const { onClose } = open('wish');
    type('bourne');
    fireEvent.click(await screen.findByTitle('The movies of The Bourne Collection, or its box set'));

    fireEvent.click(await screen.findByRole('button', { name: 'Wish the box set (2)' }));

    await waitFor(() => expect(movieFinderService.addBoxSet).toHaveBeenCalledWith('The Bourne Collection, 2 movies',
      [expect.objectContaining({ id: 2502 }), expect.objectContaining({ id: 2503 })], 'wish', { format: 'Blu-ray 4K' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('pour la collection, demande l’édition : format, ce qui la distingue, prix', async () => {
    const { onClose } = open('owned');
    type('bourne');
    fireEvent.click(await screen.findByText('The Bourne Supremacy'));

    fireEvent.click(screen.getByRole('radio', { name: 'Blu-ray' }));
    fireEvent.click(screen.getByRole('button', { name: 'Steelbook' }));
    fireEvent.change(screen.getByLabelText(/price chf/i), { target: { value: '19.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add this Blu-ray' }));

    await waitFor(() => expect(movieFinderService.addMovie).toHaveBeenCalledWith(expect.objectContaining({ id: 2502 }), 'owned',
      expect.objectContaining({ format: 'Blu-ray', edition: 'Steelbook', price: '19.90' })));
    expect(onClose).toHaveBeenCalled();
  });

  it('refuse avant l’envoi un doublon exact de ce qu’on a déjà', async () => {
    open('owned');
    type('bourne');
    fireEvent.click(await screen.findByText('The Bourne Identity'));

    fireEvent.click(screen.getByRole('radio', { name: 'DVD' }));

    expect(screen.getByText(/you already have this dvd/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add this DVD' })).toBeDisabled();
  });

  it('un coffret de la collection : un nom, un format, le prix du coffret', async () => {
    open('owned');
    type('bourne');
    fireEvent.click(await screen.findByTitle('The movies of The Bourne Collection, or its box set'));
    fireEvent.click(await screen.findByRole('button', { name: 'I have the box set (2)' }));

    expect(screen.getByText('The Bourne Ultimatum')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/price of the box chf/i), { target: { value: '30' } });
    expect(screen.getByText('15.00 CHF a movie')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add the box set (2)' }));

    await waitFor(() => expect(movieFinderService.addBoxSet).toHaveBeenCalledWith('The Bourne Collection, 2 movies', expect.any(Array), 'owned',
      expect.objectContaining({ price: '30' })));
  });

  it('achète un film souhaité, dans le format souhaité d’office', async () => {
    const { onChanged } = open('owned', { movies: [{ id: 5, tmdbId: 562, title: 'Die Hard', posterPath: null, year: '1988', format: 'Blu-ray 4K' }] });

    expect(screen.getByRole('radio', { name: '4K UHD' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'I bought it' }));

    await waitFor(() => expect(movieFinderService.buy).toHaveBeenCalledWith([5], expect.objectContaining({ format: 'Blu-ray 4K' })));
    expect(onChanged).toHaveBeenCalled();
  });

  it('achète un coffret souhaité entier', async () => {
    open('owned', {
      boxName: 'Die Hard 1-2',
      movies: [{ id: 5, tmdbId: 562, title: 'Die Hard', posterPath: null, year: '1988', format: 'Blu-ray' },
        { id: 6, tmdbId: 1573, title: 'Die Hard 2', posterPath: null, year: '1990', format: 'Blu-ray' }],
    });

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'I bought the box set' }));

    await waitFor(() => expect(movieFinderService.buy).toHaveBeenCalledWith([5, 6], expect.objectContaining({ format: 'Blu-ray' })));
  });
});
