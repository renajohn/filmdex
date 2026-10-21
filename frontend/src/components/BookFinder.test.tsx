import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookFinder, { BookBuying } from './BookFinder';
import Dialog from './shared/Dialog';
import bookFinderService, { FinderBook } from '../services/bookFinderService';
import bookService from '../services/bookService';

vi.mock('../services/bookFinderService', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/bookFinderService')>()),
  default: { search: vi.fn(), series: vi.fn(), author: vi.fn(), add: vi.fn(), addMany: vi.fn(), buy: vi.fn() },
}));
vi.mock('../services/bookService', () => ({ default: { deleteBook: vi.fn(), getImageUrl: (p: string | null) => p } }));

const book = (n: number, fields: Partial<FinderBook> = {}): FinderBook => ({
  googleId: `g${n}`, title: `Sorceline - Tome 0${n}`, subtitle: null, authors: ['Sylvia Douyé'], year: String(2017 + n), publisher: "Vents d'Ouest",
  language: 'fr', isbn13: `97823310${n}0000`, isbn10: null, cover: `https://books.google.com/${n}`, pageCount: 72, series: 'Sorceline', seriesNumber: n,
  bookType: 'graphic-novel', description: null, categories: [], have: null, ...fields,
});

const open = (mode: 'wish' | 'owned', buying?: BookBuying) => {
  const handlers = { onHead: vi.fn(), onChanged: vi.fn(), onClose: vi.fn() };
  render(<Dialog show onClose={() => undefined} title="Add"><BookFinder mode={mode} buying={buying} {...handlers} /></Dialog>);
  return handlers;
};

const type = (words: string) => fireEvent.change(screen.getByRole('textbox', { name: /search for a book/i }), { target: { value: words } });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* none */ }
  vi.mocked(bookFinderService.search).mockReset().mockResolvedValue({
    books: [book(3, { have: { status: 'owned', id: 30 } }), book(9), book(0, { title: 'Les Chemins de la communale', series: null, seriesNumber: null, bookType: 'book', isbn13: '9782226235114' })],
    series: [{ name: 'Sorceline', authors: ['Sylvia Douyé'], covers: [], volumes: 7 }],
    authors: [{ name: 'Sylvia Douyé', covers: [], books: 7 }],
  });
  vi.mocked(bookFinderService.series).mockReset().mockResolvedValue({
    name: 'Sorceline', missingNumbers: [2],
    volumes: [book(1, { googleId: 'library:1', have: { status: 'owned', id: 1 } }), book(3, { have: { status: 'owned', id: 30 } }), book(8), book(9)],
  });
  vi.mocked(bookFinderService.add).mockReset().mockResolvedValue({ id: 42, title: 'Sorceline - Tome 09' });
  vi.mocked(bookFinderService.addMany).mockReset().mockResolvedValue({ added: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }], errors: [] });
  vi.mocked(bookFinderService.buy).mockReset().mockResolvedValue([{ id: 7, title: 'Oeil de dragon' }]);
  vi.mocked(bookService.deleteBook).mockReset().mockResolvedValue({});
});

