import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScoresPage from './ScoresPage';
import bookSectionsService, { Score } from '../services/bookSectionsService';
import bookService from '../services/bookService';

vi.mock('../services/bookSectionsService', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/bookSectionsService')>()),
  default: { scores: vi.fn(), setComposers: vi.fn() },
}));
vi.mock('../services/bookService', () => ({ default: { uploadEbook: vi.fn(), getImageUrl: (p: string | null) => p, getBookById: vi.fn(), updateBook: vi.fn(), deleteBook: vi.fn(), addBook: vi.fn() } }));

const score = (id: number, title: string, fields: Partial<Score> = {}): Score => ({
  id, title, authors: [], publisher: 'G. Henle Verlag', cover: null, composer: null, composerSuggestion: null, ebookFile: null, isbn13: null, urls: {}, titleStatus: 'owned', ...fields,
});

beforeEach(() => {
  vi.mocked(bookSectionsService.scores).mockReset().mockResolvedValue([
    score(1, 'Préludes Vol. 1 - piano - (HN 383)', { composer: 'Claude Debussy', ebookFile: 'book_1_x_preludes.pdf' }),
    score(2, 'Bach : suites françaises BWV 812-817', { authors: ['Vladimir Ashkenazy'], composerSuggestion: 'Johann Sebastian Bach' }),
    score(3, 'Improve your sight-reading !', { authors: ['Paul Harris'], publisher: 'Faber' }),
  ]);
  vi.mocked(bookSectionsService.setComposers).mockReset().mockResolvedValue({ changed: 1 });
  vi.mocked(bookService.uploadEbook).mockReset().mockResolvedValue({});
});

describe('ScoresPage', () => {
  it('range les partitions par compositeur, les recueils à la fin, avec la référence et l’éditeur', async () => {
    render(<ScoresPage />);

    const debussy = (await screen.findByRole('heading', { name: /Claude Debussy/ })).closest('section') as HTMLElement;
    expect(within(debussy).getByText('Préludes Vol. 1')).toBeInTheDocument();
    expect(within(debussy).getByText('HN 383')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(headings[headings.length - 1]).toMatch(/Anthologies & methods/);
    expect(screen.getByText(/ed\. Vladimir Ashkenazy/)).toBeInTheDocument();
  });

  it('ouvre le PDF dans le navigateur, et propose d’en joindre un à celle qui n’en a pas', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ScoresPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'PDF' }));
    expect(open).toHaveBeenCalledWith('/api/books/1/ebook/download?inline=1', '_blank', 'noopener');

    const bach = screen.getByText('Bach : suites françaises BWV 812-817').closest('.scores-page__score') as HTMLElement;
    fireEvent.click(within(bach).getByRole('button', { name: /attach pdf/i }));
    const file = new File(['%PDF'], 'suites.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('score-pdf-input'), { target: { files: [file] } });
    await waitFor(() => expect(bookService.uploadEbook).toHaveBeenCalledWith(2, file));
  });

  it('mène à IMSLP par le compositeur et la pièce', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ScoresPage />);
    const preludes = (await screen.findByText('Préludes Vol. 1')).closest('.scores-page__score') as HTMLElement;

    fireEvent.click(within(preludes).getByRole('button', { name: 'On IMSLP' }));

    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/imslp\.org\/index\.php\?search=Claude%20Debussy%20Pr%C3%A9ludes/), '_blank', 'noopener');
  });

  it('propose les compositeurs suggérés, qu’on peut corriger, et les garde', async () => {
    render(<ScoresPage />);
    fireEvent.click(await screen.findByRole('button', { name: /review the suggestions/i }));

    const field = screen.getByLabelText('Composer of Bach : suites françaises BWV 812-817');
    expect(field).toHaveValue('Johann Sebastian Bach');
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(bookSectionsService.setComposers).toHaveBeenCalledWith([{ id: 2, composer: 'Johann Sebastian Bach' }]));
  });

  it('filtre par la recherche de l’en-tête : des mots, composer:, publisher:', async () => {
    const { rerender } = render(<ScoresPage searchCriteria={{ searchText: 'faber' }} />);
    expect(await screen.findByText('Improve your sight-reading !')).toBeInTheDocument();
    expect(screen.queryByText('Préludes Vol. 1')).not.toBeInTheDocument();

    rerender(<ScoresPage searchCriteria={{ searchText: 'composer:debussy' }} />);
    expect(screen.getByText('Préludes Vol. 1')).toBeInTheDocument();
    expect(screen.queryByText('Improve your sight-reading !')).not.toBeInTheDocument();
  });

  it('pose la lettre de chaque compositeur pour l’index sur le côté', async () => {
    render(<ScoresPage />);
    const debussy = (await screen.findByRole('heading', { name: /Claude Debussy/ })).closest('section') as HTMLElement;
    expect(debussy).toHaveAttribute('data-first-letter', 'D');
  });
});
