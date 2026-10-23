import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieFilmages from './MovieFilmages';

vi.mock('../services/api', () => ({
  default: {
    getMovieFilmages: vi.fn(),
    setFilmagesLink: vi.fn(),
    clearFilmagesLink: vi.fn(),
  },
}));

import apiService from '../services/api';

const data = (over: Record<string, unknown> = {}) => ({
  movieId: 7, filmagesId: 3259, filmagesUrl: 'https://www.filmages.ch/films/detail/items/3259.html',
  ageLegal: 7, ageSuggested: 14,
  indications: [{ label: 'Humour', description: 'Le film fait rire.' }],
  counterIndications: [{ label: 'Violence', description: 'Des coups.' }],
  synthesis: 'Pour adolescents.', matchedBy: 'auto', checkedAt: '2026-10-23T00:00:00.000Z',
  movieAge: 14, ageSource: 'filmages',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getMovieFilmages as any).mockResolvedValue(data());
});

describe('MovieFilmages', () => {
  it('affiche les deux âges, les éléments avec leur définition et un lien vers la fiche', async () => {
    render(<MovieFilmages movieId={7} />);
    await waitFor(() => expect(screen.getByText('Humour')).toBeInTheDocument());
    expect(screen.getByText('Legal').querySelector('strong')).toHaveTextContent('7+');
    expect(screen.getByText('Suggested').querySelector('strong')).toHaveTextContent('14+');
    expect(screen.getByText('Humour')).toHaveAttribute('title', 'Le film fait rire.');
    expect(screen.getByText('Violence')).toHaveAttribute('title', 'Des coups.');
    expect(screen.getByText('Pour adolescents.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /FilmAges/ })).toHaveAttribute('href', 'https://www.filmages.ch/films/detail/items/3259.html');
  });

  it('dit qu’un film n’est pas sur FilmAges', async () => {
    (apiService.getMovieFilmages as any).mockResolvedValue(data({ filmagesId: null, filmagesUrl: null, indications: [], counterIndications: [] }));
    render(<MovieFilmages movieId={7} />);
    await waitFor(() => expect(screen.getByText('Not on FilmAges')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('choisit la fiche à la main et prévient la carte du nouvel âge', async () => {
    const chosen = data({ filmagesId: 42, matchedBy: 'manual', ageSuggested: 10, movieAge: 10 });
    (apiService.setFilmagesLink as any).mockResolvedValue(chosen);
    const onChange = vi.fn();
    render(<MovieFilmages movieId={7} onChange={onChange} />);
    await waitFor(() => expect(screen.getByText('Humour')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Choose the FilmAges film…' }));
    fireEvent.change(screen.getByLabelText('FilmAges page'), { target: { value: 'https://www.filmages.ch/films/detail/items/42.html' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(chosen));
    expect(apiService.setFilmagesLink).toHaveBeenCalledWith(7, 'https://www.filmages.ch/films/detail/items/42.html');
  });

  it('refuse une adresse qui n’est pas une fiche', async () => {
    render(<MovieFilmages movieId={7} />);
    await waitFor(() => expect(screen.getByText('Humour')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Choose the FilmAges film…' }));
    fireEvent.change(screen.getByLabelText('FilmAges page'), { target: { value: 'Truman' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText(/Paste the FilmAges page address/)).toBeInTheDocument();
    expect(apiService.setFilmagesLink).not.toHaveBeenCalled();
  });
});