describe('BookFinder', () => {
  it('trouve les livres pendant la frappe, ce qu’on en a, et les pastilles de série et d’auteur', async () => {
    open('wish');
    type('sorceline');

    expect(await screen.findByText('Sorceline - Tome 09')).toBeInTheDocument();
    expect(bookFinderService.search).toHaveBeenCalledWith('sorceline', 'fr', 'all', expect.anything());
    expect(within(screen.getByText('Sorceline - Tome 03').closest('[role=option]') as HTMLElement).getByText('Owned')).toBeInTheDocument();
    expect(screen.getByTitle('The volumes of Sorceline')).toBeInTheDocument();
    expect(screen.getByTitle('All the books of Sylvia Douyé')).toBeInTheDocument();
  });

  it('le type choisi filtre les livres, dit combien il en cache, et relance la recherche', async () => {
    open('wish');
    type('sorceline');
    await screen.findByText('Les Chemins de la communale');

    fireEvent.click(screen.getByRole('radio', { name: 'BD' }));

    expect(screen.queryByText('Les Chemins de la communale')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of another kind hidden/)).toBeInTheDocument();
    await waitFor(() => expect(bookFinderService.search).toHaveBeenLastCalledWith('sorceline', 'fr', 'graphic-novel', expect.anything()));
  });

  it('sur la wish list, un clic souhaite le livre, du type et dans la langue qu’il a', async () => {
    const { onChanged, onClose } = open('wish');
    type('sorceline');

    fireEvent.click(await screen.findByText('Sorceline - Tome 09'));

    await waitFor(() => expect(bookFinderService.add).toHaveBeenCalledWith(expect.objectContaining({ googleId: 'g9' }), 'wish',
      expect.objectContaining({ bookType: 'graphic-novel', language: 'fr', format: 'physical' })));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /take it off the wish list/i }));
    await waitFor(() => expect(bookService.deleteBook).toHaveBeenCalledWith(42));
  });

  it('une série montre ses tomes, ceux qu’on a, celui qui manque, et souhaite ceux qu’on n’a pas', async () => {
    const { onClose } = open('wish');
    type('sorceline');
    fireEvent.click(await screen.findByTitle('The volumes of Sorceline'));

    expect(await screen.findByText(/4 volumes found, T2 not found · 2 owned · next: T8/)).toBeInTheDocument();
    expect(screen.getByText('from your library')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wish 2 volumes' }));

    await waitFor(() => expect(bookFinderService.addMany).toHaveBeenCalledWith(
      [expect.objectContaining({ seriesNumber: 8 }), expect.objectContaining({ seriesNumber: 9 })], 'wish', expect.objectContaining({ bookType: 'graphic-novel' })));
    expect(onClose).toHaveBeenCalled();
  });

  it('pour la bibliothèque, demande l’édition : type, format, langue, à qui, prix, date', async () => {
    const { onClose } = open('owned');
    type('sorceline');
    fireEvent.click(await screen.findByText('Sorceline - Tome 09'));

    fireEvent.click(screen.getByRole('radio', { name: 'Ebook' }));
    fireEvent.change(screen.getByLabelText(/belongs to/i), { target: { value: 'Violaine' } });
    fireEvent.change(screen.getByLabelText(/price chf/i), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add this book' }));

    await waitFor(() => expect(bookFinderService.add).toHaveBeenCalledWith(expect.objectContaining({ googleId: 'g9' }), 'owned',
      expect.objectContaining({ bookType: 'graphic-novel', format: 'ebook', owner: 'Violaine', priceChf: '12.50' })));
    expect(onClose).toHaveBeenCalled();
  });

  it('d’une série, ajoute les tomes qu’on vient d’avoir, le prix partagé', async () => {
    open('owned');
    type('sorceline');
    fireEvent.click(await screen.findByTitle('The volumes of Sorceline'));
    fireEvent.click(await screen.findByRole('button', { name: 'I have these 2' }));

    fireEvent.change(screen.getByLabelText(/price of them all chf/i), { target: { value: '30' } });
    expect(screen.getByText('15.00 CHF a volume')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add the 2 volumes' }));

    await waitFor(() => expect(bookFinderService.addMany).toHaveBeenCalledWith(expect.any(Array), 'owned', expect.objectContaining({ priceChf: '30' })));
  });

  it('achète un livre souhaité, avec son prix et sa date', async () => {
    const { onChanged } = open('owned', { books: [{ id: 7, title: 'Oeil de dragon', cover: null, authors: ['X'], year: '2025', series: null, seriesNumber: null,
      bookType: 'graphic-novel', language: 'fr', format: 'physical', owner: null }] });

    fireEvent.change(screen.getByLabelText(/price chf/i), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'I bought it' }));

    await waitFor(() => expect(bookFinderService.buy).toHaveBeenCalledWith([7], expect.objectContaining({ priceChf: '18', bookType: 'graphic-novel' })));
    expect(onChanged).toHaveBeenCalled();
  });
});
