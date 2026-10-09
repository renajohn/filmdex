import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShelfMovesNotice from './ShelfMovesNotice';
import { resetShelfLocations } from '../../utils/shelfLocations';

const MOVES = [
  { kind: 'movie', id: 1, title: 'Jurassic World', from: null, to: 'A-4', after: 'Jurassic Park III', before: null },
  { kind: 'movie', id: 2, title: 'King Kong', from: 'A-4', to: 'A-5', after: null, before: 'Kung Fu Panda' },
  { kind: 'box_set', id: 3, title: 'Lord of the Rings', from: 'B-10', to: null },
];

let moves = MOVES;

beforeEach(() => {
  resetShelfLocations();
  moves = MOVES;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/shelving/moves/done') {
      moves = [];
      return { ok: true, json: async () => ({ ok: true }), body: init?.body };
    }
    return { ok: true, json: async () => ({ movies: {}, albums: {}, moves }) };
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('ShelfMovesNotice', () => {
  it('dit quoi déplacer sur les étagères, et s’efface une fois fait', async () => {
    await act(async () => { render(<MemoryRouter><ShelfMovesNotice /></MemoryRouter>); });
    expect(screen.getByText('3 things to move on the shelves')).toBeInTheDocument();
    const list = screen.getByRole('status');
    expect(list).toHaveTextContent('Jurassic World: Put on A-4, after Jurassic Park III');
    expect(list).toHaveTextContent('King Kong: Move from A-4 to A-5');
    expect(list).not.toHaveTextContent('Kung Fu Panda');
    expect(list).toHaveTextContent('Lord of the Rings: Take off B-10');

    fireEvent.click(screen.getByRole('button', { name: 'Done, dismiss' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    const done = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/shelving/moves/done')!;
    expect(JSON.parse(done[1]!.body as string)).toEqual({ moves: [
      { kind: 'movie', id: 1, to: 'A-4' }, { kind: 'movie', id: 2, to: 'A-5' }, { kind: 'box_set', id: 3, to: null },
    ] });
  });
});
