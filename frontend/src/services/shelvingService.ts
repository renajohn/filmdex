export type ShelfKind = 'album' | 'movie' | 'box_set';
export type ShelfSection = 'films' | 'music' | 'classical';
export type SortSource = 'manual' | 'musicbrainz' | 'guess';

export interface ShelvedItem {
  kind: ShelfKind;
  id: number;
  title: string;
  subtitle: string;
  image: string | null;
  section: ShelfSection;
  sectionAuto: boolean;
  /** The name it is filed under, as read on the shelf. */
  sortName: string;
  sortSource: SortSource;
  /** How many standard cases wide it stands. */
  units: number;
  /** Whether the width is the estimate from its discs, not one set by hand. */
  unitsAuto: boolean;
  placeId: number | null;
  /** The shelf it stands on, "B-3"; null off the shelves or when they are full. */
  code: string | null;
  levelId: number | null;
  /** Whether the owner put it on that shelf by hand, out of the order. */
  pinned: boolean;
  movieIds?: number[];
  /** A film's collections, and whether each is kept together on the shelf. */
  collections?: Array<{ id: number; name: string; together: boolean }>;
  /** The collection it stands with, filed under its first film. */
  together?: { id: number; name: string } | null;
}

export interface ShelfPlace {
  id: number;
  name: string;
  items: ShelvedItem[];
}

export interface ShelfLevel {
  id: number;
  level: number;
  code: string;
  section: ShelfSection | null;
  capacity: number;
  ownCapacity: number | null;
  usable: number;
  used: number;
  count: number;
  /** How many of them were put there by hand. */
  pinned: number;
  first: string | null;
  last: string | null;
  locked: boolean;
  breakBefore: string | null;
}

export interface ShelfUnit {
  id: number;
  letter: string;
  capacity: number;
  levels: ShelfLevel[];
}

export interface ShelvingPlan {
  sections: Array<{ key: ShelfSection; items: ShelvedItem[]; shelves: number; unshelved: number }>;
  places: ShelfPlace[];
  units: ShelfUnit[];
}

export interface ShelfSettings {
  section?: ShelfSection | null;
  shelveUnder?: string | null;
  placeId?: number | null;
  /** A shelf to put it on by hand, out of the order. */
  levelId?: number | null;
  units?: number | null;
}

const send = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/shelving${url}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `HTTP error! status: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
};

/** Where each physical CD, film and box set is kept. */
const shelvingService = {
  getPlan: (): Promise<ShelvingPlan> => send<ShelvingPlan>(''),

  /** Null puts a field back to what the object's data says. */
  saveItem: (kind: ShelfKind, id: number, settings: ShelfSettings): Promise<void> =>
    send<void>(`/items/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(settings) }),

  createPlace: (name: string): Promise<{ id: number; name: string }> =>
    send(`/places`, { method: 'POST', body: JSON.stringify({ name }) }),

  renamePlace: (id: number, name: string): Promise<{ id: number; name: string }> =>
    send(`/places/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  deletePlace: (id: number): Promise<void> => send<void>(`/places/${id}`, { method: 'DELETE' }),

  /** It did not fit on its shelf: it and those after it go on the next one; `full` also keeps the shelf at what it holds now. */
  noRoom: (kind: ShelfKind, id: number, full = false): Promise<void> =>
    send<void>(`/items/${kind}/${id}/no-room`, full ? { method: 'POST', body: JSON.stringify({ full }) } : { method: 'POST' }),

  /** It would fit on the shelf before: that shelf takes it. */
  moveBack: (kind: ShelfKind, id: number): Promise<void> =>
    send<void>(`/items/${kind}/${id}/move-back`, { method: 'POST' }),

  /** Keeps a collection's films together on the shelf, under its first film, or lets each stand under its own name. */
  setTogether: (collectionId: number, together: boolean): Promise<void> =>
    send<void>(`/collections/${collectionId}`, { method: 'PUT', body: JSON.stringify({ together }) }),

  createUnit: (unit: { letter: string; levels: number; capacity: number; section: ShelfSection | null }): Promise<void> =>
    send<void>(`/units`, { method: 'POST', body: JSON.stringify(unit) }),

  /** `move` takes the unit one place left (-1) or right (1). */
  updateUnit: (id: number, changes: { letter?: string; levels?: number; capacity?: number; move?: -1 | 1 }): Promise<void> =>
    send<void>(`/units/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),

  deleteUnit: (id: number): Promise<void> => send<void>(`/units/${id}`, { method: 'DELETE' }),

  /** A capacity of null goes back to the unit's; breakBefore null forgets what had no room. */
  updateLevel: (id: number, changes: { section?: ShelfSection | null; capacity?: number | null; locked?: boolean; breakBefore?: null }): Promise<void> =>
    send<void>(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(changes) }),
};

export default shelvingService;
