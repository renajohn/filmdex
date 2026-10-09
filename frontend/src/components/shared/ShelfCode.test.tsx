import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShelfCode from './ShelfCode';
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
});
