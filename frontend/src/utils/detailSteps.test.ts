import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { adjacent, shownIds, useDetailSteps } from './detailSteps';

describe('adjacent', () => {
  it('trouve les voisins dans l’ordre de la page', () => {
    expect(adjacent([3, 7, 9], 7)).toEqual({ previous: 3, next: 9 });
    expect(adjacent([3, 7, 9], 3)).toEqual({ previous: null, next: 7 });
    expect(adjacent(['3', '7', '9'], 9)).toEqual({ previous: '7', next: null });
  });

  it('n’en donne aucun pour un élément absent de la page', () => {
    expect(adjacent([3, 7, 9], 4)).toEqual({ previous: null, next: null });
    expect(adjacent([3, 7, 9], null)).toEqual({ previous: null, next: null });
  });
});

describe('shownIds', () => {
  it('lit les éléments affichés dans l’ordre de l’écran, sans les cachés', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-item-id="4"></div><div data-item-id="2" hidden></div><div data-item-id="8"></div><div data-item-id="4"></div>';
    // jsdom lays nothing out; a hidden element is the one without boxes.
    root.querySelectorAll<HTMLElement>('[data-item-id]').forEach(element => {
      element.getClientRects = () => (element.hidden ? [] : [{}]) as unknown as DOMRectList;
    });

    expect(shownIds(root)).toEqual(['4', '8']);
    expect(shownIds(null)).toEqual([]);
  });
});

describe('useDetailSteps', () => {
  it('n’affiche que le dernier élément demandé', async () => {
    let lateResolve: (item: any) => void = () => {};
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { lateResolve = resolve; }))
      .mockResolvedValueOnce({ id: 3 });
    const show = vi.fn();
    const { result } = renderHook(() => useDetailSteps([3, 7, 9], 7, load, show));

    act(() => { result.current.onNext!(); });
    act(() => { result.current.onPrevious!(); });
    await waitFor(() => expect(show).toHaveBeenCalledWith({ id: 3 }));
    await act(async () => { lateResolve({ id: 9 }); });

    expect(load).toHaveBeenCalledWith(9);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
