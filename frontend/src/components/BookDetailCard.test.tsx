import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BookDetailCard from './BookDetailCard';

vi.mock('../services/bookService', () => ({
  default: {
    getImageUrl: vi.fn((path: string | null | undefined) => (path ? `/images/${path}` : null)),
    getBooksBySeries: vi.fn(() => Promise.resolve([])),
    getEbookInfo: vi.fn(() => Promise.resolve(null)),
    getAutocompleteSuggestions: vi.fn(() => Promise.resolve([])),
    downloadEbook: vi.fn(() => Promise.resolve()),
    updateBook: vi.fn((_id: number, data: unknown) => Promise.resolve(data)),
  },
}));

vi.mock('../services/bookCommentService', () => ({
  default: {
    getCommentsByBookId: vi.fn(() => Promise.resolve([])),
    getCommentNameSuggestions: vi.fn(() => Promise.resolve([])),
  },
}));

import bookService from '../services/bookService';
import bookCommentService from '../services/bookCommentService';

const book = (over: Record<string, unknown> = {}) => ({
  id: 7,
  title: 'La Porte du secret',
  authors: ['Nicolas Beuglet'],
  publisher: 'Jungle',
  publishedYear: 2022,
  pageCount: 55,
  language: 'fr',
  bookType: 'graphic-novel',
  cover: 'book/7.jpg',
  series: "L'alchimiste",
  seriesNumber: 1,
  owner: 'Oriane',
  isbn: '2822236607',
  isbn13: '9782822236607',
  genres: ['Comics', 'Comics'],
  urls: { googleBooks: 'https://books.google/1', googleBooksInfo: 'https://books.google/info/1', amazon: 'https://amazon/1' },
  description: 'Une nouvelle série.',
  ...over,
});

const renderCard = (over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) =>
  render(
    <BookDetailCard
      book={book(over)}
      onClose={vi.fn()} onEdit={vi.fn()} onUpdateBook={vi.fn(() => Promise.resolve({}))}
      onBookUpdated={vi.fn()} onDelete={vi.fn()} {...props}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe('BookDetailCard', () => {
  it('says who and what beside the cover, the series as a shelf to jump to', () => {
    const onSearch = vi.fn();
    renderCard({}, { onSearch });

    expect(screen.getByRole('button', { name: 'Nicolas Beuglet' })).toBeInTheDocument();
    expect(screen.getByText(/Jungle · 2022 · 55 pages · French ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /L'alchimiste/ }));
    expect(onSearch).toHaveBeenCalledWith(expect.stringContaining("L'alchimiste"));
    expect(screen.getByText('Oriane')).toBeInTheDocument();
  });

  it('links the sites by their names, a site\'s second pages only in the fold', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Google Books' })).toHaveAttribute('href', 'https://books.google/1');
    expect(screen.getByRole('link', { name: 'Amazon' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google Books (info)' })).not.toBeInTheDocument();
    expect(screen.queryByText('978-2-822-23660-7', { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ISBN, links and more' }));
    expect(screen.getByRole('link', { name: 'Google Books (info)' })).toBeInTheDocument();
    expect(screen.getByText(/9782822236607|978-2-822-23660-7/)).toBeInTheDocument();
    // A genre Google gives twice is shown once.
    expect(screen.getAllByRole('button', { name: 'Comics' })).toHaveLength(1);
  });

  it('shows nothing empty: no series, no reviews, a quiet word for each instead', async () => {
    renderCard({ series: null, seriesNumber: null });

    expect(screen.queryByText(/None/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put it in a series…' })).toBeInTheDocument();
    await waitFor(() => expect(bookCommentService.getCommentsByBookId).toHaveBeenCalled());
    expect(screen.queryByText(/No reviews yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write a review…' })).toBeInTheDocument();
  });

  it('gives a book without a cover the same card, its place kept for one', () => {
    renderCard({ cover: null });

    expect(screen.getByRole('button', { name: 'Add cover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nicolas Beuglet' })).toBeInTheDocument();
    expect(screen.getAllByText('Une nouvelle série.')).toHaveLength(1);
  });

  it('offers the e-book from the head', async () => {
    renderCard({ ebookFile: 'book_7_0_porte.epub' });

    fireEvent.click(screen.getByRole('button', { name: /E-book/ }));
    await waitFor(() => expect(bookService.downloadEbook).toHaveBeenCalledWith(7));
  });

  it('has no Close beside Edit and Delete, the ✕ closes', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    // The only Close is the ✕ in the head.
    expect(screen.getAllByRole('button', { name: /^Close$/ })).toHaveLength(1);
  });
});
