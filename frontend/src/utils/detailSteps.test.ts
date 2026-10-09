import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { adjacent, findById, shownIds, useDetailSteps } from './detailSteps';

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
  it('va chercher les voisins d’avance, avec leurs images, et les affiche sans attendre', async () => {
    const load = vi.fn((id: any) => Promise.resolve({ id: Number(id), cover: `/c/${id}.jpg` }));
    const show = vi.fn();
    const images = vi.fn((item: any) => [item.cover]);
    const { result } = renderHook(() => useDetailSteps([3, 7, 9], 7, load, show, { imagesOf: images }));

    await waitFor(() => expect(images).toHaveBeenCalledTimes(2));
    expect(load.mock.calls.map(call => call[0]).sort()).toEqual(['3', '9']);

    await act(async () => { await result.current.onNext!(); });

    expect(show).toHaveBeenCalledWith({ id: 9, cover: '/c/9.jpg' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('n’affiche que le dernier élément demandé', async () => {
    let lateResolve: (item: any) => void = () => {};
    const load = vi.fn((id: any) => String(id) === '9'
      ? new Promise(resolve => { lateResolve = resolve; })
      : Promise.resolve({ id: Number(id) }));
    const show = vi.fn();
    const { result } = renderHook(() => useDetailSteps([3, 7, 9], 7, load, show));

    act(() => { result.current.onNext!(); });
    act(() => { result.current.onPrevious!(); });
    await waitFor(() => expect(show).toHaveBeenCalledWith({ id: 3 }));
    await act(async () => { lateResolve({ id: 9 }); });

    expect(show).toHaveBeenCalledTimes(1);
  });

  it('montre tout de suite l’entrée de la liste, puis la fiche complète quand elle arrive', async () => {
    let resolve: (item: any) => void = () => {};
    const load = vi.fn(() => new Promise(done => { resolve = done; }));
    const show = vi.fn();
    const summaries = [{ id: 9, title: 'Léon' }];
    const { result } = renderHook(() =>
      useDetailSteps([7, 9], 7, load, show, { summaryOf: id => findById(id, summaries) }));

    // Before the neighbours are fetched ahead: the step must not wait.
    act(() => { result.current.onNext!(); });
    expect(show).toHaveBeenCalledWith({ id: 9, title: 'Léon' });

    await act(async () => { resolve({ id: 9, title: 'Léon', overview: 'A hitman…' }); });
    expect(show).toHaveBeenLastCalledWith({ id: 9, title: 'Léon', overview: 'A hitman…' });
  });
});

describe('findById', () => {
  it('cherche dans chaque liste, ids en nombre ou en texte', () => {
    expect(findById('2', [{ id: 1 }], [{ id: 2, title: 'b' }])).toEqual({ id: 2, title: 'b' });
    expect(findById(5, [{ id: 1 }])).toBeUndefined();
  });
});
