import { render, screen, waitFor, within } from '@testing-library/react';
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
    const sections = await screen.findByRole('radiogroup', { name: 'Collections' });

    const tooltips = Array.from(sections.querySelectorAll('[role="radio"]')).map(s =>
      s.getAttribute('aria-label')
    );

    expect(tooltips).toEqual([
      expect.stringContaining('FilmDex'),
      expect.stringContaining('MusicDex'),
      expect.stringContaining('BookDex'),
      expect.stringContaining('Scores'),
      expect.stringContaining('Wish List'),
      expect.stringContaining('Analytics')
    ]);
  });

  it('marks the collection currently being shown', async () => {
    render(<App />);

    const sections = await screen.findByRole('radiogroup', { name: 'Collections' });

    expect(within(sections).getByRole('radio', { checked: true })).toHaveAccessibleName(expect.stringContaining('FilmDex'));
  });
});
