import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

/**
 * The shell: navigation between the four collections and the one search box
 * that serves all of them. What each page then renders is covered by that
 * page's own tests.
 */

vi.mock('./services/api', () => ({
  default: {
    getAllMovies: vi.fn(() => Promise.resolve([])),
    getMovieDetails: vi.fn(() => Promise.resolve(null)),
    getAutocompleteSuggestions: vi.fn(() => Promise.resolve([])),
    getCollectionNames: vi.fn(() => Promise.resolve([])),
    getBoxSetNames: vi.fn(() => Promise.resolve([])),
    getWatchNextMovies: vi.fn(() => Promise.resolve([]))
  }
}));

vi.mock('./services/musicService', () => ({
  default: { getAllAlbums: vi.fn(() => Promise.resolve([])) }
}));

vi.mock('./services/bookService', () => ({
  default: { getAllBooks: vi.fn(() => Promise.resolve([])) }
}));

describe('App shell', () => {
  it('lands on FilmDex rather than an empty route', async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Search FilmDex by title, director/i)).toBeInTheDocument()
    );
  });

  it('offers a way into each collection', async () => {
    render(<App />);

    // The pills carry an icon, not a label, so the tooltip is what names them.
    await waitFor(() => expect(document.querySelector('.segmented-control')).toBeInTheDocument());

    const tooltips = Array.from(document.querySelectorAll('.segment')).map(s =>
      s.getAttribute('data-tooltip')
    );

    expect(tooltips).toEqual([
      expect.stringContaining('FilmDex'),
      expect.stringContaining('MusicDex'),
      expect.stringContaining('BookDex'),
      expect.stringContaining('Wish List'),
      expect.stringContaining('Analytics')
    ]);
  });

  it('marks the collection currently being shown', async () => {
    render(<App />);

    await waitFor(() => expect(document.querySelector('.segment.active')).toBeInTheDocument());

    expect(document.querySelector('.segment.active')).toHaveAttribute(
      'data-tooltip',
      expect.stringContaining('FilmDex') as unknown as string
    );
  });
});
