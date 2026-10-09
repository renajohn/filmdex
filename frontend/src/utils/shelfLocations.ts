import { useEffect, useSyncExternalStore } from 'react';

interface Locations {
  movies: Record<number, string>;
  albums: Record<number, string>;
}

/** Fetched again when a page asks after this long, so a CD added since gets its shelf. */
const STALE_MS = 30 * 1000;

let locations: Locations | null = null;
let fetchedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Rereads where each film and CD is: after the shelves change, or when the copy at hand is old. */
export function refreshShelfLocations(): Promise<void> {
  if (pending) return pending;
  pending = fetch('/api/shelving/locations')
    .then(response => (response.ok ? response.json() : null))
    .then((body: Locations | null) => {
      if (body) {
        locations = body;
        fetchedAt = Date.now();
        listeners.forEach(listener => listener());
      }
    })
    .catch(() => undefined)
    .finally(() => { pending = null; });
  return pending;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/**
 * The shelf a film or CD stands on, "B-3", or the place it is kept in; null
 * while unknown or when the furniture has no shelf for it. One copy for the
 * whole app, so a grid of hundreds of cards asks the server once.
 */
export function useShelfLocation(kind: 'movie' | 'album', id: number | string | null | undefined): string | null {
  const current = useSyncExternalStore(subscribe, () => locations);
  useEffect(() => {
    if (Date.now() - fetchedAt > STALE_MS) refreshShelfLocations();
  }, []);
  if (id == null || !current) return null;
  return (kind === 'movie' ? current.movies : current.albums)[Number(id)] ?? null;
}

/** For tests: forget what was fetched. */
export function resetShelfLocations(): void {
  locations = null;
  fetchedAt = 0;
  pending = null;
}
