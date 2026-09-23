import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MovieWarnings from './MovieWarnings';

vi.mock('../services/api', () => ({
  default: {
    getMovieWarnings: vi.fn(),
    setWarningOverride: vi.fn(),
    setDddLink: vi.fn(),
    refreshMovieWarnings: vi.fn(),
  },
}));

import apiService from '../services/api';

const data = (over: Record<string, unknown> = {}) => ({
  movieId: 214, dddId: 22644, dddUrl: 'https://www.doesthedogdie.com/media/22644',
  matchedBy: 'title_year', checkedAt: '2026-09-23T00:00:00.000Z',
  topics: [
    { topic: 'spiders', status: 'with', yes: 1, no: 1, override: null, overrideAt: null, fetchedAt: null },
    { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getMovieWarnings as any).mockResolvedValue(data());
});

describe('MovieWarnings', () => {
  it('affiche le classement et les votes bruts de chaque sujet', async () => {
    render(<MovieWarnings movieId={214} />);
    await waitFor(() => expect(screen.getByText(/Spiders/)).toBeInTheDocument());
    expect(screen.getByText('With · 1 yes / 1 no')).toBeInTheDocument();
    expect(screen.getByText('Without · 0 yes / 1 no')).toBeInTheDocument();
  });

  it('corrige le classement à la main et affiche la mention', async () => {
    (apiService.setWarningOverride as any).mockResolvedValue(data({
      topics: [
        { topic: 'spiders', status: 'without', yes: 1, no: 1, override: 'without', overrideAt: 'x', fetchedAt: null },
        { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
      ],
    }));
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('With · 1 yes / 1 no'));
    fireEvent.click(screen.getByRole('radio', { name: 'Without' }));

    await waitFor(() => expect(apiService.setWarningOverride).toHaveBeenCalledWith(214, 'spiders', 'without'));
    expect(await screen.findByText('Without (manual) · 1 yes / 1 no')).toBeInTheDocument();
  });

  it('rend la main aux votes', async () => {
    (apiService.getMovieWarnings as any).mockResolvedValue(data({
      topics: [
        { topic: 'spiders', status: 'without', yes: 1, no: 1, override: 'without', overrideAt: 'x', fetchedAt: null },
        { topic: 'snakes', status: 'without', yes: 0, no: 1, override: null, overrideAt: null, fetchedAt: null },
      ],
    }));
    (apiService.setWarningOverride as any).mockResolvedValue(data());
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('Without (manual) · 1 yes / 1 no'));
    fireEvent.click(screen.getByRole('radio', { name: 'Follow votes' }));
    await waitFor(() => expect(apiService.setWarningOverride).toHaveBeenCalledWith(214, 'spiders', null));
  });

  it('lance la recherche du sujet au clic sur son nom', async () => {
    const onSearch = vi.fn();
    render(<MovieWarnings movieId={214} onSearch={onSearch} />);
    fireEvent.click(await screen.findByRole('button', { name: /Spiders/ }));
    expect(onSearch).toHaveBeenCalledWith('spiders:with');
  });

  it('enregistre un ID DoesTheDogDie saisi à la main', async () => {
    (apiService.setDddLink as any).mockResolvedValue(data({ dddId: 1, matchedBy: 'manual' }));
    render(<MovieWarnings movieId={214} />);
    fireEvent.click(await screen.findByText('With · 1 yes / 1 no'));
    fireEvent.change(screen.getByLabelText('DoesTheDogDie ID'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(apiService.setDddLink).toHaveBeenCalledWith(214, 12345));
  });

  it('reste discret si le chargement échoue', async () => {
    (apiService.getMovieWarnings as any).mockRejectedValue(new Error('boom'));
    const { container } = render(<MovieWarnings movieId={214} />);
    await waitFor(() => expect(apiService.getMovieWarnings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
