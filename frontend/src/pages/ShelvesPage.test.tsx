import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShelvesPage from './ShelvesPage';
import shelvingService, { type ShelvingPlan, type ShelvedItem } from '../services/shelvingService';

vi.mock('../services/shelvingService', () => ({
  default: {
    getPlan: vi.fn(),
    saveItem: vi.fn(),
    createPlace: vi.fn(),
    renamePlace: vi.fn(),
    deletePlace: vi.fn(),
    noRoom: vi.fn(),
    moveBack: vi.fn(),
    createUnit: vi.fn(),
    updateUnit: vi.fn(),
    deleteUnit: vi.fn(),
    updateLevel: vi.fn(),
    setTogether: vi.fn(),
  },
}));

const item = (fields: Partial<ShelvedItem>): ShelvedItem => ({
  kind: 'album', id: 1, title: '', subtitle: '', image: null, section: 'music', sectionAuto: true,
  sortName: '', sortSource: 'guess', units: 1, unitsAuto: true, placeId: null, code: null, levelId: null, pinned: false, ...fields,
});

const PLAN: ShelvingPlan = {
  sections: [
    { key: 'films', shelves: 0, unshelved: 2, items: [
      item({ kind: 'movie', id: 10, title: 'The Matrix', sortName: 'Matrix', section: 'films', subtitle: '1999 · Blu-ray' }),
      item({ kind: 'box_set', id: 3, title: 'Coffret trilogie, Jason Bourne', sortName: 'Jason Bourne', section: 'films', units: 2 }),
    ] },
    { key: 'music', shelves: 0, unshelved: 2, items: [
      item({ id: 1, title: 'Abbey Road', sortName: 'Beatles', sortSource: 'musicbrainz', subtitle: 'The Beatles' }),
      item({ id: 2, title: 'Older', sortName: 'Michael, George', sortSource: 'musicbrainz', subtitle: 'George Michael' }),
    ] },
    { key: 'classical', shelves: 0, unshelved: 1, items: [
      item({ id: 5, title: 'Water Music', sortName: 'Tilney, Colin', section: 'classical' }),
    ] },
  ],
  units: [],
  places: [{ id: 9, name: 'Wardrobe, top', items: [item({ id: 6, title: 'Die 32 Klaviersonaten', sortName: 'Kempff, Wilhelm', section: 'classical', placeId: 9 })] }],
};

beforeEach(() => {
  vi.mocked(shelvingService.getPlan).mockReset().mockResolvedValue(PLAN);
  vi.mocked(shelvingService.saveItem).mockReset().mockResolvedValue();
  vi.mocked(shelvingService.createPlace).mockReset().mockResolvedValue({ id: 10, name: 'Desk' });
});

