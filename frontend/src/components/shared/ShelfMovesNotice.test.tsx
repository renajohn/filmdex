import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShelfMovesNotice from './ShelfMovesNotice';
import { refreshShelfLocations, resetShelfLocations } from '../../utils/shelfLocations';

// A new film on A-4; the last one there, King Kong, goes on to A-5.
const MOVES = [
  { kind: 'movie', id: 1, title: 'Jurassic World', from: null, to: 'A-4', after: 'Jurassic Park III', before: null, toLevelId: 4 },
  { kind: 'movie', id: 2, title: 'King Kong', from: 'A-4', to: 'A-5', after: null, before: 'Kung Fu Panda', toLevelId: 5 },
];
const LINE = { code: 'A-4', items: [
  { kind: 'movie', id: 9, title: 'Jurassic Park III' },
  { kind: 'movie', id: 1, title: 'Jurassic World' },
  { kind: 'movie', id: 2, title: 'King Kong' },
] };
const LEVELS = [{ id: 4, capacity: null, break_before: null, extend_through: null, locked: 0, locked_from: null, locked_through: null }];

let moves: Array<Record<string, unknown>> = MOVES;
const body = (url: string) => JSON.parse(vi.mocked(fetch).mock.calls.filter(([called]) => called === url).pop()![1]!.body as string);

beforeEach(() => {
  resetShelfLocations();
  moves = MOVES;
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    if (url === '/api/shelving/moves/done') {
      const done = JSON.parse(init!.body as string).moves.map((move: { id: number }) => move.id);
      moves = moves.filter(move => !done.includes(move.id));
      return ok({ ok: true });
    }
    if (url === '/api/shelving/moves/undo') {
      moves = MOVES;
      return ok({ ok: true });
    }
    if (url === '/api/shelving/levels/4/take-off') {
      // Taken off to the end: the chain goes on with King Kong; nothing off: it stops there.
      if (JSON.parse(init!.body as string).count === 0) moves = moves.filter(move => move.id !== 2);
      return ok({ ok: true });
    }
    if (url === '/api/shelving/levels/4/line') return ok(LINE);
    if (url === '/api/shelving/levels/5/line') return ok({ code: 'A-5', items: [{ kind: 'movie', id: 2, title: 'King Kong' }] });
    if (url === '/api/shelving/levels/state' && !init?.method) return ok({ levels: LEVELS });
    if (init?.method) return ok({ ok: true });
    return ok({ movies: {}, albums: {}, moves });
  }));
});

afterEach(() => vi.unstubAllGlobals());

const show = async () => {
  await act(async () => { render(<MemoryRouter><ShelfMovesNotice /></MemoryRouter>); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled());
};

describe('ShelfMovesNotice', () => {
  it('propose de sortir ce que le plan fait passer à l’étage suivant, d’un seul geste', async () => {
    await show();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Put on A-4');
    expect(notice).toHaveTextContent('Jurassic World (new), after Jurassic Park III');
    expect(notice).toHaveTextContent('Take off for A-5:');
    // The plan's guess is lit: King Kong comes off, Jurassic World stays.
    expect(screen.getByRole('button', { name: 'King Kong' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Jurassic World' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Put on A-5')).toBeInTheDocument();
    expect(body('/api/shelving/levels/4/take-off')).toEqual({ count: 1 });
    expect(body('/api/shelving/moves/done')).toEqual({ moves: [{ kind: 'movie', id: 1, to: 'A-4' }] });
    expect(screen.getByRole('status')).toHaveTextContent('King Kong from A-4, first, before Kung Fu Panda');
  });

  it('change d’un toucher combien de films sortent : un de plus, ou aucun', async () => {
    await show();
    // Tighter than planned: from Jurassic World on, all come off.
    fireEvent.click(screen.getByRole('button', { name: 'Jurassic World' }));
    expect(screen.getByRole('button', { name: 'Jurassic World' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'King Kong' })).toHaveAttribute('aria-pressed', 'true');
    // Tapped again, the first of those coming off stays.
    fireEvent.click(screen.getByRole('button', { name: 'Jurassic World' }));
    fireEvent.click(screen.getByRole('button', { name: 'King Kong' }));
    expect(screen.getByRole('status')).toHaveTextContent('Nothing comes off.');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('The shelves are tidy')).toBeInTheDocument();
    expect(body('/api/shelving/levels/4/take-off')).toEqual({ count: 0 });
  });

  it('revient sur une réponse donnée par erreur', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'King Kong' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('The shelves are tidy');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Put on A-4')).toBeInTheDocument();
    expect(body('/api/shelving/levels/state')).toEqual({ levels: LEVELS });
    expect(body('/api/shelving/moves/undo')).toEqual({ moves: [{ kind: 'movie', id: 1, from: null }] });
    // As it was answered: nothing coming off.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nothing comes off.'));
  });

  it('se range pour plus tard, et se rouvre quand un nouveau déplacement arrive', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Shelves to tidy' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    moves = [...MOVES, { kind: 'movie', id: 4, title: 'Up', from: null, to: 'B-1', after: 'Unforgiven', before: null, toLevelId: 11 }];
    await act(async () => { await refreshShelfLocations(); });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
