import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShelfCode, { shelvesHref } from './ShelfCode';
import { resetShelfLocations } from '../../utils/shelfLocations';

beforeEach(() => {
  resetShelfLocations();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ movies: { 7: 'B-3' }, albums: { 9: 'Wardrobe, top' } }),
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe('ShelfCode', () => {
  it('montre l’étage d’un film et le lieu d’un CD, en une seule requête', async () => {
    await act(async () => {
      render(<><ShelfCode kind="movie" id={7} /><ShelfCode kind="album" id="9" variant="inline" /><ShelfCode kind="movie" id={8} /></>);
    });
    expect(screen.getByText('B-3')).toHaveClass('shelf-code-overlay');
    expect(screen.getByText('Wardrobe, top')).toHaveClass('shelf-code-inline');
    expect(document.querySelectorAll('.shelf-code-badge')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('mène à la page Shelves au clic, sans ouvrir la fiche sous la pochette', async () => {
    const Shelves = () => { const location = useLocation(); return <p>Shelves {location.search}</p>; };
    const openCard = vi.fn();
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/musicdex']}>
          <Routes>
            <Route path="/musicdex" element={<div onClick={openCard}><ShelfCode kind="album" id={9} /></div>} />
            <Route path="/shelves" element={<Shelves />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    const tag = screen.getByRole('link', { name: 'On the shelves: Wardrobe, top' });
    expect(tag).toHaveAttribute('title', 'Show it on the shelves');
    fireEvent.click(tag);
    expect(openCard).not.toHaveBeenCalled();
    expect(screen.getByText('Shelves ?album=9')).toBeInTheDocument();
  });

  it('se rejoint aussi au clavier', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/filmdex']}>
          <Routes>
            <Route path="/filmdex" element={<ShelfCode kind="movie" id={7} variant="inline" />} />
            <Route path="/shelves" element={<p>Shelves</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    fireEvent.keyDown(screen.getByRole('link', { name: 'On the shelves: B-3' }), { key: 'Enter' });
    expect(screen.getByText('Shelves')).toBeInTheDocument();
    expect(shelvesHref('movie', 7)).toBe('/shelves?movie=7');
  });
});
