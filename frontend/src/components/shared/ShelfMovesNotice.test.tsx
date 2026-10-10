import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShelfMovesNotice from './ShelfMovesNotice';
import { resetShelfLocations } from '../../utils/shelfLocations';

const MOVES = [
  { kind: 'movie', id: 1, title: 'Jurassic World', from: null, to: 'A-4', after: 'Jurassic Park III', before: null, canNoRoom: true },
  { kind: 'movie', id: 2, title: 'King Kong', from: 'A-4', to: 'A-5', after: null, before: 'Kung Fu Panda', canStay: true },
  { kind: 'box_set', id: 3, title: 'Lord of the Rings', from: 'B-10', to: null },
];

let moves = MOVES;

beforeEach(() => {
  resetShelfLocations();
  moves = MOVES;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/shelving/moves/done') {
      const done = JSON.parse(init!.body as string).moves.map((move: { id: number }) => move.id);
      moves = moves.filter(move => !done.includes(move.id));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ ok: true }) };
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

  it('arrête la chaîne quand un film tient encore sur son étage', async () => {
    await act(async () => { render(<MemoryRouter><ShelfMovesNotice /></MemoryRouter>); });
    fireEvent.click(screen.getByRole('button', { name: 'It fits on A-4' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/shelving/items/movie/2/move-back', expect.objectContaining({ method: 'POST' })));
  });

  it('demande si l’étage est plein quand un nouveau film n’y a pas la place', async () => {
    await act(async () => { render(<MemoryRouter><ShelfMovesNotice /></MemoryRouter>); });
    fireEvent.click(screen.getByRole('button', { name: 'No room' }));
    expect(screen.getByRole('status')).toHaveTextContent('Is A-4 full now?');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, it is full' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/shelving/items/movie/1/no-room',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ full: true }) })));
  });

  it('coche un déplacement fait, sans les autres', async () => {
    await act(async () => { render(<MemoryRouter><ShelfMovesNotice /></MemoryRouter>); });
    fireEvent.click(screen.getByRole('button', { name: 'Done: King Kong' }));
    await waitFor(() => expect(screen.getByText('2 things to move on the shelves')).toBeInTheDocument());
    expect(screen.getByRole('status')).not.toHaveTextContent('King Kong');
  });
});