describe('ShelvesPage', () => {
  it('montre les films dans leur ordre, sous leur lettre, sans répéter le titre qui sert de nom', async () => {
    render(<ShelvesPage />);
    expect(await screen.findByText('Matrix')).toBeInTheDocument();
    expect(screen.queryByText('The Matrix')).not.toBeInTheDocument();
    expect(screen.getByText('Coffret trilogie, Jason Bourne')).toBeInTheDocument();
    expect(screen.getByText('2 cases')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'J' })).toBeInTheDocument();
  });

  it('marque le nom deviné d’un CD classique, et cherche dans la section', async () => {
    render(<ShelvesPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Classical/ }));
    expect(screen.getByText('guessed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Music/ }));
    fireEvent.change(screen.getByPlaceholderText('Find on the shelves…'), { target: { value: 'george' } });
    expect(screen.getByText('Michael, George')).toBeInTheDocument();
    expect(screen.queryByText('Beatles')).not.toBeInTheDocument();
  });

  it('range un CD sous un autre nom et ailleurs que sur les étagères', async () => {
    render(<ShelvesPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Classical/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit shelving of Water Music' }));

    fireEvent.change(screen.getByLabelText('Sort as'), { target: { value: 'Marriner, Neville' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'place:9' } });
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(shelvingService.saveItem).toHaveBeenCalledWith('album', 5,
      { section: null, shelveUnder: 'Marriner, Neville', placeId: 9, levelId: null, units: 3 }));
    expect(shelvingService.getPlan).toHaveBeenCalledTimes(2);
  });

  it('garde une collection ensemble depuis le crayon d’un de ses films, et la nomme sur ses films', async () => {
    const lost = item({
      kind: 'movie', id: 12, title: 'The Lost World', sortName: 'Lost World', section: 'films',
      collections: [{ id: 4, name: 'Jurassic Park', together: false }], together: null,
    });
    vi.mocked(shelvingService.getPlan).mockResolvedValue({ ...PLAN, sections: [{ key: 'films', shelves: 0, unshelved: 1, items: [lost] }, ...PLAN.sections.slice(1)] });
    vi.mocked(shelvingService.setTogether).mockReset().mockResolvedValue();
    render(<ShelvesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit shelving of The Lost World' }));

    vi.mocked(shelvingService.getPlan).mockResolvedValue({ ...PLAN, sections: [{ key: 'films', shelves: 0, unshelved: 1, items: [{
      ...lost, sortName: 'Jurassic Park', collections: [{ id: 4, name: 'Jurassic Park', together: true }], together: { id: 4, name: 'Jurassic Park' },
    }] }, ...PLAN.sections.slice(1)] });
    fireEvent.click(screen.getByLabelText('Keep “Jurassic Park” together'));
    await waitFor(() => expect(shelvingService.setTogether).toHaveBeenCalledWith(4, true));
    expect(await screen.findByTitle('Kept together with its collection')).toHaveTextContent('Jurassic Park');
    expect(screen.getByLabelText('Keep “Jurassic Park” together')).toBeChecked();
  });

  it('ne propose pas de section pour un film', async () => {
    render(<ShelvesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit shelving of The Matrix' }));
    expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Sort as'), { key: 'Escape' });
    expect(screen.queryByLabelText('Sort as')).not.toBeInTheDocument();
  });

  it('liste ce qui est rangé ailleurs, et ajoute un lieu', async () => {
    render(<ShelvesPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /Elsewhere/ }));
    const place = screen.getByRole('heading', { name: /Wardrobe, top/ }).closest('section')!;
    expect(within(place).getByText('Kempff, Wilhelm')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/New place/), { target: { value: 'Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(shelvingService.createPlace).toHaveBeenCalledWith('Desk'));
  });

  it('range étage par étage une fois les meubles décrits, et déplace vers l’étage d’avant ou d’après, nommé', async () => {
    const levelAt = (id: number, level: number, count: number, first: string | null, last: string | null) => ({
      id, level, code: `A-${level}`, section: 'films' as const, capacity: 12, ownCapacity: null, usable: 12, used: count,
      count, pinned: 0, first, last, locked: false, breakBefore: null,
    });
    const shelved: ShelvingPlan = {
      ...PLAN,
      units: [{ id: 1, letter: 'A', capacity: 12, levels: [levelAt(1, 1, 2, 'Matrix', 'Moon'), levelAt(2, 2, 1, 'Nemo', 'Nemo')] }],
      sections: PLAN.sections.map(entry => entry.key !== 'films' ? entry : {
        ...entry, shelves: 2, unshelved: 0,
        items: [
          item({ kind: 'movie', id: 10, title: 'The Matrix', sortName: 'Matrix', section: 'films', code: 'A-1', levelId: 1 }),
          item({ kind: 'movie', id: 11, title: 'Moon', sortName: 'Moon', section: 'films', code: 'A-1', levelId: 1 }),
          item({ kind: 'movie', id: 12, title: 'Nemo', sortName: 'Nemo', section: 'films', code: 'A-2', levelId: 2 }),
        ],
      }),
    };
    vi.mocked(shelvingService.getPlan).mockResolvedValue(shelved);
    vi.mocked(shelvingService.noRoom).mockReset().mockResolvedValue();
    vi.mocked(shelvingService.moveBack).mockReset().mockResolvedValue();
    render(<ShelvesPage />);

    expect(await screen.findByRole('heading', { name: 'A-2' })).toBeInTheDocument();
    expect(screen.getByText('2 · 2 of 12 cases')).toBeInTheDocument();
    // The strip of shelves, to reach one in a tap.
    expect(within(screen.getByRole('navigation', { name: 'Shelves of Films' })).getAllByRole('button')).toHaveLength(2);

    // First on the first shelf: nowhere to go either way.
    expect(screen.getByRole('button', { name: 'Move The Matrix back to the shelf before' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No room for The Matrix: move it on to A-2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'No room for Moon: move it on to A-2' }));
    await waitFor(() => expect(shelvingService.noRoom).toHaveBeenCalledWith('movie', 11));
    fireEvent.click(screen.getByRole('button', { name: 'Move Nemo back to A-1' }));
    await waitFor(() => expect(shelvingService.moveBack).toHaveBeenCalledWith('movie', 12));
    expect(screen.getByRole('button', { name: 'No room for Nemo: move it on to the next shelf' })).toBeDisabled();

    // A shelf code finds what stands on it.
    fireEvent.change(screen.getByPlaceholderText('Find on the shelves…'), { target: { value: 'a-2' } });
    expect(screen.getByText('Nemo')).toBeInTheDocument();
    expect(screen.queryByText('Moon')).not.toBeInTheDocument();
  });

  it('dessine chaque meuble en colonne, ouvre un étage pour le régler, et passe de la liste au meuble et retour', async () => {
    const furnished: ShelvingPlan = {
      ...PLAN,
      units: [{ id: 1, letter: 'A', capacity: 12, levels: [{
        id: 5, level: 1, code: 'A-1', section: 'films', capacity: 12, ownCapacity: null, usable: 10.2, used: 10,
        count: 10, pinned: 0, first: '2001', last: 'Arrietty', locked: false, breakBefore: null,
      }, {
        id: 6, level: 2, code: 'A-2', section: null, capacity: 12, ownCapacity: null, usable: 10.2, used: 0,
        count: 0, pinned: 0, first: null, last: null, locked: false, breakBefore: 'Big fish',
      }] }],
      sections: PLAN.sections.map(entry => entry.key !== 'films' ? entry : {
        ...entry, shelves: 1,
        items: [item({ kind: 'movie', id: 10, title: 'The Matrix', sortName: 'Matrix', section: 'films', code: 'A-1', levelId: 5 })],
      }),
    };
    vi.mocked(shelvingService.getPlan).mockResolvedValue(furnished);
    vi.mocked(shelvingService.createUnit).mockReset().mockResolvedValue();
    vi.mocked(shelvingService.updateLevel).mockReset().mockResolvedValue();
    render(<ShelvesPage />);

    // From a shelf's heading in the list to its board in the furniture, already open.
    fireEvent.click(await screen.findByRole('button', { name: 'Set up A-1 ›' }));
    expect(screen.getByRole('tab', { name: /Furniture/ })).toHaveAttribute('aria-selected', 'true');
    const unit = screen.getByRole('region', { name: 'Unit A' });
    expect(within(unit).getByText('2 shelves · 12 cases each')).toBeInTheDocument();
    expect(within(unit).getByRole('button', { name: /A-1 Films 10 · 10\/12 2001 – Arrietty/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(unit).getByRole('button', { name: /A-2 Free No room Nothing put here yet/ })).toHaveAttribute('aria-expanded', 'false');

    const panel = screen.getByRole('group', { name: 'Set up A-1' });
    expect(within(panel).getByRole('radio', { name: 'Films' })).toBeChecked();
    expect(within(panel).getByText('Matrix')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('radio', { name: 'Free' }));
    await waitFor(() => expect(shelvingService.updateLevel).toHaveBeenCalledWith(5, { section: null }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Lock what it holds' }));
    await waitFor(() => expect(shelvingService.updateLevel).toHaveBeenCalledWith(5, { locked: true }));

    // The unit's own settings and the new unit stay out of the way until asked for.
    expect(screen.queryByLabelText('Letter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a unit' }));
    expect(screen.getByLabelText('Letter')).toHaveValue('B');
    fireEvent.click(screen.getByRole('button', { name: 'Add unit' }));
    await waitFor(() => expect(shelvingService.createUnit).toHaveBeenCalledWith({ letter: 'B', levels: 10, capacity: 12, section: 'films' }));

    // And back to the list, at the shelf.
    fireEvent.click(screen.getByRole('button', { name: 'Open A-1 in Films ›' }));
    expect(screen.getByRole('tab', { name: /Films/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'A-1' })).toBeInTheDocument();
  });

  it('pose un coffret à la main sur un étage libre, et le marque', async () => {
    const furnished: ShelvingPlan = {
      ...PLAN,
      units: [{ id: 1, letter: 'A', capacity: 12, levels: [{
        id: 6, level: 5, code: 'A-5', section: null, capacity: 12, ownCapacity: null, usable: 10.2, used: 0,
        count: 0, pinned: 0, first: null, last: null, locked: false, breakBefore: null,
      }] }],
      sections: PLAN.sections.map(entry => entry.key !== 'films' ? entry : {
        ...entry,
        items: [item({ kind: 'box_set', id: 3, title: 'Harry Potter box', sortName: 'Harry Potter', section: 'films', code: 'A-5', levelId: 6, pinned: true })],
      }),
    };
    vi.mocked(shelvingService.getPlan).mockResolvedValue(furnished);
    render(<ShelvesPage />);

    expect(await screen.findByTitle('Put on this shelf by hand')).toHaveTextContent('A-5');
    expect(screen.queryByRole('button', { name: 'No room for Harry Potter box' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit shelving of Harry Potter box' }));
    expect(screen.getByLabelText('Location')).toHaveValue('level:6');
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(shelvingService.saveItem).toHaveBeenCalledWith('box_set', 3,
      { section: null, shelveUnder: null, placeId: null, levelId: null, units: null }));
  });
});
